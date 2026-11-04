#!/usr/bin/env node
/**
 * devin-hub.js — Client de communication directe avec Devin dans l'IDE (sans orchestrateur).
 *
 * Symétrique à agy-hub.js (qui pilote Antigravity en Connect-RPC).
 * devin-hub.js communique via le bridge WebSocket local (ws://127.0.0.1:7477)
 * vers l'extension orchestrator-monitor qui exécute devin.sendChatActionMessage.
 *
 * Usage :
 *   node devin-hub.js current                     → cascadeId active de Devin
 *   node devin-hub.js send <texte> [cascadeId]    → injecte un message direct dans le chat Devin
 *   node devin-hub.js status                      → statut de connexion au bridge
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { randomUUID } = require('crypto');
let WebSocket;
const wsCandidates = [
    path.join(__dirname, '..', '..', 'extensions', 'orchestrator-monitor', 'ws-bridge', 'node_modules', 'ws'),
    path.join(__dirname, '..', 'ws-bridge', 'node_modules', 'ws')
];
// Extensions IDE installées (toute version) : ~/.devin/extensions/hephaistos.orchestrator-monitor-*
for (const base of [path.join(os.homedir(), '.devin', 'extensions'), path.join(os.homedir(), '.vscode', 'extensions')]) {
    try {
        for (const d of fs.readdirSync(base)) {
            if (d.startsWith('hephaistos.orchestrator-monitor-')) {
                wsCandidates.push(path.join(base, d, 'ws-bridge', 'node_modules', 'ws'));
            }
        }
    } catch { /* dossier absent */ }
}
wsCandidates.push('ws');
for (const cand of wsCandidates) {
    try {
        WebSocket = require(cand);
        if (WebSocket) break;
    } catch { /* try next */ }
}
if (!WebSocket) {
    console.error('[devin-hub] ws module introuvable');
    process.exit(1);
}

let comms;
try { comms = require('./comms'); } catch { comms = null; }

// Le bridge exige un token d'auth (revue sécu) : ORCH_MONITOR_TOKEN env,
// sinon ws-bridge.token dans un .agent connu (écrit par le bridge au boot).
function bridgeWsUrl(port) {
    let tok = (process.env.ORCH_MONITOR_TOKEN || '').trim();
    if (!tok) {
        const candidates = [
            comms && comms.workspaceRoot ? path.join(comms.workspaceRoot(), '.agent', 'ws-bridge.token') : null,
            path.join(__dirname, '..', 'ws-bridge.token'),                    // .agent/agent-bridge → .agent
            path.join(__dirname, '..', '..', '..', '.agent', 'ws-bridge.token'), // bundled ext → racine repo
            path.join(process.cwd(), '.agent', 'ws-bridge.token'),
            process.env.HEPHAISTOS_WORKSPACE
                ? path.join(process.env.HEPHAISTOS_WORKSPACE, '.agent', 'ws-bridge.token') : null,
        ].filter(Boolean);
        for (const f of candidates) {
            try {
                const t = fs.readFileSync(f, 'utf8').trim();
                if (t) { tok = t; break; }
            } catch { /* absent */ }
        }
    }
    return `ws://127.0.0.1:${port}${tok ? `?token=${encodeURIComponent(tok)}` : ''}`;
}

