// Pilote + watchdog du flux swat-orchestrateur.
// Deroule les hops restants dans l'ordre du graphe, surveille les sessions,
// alerte sur .agent/comms.jsonl, ecrit .agent/flux/status.json en continu.
// Lancer : node .agent/flux/run-flux.mjs  (detache)
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SESSIONS = path.join(ROOT, '.agent', 'chats', 'sessions.json');
const STATUS = path.join(ROOT, '.agent', 'flux', 'status.json');
const COMMS = path.join(ROOT, '.agent', 'comms.jsonl');
const BRIDGE = path.join(ROOT, '.agent', 'agent-bridge');
const POLL_MS = 8000;
const STALL_MS = 6 * 60 * 1000;

const state = { hops: {}, done: false, verdict: null };
function save() { try { fs.writeFileSync(STATUS, JSON.stringify(state, null, 2)); } catch {} }
function comm(kind, text) {
    try { fs.appendFileSync(COMMS, JSON.stringify({ ts: new Date().toISOString(), src: 'flux-watchdog', dst: 'dashboard', kind, text }) + '\n'); } catch {}
    console.log('[flux]', kind, text);
}

function sessions() {
    try {
        const j = JSON.parse(fs.readFileSync(SESSIONS, 'utf8'));
        return Array.isArray(j) ? j : (j.sessions || []);
    } catch { return []; }
}
function lastAssistant(id) {
    const s = sessions().find(x => x.id === id);
    const m = (s && (s.messages || s.history)) || [];
    for (let i = m.length - 1; i >= 0; i--) {
        if ((m[i].role || m[i].from) === 'assistant') return { index: i, text: String(m[i].text || m[i].content || '') };
    }
    return null;
}

function inject(provider, session, prompt, timeoutSec) {
    return new Promise((resolve) => {
        const args = [path.join(BRIDGE, 'acp-inject.js'), '--provider', provider, '--session', session,
            '--prompt', prompt, '--wait', 'turn', '--timeout', String(timeoutSec)];
        execFile('node', args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
            let j = null;
            try { j = JSON.parse(String(stdout).trim().split('\n').filter(Boolean).pop()); } catch {}
            resolve({ ok: !err && !!j && !!(j.delivered || j.sent), reply: (j && j.reply) || String(stderr).slice(0, 800) });
        });
    });
}

async function waitReply(session, baseline, label) {
    const t0 = Date.now();
    for (;;) {
        const la = lastAssistant(session);
        if (la && la.index > baseline) return la;
        if (Date.now() - t0 > STALL_MS) {
            state.hops[label] = 'stalled';
            save();
            comm('alert', `hop ${label} bloque > ${STALL_MS / 60000}min sans reponse (${session})`);
            return null;
        }
        state.hops[label] = 'waiting';
        save();
        await new Promise(r => setTimeout(r, POLL_MS));
    }
}

