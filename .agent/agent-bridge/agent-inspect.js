#!/usr/bin/env node
/**
 * agent-inspect.js — Diagnostic ultra-rapide (<50ms) des sessions Devin / Subalternes.
 * 
 * Utilise node:sqlite sur %APPDATA%/devin/cli/sessions.db en lecture seule directe.
 * Zéro fumbling, zéro boucle de recherche, zéro timeout.
 * 
 * Usage :
 *   node agent-inspect.js --list              -> Liste synthétique des sessions récentes et de leur état
 *   node agent-inspect.js <sessionId|slug>    -> Rapport 1-shot complet d'une session (prompt, statut, blocage)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const SESSIONS_DB = path.join(APPDATA, 'devin', 'cli', 'sessions.db');

function openSessionsDb() {
    if (!fs.existsSync(SESSIONS_DB)) {
        throw new Error(`Base sessions.db introuvable : ${SESSIONS_DB}`);
    }
    return new DatabaseSync(SESSIONS_DB, { readOnly: true });
}

function listSessions(limit = 10) {
    const db = openSessionsDb();
    const rows = db.prepare(`
        SELECT 
            s.id, 
            s.title, 
            s.model, 
            s.working_directory,
            datetime(s.last_activity_at/1000, 'unixepoch', 'localtime') as last_act,
            (SELECT COUNT(*) FROM message_nodes WHERE session_id = s.id) as node_count,
            (SELECT MAX(node_id) FROM message_nodes WHERE session_id = s.id) as max_node
        FROM sessions s
        ORDER BY s.last_activity_at DESC
        LIMIT ?
    `).all(limit);

    console.log(`\n=== SESSIONS DEVIN RÉCENTES (${rows.length}) ===\n`);
    for (const r of rows) {
        let stateTag = 'IDLE';
        let lastTool = '';
        if (r.max_node) {
            const lastNodeRow = db.prepare(`
                SELECT chat_message FROM message_nodes 
                WHERE session_id = ? AND node_id = ?
            `).get(r.id, r.max_node);
            if (lastNodeRow) {
                try {
                    const msg = JSON.parse(lastNodeRow.chat_message);
                    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                        stateTag = 'PENDING_TOOL';
                        lastTool = msg.tool_calls.map(t => t.name || t.function?.name || 'tool').join(', ');
                    } else if (msg.role === 'user' && msg.content === 'continue') {
                        stateTag = 'CONTINUE_LOOP';
                    } else if (msg.role === 'assistant' && msg.content) {
                        stateTag = 'REPLIED';
                    }
                } catch {}
            }
        }
        console.log(`- [${stateTag}] ${r.id}`);
        console.log(`  Titre    : ${r.title || '(sans titre)'}`);
        console.log(`  Dernier  : Node ${r.max_node || 0} (${r.last_act || 'inconnu'}) | Modèle: ${r.model || 'défaut'}`);
        if (lastTool) console.log(`  Outil en attente : ${lastTool}`);
    }
    console.log('');
}

function inspectSession(targetId) {
    const db = openSessionsDb();
    const id = targetId.replace(/^acp\/[^\/]+\//, '');

    const session = db.prepare(`
        SELECT 
            id, title, model, backend_type, working_directory,
            datetime(created_at/1000, 'unixepoch', 'localtime') as created,
            datetime(last_activity_at/1000, 'unixepoch', 'localtime') as last_act
        FROM sessions 
        WHERE id = ? OR id LIKE ?
    `).get(id, `%${id}%`);

    if (!session) {
        console.error(`Session introuvable dans sessions.db pour : ${targetId}`);
        process.exit(1);
    }

    const realId = session.id;

    // 1. Prompt initial
    let promptInitial = '(aucun prompt utilisateur trouvé)';
    const firstUserNode = db.prepare(`
        SELECT node_id, chat_message FROM message_nodes 
        WHERE session_id = ? AND node_id <= 10
        ORDER BY node_id ASC
    `).all(realId);

    for (const n of firstUserNode) {
        try {
            const msg = JSON.parse(n.chat_message);
            if (msg.role === 'user' && msg.content && msg.content !== 'continue' && !msg.telemetry?.operation) {
                promptInitial = msg.content;
                break;
            }
        } catch {}
    }

    // 2. Derniers noeuds (5 derniers)
    const lastNodes = db.prepare(`
        SELECT node_id, chat_message 
        FROM message_nodes 
        WHERE session_id = ? 
        ORDER BY node_id DESC 
        LIMIT 5
    `).all(realId);

    let currentStatus = 'IDLE';
    let blockReason = null;
    let pendingToolCalls = [];
    let continueLoopCount = 0;
    let lastAssistantReply = '';

    for (const n of lastNodes) {
        try {
            const msg = JSON.parse(n.chat_message);
            if (msg.role === 'user' && msg.content === 'continue') {
                continueLoopCount++;
            }
            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && pendingToolCalls.length === 0) {
                pendingToolCalls = msg.tool_calls;
            }
            if (msg.role === 'assistant' && msg.content && !lastAssistantReply) {
                lastAssistantReply = msg.content.slice(0, 300);
            }
            if (msg.role === 'tool' && (msg.content || '').includes('error') && !blockReason) {
                blockReason = msg.content.slice(0, 200);
            }
        } catch {}
    }

    if (continueLoopCount >= 2) {
        currentStatus = 'STALLED_IN_CONTINUE_LOOP';
    } else if (pendingToolCalls.length > 0) {
        currentStatus = 'WAITING_TOOL_CALL';
    } else if (lastAssistantReply) {
        currentStatus = 'ACTIVE_OR_COMPLETED';
    }

    console.log(`\n======================================================`);
    console.log(`RAPPORT D'INSPECTION SESSION : ${realId}`);
    console.log(`======================================================`);
    console.log(`Titre        : ${session.title}`);
    console.log(`Workspace    : ${session.working_directory}`);
    console.log(`Modèle       : ${session.model}`);
    console.log(`Créée le     : ${session.created}`);
    console.log(`Dernière act : ${session.last_act}`);
    console.log(`Statut déduit: ${currentStatus}`);
    console.log(`------------------------------------------------------`);
    console.log(`PROMPT INITIAL :`);
    console.log(promptInitial.length > 400 ? promptInitial.slice(0, 400) + '...' : promptInitial);
    console.log(`------------------------------------------------------`);
    if (pendingToolCalls.length > 0) {
        console.log(`OUTILS APPELÉS EN COURS :`);
        for (const tc of pendingToolCalls) {
            console.log(`  - ${tc.name || tc.function?.name} args: ${JSON.stringify(tc.arguments || tc.function?.arguments || {})}`);
        }
    }
    if (blockReason) {
        console.log(`DERNIÈRE ERREUR OUTIL DÉTECTÉE :`);
        console.log(`  ${blockReason}`);
    }
    if (continueLoopCount > 0) {
        console.log(`PULSES PASSIVES CONTINUE DÉTECTÉES : ${continueLoopCount} d'affilée (stagnation probable)`);
    }
    if (lastAssistantReply) {
        console.log(`DERNIÈRE RÉPONSE ASSISTANT :`);
        console.log(lastAssistantReply + (lastAssistantReply.length >= 300 ? '...' : ''));
    }
    console.log(`======================================================\n`);
}

const arg = process.argv[2];
if (!arg || arg === '--list' || arg === '-l') {
    listSessions(10);
} else {
    inspectSession(arg);
}
