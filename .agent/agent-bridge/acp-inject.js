#!/usr/bin/env node
/**
 * acp-inject.js — injection ACP exacte vers une session existante, sans passer
 * par le chat Devin actif.
 *
 * Principe : Devin ne fournit aucune commande publique pour envoyer un prompt
 * ACP vers un providerId/sessionId arbitraire. Les providers ACP sont des
 * processus locaux (opencode.exe acp, agy_acp_server.exe, ...). Ce client ouvre
 * donc une connexion ACP stdio dédiée vers le provider, rattache la session
 * exacte via session/load (ou session/resume), puis envoie session/prompt.
 *
 * Garanties :
 * - Jamais de session/new (aucune conversation de remplacement).
 * - Jamais d'appel devin.sendChatActionMessage ni de routage par focus.
 * - Provider inconnu = refus (fail-closed) : le caller doit retourner skipped.
 * - Binaires résolus par argv (pas de shell), windowsHide.
 *
 * Module : { inject, providerCommand, listProviders }
 * CLI    : node acp-inject.js --provider opencode --session ses_x
 *            --prompt "texte" [--cwd DIR] [--wait delivered|turn] [--timeout SEC]
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const adapters = require('./agent-adapters');
const { localPath } = require('./local-paths');

const EXE = process.platform === 'win32' ? '.exe' : '';

/* Providers ACP locaux vérifiés (voir "Devin ACP.log" : Spawning process ...).
 * Seuls les providers pilotables en stdio sont mappés. Un provider absent de
 * cette table ne peut pas être injecté : le caller refuse (skipped). */
const PROVIDERS = {
    'opencode': { cmd: `opencode${EXE}`, args: ['acp'] },
    'antigravity-acp': { cmd: `agy_acp_server${EXE}`, args: [] },
    'mistral-vibe': { cmd: `vibe-acp${EXE}`, args: [] },
    'hermes': { cmd: `hermes${EXE}`, args: ['acp', '--accept-hooks'] },
    'kilo': { cmd: `kilo${EXE}`, args: ['acp'] },
    // Fenêtres hephaistos-chats (extension VS Code) : serveur ACP stdio adossé à .agent/chats/sessions.json
    'hephaistos': {
        cmd: process.execPath,
        args: [path.join(__dirname, '..', '..', 'extensions', 'hephaistos-chats', 'acp-server.mjs')],
    },
    // Cerberos : pont SSH vers `hermes acp` sur le laptop Herald OS —
    // même spawn que la distribution Devin (acp/registry.json).
    // Chemins machine : env d'abord, puis local-paths.json (gitignoré).
    'cerberos': {
        cmd: process.env.CERBEROS_ACP_NODE || localPath('nodeExe') || 'node',
        args: [process.env.CERBEROS_ACP_BIN || localPath('cerberosAcpBin') || 'cerberos-acp.js'],
    },
};

/* RÈGLE : seuls les vrais agents CLI ont un transport ACP injectable.
 * nim/nim2/ollama/openrouter/huggingface = API officielles directes —
 * jamais `opencode acp` (sessions partagées = cross-talk entre fenêtres).
 * Pour injecter dans une fenêtre hephaistos-chats de ces providers,
 * utiliser --provider hephaistos --session <chatId> (acp-server.mjs). */

