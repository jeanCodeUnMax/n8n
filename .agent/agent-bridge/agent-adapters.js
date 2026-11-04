#!/usr/bin/env node
/**
 * agent-adapters.js — transports CLI à sessions reprises et correspondance des providers ACP Devin.
 *
 * Les transports CLI acceptés utilisent un ID de session explicite; le mapping ACP ne suffit pas sans session active dans Devin.
 * Les modes CLI Kilo/Hermes sont distincts de leurs sessions ACP.
 *
 * Usage :
 *   const a = require('./agent-adapters');
 *   a.resumeArgs('kilo', 'ses_123')   → ['-s', 'ses_123']
 *   a.resumeArgs('opencode', null)    → ['-c']            (dernière session)
 *   a.exportCmd('gemini', 'abc')      → 'gemini --resume abc ...'
 */
'use strict';

const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

/** Binaire d'un agent : override env (<AGENT>_BIN) puis chemin user standard. */
const bin = (envVar, ...parts) => process.env[envVar] || path.join(...parts);

/**
 * sessionFlag: template pour reprendre une session connue.
 *   {flag:'-s'}            → '-s <id>'
 *   {flag:'--resume'}      → '--resume <id>'
 *   {flag:'-c', none:true} → '-c' (continue dernier, pas d'id)
 * continueFlag: flag "dernière session" quand aucun id n'est connu.
 */
const ADAPTERS = {
    agy: {
        bin: bin('AGY_BIN', LOCALAPPDATA, 'agy', 'bin', 'agy.exe'),
        headless: ['--dangerously-skip-permissions', '--print'],
        sessionFlag: '--conversation',      // agy --conversation <id>
        continueFlag: '--continue',
        sessionStore: 'hub-local (agy --hub) — conversations listables via GetAllCascadeTrajectories',
        replyVia: 'hub RPC SendUserCascadeMessage + GetCascadeTrajectorySteps (agy-hub.js)'
    },
    kilo: {
        bin: bin('KILO_BIN', APPDATA, 'npm', 'kilo.cmd'),
        entryPoint: bin('KILO_ENTRY', APPDATA, 'npm', 'node_modules', '@kilocode', 'cli', 'bin', 'kilo'),
        headless: ['run', '--auto'],
        sessionFlag: '-s',                  // kilo run -s <id>
        continueFlag: '-c',
        sessionStore: 'projet .kilo/ + ~/.local/share/kilo',
        exportCmd: 'kilo export <sessionID>',  // JSON des messages
        replyVia: 'kilo export <id> | jq messages'
    },
    opencode: {
        bin: bin('OPENCODE_BIN', APPDATA, 'npm', 'opencode.cmd'),
        headless: ['run', '--auto'],
        sessionFlag: '-s',                  // opencode run -s <id> (+ --fork pour brancher)
        continueFlag: '-c',
        forkFlag: '--fork',
        sessionStore: '~/.local/share/opencode/project/<slug>/storage/session',
        exportCmd: 'opencode export <sessionID>',
        replyVia: 'opencode export <id>'
    },
    gemini: {
        bin: bin('GEMINI_BIN', APPDATA, 'npm', 'gemini.cmd'),
        headless: ['-p'],
        sessionFlag: '--resume',            // gemini --resume <id|latest|index>
        newSessionFlag: '--session-id',     // impose un UUID neuf
        sessionStore: '~/.gemini/tmp/<projet>/chats/session-*.json',
        listCmd: 'gemini --list-sessions',
        replyVia: 'fichier session-*.json (chronologique)'
    },
    /* Mistral Vibe n'a pas d'adaptateur de reprise CLI ici. */
    hermes: {
        bin: bin('HERMES_BIN', HOME, '.local', 'bin', 'hermes.exe'),
        headless: ['-z'],
        sessionFlag: '--resume',            // hermes --resume <SESSION>
        continueFlag: '--continue',         // [--continue SESSION_NAME]
        listCmd: 'hermes sessions list',
        exportCmd: 'hermes sessions export <name>',
        sessionStore: '~/.hermes/sessions',
        acp: 'hermes acp  (serveur ACP natif)'
    },
    cline: {
        bin: bin('CLINE_BIN', APPDATA, 'npm', 'cline.cmd'),
        headless: [],
        sessionFlag: '--id',                // cline --id <session-id>
        listCmd: 'cline history',
        sessionStore: '~/.cline (à confirmer)',
        replyVia: 'cline history / --id'
    },
    codex: {
        bin: bin('CODEX_BIN', APPDATA, 'npm', 'codex.cmd'),
        headless: ['exec'],
        sessionFlag: 'resume',              // codex resume <id> (sous-commande)
        subcommand: true,
        sessionStore: '~/.codex/sessions'
    },
    /* Les providers API CLI ne sont pas des sessions reprenables; mapping ACP séparé ci-dessous. */
    ollama: {
        provider: true,
        api: 'http://127.0.0.1:11434/api/generate',
        body: { model: 'SparkLLM/Spark-X2.5-1.7B:latest', stream: false, think: false },
        preferredModel: 'SparkLLM/Spark-X2.5-1.7B:latest',
        note: 'API HTTP — JAMAIS le CLI (ANSI brut). think:false obligatoire sur modèles thinking (sinon réponse = raisonnement brut). Modèles :cloud suspendus (quota).'
    },
    nim: { provider: true, note: 'NVIDIA NIM API 1 — provider, dispatch via kilo/hermes' },
    nim2: { provider: true, note: 'NVIDIA NIM API 2 — provider, dispatch via kilo' },
    openrouter: { provider: true, note: 'API directe openrouter.ai — jamais via opencode acp' },
    omniroute: { provider: true, api: 'http://localhost:20128/v1/chat/completions', note: 'OmniRoute — gateway locale multi-providers :20128 (agent omni1, worker omniroute-worker.mjs)' },
    'devin-cloud': { provider: true, note: 'Devin cloud — sessions API Devin' }
};