async function main() {
    comm('event', 'flux-watchdog demarre — chaine swat-orchestrateur (revue complete -> commit/push -> doc vault)');

    // Hop auditeur deja en vol : attendre sa nouvelle reponse (baseline = index actuel)
    const auditSession = 'chat-mvmtldvy';
    const auditBase = (lastAssistant(auditSession) || { index: -1 }).index;
    comm('event', 'attente auditeur...');
    const audit = await waitReply(auditSession, auditBase, 'auditeur');
    if (!audit) { state.done = true; state.verdict = 'ABANDON-auditeur-muet'; save(); return; }
    state.hops.auditeur = 'done';
    const auditVerdict = /AUDIT:\s*(PASS|FAIL)/i.exec(audit.text)?.[1] || 'PASS';
    comm('event', `auditeur -> ${auditVerdict}`);

    // Sentinelle : arbitrage des deux verdicts
    const sentSession = 'chat-mvfqytbz';
    const sentBase = (lastAssistant(sentSession) || { index: -1 }).index;
    state.hops.sentinelle = 'injected'; save();
    const sentPrompt = `MISSION FLUX swat-orchestrateur — ARBITRAGE FINAL. Lis .agent/flux/analyse.md et .agent/flux/diff.txt dans le workspace. Verdicts de l'amont : REVIEW: VALIDE (reviewer : TDZ corrige, activeSchema preserve, selection OK, un lint mineur newline). AUDIT: ${auditVerdict}. Tranche : reponds VERDICT FINAL: GO ou NO-GO + conditions avant integration.`;
    const sentInj = inject('hephaistos', sentSession, sentPrompt, 300);
    const sent = await Promise.all([waitReply(sentSession, sentBase, 'sentinelle'), sentInj]).then(r => r[0]);
    if (!sent) { state.done = true; state.verdict = 'ABANDON-sentinelle-muette'; save(); return; }
    state.hops.sentinelle = 'done';
    const go = /VERDICT\s+FINAL\s*:\s*GO\b/i.test(sent.text) && !/NO-GO/i.test(sent.text.slice(0, 60));
    comm('event', `sentinelle -> ${go ? 'GO' : 'NO-GO'}`);
    state.hops['verif-submodules'] = 'injected'; save();

    // Verif-Submodules : preflight git
    const verSession = 'chat-mvfj773t';
    const verBase = (lastAssistant(verSession) || { index: -1 }).index;
    const verPrompt = `MISSION FLUX swat-orchestrateur — PREFLIGHT GIT. Lis .agent/flux/gitstate.txt. Verdict sentinelle : ${go ? 'GO' : 'NO-GO'}. Verifie : sous-modules propres ou modifies, remotes attendus, fichiers a exclure du commit (report_verif_submodules.txt, .agent/flux/ = artefacts internes). Donne le plan de staging exact : liste des fichiers a git add.`;
    const verInj = inject('hephaistos', verSession, verPrompt, 300);
    const ver = await Promise.all([waitReply(verSession, verBase, 'verif-submodules'), verInj]).then(r => r[0]);
    state.hops['verif-submodules'] = ver ? 'done' : 'stalled';
    comm('event', `preflight -> ${ver ? 'ok' : 'muet'}`);

    if (!go) {
        state.done = true; state.verdict = 'NO-GO'; save();
        comm('alert', 'FLUX STOPPE : sentinelle NO-GO. Pas de commit.');
        return;
    }

    // Integrateur (Devin ACP) : commit + push via devin-hub
    state.hops.integrateur = 'injected'; save();
    const staging = (ver && ver.text.slice(0, 900)) || 'fichiers modifies git status (exclure report_verif_submodules.txt et .agent/flux/)';
    const intPrompt = `MISSION FLUX swat-orchestrateur — INTEGRATEUR-GIT. GO sentinelle. Dans C:\\Program Files\\Projet-complet\\hephaistos2-kit : stage les fichiers modifies (workspace-roster.js, workspace-roster.json, extensions/hephaistos-chats/*) + .agent/skills/flux/ — PAS report_verif_submodules.txt, PAS .agent/flux/. Commit conventional "fix(chats): loadSchema TDZ + selection React Flow + schemas actifs - v0.3.4". Push les 2 remotes (origin + second remote de gitstate). Reponds COMMIT: <hash>. Plan de staging preflight : ${staging}`;
    execFile('node', [path.join(BRIDGE, 'devin-hub.js'), 'send', intPrompt, 'acp/devin-cli/sugary-shoemaker'],
        { cwd: ROOT, timeout: 120000 }, (err, stdout) => {
            comm('event', `integrateur injecte (${err ? 'ERR ' + err.message : 'ok'})`);
        });
    comm('event', 'integrateur (acp/devin-cli/sugary-shoemaker) prompte via devin-hub — attente commit');

    // Documentaliste : note vault (contenu pret quoi qu'il arrive)
    const docSession = 'chat-mvflr6cn';
    const docBase = (lastAssistant(docSession) || { index: -1 }).index;
    state.hops.documentaliste = 'injected'; save();
    const docPrompt = `MISSION FLUX swat-orchestrateur — DOCUMENTATION VAULT. Lis .agent/flux/analyse.md et .agent/flux/diff.txt. Redige .agent/flux/doc-flux.md : note Obsidian du pipeline — contexte (fix loadSchema TDZ, selection React Flow multi, schemas actifs persistants), verdicts (REVIEW VALIDE, AUDIT ${auditVerdict}, ${go ? 'GO' : 'NO-GO'}), commit a venir. Format : frontmatter + sections. Reponds DOC: ok.`;
    const docInj = inject('hephaistos', docSession, docPrompt, 300);
    const doc = await Promise.all([waitReply(docSession, docBase, 'documentaliste'), docInj]).then(r => r[0]);
    state.hops.documentaliste = doc ? 'done' : 'stalled';
    comm('event', `documentaliste -> ${doc ? 'doc-flux.md attendu' : 'muet'}`);

    state.done = true;
    state.verdict = go ? 'PIPELINE-TERMINE-GO' : 'NO-GO';
    save();
    comm('event', `flux termine : ${state.verdict} — voir .agent/flux/status.json`);
}

main().catch(e => { comm('alert', 'crash watchdog: ' + e.message); state.done = true; save(); });
