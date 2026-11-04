#!/usr/bin/env node
/**
 * comms.js — bus d'échanges inter-agents (Devin ⇄ AGY ⇄ CLIs).
 *
 * Format : append-only JSONL dans <workspace>/.agent/comms.jsonl.
 * N'importe quel process (extension, CLI, bridge, script) peut append —
 * le ws-bridge tail le fichier et broadcast aux webviews du monitor.
 *
 * Entrée : {ts, src, dst, kind, text, convId?, taskId?, phase?, pairId?, replyTo?, session?, peerCascade?, transport?, peerTransport?, providerId?, peerProviderId?}
 *   src/dst : 'devin' | 'agy' | 'kilo' | 'hermes' | ... | 'user'
 *   kind    : 'prompt' | 'reply' | 'wake' | 'result' | 'event' | 'error' | 'handshake'
 *
 * Env : COMMS_LOG (chemin complet) ou HEPHAISTOS_WORKSPACE (racine workspace).
 *
 * CLI :
 *   node comms.js log <src> <dst> <kind> <texte> [convId] [taskId]
 *   node comms.js tail [n]      → dernières entrées
 *   node comms.js path          → chemin du fichier
 */
'use strict';

const fs = require('fs');
const path = require('path');

function workspaceRoot() {
    if (process.env.HEPHAISTOS_WORKSPACE) return process.env.HEPHAISTOS_WORKSPACE;
    // cwd si on est lancé depuis la racine du workspace (cas courant en CLI)
    try {
        const cwd = process.cwd();
        if (fs.existsSync(path.join(cwd, '.agent')) || fs.existsSync(path.join(cwd, '.git'))) return cwd;
    } catch { /* ignore */ }
    // Remonter depuis __dirname jusqu'au premier ancêtre qui contient
    // .agent/ — couvre agent-bridge/ sous .agent/ (copie portable) et
    // sous extensions/orchestrator-monitor/ (repo/extension installée).
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        if (fs.existsSync(path.join(dir, '.agent', 'rules')) || fs.existsSync(path.join(dir, 'orchestrator.db'))) return dir;
    }
    return path.join(__dirname, '..', '..', '..');
}

function commsPath() {
    return process.env.COMMS_LOG || path.join(workspaceRoot(), '.agent', 'comms.jsonl');
}