const ACP_PROVIDER_IDS = Object.freeze({
    devin: 'devin-cli',
    agy: 'antigravity-acp',
    kilo: 'kilo',
    hermes: 'hermes',
    gemini: 'gemini',
    cline: 'cline',
    'devin-cloud': 'devin-cloud',
    vtcode: 'vtcode',
    opencode: 'opencode',
    openrouter: 'openrouter',
    ollama: 'ollama',
    nim: 'nim',
    nim2: 'nim2',
    'mistral-vibe': 'mistral-vibe',
    'codex-acp': 'codex-acp',
    huggingface: 'huggingface',
    cerberos: 'cerberos',
    // Fenêtres de chat de l'extension hephaistos-chats (provider ACP dédié)
    hephaistos: 'hephaistos'
});

const AGENT_ALIASES = Object.freeze({
    'antigravity': 'agy', 'google antigravity': 'agy', 'antigravity-acp': 'agy',
    'devin local': 'devin', 'devin-cli': 'devin', 'devin cloud': 'devin-cloud',
    'kilo code': 'kilo', 'kilocode': 'kilo',
    'nvidia nim': 'nim', 'nvidia nim 1': 'nim', 'nvidia nim #1': 'nim', 'nvidia anim 1': 'nim', 'nim1': 'nim', 'nim 1': 'nim',
    'nvidia nim 2': 'nim2', 'nvidia nim #2': 'nim2', 'nvidia anim 2': 'nim2', 'nim 2': 'nim2',
    'open router': 'openrouter', 'open code': 'opencode', 'mistral vibe': 'mistral-vibe',
    'hugging face': 'huggingface', 'codex': 'codex-acp',
    'hephaistos chats': 'hephaistos',
    'cerber': 'cerberos', 'cerberos': 'cerberos', 'cerber os': 'cerberos', 'cerbere': 'cerberos', 'cerbere os': 'cerberos', 'hephaistos-chat': 'hephaistos', 'hphe': 'hephaistos'
});

function resolveAgent(value) {
    const name = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const canonical = AGENT_ALIASES[name] || name;
    return Object.prototype.hasOwnProperty.call(ACP_PROVIDER_IDS, canonical) ? canonical : null;
}

function providerIdFor(agent) {
    const canonical = resolveAgent(agent);
    return canonical ? ACP_PROVIDER_IDS[canonical] : null;
}

function cliSessionSupported(agent) {
    return ['kilo', 'hermes'].includes(resolveAgent(agent));
}

/** Args de reprise pour un agent + session_id connu (ou dernier si null). */
function resumeArgs(agent, sessionId) {
    const a = ADAPTERS[resolveAgent(agent)];
    if (!a || a.provider) return [];
    if (sessionId && a.sessionFlag) {
        if (a.subcommand) return [a.sessionFlag, sessionId];
        return [a.sessionFlag, sessionId];
    }
    if (!sessionId && a.continueFlag) return [a.continueFlag];
    return [];
}

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function sessionIdValid(sessionId) {
    return typeof sessionId === 'string' && /^[A-Za-z0-9._/-]{7,200}$/.test(sessionId);
}

