// security-watch.cjs — surveillance des modifications du workspace pour la
// revue sécu binôme (Devin maple-texture surveille la session AGY pairée).
//
// - fs.watch récursif sur le workspace → chaque écriture fichier est loguée
//   (chemin, taille, sha1) + flags heuristiques (sinks XSS, secrets en clair,
//   exec, bind 0.0.0.0, clipboard, chemins sensibles…).
// - Tail de .agent/comms.jsonl → chaque nouvelle entrée (prompt/reply/
//   handshake/wake) est résumée pour corréler l'activité session AGY aux
//   modifications fichiers.
// - Sortie : .agent/logs/security-review/events.jsonl (gitignoré via logs/)
//   + lignes console [SECWATCH]/[COMMS] pour get_output.
//
// Usage : node .agent/security-watch.cjs   (laisser tourner en tâche de fond)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.HEPHAISTOS_WORKSPACE || process.cwd();
const LOG_DIR = path.join(ROOT, '.agent', 'logs', 'security-review');
const EVENTS = path.join(LOG_DIR, 'events.jsonl');
const COMMS = path.join(ROOT, '.agent', 'comms.jsonl');
const MAX_SCAN = 512 * 1024;      // pas de scan de contenu au-delà
const DEBOUNCE_MS = 350;

let comms;
try { comms = require('./agent-bridge/comms'); } catch { comms = null; }

fs.mkdirSync(LOG_DIR, { recursive: true });

// ---- exclusions (bruit de build / état runtime) ----
const EXCLUDE_DIRS = /(^|[\\/])(\.git|node_modules|\.pytest_cache|__pycache__|\.venv|semantic-cache-data|target|dist|\.next|\.idea)([\\/]|$)/;
const EXCLUDE_SELF = /(^|[\\/])\.agent[\\/](logs|security-review)[\\/]/;
const SENSITIVE_PATH = /(^|[\\/])\.env(\.|$)|\.token$|\.(pem|key|p12|pfx)$|id_rsa|credentials/i;

// ---- règles heuristiques (tri rapide ; la revue humaine/agent tranche) ----
const RULES = [
    [/eval\s*\(/, 'eval'],
    [/new\s+Function\s*\(/, 'new-Function'],
    [/innerHTML\s*=\s*[^'"\s=]/, 'innerHTML-assign'],
    [/insertAdjacentHTML|outerHTML\s*=|document\.write/, 'html-sink'],
    [/dangerouslySetInnerHTML/, 'dangerous-react'],
    [/execSync|spawnSync|execFileSync/, 'sync-exec'],
    [/child_process/, 'child_process'],
    [/env\.clipboard|clipboard\.writeText/, 'clipboard'],
    [/['"`]?0\.0\.0\.0['"`]?/, 'bind-0.0.0.0'],
    [/ws:\/\/(?!127\.0\.0\.1|localhost)/, 'ws-foreign'],
    [/http:\/\/(?!127\.0\.0\.1|localhost|example\.)/, 'http-cleartext'],
    [/(api[_-]?key|secret|password|passwd|csrf|token)["'\s:=]{1,6}["'][A-Za-z0-9_\-.]{12,}["']/i, 'secret-literal'],
    [/rm\s+-rf|Remove-Item[^\n]*-Recurse[^\n]*-Force|del\s+\/[sq]/i, 'destructive'],
    [/csrfToken(?!\s*:\s*['"`]<redacted>)/, 'csrf-ref'],
];

const pending = new Map();   // rel -> timer
const lastHash = new Map();  // rel -> sha1-8 (dédup écritures identiques)
let commsOffset = 0;
let watcher = null;

function emit(entry) {
    const line = JSON.stringify(entry);
    try { fs.appendFileSync(EVENTS, line + '\n'); } catch { /* best-effort */ }
    if (entry.kind === 'comms') {
        console.log(`[COMMS] ${entry.ts} ${entry.src}→${entry.dst} ${entry.msgKind}${entry.taskId ? ' #' + entry.taskId : ''}${entry.pairId ? ' pair=' + entry.pairId.slice(0, 8) : ''} ${entry.preview || ''}`);
    } else {
        const f = entry.flags && entry.flags.length ? ` flags=${entry.flags.join(',')}` : '';
        console.log(`[SECWATCH] ${entry.ts} ${entry.event} ${entry.path} ${entry.size}b sha1=${entry.sha1 || '-'}${f}`);
    }
}

function looksText(buf) {
    const n = Math.min(buf.length, 8192);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
    return true;
}

function scanContent(abs) {
    const st = fs.statSync(abs);
    if (st.size > MAX_SCAN) return { flags: ['too-large'], size: st.size, sha1: null };
    const buf = fs.readFileSync(abs);
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
    const flags = [];
    if (SENSITIVE_PATH.test(abs)) flags.push('sensitive-path');
    if (looksText(buf)) {
        const text = buf.toString('utf8');
        for (const [re, tag] of RULES) if (re.test(text)) flags.push(tag);
    } else flags.push('binary');
    return { flags, size: st.size, sha1 };
}

function onFsEvent(eventType, filename) {
    if (!filename) return;
    const rel = filename.replace(/[\\/]+/g, '/');
    if (EXCLUDE_DIRS.test(rel) || EXCLUDE_SELF.test(rel)) return;
    if (rel === '.agent/comms.jsonl') return drainComms();
    clearTimeout(pending.get(rel));
    pending.set(rel, setTimeout(() => {
        pending.delete(rel);
        const abs = path.join(ROOT, filename);
        if (!fs.existsSync(abs)) { emit({ kind: 'fs', ts: new Date().toISOString(), event: 'delete', path: rel, flags: ['delete'] }); return; }
        let scan;
        try {
            if (fs.statSync(abs).isDirectory()) return;
            scan = scanContent(abs);
        } catch { return; }
        if (scan.sha1 && lastHash.get(rel) === scan.sha1) return; // écriture sans changement de contenu
        if (scan.sha1) lastHash.set(rel, scan.sha1);
        emit({ kind: 'fs', ts: new Date().toISOString(), event: eventType, path: rel, size: scan.size, sha1: scan.sha1, flags: scan.flags });
    }, DEBOUNCE_MS));
}

function drainComms() {
    if (!comms) return;
    const { entries, offset } = comms.readFrom(COMMS, commsOffset);
    commsOffset = offset;
    for (const e of entries) {
        emit({
            kind: 'comms', ts: e.ts, src: e.src, dst: e.dst, msgKind: e.kind,
            phase: e.phase, taskId: e.taskId, pairId: e.pairId, session: e.session,
            convId: e.convId, preview: (e.text || '').slice(0, 100)
        });
    }
}

function start() {
    try { commsOffset = fs.existsSync(COMMS) ? fs.statSync(COMMS).size : 0; } catch { commsOffset = 0; }
    try {
        watcher = fs.watch(ROOT, { recursive: true }, onFsEvent);
    } catch (e) {
        console.error(`[SECWATCH-ERR] fs.watch récursif impossible: ${e.message}`);
        process.exit(2);
    }
    watcher.on('error', (e) => console.error(`[SECWATCH-ERR] ${e.message}`));
    console.log(`[SECWATCH-READY] watching ${ROOT} → ${EVENTS}`);
    emit({ kind: 'meta', ts: new Date().toISOString(), event: 'watch-start', path: '.', flags: ['watcher-v1'] });
    setInterval(() => console.log(`[SECWATCH-HB] ${new Date().toISOString()} watching`), 120000).unref();
}

process.on('SIGINT', () => process.exit(0));
start();