function getActiveCascade() {
    // 1) Source fiable : sessioninfo.updatedAt du globalStorage Devin (activité
    //    utilisateur réelle) — délégué à current-cascade.js. Le .pb mtime est
    //    pollué par des writes de fond (chats vierges au reload, wakes injectés)
    //    et ciblait la mauvaise conversation.
    try {
        const id = execFileSync(process.execPath,
            [path.join(__dirname, 'current-cascade.js')],
            { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
        if (id) return id;
    } catch { /* fallback .pb */ }
    // 2) Fallback : .pb le plus récemment écrit sous .devin
    const cascadeDirs = [
        path.join(os.homedir(), '.devin', 'cascade'),
        path.join(os.homedir(), '.devin', 'codeium', 'cascade'),
        path.join(os.homedir(), '.codeium', 'cascade')
    ];
    for (const dir of cascadeDirs) {
        try {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.pb') && !f.endsWith('.archived'))
                .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
                .sort((a, b) => b.m - a.m);
            if (files.length) return files[0].f.replace(/\.pb$/, '');
        } catch { /* continuer */ }
    }
    return null;
}

function sendToDevin(text, cascadeId, port = 7477, sourceAgent = process.env.HEPHAISTOS_AGENT || 'devin-hub') {
    return new Promise((resolve, reject) => {
        // Cible explicite d'abord (un message adressé à X ne doit jamais
        // atterrir dans Y) ; sans cible, la conv actuellement active.
        const targetId = cascadeId || getActiveCascade();
        if (!targetId) { reject(new Error('Aucune session Devin cible')); return; }
        const ws = new WebSocket(bridgeWsUrl(port));
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`Timeout de connexion au bridge Devin ws://127.0.0.1:${port}`));
        }, 5000);

        ws.on('open', () => {
            const payload = {
                command: 'wake_devin',
                text: text,
                cascadeId: targetId
            };
            ws.send(JSON.stringify(payload));
            if (comms) {
                comms.log({
                    src: sourceAgent,
                    dst: 'devin',
                    kind: 'prompt',
                    text: text,
                    convId: targetId
                });
            }
            clearTimeout(timeout);
            setTimeout(() => {
                ws.close();
                resolve({ sent: true, cascadeId: targetId });
            }, 300);
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

function bridgeRequest(command, payload, resultType, port = 7477, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const requestId = randomUUID();
        const ws = new WebSocket(bridgeWsUrl(port));
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            try { ws.close(); } catch { /* noop */ }
            fn(value);
        };
        const timeout = setTimeout(() => finish(reject, new Error(`Timeout ${command} via Devin bridge`)), timeoutMs);
        ws.on('open', () => ws.send(JSON.stringify({ command, requestId, ...payload })));
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }
            if (msg?.requestId !== requestId || msg?.type !== resultType) return;
            if (msg.error) finish(reject, new Error(String(msg.error)));
            else finish(resolve, msg);
        });
        ws.on('error', (error) => finish(reject, error));
        ws.on('close', () => {
            if (!settled) finish(reject, new Error(`${command} bridge connection closed before response`));
        });
    });
}

// FR-10 : inventaire direct quand le WS :7477 ne répond pas. Les sessions ACP
// de TOUS les providers sont persistées par l'IDE dans le globalStorage :
// state.vscdb, clés `windsurf.acp.sessioninfo.session.<id>` (même source que
// current-cascade.js, mais sans le filtre USER_PROVIDERS).
function listAcpSessionsDirect(providerId) {
    let DatabaseSync;
    try { DatabaseSync = require('node:sqlite').DatabaseSync; } catch { return []; }
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const dbPath = path.join(appdata, 'Devin', 'User', 'globalStorage', 'state.vscdb');
    if (!fs.existsSync(dbPath)) return [];
    let db;
    try { db = new DatabaseSync(dbPath, { readOnly: true }); } catch { return []; }
    try {
        const rows = db.prepare(
            "SELECT value FROM ItemTable WHERE key LIKE 'windsurf.acp.sessioninfo.session.%'"
        ).all();
        const out = [];
        for (const r of rows) {
            try {
                const p = JSON.parse(r.value);
                if (providerId && p.providerId !== providerId) continue;
                const info = p.info || {};
                if (!info.sessionId) continue;
                out.push({
                    sessionId: info.sessionId,
                    providerId: p.providerId || '',
                    title: info.title || '',
                    focused: Boolean(info.focused ?? p.focused),
                    updatedAt: info.updatedAt || '',
                    userMessageCount: info._meta?.['cognition.ai/userMessageCount'] ?? null,
                    source: 'state.vscdb',
                });
            } catch { /* entrée non-JSON */ }
        }
        return out;
    } catch { return []; }
    finally { try { db.close(); } catch { /* noop */ } }
}

async function listAcpSessions(providerId, port = 7477, workspaceRoot = process.env.HEPHAISTOS_WORKSPACE || process.cwd()) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot) throw new Error('ACP session listing requires an explicit workspace');
    // Bridge WS d'abord (inventaire temps réel de l'extension) — 1.5s puis
    // fallback disque : une extension morte ne doit plus vider l'inventaire.
    try {
        const result = await bridgeRequest('list_acp_sessions', { providerId: providerId || '', workspaceRoot }, 'acp_sessions_result', port, 1500);
        if (Array.isArray(result.sessions) && result.sessions.length) return result.sessions;
    } catch { /* WS mort/lent → fallback disque */ }
    return listAcpSessionsDirect(providerId);
}