function envKey(providerId) {
    return `HEPHAISTOS_ACP_CMD_${String(providerId).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/** {cmd,args} pour un provider, ou null si non injectable. Env peut surcharger le binaire. */
function providerCommand(providerId) {
    const spec = PROVIDERS[providerId];
    if (!spec) return null;
    const override = process.env[envKey(providerId)];
    return { cmd: override || spec.cmd, args: [...spec.args], env: spec.env || null };
}

function listProviders() {
    return Object.keys(PROVIDERS);
}

const ACTIVITY_UPDATES = new Set([
    'agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update',
    'plan', 'current_mode_update', 'available_commands_update'
]);

/**
 * inject({providerId, sessionId, text, cwd, wait, timeoutMs, turnTimeoutMs})
 *  - wait:'delivered' (défaut) : résout dès que la session cible montre une
 *    activité après session/prompt (preuve de livraison), le tour continue en
 *    tâche de fond jusqu'à end_turn ou turnTimeoutMs.
 *  - wait:'turn' : attend la réponse session/prompt (stopReason + texte agent).
 * Rejette tôt si provider non mappé, session non attachable ou spawn impossible.
 */
function inject(opts) {
    const { providerId, text, cwd, wait = 'delivered', timeoutMs = 120000, turnTimeoutMs = 600000 } = opts || {};
    const rawSessionId = opts?.sessionId;
    const sessionId = (rawSessionId || '').replace(/^acp\/[^\/]+\//, '');
    if (!providerId || !sessionId || !text) return Promise.reject(new Error('providerId/sessionId/text requis'));
    const spec = providerCommand(providerId);
    if (!spec) return Promise.reject(Object.assign(new Error(`provider ACP non injectable: ${providerId}`), { code: 'unsupported' }));

    const lock = adapters.acquireAcpLock(providerId, timeoutMs);
    if (!lock.acquired) {
        return Promise.reject(Object.assign(new Error(`[acp-inject] ${lock.reason}`), { code: 'locked', remainingMs: lock.remainingMs }));
    }

    return new Promise((resolve, reject) => {
        const child = spawn(spec.cmd, spec.args, {
            cwd: cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: spec.env ? { ...process.env, ...spec.env } : process.env
        });

        let buf = '';
        let nextId = 1;
        let settled = false;
        const pending = new Map();
        const replyChunks = [];
        let promptDone = false;
        let activitySeen = false;

        const deadline = Date.now() + timeoutMs;
        const timer = setTimeout(() => fail(new Error(`acp-inject timeout ${timeoutMs}ms`)), timeoutMs);
        // Laisse le tour se terminer même si 'delivered' a déjà résolu.
        const turnTimer = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, turnTimeoutMs);
        turnTimer.unref?.();

        function fail(err) {
            if (settled) return;
            settled = true;
            adapters.releaseAcpLock(providerId);
            clearTimeout(timer);
            clearTimeout(turnTimer);
            try { child.kill(); } catch { /* noop */ }
            reject(err);
        }
        function succeed(extra) {
            adapters.releaseAcpLock(providerId);
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (!extra || !extra.pending) {
                clearTimeout(turnTimer);
            }
            resolve(Object.assign({
                sent: true, via: 'acp-stdio', providerId, sessionId,
                delivered: activitySeen || promptDone
            }, extra));
        }

        function request(method, params) {
            const id = nextId++;
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
            return new Promise((res, rej) => pending.set(id, { res, rej }));
        }
        function respond(id, result) {
            try { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); } catch { /* noop */ }
        }

        function handleAgentRequest(msg) {
            const { id, method, params } = msg;
            try {
                switch (method) {
                    case 'fs/read_text_file':
                        return respond(id, { content: fs.readFileSync(params.path, 'utf8') });
                    case 'fs/write_text_file':
                        fs.mkdirSync(path.dirname(params.path), { recursive: true });
                        fs.writeFileSync(params.path, params.content);
                        return respond(id, {});
                    case 'session/request_permission': {
                        const options = params?.options || [];
                        const allow = options.find((o) => /allow/i.test(o.kind || o.name || '')) || options[0];
                        return respond(id, { outcome: allow ? { outcome: 'selected', optionId: allow.optionId } : { outcome: 'cancelled' } });
                    }
                    default:
                        return respond(id, null);
                }
            } catch {
                return respond(id, null);
            }
        }

        function handleNotification(msg) {
            if (msg.method !== 'session/update') return;
            if (msg.params?.sessionId && msg.params.sessionId !== sessionId) return;
            const u = msg.params?.update;
            if (!u) return;
            if (ACTIVITY_UPDATES.has(u.sessionUpdate)) activitySeen = true;
            if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') {
                replyChunks.push(u.content.text);
            }
        }

        child.stdout.on('data', (chunk) => {
            buf += chunk.toString('utf8');
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line) continue;
                let msg;
                try { msg = JSON.parse(line); } catch { continue; }
                if (msg.id != null && msg.method) {
                    handleAgentRequest(msg);
                } else if (msg.id != null && pending.has(msg.id)) {
                    const p = pending.get(msg.id);
                    pending.delete(msg.id);
                    msg.error ? p.rej(Object.assign(new Error(msg.error.message || 'ACP error'), { acpError: msg.error })) : p.res(msg.result);
                } else if (msg.method) {
                    handleNotification(msg);
                }
            }
        });
        child.on('error', (e) => fail(Object.assign(e, { code: e.code || 'spawn' })));
        child.on('exit', (code) => {
            adapters.releaseAcpLock(providerId);
            if (!settled) {
                if (activitySeen || promptDone) succeed({ exited: true });
                else fail(new Error(`provider ${providerId} terminé (code ${code}) avant livraison`));
            }
        });
        child.stderr.on('data', () => { /* diagnostics provider ignorés */ });

        (async () => {
            const init = await request('initialize', {
                protocolVersion: 1,
                clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
                clientInfo: { name: 'hephaistos-acp-inject', version: '1.0.0' }
            });
            if (Date.now() > deadline) throw new Error('acp-inject timeout pendant initialize');

            // Attachement EXACT à la session existante. Jamais session/new.
            let attached = false;
            const attachErrors = [];
            for (const method of ['session/load', 'session/resume']) {
                if (method === 'session/load' && init?.agentCapabilities?.loadSession === false) continue;
                try {
                    await request(method, { sessionId, cwd: cwd || process.cwd(), mcpServers: [] });
                    attached = true;
                    break;
                } catch (e) { attachErrors.push(`${method}: ${e.message}`); }
            }
            if (!attached) {
                throw Object.assign(new Error(`session ${sessionId} non attachable (${attachErrors.join(' ; ') || 'aucune méthode'})`), { code: 'no-session' });
            }
            if (Date.now() > deadline) throw new Error('acp-inject timeout pendant session/load');

            const promptPromise = request('session/prompt', {
                sessionId,
                prompt: [{ type: 'text', text }]
            });

            if (wait === 'turn') {
                const res = await promptPromise;
                promptDone = true;
                succeed({ stopReason: res?.stopReason, reply: replyChunks.join('') });
                try { child.kill(); } catch { /* noop */ }
                return;
            }

            // wait === 'delivered' : preuve d'activité ou réponse complète.
            promptPromise.then((res) => {
                promptDone = true;
                succeed({ stopReason: res?.stopReason, reply: replyChunks.join('') });
                try { child.kill(); } catch { /* noop */ }
            }, (e) => fail(e));

            const poll = setInterval(() => {
                if (settled) { clearInterval(poll); return; }
                if (activitySeen || promptDone) {
                    clearInterval(poll);
                    // Ne tue pas l'enfant : le tour continue jusqu'à end_turn.
                    succeed({ pending: !promptDone });
                }
            }, 100);
            poll.unref?.();
        })().catch((e) => fail(e));
    });
}

/* ===== CLI ===== */
function cli() {
    const argv = process.argv.slice(2);
    const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
    const providerId = opt('--provider');
    const sessionId = opt('--session');
    const wait = opt('--wait') || 'delivered';
    const cwd = opt('--cwd') || process.cwd();
    const timeoutSec = Number(opt('--timeout') || 120);
    let text = opt('--prompt');

    if (argv.includes('--list')) {
        console.log(JSON.stringify(listProviders()));
        return;
    }
    if (!providerId || !sessionId) {
        console.error('usage: acp-inject.js --provider <id> --session <id> [--prompt "..."|--stdin] [--cwd DIR] [--wait delivered|turn] [--timeout SEC] [--list]');
        process.exit(64);
    }
    const run = (input) => inject({
        providerId, sessionId, text: input, cwd,
        wait: wait === 'turn' ? 'turn' : 'delivered',
        timeoutMs: timeoutSec * 1000
    }).then((res) => {
        console.log(JSON.stringify(res, null, 1));
    }).catch((e) => {
        console.log(JSON.stringify({ sent: false, error: e.message, code: e.code || null }));
        process.exit(1);
    });

    if (argv.includes('--stdin') || text == null) {
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (d) => { input += d; });
        process.stdin.on('end', () => run(input));
    } else {
        run(text);
    }
}

if (require.main === module) cli();

module.exports = { inject, providerCommand, listProviders };