/** Nettoie la sortie CLI : ANSI + caractères de contrôle (ollama & co crachent de l'ANSI brut). */
function sanitize(text) {
    return String(text ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // séquences CSI
        .replace(/\x1b[()][0-9A-B]/g, '')          // jeux de caractères
        .replace(/\x1b\][^\x07]*\x07/g, '')        // OSC
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Append une entrée. Tolérant aux pannes — ne throw jamais. */
function log(entry) {
    try {
        const p = commsPath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const line = JSON.stringify({
            ts: entry.ts || new Date().toISOString(),
            src: entry.src || '?',
            dst: entry.dst || '?',
            kind: entry.kind || 'event',
            text: sanitize(entry.text).slice(0, 4000),
            ...(entry.convId ? { convId: entry.convId } : {}),
            ...(entry.taskId !== undefined ? { taskId: entry.taskId } : {}),
            ...(entry.phase ? { phase: sanitize(entry.phase).slice(0, 16) } : {}),
            ...(entry.pairId ? { pairId: sanitize(entry.pairId).slice(0, 128) } : {}),
            ...(entry.replyTo ? { replyTo: sanitize(entry.replyTo).slice(0, 128) } : {}),
            ...(entry.session ? { session: sanitize(entry.session).slice(0, 120) } : {}),
            ...(entry.peerCascade ? { peerCascade: sanitize(entry.peerCascade).slice(0, 300) } : {}),
            ...(entry.transport ? { transport: sanitize(entry.transport).slice(0, 32) } : {}),
            ...(entry.peerTransport ? { peerTransport: sanitize(entry.peerTransport).slice(0, 32) } : {}),
            ...(entry.providerId ? { providerId: sanitize(entry.providerId).slice(0, 64) } : {}),
            ...(entry.peerProviderId ? { peerProviderId: sanitize(entry.peerProviderId).slice(0, 64) } : {})
        });
        fs.appendFileSync(p, line + '\n');
        return true;
    } catch { return false; }
}

/** Lit les n dernières entrées (défaut 100). */
function tail(n = 100, file = commsPath()) {
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}

const PAIRING_TTL_MS = 15 * 60 * 1000;

function handshakeTimestamp(entry) {
    const value = Date.parse(entry?.ts || '');
    return Number.isFinite(value) ? value : null;
}

function isFreshHandshake(entry, now) {
    const ts = handshakeTimestamp(entry);
    return entry?.kind === 'handshake' && Boolean(entry.pairId && entry.session && entry.convId) &&
        ts !== null && ts <= now && now - ts <= PAIRING_TTL_MS;
}

function handshakeAcked(entries, request, now) {
    return entries.some((entry) => {
        const ts = handshakeTimestamp(entry);
        return isFreshHandshake(entry, now) && entry.phase === 'ack' &&
            entry.src === request.dst && entry.dst === request.src &&
            entry.session === request.session && entry.pairId === request.pairId &&
            entry.replyTo === request.pairId && entry.peerCascade === request.convId &&
            (!request.transport || entry.peerTransport === request.transport) &&
            (!request.peerTransport || entry.transport === request.peerTransport) &&
            (!request.providerId || entry.peerProviderId === request.providerId) &&
            (!request.peerProviderId || entry.providerId === request.peerProviderId) &&
            ts >= handshakeTimestamp(request);
    });
}

function findPendingHandshake(entries, src, dst, session, now = Date.now(), srcTransport, dstTransport) {
    if (!Array.isArray(entries)) return null;
    const requests = entries.filter((entry) => isFreshHandshake(entry, now) &&
        entry.phase === 'request' && entry.src === src && entry.dst === dst && entry.session === session &&
        (!srcTransport || entry.transport === srcTransport) &&
        (!dstTransport || entry.peerTransport === dstTransport))
        .sort((a, b) => handshakeTimestamp(a) - handshakeTimestamp(b));
    const request = requests[requests.length - 1];
    return request && !handshakeAcked(entries, request, now) ? request : null;
}

function findEstablishedPair(entries, me, session, now = Date.now(), peer, myTransport, peerTransport) {
    if (!Array.isArray(entries) || typeof me !== 'string' || !me) return null;
    const requests = entries.filter((entry) => isFreshHandshake(entry, now) &&
        entry.phase === 'request' && entry.session === session &&
        ((entry.src === me && (!peer || entry.dst === peer)) || (entry.dst === me && (!peer || entry.src === peer))) &&
        (!myTransport || (entry.src === me ? entry.transport : entry.peerTransport) === myTransport) &&
        (!peerTransport || (entry.src === me ? entry.peerTransport : entry.transport) === peerTransport))
        .sort((a, b) => handshakeTimestamp(a) - handshakeTimestamp(b));
    const request = requests[requests.length - 1];
    if (!request) return null;
    const ack = entries.find((entry) => isFreshHandshake(entry, now) && entry.phase === 'ack' &&
        entry.src === request.dst && entry.dst === request.src &&
        entry.session === request.session && entry.pairId === request.pairId &&
        entry.replyTo === request.pairId && entry.peerCascade === request.convId &&
        (!request.transport || entry.peerTransport === request.transport) &&
        (!request.peerTransport || entry.transport === request.peerTransport) &&
        (!request.providerId || entry.peerProviderId === request.providerId) &&
        (!request.peerProviderId || entry.providerId === request.peerProviderId) &&
        handshakeTimestamp(entry) >= handshakeTimestamp(request));
    if (!ack) return null;
    const ids = request.src === me
        ? { myCascade: request.convId, peerCascade: ack.convId }
        : { myCascade: ack.convId, peerCascade: request.convId };
    if (!ids.myCascade || !ids.peerCascade || ids.myCascade === ids.peerCascade) return null;
    const mine = request.src === me ? request : ack;
    const other = request.src === me ? ack : request;
    return {
        pairId: request.pairId,
        session,
        peer: request.src === me ? request.dst : request.src,
        myTransport: mine.transport || null,
        peerTransport: other.transport || null,
        myProviderId: mine.providerId || null,
        peerProviderId: other.providerId || null,
        ...ids,
        request,
        ack
    };
}

function resolvePairTarget(explicitTarget, myCascade, pair) {
    if (typeof explicitTarget === 'string' && explicitTarget.trim()) return explicitTarget.trim();
    if (!pair || pair.myCascade !== myCascade || !pair.peerCascade) return null;
    return pair.peerCascade;
}

/* ---- FR-09 : persistance durable des paires dans orchestrator.db ----------
   Le handshake comms.jsonl expire à 15 min et ne survit pas au restart IDE.
   La table `pairs` (créée par ensure_schema côté hphe-kit) garde le lien :
   pair_save à l'établissement, pair_get pour le rejoin sans handshake.
   Accès direct node:sqlite comme bridge.js / nim-worker.mjs — jamais fatal. */

function orchestratorDbPath() {
    const candidates = [
        process.env.HPHE_ORCH_DB,
        process.env.ORCHESTRATOR_DB,
        process.env.HPHE_INSTALL && path.join(process.env.HPHE_INSTALL, 'data', 'orchestrator.db'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'servers', 'hephaistos2-kit', 'data', 'orchestrator.db'),
    ].filter(Boolean);
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch { /* next */ }
    }
    return null;
}

