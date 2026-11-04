#!/usr/bin/env node
/**
 * message-queue.js — File d'attente persistante FIFO inter-agents (Anti-Interruption).
 *
 * Garantit qu'aucun message ou invite ne vient couper ou perturber un agent en cours
 * de travail (génération, exécution d'outil, tour actif).
 *
 * Structure de stockage : <workspace>/.agent/queue/<safeSessionId>.jsonl
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const adapters = require('./agent-adapters');

let comms;
try { comms = require('./comms'); } catch { comms = null; }

function getQueueDir(workspaceRoot) {
    const root = workspaceRoot || (comms && comms.workspaceRoot ? comms.workspaceRoot() : process.cwd());
    const qDir = path.join(root, '.agent', 'queue');
    if (!fs.existsSync(qDir)) {
        try { fs.mkdirSync(qDir, { recursive: true }); } catch { /* best-effort */ }
    }
    return qDir;
}

function safeQueueFile(sessionId, workspaceRoot) {
    const qDir = getQueueDir(workspaceRoot);
    const safeName = String(sessionId || 'default')
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .slice(0, 120);
    return path.join(qDir, `${safeName}.jsonl`);
}

/**
 * Lit tous les éléments en file pour une session.
 */
function readQueue(sessionId, workspaceRoot) {
    const file = safeQueueFile(sessionId, workspaceRoot);
    if (!fs.existsSync(file)) return [];
    try {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        return lines.map((l) => {
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
    } catch { return []; }
}

/**
 * Écrit l'ensemble de la file pour une session.
 */
function writeQueue(sessionId, items, workspaceRoot) {
    const file = safeQueueFile(sessionId, workspaceRoot);
    if (!items || items.length === 0) {
        try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* best-effort */ }
        return;
    }
    const content = items.map((x) => JSON.stringify(x)).join('\n') + '\n';
    try { fs.writeFileSync(file, content, 'utf8'); } catch { /* best-effort */ }
}

/**
 * Enfile un message pour un destinataire.
 */
function enqueue(item, workspaceRoot) {
    const sessionId = item.sessionId || item.convId || item.targetId;
    if (!sessionId) throw new Error('[message-queue] sessionId requis pour enfiler un message');

    const msg = {
        id: item.id || randomUUID(),
        ts: item.ts || new Date().toISOString(),
        src: item.src || 'unknown',
        dst: item.dst || 'unknown',
        sessionId,
        transport: item.transport || 'unknown',
        text: item.text || '',
        kind: item.kind || 'prompt'
    };

    const items = readQueue(sessionId, workspaceRoot);
    items.push(msg);
    writeQueue(sessionId, items, workspaceRoot);

    if (comms) {
        comms.log({
            src: msg.src,
            dst: msg.dst,
            kind: 'queued',
            text: `[File d'attente pos ${items.length}] ${msg.text.slice(0, 100)}`,
            convId: sessionId
        });
    }

    return { enqueued: true, position: items.length, id: msg.id };
}

/**
 * Dépile le premier message pour une session.
 */
function dequeue(sessionId, workspaceRoot) {
    const items = readQueue(sessionId, workspaceRoot);
    if (items.length === 0) return null;
    const next = items.shift();
    writeQueue(sessionId, items, workspaceRoot);
    return next;
}

/**
 * Consulte le message en tête sans le retirer.
 */
function peek(sessionId, workspaceRoot) {
    const items = readQueue(sessionId, workspaceRoot);
    return items.length > 0 ? items[0] : null;
}

function queueLength(sessionId, workspaceRoot) {
    return readQueue(sessionId, workspaceRoot).length;
}

/**
 * Vérifie si la cible est occupée (verrou ACP actif ou tour en cours).
 */
function isTargetBusy(agent, transport, providerId) {
    const pid = providerId || adapters.providerIdFor(agent);
    if (pid && typeof adapters.isAcpLocked === 'function') {
        if (adapters.isAcpLocked(pid)) return true;
    }
    return false;
}

module.exports = {
    enqueue,
    dequeue,
    peek,
    queueLength,
    readQueue,
    isTargetBusy,
    getQueueDir
};