async function sendToAcpAgent(text, sessionId, providerId, port = 7477, workspaceRoot = process.env.HEPHAISTOS_WORKSPACE || process.cwd()) {
    if (typeof text !== 'string' || !text || typeof sessionId !== 'string' || !sessionId ||
        typeof providerId !== 'string' || !providerId || typeof workspaceRoot !== 'string' || !workspaceRoot) {
        throw new Error('ACP send requires explicit text, sessionId, providerId and workspace');
    }
    // Normalisation : le roster et les schémas stockent parfois le slug nu
    // ('sugary-shoemaker') alors que redux acp.sessions indexe par l'id complet
    // ('acp/devin-cli/sugary-shoemaker'). Sans ça : wake-acp-unknown + FIFO.
    const fullId = sessionId.includes('/') ? sessionId : `acp/${providerId}/${sessionId}`;
    const result = await bridgeRequest('wake_acp_agent', { text, sessionId: fullId, providerId, workspaceRoot }, 'acp_wake_result', port, 120000);
    return { status: result.status, sessionId: fullId, providerId };
}

/**
 * Envoi AGY via le démon ws-bridge 7477 — SEUL tunnel canonique.
 * L'extension route `wake_antigravity` vers le hub agy.exe (Connect-RPC) et,
 * si replyToCascadeId est fourni, relaie la réponse du pair dans la conv Devin
 * de l'expéditeur. Ne jamais appeler agy-hub.sendMessage en direct : ça court-
 * circuite le démon (pas de routage central, pas de relay, fenêtres parasites).
 */
function sendToAntigravity(text, agyCascadeId, replyToCascadeId, port = 7477, sourceAgent = process.env.HEPHAISTOS_AGENT || 'devin-hub') {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(bridgeWsUrl(port));
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`Timeout de connexion au bridge Devin ws://127.0.0.1:${port}`));
        }, 5000);
        ws.on('open', () => {
            ws.send(JSON.stringify({
                command: 'wake_antigravity',
                text: text,
                agyCascadeId: agyCascadeId,
                replyToCascadeId: replyToCascadeId || ''
            }));
            if (comms) {
                comms.log({ src: sourceAgent, dst: 'agy', kind: 'prompt', text: text, convId: agyCascadeId });
            }
            clearTimeout(timeout);
            setTimeout(() => { ws.close(); resolve({ sent: true, agyCascadeId }); }, 300);
        });
        ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
}

// CLI
if (require.main === module) {
    const [cmd, ...args] = process.argv.slice(2);
    if (!cmd || cmd === 'help') {
        console.log('Usage:');
        console.log('  node devin-hub.js current');
        console.log('  node devin-hub.js send <texte> [cascadeId]');
        console.log('  node devin-hub.js acp-list [providerId]  → sessions ACP activées du workspace');
        console.log('  node devin-hub.js status');
        process.exit(0);
    }

    if (cmd === 'current') {
        const id = getActiveCascade();
        if (id) {
            console.log(id);
            process.exit(0);
        } else {
            console.error('Aucune session Devin active trouvée');
            process.exit(1);
        }
    }

    if (cmd === 'acp-list') {
        listAcpSessions(args[0] || undefined)
            .then((sessions) => console.log(JSON.stringify(sessions, null, 1)))
            .catch((err) => { console.error(JSON.stringify({ error: err.message }, null, 1)); process.exit(1); });
    }

    if (cmd === 'status') {
        const ws = new WebSocket(bridgeWsUrl(7477));
        ws.on('open', () => {
            console.log(JSON.stringify({ status: 'connected', port: 7477, activeCascade: getActiveCascade() }, null, 2));
            ws.close();
        });
        ws.on('error', (e) => {
            console.error(JSON.stringify({ status: 'error', error: e.message }, null, 2));
            process.exit(1);
        });
    }

    if (cmd === 'send') {
        const asIdx = args.indexOf('--as');
        const asAgent = asIdx !== -1 ? args[asIdx + 1] : null;
        const pos = asIdx === -1 ? args : args.filter((a, i) => i !== asIdx && i !== asIdx + 1);
        const text = pos[0];
        if (!text) {
            console.error('Erreur: texte requis. Usage: node devin-hub.js send "<texte>" [cascadeId] [--as <agent>]');
            process.exit(1);
        }
        const cascadeId = pos[1] || null;
        sendToDevin(text, cascadeId, 7477, asAgent || process.env.HEPHAISTOS_AGENT || 'devin-hub')
            .then(res => {
                console.log(JSON.stringify({ status: 'sent', cascadeId: res.cascadeId, text: text }, null, 2));
            })
            .catch(err => {
                console.error(JSON.stringify({ status: 'failed', error: err.message }, null, 2));
                process.exit(1);
            });
    }
}

module.exports = { getActiveCascade, sendToDevin, listAcpSessions, listAcpSessionsDirect, sendToAcpAgent, sendToAntigravity };