function withPairsDb(fn) {
    let DatabaseSync;
    try { DatabaseSync = require('node:sqlite').DatabaseSync; } catch { return null; }
    const dbPath = orchestratorDbPath();
    if (!dbPath) return null;
    let db = null;
    try {
        db = new DatabaseSync(dbPath);
        return fn(db);
    } catch { return null; }
    finally { try { db?.close(); } catch { /* ignore */ } }
}

/** Persiste une paire établie. Entrée : {pairId, agentA, agentB, session,
 *  transportA, transportB, cascadeA, cascadeB, model?, meta?}. */
function pairSave(pair) {
    if (!pair?.pairId || !pair.agentA || !pair.agentB) return false;
    return withPairsDb((db) => {
        db.prepare(
            `INSERT INTO pairs (pair_id, agent_a, agent_b, session, transport_a, transport_b, cascade_a, cascade_b, model, established_at, last_seen, meta)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(pair_id) DO UPDATE SET
               agent_a=excluded.agent_a, agent_b=excluded.agent_b, session=excluded.session,
               transport_a=excluded.transport_a, transport_b=excluded.transport_b,
               cascade_a=excluded.cascade_a, cascade_b=excluded.cascade_b,
               model=excluded.model, last_seen=excluded.last_seen, meta=excluded.meta`
        ).run(
            String(pair.pairId), String(pair.agentA), String(pair.agentB),
            pair.session || null, pair.transportA || null, pair.transportB || null,
            pair.cascadeA || null, pair.cascadeB || null, pair.model || null,
            new Date().toISOString(), new Date().toISOString(),
            pair.meta ? String(pair.meta).slice(0, 4000) : null
        );
        return true;
    }) === true;
}

/** Rappelle la dernière paire persistée pour (agent, peer[, session]).
 *  → {pairId, session, myCascade, peerCascade, myTransport, peerTransport}
 *  orienté du point de vue de `agent`. null si absente. */
function pairGet(agent, peer, session) {
    if (typeof agent !== 'string' || !agent) return null;
    return withPairsDb((db) => {
        const row = session
            ? db.prepare(
                `SELECT * FROM pairs
                 WHERE ((agent_a=? AND agent_b=?) OR (agent_a=? AND agent_b=?)) AND session=?
                 ORDER BY last_seen DESC LIMIT 1`
              ).get(agent, peer || '', peer || '', agent, session)
            : db.prepare(
                `SELECT * FROM pairs
                 WHERE (agent_a=? AND agent_b=?) OR (agent_a=? AND agent_b=?)
                 ORDER BY last_seen DESC LIMIT 1`
              ).get(agent, peer || '', peer || '', agent);
        if (!row) return null;
        const mine = row.agent_a === agent;
        return {
            pairId: row.pair_id,
            session: row.session,
            peer: mine ? row.agent_b : row.agent_a,
            myCascade: mine ? row.cascade_a : row.cascade_b,
            peerCascade: mine ? row.cascade_b : row.cascade_a,
            myTransport: mine ? row.transport_a : row.transport_b,
            peerTransport: mine ? row.transport_b : row.transport_a,
            model: row.model,
            lastSeen: row.last_seen,
            restored: true,
        };
    });
}

/**
 * Lit les octets ajoutés depuis `offset`. → {entries, offset}
 * offset négatif/géré par l'appelant (bridge : offset = taille lue précédente).
 */
function readFrom(offset, file = commsPath()) {
    try {
        const st = fs.statSync(file);
        if (offset > st.size) offset = 0; // fichier tronqué → repartir du début
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(st.size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        const entries = buf.toString('utf8').split('\n').filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        return { entries, offset: st.size };
    } catch { return { entries: [], offset: 0 }; }
}

if (require.main === module) {
    const [cmd, ...a] = process.argv.slice(2);
    if (cmd === 'log') {
        const [src, dst, kind, ...rest] = a;
        const taskId = /^\d+$/.test(a[a.length - 1] || '') ? Number(a.pop()) : undefined;
        const convId = /^[0-9a-f-]{36}$/i.test(a[a.length - 1] || '') ? a.pop() : undefined;
        log({ src, dst, kind, text: rest.join(' '), convId, taskId });
    } else if (cmd === 'tail') {
        tail(a[0] ? Number(a[0]) : 20).forEach((e) => console.log(`[${e.ts}] ${e.src}→${e.dst} ${e.kind}: ${e.text.slice(0, 200)}`));
    } else if (cmd === 'path') {
        console.log(commsPath());
    } else {
        console.error('cmds: log <src> <dst> <kind> <texte> [convId] [taskId] | tail [n] | path');
        process.exit(2);
    }
}

module.exports = {
    log,
    tail,
    readFrom,
    commsPath,
    workspaceRoot,
    PAIRING_TTL_MS,
    findPendingHandshake,
    findEstablishedPair,
    resolvePairTarget,
    pairSave,
    pairGet
};