function commandFor(agent, args) {
    const canonical = resolveAgent(agent);
    if (canonical === 'kilo') return { command: process.execPath, args: [ADAPTERS.kilo.entryPoint, ...args] };
    if (canonical === 'hermes') return { command: ADAPTERS.hermes.bin, args };
    throw new Error(`CLI session transport unsupported for ${agent}`);
}

function runCli(agent, args, options = {}) {
    const spec = commandFor(agent, args);
    const result = spawnSync(spec.command, spec.args, {
        cwd: options.cwd || process.cwd(),
        encoding: 'utf8',
        timeout: options.timeoutMs || 120000,
        maxBuffer: options.maxBuffer || MAX_OUTPUT_BYTES,
        windowsHide: true
    });
    if (result.error || result.status !== 0) throw new Error(`${agent} session command failed (status=${result.status ?? 'spawn'})`);
    return String(result.stdout || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function parseKiloSessionList(output) {
    return String(output).split(/\r?\n/).flatMap((line) => {
        const match = /\b(ses_[A-Za-z0-9_-]+)\b/.exec(line);
        return match ? [{ sessionId: match[1], summary: line.replace(match[1], '').trim() }] : [];
    });
}

function parseHermesSessionList(output) {
    return String(output).split(/\r?\n/).flatMap((line) => {
        const tokens = line.trim().split(/\s+/);
        const sessionId = tokens[tokens.length - 1];
        return /^(?:\d{8}_\d{6}_[A-Za-z0-9_-]+|cron_[A-Za-z0-9_-]+)$/.test(sessionId || '')
            ? [{ sessionId, summary: line.slice(0, line.lastIndexOf(sessionId)).trim() }]
            : [];
    });
}

function isWithinWorkspace(directory, workspace) {
    if (typeof directory !== 'string' || !directory) return false;
    const root = path.resolve(workspace).toLowerCase();
    const candidate = path.resolve(directory).toLowerCase();
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function listSessions(agent, options = {}) {
    agent = resolveAgent(agent);
    if (!['kilo', 'hermes'].includes(agent)) throw new Error(`CLI session listing unsupported for ${agent}`);
    const cwd = path.resolve(options.cwd || process.cwd());
    if (agent === 'hermes') {
        return parseHermesSessionList(runCli('hermes', ['sessions', 'list', '--workspace', cwd], options))
            .map((session) => ({ sessionId: session.sessionId, workspace: cwd }));
    }
    const candidates = parseKiloSessionList(runCli('kilo', ['session', 'list'], options));
    const sessions = [];
    for (const candidate of candidates) {
        try {
            const exported = JSON.parse(runCli('kilo', ['export', candidate.sessionId], { ...options, cwd, maxBuffer: 32 * 1024 * 1024 }));
            const directory = exported.info?.directory;
            if (isWithinWorkspace(directory, cwd)) sessions.push({ sessionId: candidate.sessionId, workspace: directory });
        } catch { }
    }
    return sessions;
}

function verifySessionInWorkspace(agent, sessionId, options = {}) {
    agent = resolveAgent(agent);
    if (!sessionIdValid(sessionId) || !['kilo', 'hermes'].includes(agent)) return false;
    const cwd = path.resolve(options.cwd || process.cwd());
    if (agent === 'hermes') return listSessions(agent, { ...options, cwd }).some((session) => session.sessionId === sessionId);
    if (!listSessions(agent, { ...options, cwd }).some((session) => session.sessionId === sessionId)) return false;
    try {
        const exported = JSON.parse(runCli('kilo', ['export', sessionId], { ...options, cwd, maxBuffer: 32 * 1024 * 1024 }));
        return isWithinWorkspace(exported.info?.directory, cwd);
    } catch { return false; }
}

function buildSessionInvocation(agent, sessionId, prompt) {
    agent = resolveAgent(agent);
    if (!sessionIdValid(sessionId) || typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('CLI session send requires an explicit session ID and prompt');
    }
    if (!['kilo', 'hermes'].includes(agent)) throw new Error(`CLI session transport unsupported for ${agent}`);
    const resume = resumeArgs(agent, sessionId);
    const args = agent === 'hermes'
        ? [...resume, '-z', prompt, '--no-restore-cwd']
        : [...ADAPTERS[agent].headless, ...resume, prompt];
    return commandFor(agent, args);
}

function sendToSession(agent, sessionId, prompt, options = {}) {
    agent = resolveAgent(agent);
    if (!sessionIdValid(sessionId) || typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('CLI session send requires an explicit session ID and prompt');
    }
    if (!verifySessionInWorkspace(agent, sessionId, options)) {
        throw new Error(`${agent} session is not registered in the selected workspace`);
    }
    const spec = buildSessionInvocation(agent, sessionId, prompt);
    const result = spawnSync(spec.command, spec.args, {
        cwd: options.cwd || process.cwd(),
        encoding: 'utf8',
        timeout: options.timeoutMs || 120000,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true
    });
    if (result.error || result.status !== 0) throw new Error(`${agent} session send failed (status=${result.status ?? 'spawn'})`);
    return String(result.stdout || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

/**
 * MUTEX SINGLE-FLIGHT ACP & GOUVERNANCE MACHINE MODESTE
 * Empêche d'instancier plusieurs cascades ou sessions ACP simultanées pour le même agent.
 * Supporte le TTL exact via expiresAt et la validation d'agent.
 */
const _acpLocks = new Map();

function acquireAcpLock(agent, ttlMs = 120000) {
    if (!agent || typeof agent !== 'string' || !agent.trim()) {
        return { acquired: false, agent: null, reason: 'Identifiant d agent invalide ou manquant' };
    }
    const key = String(resolveAgent(agent) || agent).toLowerCase().trim();
    const now = Date.now();
    const existing = _acpLocks.get(key);
    if (existing && (now < existing.expiresAt)) {
        return {
            acquired: false,
            agent: key,
            remainingMs: existing.expiresAt - now,
            reason: 'Session ACP deja active pour cet agent (protection anti-doublon)'
        };
    }
    const expiresAt = now + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 120000);
    _acpLocks.set(key, { timestamp: now, expiresAt, agent: key });
    return { acquired: true, agent: key, expiresAt };
}

function releaseAcpLock(agent) {
    if (!agent) return false;
    const key = String(resolveAgent(agent) || agent).toLowerCase().trim();
    return _acpLocks.delete(key);
}

function isAcpLocked(agent) {
    if (!agent) return false;
    const key = String(resolveAgent(agent) || agent).toLowerCase().trim();
    const existing = _acpLocks.get(key);
    if (!existing) return false;
    if (Date.now() >= existing.expiresAt) {
        _acpLocks.delete(key);
        return false;
    }
    return true;
}

/** Tag de routage à embedder dans le titre de tâche : [sess:kilo=abc123]. */
const SESSION_TAG = /(?:sess|session)[:=]\s*([a-z0-9_-]+)\s*[:=]\s*([A-Za-z0-9_-]+)/i;

if (require.main === module) {
    const [cmd, agent, id] = process.argv.slice(2);
    if (cmd === 'resume') console.log(resumeArgs(agent, id || null).join(' '));
    else if (cmd === 'list') console.log(Object.keys(ADAPTERS).join('\n'));
    else if (cmd === 'show') console.log(JSON.stringify(ADAPTERS[resolveAgent(agent)], null, 1));
    else if (cmd === 'resolve') {
        const resolved = resolveAgent(agent);
        if (!resolved) { console.error('agent inconnu'); process.exit(2); }
        console.log(JSON.stringify({ agent: resolved, providerId: providerIdFor(resolved), cliSessionSupported: cliSessionSupported(resolved) }));
    }
    else if (cmd === 'sessions') console.log(JSON.stringify(listSessions(agent), null, 1));
    else console.error('cmds: list | show <agent> | resolve <nom> | resume <agent> [sessionId] | sessions <kilo|hermes>');
}

module.exports = {
    ADAPTERS,
    ACP_PROVIDER_IDS,
    resolveAgent,
    providerIdFor,
    cliSessionSupported,
    resumeArgs,
    SESSION_TAG,
    sessionIdValid,
    listSessions,
    verifySessionInWorkspace,
    parseKiloSessionList,
    parseHermesSessionList,
    isWithinWorkspace,
    buildSessionInvocation,
    sendToSession,
    acquireAcpLock,
    releaseAcpLock,
    isAcpLocked
};
