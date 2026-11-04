// obsidian-mcp-proxy — stdio MCP → Obsidian Local REST API /mcp (Streamable HTTP).
// Remplace mcp-remote : pas de port de callback OAuth, pas de navigateur, pas
// d'état partagé. Chaque session Devin spawne son propre processus — aucune
// ressource commune, donc aucun conflit multi-fenêtres.
//
// Env : OBSIDIAN_API_KEY (requis), OBSIDIAN_MCP_URL (défaut https://127.0.0.1:27124/mcp/).

import readline from 'node:readline';

const BASE = (process.env.OBSIDIAN_MCP_URL || 'https://127.0.0.1:27124/mcp/').trim();
const KEY = (process.env.OBSIDIAN_API_KEY || '').trim();
let sessionId = null;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certificat auto-signé du plugin

function emit(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(id, code, message) {
    if (id === null || id === undefined) return;
    emit({ jsonrpc: '2.0', id, error: { code, message } });
}

function extractSseJson(text) {
    // Réponse Streamable HTTP : lignes "data: {...}" — on prend la dernière.
    let last = null;
    for (const line of text.split('\n')) {
        if (line.startsWith('data:')) {
            try { last = JSON.parse(line.slice(5).trim()); } catch { /* partial */ }
        }
    }
    return last;
}

async function forward(msg) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    };
    if (KEY) headers['Authorization'] = `Bearer ${KEY}`;
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (msg.method === 'initialize') headers['mcp-protocol-version'] = '2024-11-05';

    const res = await fetch(BASE, {
        method: 'POST',
        headers,
        body: JSON.stringify(msg),
        signal: AbortSignal.timeout(30000),
    });

    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;

    if (res.status === 202) return null;              // notif acceptée, pas de corps
    if (res.status === 404 && sessionId) {            // session expirée → retry sans id
        sessionId = null;
        return forward(msg);
    }
    if (!res.ok) throw new Error(`Obsidian HTTP ${res.status}: ${await res.text().catch(() => '')}`);

    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!text.trim()) return null;
    return ct.includes('event-stream') ? extractSseJson(text) : JSON.parse(text);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
    const raw = line.trim();
    if (!raw) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    forward(msg)
        .then((res) => { if (res !== null) emit(res); })
        .catch((e) => {
            console.error(`[obsidian-mcp] ${e.message}`);
            fail(msg.id, -32000, e.message);
        });
});
