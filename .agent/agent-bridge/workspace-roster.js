#!/usr/bin/env node
/**
 * workspace-roster.js — manifeste local des fenêtres/agents du workspace
 * (« SWAT de base ») + restauration et ping-pong de vérification.
 *
 * Le manifeste `.agent/workspace-roster.json` décrit les conversations qui
 * appartiennent au workspace : agents Devin natifs (ACP), Cerberos, et les
 * Bleubites de l'extension hephaistos-chats. Au reopen du workspace :
 *
 *   restore → rouvre les panneaux Bleubites via le bus `open_chat`
 *             (bridge ws://127.0.0.1:7477 → extension → ChatPanel.open,
 *             réutilise le panneau existant — jamais de doublon) ;
 *             vérifie la présence des sessions ACP natives sans rien créer.
 *   ping    → envoie « PING : réponds uniquement PONG » sur chaque transport :
 *             - providers injectables (hephaistos, cerberos, nim, …) :
 *               acp-inject.js --wait turn → exige delivered + end_turn + reply ;
 *             - devin-cli : wake_acp_agent via le bridge (focus onglet existant,
 *               ouvre si absent, soumet le texte — pas de reply texte dispo).
 *   status  → état live : sessions ACP listées (Redux via bridge, fallback
 *             disque) + sessions Bleubites persistées (.agent/chats/sessions.json).
 *
 * --write persiste verification.lastPing + results dans le manifeste.
 *
 * CLI :
 *   node workspace-roster.js status|restore|ping [--write] [--json]
 *   node workspace-roster.js ping --only chat-mvlpm7vh,acp/cerberos/local-…
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PING_TEXT = 'PING : réponds uniquement PONG';
const DEFAULT_PORT = 7477;

let WebSocket = null;
try { WebSocket = require('ws'); } catch { /* bridgeSend sera indisponible */ }

function workspaceRoot() {
    if (process.env.HEPHAISTOS_WORKSPACE) return process.env.HEPHAISTOS_WORKSPACE;
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        if (fs.existsSync(path.join(dir, '.agent', 'workspace-roster.json'))) return dir;
    }
    return process.cwd();
}

function rosterPath(root) {
    return path.join(root, '.agent', 'workspace-roster.json');
}

function loadRoster(root) {
    return JSON.parse(fs.readFileSync(rosterPath(root), 'utf8'));
}

function emptyWorkflow() {
    return { version: 1, name: 'Flux agents', entrySessionId: null, nodes: [], edges: [] };
}

function validateWorkflow(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
        throw new Error('workflow invalide: version/nodes/edges requis');
    }

    const nodes = new Map();
    for (const raw of input.nodes) {
        const sessionId = String(raw?.sessionId || '');
        if (!sessionId || sessionId.length > 200 || nodes.has(sessionId)) {
            throw new Error(`sessionId de node invalide ou duplique: ${sessionId}`);
        }
        const x = Number(raw.position?.x);
        const y = Number(raw.position?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 20000 || Math.abs(y) > 20000) {
            throw new Error(`position invalide pour ${sessionId}`);
        }
        const skills = Array.isArray(raw.skills)
            ? raw.skills.map((item) => String(item || '').slice(0, 120)).filter(Boolean).slice(0, 24)
            : [];
        const mcps = Array.isArray(raw.mcps)
            ? raw.mcps.map((item) => String(item || '').slice(0, 120)).filter(Boolean).slice(0, 8)
            : [];
        nodes.set(sessionId, {
            sessionId,
            role: String(raw.role || 'Agent').slice(0, 120),
            task: String(raw.task || '').slice(0, 6000),
            skills,
            mcps,
            title: String(raw.title || '').slice(0, 200),
            position: { x, y },
        });
    }

    const edgeKeys = new Set();
    const edges = input.edges.map((raw) => {
        const source = String(raw?.source || '');
        const target = String(raw?.target || '');
        const key = `${source}\u0000${target}`;
        if (!nodes.has(source) || !nodes.has(target) || source === target || edgeKeys.has(key)) {
            throw new Error(`connexion invalide: ${source} -> ${target}`);
        }
        edgeKeys.add(key);
        const edgeObj = { id: String(raw.id || `edge:${source}->${target}`), source, target };
        if (raw.sourceHandle) edgeObj.sourceHandle = String(raw.sourceHandle);
        if (raw.targetHandle) edgeObj.targetHandle = String(raw.targetHandle);
        return edgeObj;
    });

    const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
    const outgoing = new Map([...nodes.keys()].map((id) => [id, []]));
    for (const edge of edges) {
        indegree.set(edge.target, indegree.get(edge.target) + 1);
        outgoing.get(edge.source).push(edge.target);
    }
    const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
    let visited = 0;
    while (ready.length) {
        const id = ready.shift();
        visited++;
        for (const next of outgoing.get(id)) {
            indegree.set(next, indegree.get(next) - 1);
            if (indegree.get(next) === 0) ready.push(next);
        }
    }
    if (visited !== nodes.size) throw new Error('connexion cyclique interdite dans un pipeline');

    const entrySessionId = input.entrySessionId == null ? null : String(input.entrySessionId);
    if (entrySessionId && !nodes.has(entrySessionId)) {
        throw new Error(`point d'entree absent du workflow: ${entrySessionId}`);
    }
    const out = {
        version: 1,
        name: String(input.name || 'Flux agents').slice(0, 120),
        entrySessionId,
        nodes: [...nodes.values()],
        edges,
    };
    if (input.activeSchema) out.activeSchema = String(input.activeSchema).slice(0, 120);
    if (input.activeSchemaId) out.activeSchemaId = String(input.activeSchemaId).slice(0, 120);
    if (input.mode === 'council' || isCouncilSchemaName(out.name) || isCouncilSchemaName(out.activeSchema)) out.mode = 'council';
    return out;
}

function dedupeRosterCore(roster) {
    roster.core = roster.core || {};
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        roster.core[group] = Array.isArray(roster.core[group]) ? roster.core[group] : [];
    }
    const nonBleubites = new Set([
        ...roster.core.devin.map((m) => m && m.sessionId).filter(Boolean),
        ...roster.core.cerberos.map((m) => m && m.sessionId).filter(Boolean),
    ]);
    roster.core.bleubites = roster.core.bleubites.filter((m) =>
        m && m.sessionId && !m.sessionId.startsWith('acp/') && !m.sessionId.startsWith('local-') && !nonBleubites.has(m.sessionId));
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        const bySession = new Map();
        for (const item of roster.core[group]) {
            if (!item || !item.sessionId) continue;
            const existing = bySession.get(item.sessionId);
            if (!existing) {
                bySession.set(item.sessionId, { ...item });
            } else {
                if (item.providerId && (existing.providerId === 'hephaistos' || !existing.providerId)) {
                    existing.providerId = item.providerId;
                }
                if (item.model && !existing.model) existing.model = item.model;
                if (item.role && (!existing.role || existing.role === 'Agent' || existing.role === 'Devin')) {
                    existing.role = item.role;
                }
                if (item.title && !existing.title) existing.title = item.title;
                if (typeof item.hidden === 'boolean') existing.hidden = item.hidden;
            }
        }
        roster.core[group] = [...bySession.values()];
    }
}

function findCoreMember(roster, sessionId) {
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        const found = (roster.core?.[group] || []).find((item) => item.sessionId === sessionId);
        if (found) return found;
    }
    return undefined;
}

function writeRoster(root, roster) {
    roster.updatedAt = new Date().toISOString();
    fs.writeFileSync(rosterPath(root), JSON.stringify(roster, null, 2) + '\n', 'utf8');
}

function readWorkflow(root) {
    const roster = loadRoster(root);
    const workflow = validateWorkflow(roster.workflow || emptyWorkflow());
    if (!workflow.activeSchemaId && workflow.name) {
        const matched = findMatchingSchema(root, workflow);
        if (matched) {
            workflow.activeSchemaId = matched.id;
            workflow.activeSchema = matched.name;
        }
    }
    return workflow;
}
function syncRosterWorkflow(root, sessions) {
    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    const workflow = validateWorkflow(roster.workflow || emptyWorkflow());
    if (!workflow.activeSchemaId && workflow.name) {
        const matched = findMatchingSchema(root, workflow);
        if (matched) {
            workflow.activeSchemaId = matched.id;
            workflow.activeSchema = matched.name;
        }
    }
    const byId = new Map((Array.isArray(sessions) ? sessions : []).map((session) => [session.id, session]));
    let changed = false;
    const members = [];
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        for (const member of (roster.core?.[group] || [])) members.push({ group, member });
    }
    const seen = new Set();
    const uniqueMembers = members.filter((item) => {
        if (seen.has(item.member.sessionId)) return false;
        seen.add(item.member.sessionId);
        return true;
    });
    const hiddenIds = new Set(uniqueMembers.filter((item) => item.member.hidden).map((item) => item.member.sessionId));
    const rosterIds = new Set(uniqueMembers.filter((item) => !item.member.hidden).map((item) => item.member.sessionId));

    // Schema actif : le graphe sauvegarde fait foi — les noeuds du schema
    // (meme sessions hors roster) ne sont PAS elagues sauf s'ils ont ete
    // explicitement masques (hidden: true).
    const schemaIds = workflow.activeSchemaId ? new Set(workflow.nodes.map((n) => n.sessionId)) : null;
    const keepNode = (id) => !hiddenIds.has(id) && (rosterIds.has(id) || Boolean(schemaIds && schemaIds.has(id)));

    const activeNodes = workflow.nodes.filter((node) => keepNode(node.sessionId));
    if (activeNodes.length !== workflow.nodes.length) {
        workflow.nodes = activeNodes;
        changed = true;
    }
    const activeNodeIds = new Set(activeNodes.map((node) => node.sessionId));
    const activeEdges = workflow.edges.filter((edge) =>
        activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target));
    if (activeEdges.length !== workflow.edges.length) {
        workflow.edges = activeEdges;
        changed = true;
    }
    if (workflow.entrySessionId && !activeNodeIds.has(workflow.entrySessionId)) {
        workflow.entrySessionId = null;
        changed = true;
    }
    const nodes = new Map();
    for (const node of workflow.nodes) nodes.set(node.sessionId, node);

    for (const [index, { group, member }] of uniqueMembers.entries()) {
        if (member.hidden) continue;
        if (member.providerId === 'hephaistos' || member.sessionId.startsWith('chat-')) {
            const session = byId.get(member.sessionId);
            if (!session) continue;
            const model = String(session.model || member.model || '').slice(0, 200);
            if (model !== member.model) {
                member.model = model;
                changed = true;
            }
        }
        if (member.title && nodes.has(member.sessionId) && nodes.get(member.sessionId).title !== member.title) {
            nodes.get(member.sessionId).title = String(member.title).slice(0, 200);
            changed = true;
        }
        if (!nodes.has(member.sessionId)) {
            if (workflow.activeSchemaId) {
                member.hidden = true;
                changed = true;
                continue;
            }
            const node = {
                sessionId: member.sessionId,
                role: String(member.role || (group === 'devin' ? 'Devin' : 'Agent')).slice(0, 120),
                task: '',
                skills: [],
                title: String(member.title || '').slice(0, 200),
                position: { x: 100 + (index % 3) * 280, y: 120 + Math.floor(index / 3) * 170 },
            };
            workflow.nodes.push(node);
            nodes.set(member.sessionId, node);
            changed = true;
        }
    }
    if (!workflow.entrySessionId) {
        const head = members.find((item) => item.group === 'devin' && nodes.has(item.member.sessionId));
        if (head) {
            workflow.entrySessionId = head.member.sessionId;
            changed = true;
        }
    }

    if (changed || !roster.workflow) {
        const prevSync = roster.workflow || {};
        const nextSync = validateWorkflow(workflow);
        if (prevSync.activeSchema) nextSync.activeSchema = prevSync.activeSchema;
        if (prevSync.activeSchemaId) nextSync.activeSchemaId = prevSync.activeSchemaId;
        roster.workflow = nextSync;
        writeRoster(root, roster);
    }
    return roster.workflow || workflow;
}

function upsertChatAgent(root, agent) {
    const sessionId = String(agent?.sessionId || '');
    if (!sessionId || !sessionId.startsWith('chat-')) {
        throw new Error('session hephaistos-chat invalide');
    }

    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    let member = roster.core.bleubites.find((item) => item.sessionId === sessionId);
    const isNewMember = !member;
    if (!member) {
        member = { providerId: String(agent.providerId || 'hephaistos'), sessionId, restore: 'open-or-reveal' };
        roster.core.bleubites.push(member);
    }
    if (agent.providerId) member.providerId = String(agent.providerId).slice(0, 120);
    if (agent.model) member.model = String(agent.model).slice(0, 200);
    if (agent.role && !member.role) member.role = String(agent.role).slice(0, 120);

    const workflow = validateWorkflow(roster.workflow || emptyWorkflow());
    if (!workflow.nodes.some((node) => node.sessionId === sessionId) && (isNewMember || !member.hidden)) {
        const index = workflow.nodes.length;
        workflow.nodes.push({
            sessionId,
            role: String(agent.role || member.role || 'Agent').slice(0, 120),
            task: '',
            position: { x: 100 + (index % 3) * 280, y: 120 + Math.floor(index / 3) * 170 },
        });
    }
    roster.workflow = validateWorkflow(workflow);
    syncActiveSchemaSnapshot(root, roster.workflow);
    writeRoster(root, roster);
    return roster.workflow;
}

function saveWorkflow(root, input) {
    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    const workflow = validateWorkflow(input);

    if (input.activeSchema) workflow.activeSchema = input.activeSchema;
    else if (roster.workflow && roster.workflow.activeSchema) workflow.activeSchema = roster.workflow.activeSchema;
    if (input.activeSchemaId) workflow.activeSchemaId = input.activeSchemaId;
    else if (roster.workflow && roster.workflow.activeSchemaId) workflow.activeSchemaId = roster.workflow.activeSchemaId;

    for (const node of workflow.nodes) {
        const group = node.sessionId.startsWith('acp/')
            ? 'devin'
            : (node.sessionId.startsWith('local-') ? 'cerberos' : 'bleubites');
        let member = findCoreMember(roster, node.sessionId);
        if (!member) {
            member = {
                providerId: group === 'devin'
                    ? (node.sessionId.split('/')[1] || 'devin-cli')
                    : (group === 'cerberos' ? 'cerberos' : 'hephaistos'),
                sessionId: node.sessionId,
                restore: group === 'bleubites' ? 'open-or-reveal' : 'existing-only',
            };
            roster.core[group].push(member);
        }
        member.role = node.role;
        if (node.title) member.title = node.title;
        member.hidden = false;
    }

    syncActiveSchemaSnapshot(root, workflow);
    roster.workflow = workflow;
    writeRoster(root, roster);
    return workflow;
}

function upsertCoreAgent(root, group, agent) {
    if (!['devin', 'cerberos', 'bleubites'].includes(group)) throw new Error('groupe roster invalide');
    const sessionId = String(agent?.sessionId || '');
    if (!sessionId) throw new Error('sessionId requis');
    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    let member = roster.core[group].find((item) => item.sessionId === sessionId);
    const isNewMember = !member;
    if (!member) {
        member = { providerId: agent.providerId, sessionId, restore: agent.restore || 'existing-only' };
        roster.core[group].push(member);
    }
    if (agent.providerId) member.providerId = agent.providerId;
    if (agent.role && !member.role) member.role = String(agent.role).slice(0, 120);
    if (agent.title) member.title = String(agent.title).slice(0, 200);
    const workflow = validateWorkflow(roster.workflow || emptyWorkflow());
    const hasExistingWorkflow = Boolean(workflow.activeSchemaId || workflow.nodes.length > 0);
    if (!workflow.nodes.some((node) => node.sessionId === sessionId)) {
        if (hasExistingWorkflow && isNewMember) {
            member.hidden = true;
        } else if (!member.hidden && !hasExistingWorkflow) {
            const index = workflow.nodes.length;
            workflow.nodes.push({
                sessionId,
                role: String(member.role || 'Devin').slice(0, 120),
                task: '',
                skills: [],
                title: String(member.title || '').slice(0, 200),
                position: { x: 100 + (index % 3) * 280, y: 40 },
            });
        }
    }
    if (!workflow.entrySessionId && group === 'devin' && workflow.nodes.some((node) => node.sessionId === sessionId)) {
        workflow.entrySessionId = sessionId;
    }
    roster.workflow = validateWorkflow(workflow);
    writeRoster(root, roster);
    return roster.workflow;
}

function removeChatAgent(root, sessionId) {
    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    const id = String(sessionId || '');
    if (roster.core?.bleubites) {
        roster.core.bleubites = roster.core.bleubites.filter((item) => item.sessionId !== id);
    }
    const workflow = validateWorkflow(roster.workflow || emptyWorkflow());
    workflow.nodes = workflow.nodes.filter((node) => node.sessionId !== id);
    workflow.edges = workflow.edges.filter((edge) => edge.source !== id && edge.target !== id);
    if (workflow.entrySessionId === id) workflow.entrySessionId = null;
    roster.workflow = validateWorkflow(workflow);
    syncActiveSchemaSnapshot(root, roster.workflow);
    if (roster.verification?.results) delete roster.verification.results[id];
    writeRoster(root, roster);
    return roster.workflow;
}

function connectWorkflowAgents(root, source, target) {
    const workflow = readWorkflow(root);
    workflow.edges.push({ id: `edge:${source}->${target}`, source, target });
    return saveWorkflow(root, workflow);
}

function disconnectWorkflowAgents(root, source, target) {
    const workflow = readWorkflow(root);
    workflow.edges = workflow.edges.filter((edge) => edge.source !== source || edge.target !== target);
    return saveWorkflow(root, workflow);
}

function configureWorkflowNode(root, sessionId, updates) {
    const workflow = readWorkflow(root);
    const node = workflow.nodes.find((item) => item.sessionId === sessionId);
    if (!node) throw new Error(`agent absent du workflow: ${sessionId}`);
    if (updates.role != null) node.role = String(updates.role).slice(0, 120);
    if (updates.task != null) node.task = String(updates.task).slice(0, 6000);
    if (updates.skills != null) node.skills = (Array.isArray(updates.skills) ? updates.skills : [updates.skills]).map((s) => String(s).slice(0, 120)).filter(Boolean).slice(0, 24);
    if (updates.mcps != null) node.mcps = (Array.isArray(updates.mcps) ? updates.mcps : [updates.mcps]).map((s) => String(s).slice(0, 120)).filter(Boolean).slice(0, 8);
    if (updates.position != null) node.position = updates.position;
    if (updates.entry === true) workflow.entrySessionId = sessionId;
    if (updates.entry === false && workflow.entrySessionId === sessionId) workflow.entrySessionId = null;
    return saveWorkflow(root, workflow);
}

function cmdWorkflow(root, args) {
    const subcommand = args[0] || 'status';
    if (subcommand === 'status') return readWorkflow(root);
    if (subcommand === 'connect') return connectWorkflowAgents(root, args[1], args[2]);
    if (subcommand === 'disconnect') return disconnectWorkflowAgents(root, args[1], args[2]);
    if (subcommand === 'remove') return removeChatAgent(root, args[1]);
    if (subcommand === 'configure') {
        const sessionId = args[1];
        const option = (name) => {
            const index = args.indexOf(name);
            return index >= 0 ? args[index + 1] : undefined;
        };
        return configureWorkflowNode(root, sessionId, {
            role: option('--role'),
            task: option('--task'),
            skills: option('--skills') ? String(option('--skills')).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
            mcps: option('--mcps') ? String(option('--mcps')).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
            entry: args.includes('--entry') ? true : (args.includes('--no-entry') ? false : undefined),
        });
    }
    throw new Error('usage: workflow status|connect <source> <target>|disconnect <source> <target>|configure <sessionId> [--role R] [--task T] [--entry]|remove <sessionId>');
}

function* entries(roster) {
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        for (const e of (roster.core && roster.core[group]) || []) {
            yield { group, ...e };
        }
    }
}

function hephaistosSessions(root) {
    try {
        const d = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'chats', 'sessions.json'), 'utf8'));
        const s = Array.isArray(d) ? d : (d.sessions || []);
        return new Set(s.map(x => x.id || x.sessionId).filter(Boolean));
    } catch { return new Set(); }
}

function bridgeToken(root) {
    if (process.env.ORCH_MONITOR_TOKEN) return process.env.ORCH_MONITOR_TOKEN;
    try { return fs.readFileSync(path.join(root, '.agent', 'ws-bridge.token'), 'utf8').trim(); } catch { return ''; }
}

/** Envoi fire-and-forget d'une commande au bridge (open_chat n'a pas de réponse). */
function bridgeSend(root, msg, port = DEFAULT_PORT, timeoutMs = 4000) {
    return new Promise((resolve) => {
        if (!WebSocket) return resolve({ sent: false, error: 'ws module introuvable' });
        const tok = bridgeToken(root);
        const ws = new WebSocket(`ws://127.0.0.1:${port}${tok ? `?token=${encodeURIComponent(tok)}` : ''}`);
        const timer = setTimeout(() => { try { ws.close(); } catch {} resolve({ sent: false, error: 'timeout' }); }, timeoutMs);
        ws.on('open', () => {
            ws.send(JSON.stringify(msg), () => {
                clearTimeout(timer);
                try { ws.close(); } catch {}
                resolve({ sent: true });
            });
        });
        ws.on('error', (e) => { clearTimeout(timer); resolve({ sent: false, error: e.message }); });
    });
}

async function liveAcpSessions(root, providerId) {
    const hub = require('./devin-hub');
    try {
        return await hub.listAcpSessions(providerId, DEFAULT_PORT, root);
    } catch { return []; }
}

function injectPing(root, providerId, sessionId) {
    const res = spawnSync(process.execPath, [
        path.join(__dirname, 'acp-inject.js'),
        '--provider', providerId,
        '--session', sessionId,
        '--prompt', PING_TEXT,
        '--cwd', root,
        '--wait', 'turn',
        '--timeout', '90',
    ], { encoding: 'utf8', timeout: 120000, windowsHide: true });
    try {
        return JSON.parse((res.stdout || '').trim());
    } catch {
        return { sent: false, error: (res.stderr || res.stdout || 'spawn failed').slice(0, 300) };
    }
}

function currentDevinSession(root) {
    try {
        const id = spawnSync(process.execPath, [
            path.join(__dirname, 'current-cascade.js')
        ], { encoding: 'utf8', cwd: root, windowsHide: true }).stdout.trim();
        return id.startsWith('acp/') ? id : `acp/devin-cli/${id}`;
    } catch { return null; }
}

async function pingEntry(root, e) {
    if (e.providerId === 'devin-cli') {
        // Jamais de ping sur la session courante de l'agent : s'injecter soi-
        // même ouvre un doublon de la conversation active dans l'IDE.
        const self = currentDevinSession(root);
        if (self && e.sessionId === self) {
            return { transport: 'wake_acp_agent', status: 'skipped-self', delivered: false };
        }
        const hub = require('./devin-hub');
        const r = await hub.sendToAcpAgent(PING_TEXT, e.sessionId, e.providerId, DEFAULT_PORT, root);
        return { transport: 'wake_acp_agent', status: r.status, delivered: r.status === 'sent' || r.status === 'delivered' };
    }
    const r = injectPing(root, e.providerId, e.sessionId);
    return {
        transport: 'acp-inject',
        delivered: !!r.delivered || !!r.sent,
        stopReason: r.stopReason || null,
        // Reply tronquée : le manifeste est commité, il ne doit pas
        // embarquer de contenu d'agent (données internes potentielles).
        reply: (r.reply || '').slice(0, 160) || null,
        pong: !!(r.delivered && r.stopReason === 'end_turn' && /pong/i.test(r.reply || '')),
        error: r.error || null,
    };
}

async function cmdStatus(root, roster) {
    const chats = hephaistosSessions(root);
    const byProvider = {};
    const list = [...entries(roster)];
    for (const e of list) {
        if (e.providerId === 'hephaistos') {
            e._status = chats.has(e.sessionId) ? 'session-present' : 'session-missing';
            continue;
        }
        if (!(e.providerId in byProvider)) byProvider[e.providerId] = await liveAcpSessions(root, e.providerId);
        const sid = e.sessionId.split('/').pop();
        const found = byProvider[e.providerId].find(s => {
            const id = s.sessionId || s.id || '';
            return id === e.sessionId || id === sid || id.endsWith(`/${sid}`);
        });
        e._status = found ? `acp-listed${found.focused ? '+focused' : ''}` : 'acp-missing';
    }
    return list;
}

async function cmdRestore(root, roster) {
    const results = {};
    for (const e of entries(roster)) {
        if (e.restore !== 'open-or-reveal') { results[e.sessionId] = 'existing-only'; continue; }
        if (e.providerId === 'hephaistos' || e.sessionId.startsWith('chat-')) {
            const r = await bridgeSend(root, { command: 'open_chat', sessionId: e.sessionId });
            results[e.sessionId] = r.sent ? 'open-requested' : `open-failed:${r.error}`;
        } else {
            results[e.sessionId] = 'no-restore-path';
        }
    }
    return results;
}

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0] || 'status';
    const root = workspaceRoot();
    const roster = loadRoster(root);
    if (cmd === 'hide' || cmd === 'unhide') {
        const sessionId = args[1];
        if (!sessionId) throw new Error('usage: hide|unhide <sessionId>');
        setMemberHidden(root, sessionId, cmd === 'hide');
        const w = syncRosterWorkflow(root, cliSessions(root));
        console.log(JSON.stringify({ command: cmd, sessionId, nodes: w.nodes.length }, null, 1));
        return;
    }
    if (cmd === 'schema') {
        const sub = args[1];
        if (sub === 'save') {
            const nameIdx = args.indexOf('--name');
            const entry = saveSchema(root, nameIdx >= 0 ? args[nameIdx + 1] : 'Schema', syncRosterWorkflow(root, cliSessions(root)));
            console.log(JSON.stringify({ command: 'schema save', id: entry.id, name: entry.name }, null, 1));
            return;
        }
        if (sub === 'list') {
            console.log(JSON.stringify({ command: 'schema list', schemas: listSchemas(root, args.includes('--all')) }, null, 1));
            return;
        }
        if (sub === 'rename') {
            const target = readSchemas().find((item) => item.id === args[2] || item.name === args[2]);
            if (!target) throw new Error('Schema introuvable: ' + args[2]);
            const name = String(args.slice(3).join(' ') || '').replace(/[^\w\-\u00c0-\u024f ]/g, '').trim().slice(0, 120);
            if (!name) throw new Error('nom de schema invalide');
            target.name = name;
            const list = readSchemas();
            writeSchemas(list);
            console.log(JSON.stringify({ command: 'schema rename', id: target.id, name }, null, 1));
            return;
        }
        if (sub === 'load') {
            const w = loadSchema(root, args[2]);
            console.log(JSON.stringify({ command: 'schema load', nodes: w.nodes.length, edges: w.edges.length }, null, 1));
            return;
        }
        if (sub === 'delete') {
            console.log(JSON.stringify({ command: 'schema delete', ...deleteSchema(root, args[2]) }, null, 1));
            return;
        }
        if (sub === 'create') {
            const nameIdx = args.indexOf('--name');
            const w = createEmptySchema(root, nameIdx >= 0 ? args[nameIdx + 1] : 'Nouveau schema');
            console.log(JSON.stringify({ command: 'schema create', name: w.name, nodes: w.nodes.length }, null, 1));
            return;
        }
        if (sub === 'restore-standards') {
            console.log(JSON.stringify({ command: 'schema restore-standards', ...restoreStandardSchemas(root) }, null, 1));
            return;
        }
        throw new Error('usage: schema save|list|load|delete|create|restore-standards');
    }
    if (cmd === 'workflow') {
        console.log(JSON.stringify({ command: 'workflow', workflow: cmdWorkflow(root, args.slice(1)) }, null, 1));
        return;
    }
    const onlyIdx = args.indexOf('--only');
    const only = (onlyIdx >= 0 ? args[onlyIdx + 1] || '' : '').split(',').filter(Boolean);
    const pick = e => !only.length || only.includes(e.sessionId);

    if (cmd === 'status') {
        const list = await cmdStatus(root, roster);
        const out = list.map(e => ({ sessionId: e.sessionId, providerId: e.providerId, group: e.group, status: e._status }));
        console.log(JSON.stringify({ command: 'status', workspace: roster.workspace, entries: out }, null, 1));
        return;
    }

    if (cmd === 'restore') {
        const results = {};
        const list = entries(roster).filter(pick);
        for (const e of list) {
            if (e.restore !== 'open-or-reveal') { results[e.sessionId] = 'existing-only'; continue; }
            if (e.providerId === 'hephaistos' || e.sessionId.startsWith('chat-')) {
                const r = await bridgeSend(root, { command: 'open_chat', sessionId: e.sessionId });
                results[e.sessionId] = r.sent ? 'open-requested' : `open-failed:${r.error}`;
            } else {
                results[e.sessionId] = 'no-restore-path';
            }
        }
        console.log(JSON.stringify({ command: 'restore', workspace: roster.workspace, results }, null, 1));
        return;
    }

    if (cmd === 'ping') {
        const results = {};
        for (const e of entries(roster)) {
            if (!pick(e)) continue;
            results[e.sessionId] = await pingEntry(root, e);
        }
        if (args.includes('--write')) {
            // Fusion : --only <subset> ne doit pas effacer les résultats des
            // agents non pingés — chaque entrée garde son dernier verdict.
            const prev = roster.verification?.results || {};
            roster.verification = { lastPing: new Date().toISOString(), results: { ...prev, ...results } };
            fs.writeFileSync(rosterPath(root), JSON.stringify(roster, null, 2) + '\n', 'utf8');
        }
        console.log(JSON.stringify({ command: 'ping', workspace: roster.workspace, results }, null, 1));
        return;
    }

    if (cmd === 'add') {
        // add <group> <providerId> <sessionId> [--model M] [--role R] [--restore mode]
        const [group, providerId, sessionId] = args.slice(1);
        if (!['devin', 'cerberos', 'bleubites'].includes(group) || !providerId || !sessionId) {
            console.error('usage: add <devin|cerberos|bleubites> <providerId> <sessionId> [--model M] [--role R]');
            process.exit(1);
        }
        roster.core[group] = roster.core[group] || [];
        if (roster.core[group].some(e => e.sessionId === sessionId && e.providerId === providerId)) {
            if (group === 'bleubites' && providerId === 'hephaistos') {
                const modelIndex = args.indexOf('--model');
                const roleIndex = args.indexOf('--role');
                upsertChatAgent(root, {
                    sessionId,
                    model: modelIndex >= 0 ? args[modelIndex + 1] : undefined,
                    role: roleIndex >= 0 ? args[roleIndex + 1] : undefined,
                });
            }
            console.log(JSON.stringify({ command: 'add', status: 'duplicate-skip', sessionId }));
            return;
        }
        const entry = { providerId, sessionId, restore: group === 'bleubites' ? 'open-or-reveal' : 'existing-only' };
        const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
        const model = flag('--model'); if (model) entry.model = model;
        const role = flag('--role'); if (role) entry.role = role;
        roster.core[group].push(entry);
        if (group === 'bleubites' && providerId === 'hephaistos') {
            const workflow = validateWorkflow(roster.workflow || emptyWorkflow());
            if (!workflow.nodes.some((node) => node.sessionId === sessionId)) {
                const index = workflow.nodes.length;
                workflow.nodes.push({
                    sessionId,
                    role: role || 'Agent',
                    task: '',
                    position: { x: 100 + (index % 3) * 280, y: 120 + Math.floor(index / 3) * 170 },
                });
            }
            roster.workflow = validateWorkflow(workflow);
        }
        roster.updatedAt = new Date().toISOString();
        fs.writeFileSync(rosterPath(root), JSON.stringify(roster, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ command: 'add', status: 'added', group, entry }));
        return;
    }

    if (cmd === 'remove') {
        // remove <sessionId> — retire l'agent du roster (la fenêtre reste ouverte,
        // l'agent n'est simplement plus dans l'équipe).
        const sid = args[1];
        if (!sid) { console.error('usage: remove <sessionId>'); process.exit(1); }
        if ((roster.core?.bleubites || []).some((entry) =>
            entry.providerId === 'hephaistos' && entry.sessionId === sid)) {
            removeChatAgent(root, sid);
            console.log(JSON.stringify({ command: 'remove', status: 'removed', sessionId: sid }));
            return;
        }
        let removed = null;
        for (const group of ['devin', 'cerberos', 'bleubites']) {
            const arr = (roster.core && roster.core[group]) || [];
            const i = arr.findIndex(e => e.sessionId === sid);
            if (i >= 0) { removed = arr.splice(i, 1)[0]; break; }
        }
        if (!removed) { console.log(JSON.stringify({ command: 'remove', status: 'not-found', sessionId: sid })); return; }
        if (roster.verification?.results) delete roster.verification.results[sid];
        roster.updatedAt = new Date().toISOString();
        fs.writeFileSync(rosterPath(root), JSON.stringify(roster, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ command: 'remove', status: 'removed', sessionId: sid }));
        return;
    }

    console.error('usage: workspace-roster.js status|restore|ping|add|remove|workflow [--write] [--only id1,id2]');
    process.exit(1);
}

function schemasFile() {
    return process.env.HEPHAISTOS_SCHEMA_FILE
        || path.join(os.homedir(), '.hephaistos-workflow-schemas.json');
}

// Schémas génériques livrés avec le kit : protégés par un gabarit canonique
// dans .agent/templates/schemas/ — leur suppression dans la banque reste
// réversible via restoreStandardSchemas.
const STANDARD_SCHEMA_NAMES = new Set([
    'swat-orchestrateur',
    'swat-fix-rapide',
    'swat-code-review',
    'swat-faisabilite',
    'swat-plan-plugin',
    'concile',
]);

function isStandardSchemaName(name) {
    return STANDARD_SCHEMA_NAMES.has(normSchemaName(name));
}

// Mode concile : délibération multi-experts sur transcript partagé (tours de
// parole séquentiels), pas un DAG parallèle. Détecté par le nom pour rester
// robuste même si l'entrée n'a pas le champ mode persisté.
const COUNCIL_SCHEMA_PATTERN = /concil|conclave|council/i;

function isCouncilSchemaName(name) {
    return COUNCIL_SCHEMA_PATTERN.test(normSchemaName(name));
}

function schemaModeFor(item) {
    const mode = String(item?.mode || '').toLowerCase();
    if (mode === 'council' || isCouncilSchemaName(item?.name)) return 'council';
    return undefined;
}

function schemaTemplateDir(root) {
    return process.env.HEPHAISTOS_SCHEMA_TEMPLATE_DIR
        || path.join(root, '.agent', 'templates', 'schemas');
}

function readSchemaTemplates(root) {
    const dir = schemaTemplateDir(root);
    const templates = [];
    let files = [];
    try { files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); } catch { return templates; }
    for (const file of files) {
        try {
            const tpl = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            const graph = tpl.graph && typeof tpl.graph === 'object' ? tpl.graph : tpl;
            const name = String(tpl.name || graph.name || file.replace(/\.json$/, '')).slice(0, 120);
            templates.push({ name, graph: cleanSchemaGraph(graph, name) });
        } catch { /* gabarit illisible : ignoré */ }
    }
    return templates;
}

function readSchemas() {
    try {
        const parsed = JSON.parse(fs.readFileSync(schemasFile(), 'utf8'));
        return Array.isArray(parsed.schemas) ? parsed.schemas : [];
    } catch {
        return [];
    }
}

function writeSchemas(list) {
    try {
        fs.mkdirSync(path.dirname(schemasFile()), { recursive: true });
        fs.writeFileSync(schemasFile(), JSON.stringify({ schemas: list }, null, 2));
    } catch { /* silencieux */ }
}

function schemaDesc(graph) {
    const name = normSchemaName(graph?.name || '');
    if (name.includes('orchestrateur')) {
        return "Flux maître généraliste tout-terrain (12 nœuds) : cadrage, conception architecturale (Devin), production, tests TDD, triple audit parallèle (revue, sécurité, infra/perf), arbitrage Sentinelle, contrôle Git, documentation Vault et capitalisation de l'apprentissage (Beacon/Knowledge).";
    }
    if (name.includes('fix-rapide')) {
        return "Flux d'intervention d'urgence & correctifs ciblés : chaîne resserrée et ultra-rapide (Cadrage -> Code -> Test -> Audit Sécurité & Revue -> Gate Sentinelle -> Commit Git -> Capitalisation Beacon). À utiliser pour les résolutions de bugs ponctuels et patches rapides sans surcharge documentaire.";
    }
    if (name.includes('code-review')) {
        return "Flux d'audit qualité et revue de code : analyse statique, détection d'antipatrons, conformité de code, contrôle de sécurité et vérification git. À utiliser avant toute fusion de branche ou pour une inspection approfondie sans modification de code.";
    }
    if (name.includes('faisabilite')) {
        return "Flux d'étude de faisabilité et d'architecture : exploration de la surface d'attaque, analyse des APIs, évaluation des risques et cadrage technique avant lancement d'un gros chantier ou nouveau composant.";
    }
    if (name.includes('plan-plugin')) {
        return "Flux de cadrage et planification de spécifications (PRD) : découpage des exigences fonctionnelles, normalisation des compétences et matrice de sécurité pour la création d'extensions ou plugins.";
    }
    const nodes = (graph && graph.nodes) || [];
    const roles = [...new Set(nodes.map((n) => n.role).filter(Boolean))];
    const head = nodes.find((n) => graph.entrySessionId && n.sessionId === graph.entrySessionId);
    const base = nodes.length + ' agents — ' + roles.join(', ');
    return (head ? 'Entrée: ' + (head.title || head.sessionId) + '. ' : '') + base.slice(0, 300);
}

function sameWorkspace(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function normSchemaName(value) {
    return String(value || '').trim().toLowerCase();
}

function cleanSchemaGraph(graph, nameOverride) {
    const validated = validateWorkflow(graph);
    delete validated.activeSchema;
    delete validated.activeSchemaId;
    if (nameOverride) validated.name = String(nameOverride).slice(0, 120);
    return validated;
}

function findMatchingSchema(root, workflow) {
    const list = readSchemas();
    if (!list.length || !workflow) return undefined;
    const workspace = path.resolve(root);
    if (workflow.activeSchemaId) {
        const byId = list.find((item) => item.id === workflow.activeSchemaId);
        if (byId) return byId;
    }
    const targetName = normSchemaName(workflow.activeSchema || workflow.name);
    if (!targetName || targetName === 'flux agents') return undefined;
    return list.find((item) => sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === targetName);
}

function syncActiveSchemaSnapshot(root, workflow) {
    const list = readSchemas();
    if (!list.length || !workflow) return;
    const workspace = path.resolve(root);
    let index = -1;
    if (workflow.activeSchemaId) {
        index = list.findIndex((item) => item.id === workflow.activeSchemaId);
    }
    if (index < 0) {
        const targetName = normSchemaName(workflow.activeSchema || workflow.name);
        if (targetName && targetName !== 'flux agents') {
            index = list.findIndex((item) => sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === targetName);
        }
    }
    if (index < 0) return;

    const current = list[index];
    workflow.activeSchemaId = current.id;
    workflow.activeSchema = current.name;

    // Schémas standards = immuables : ne JAMAIS réécrire leur graphe depuis
    // l'état live. C'est ce canal qui a propagé un graphe élagué dans le
    // schéma sauvegardé (corruption swat-orchestrateur).
    if (isStandardSchemaName(current.name) || current.builtin === true) return;

    const snapshot = cleanSchemaGraph(workflow, current.name);
    list[index] = {
        ...current,
        workspace: current.workspace || workspace,
        graph: snapshot,
        desc: schemaDesc(snapshot),
        savedAt: new Date().toISOString(),
    };
    writeSchemas(list);
}

function saveSchema(root, name, graph) {
    const list = readSchemas();
    const workspace = path.resolve(root);
    let effectiveName = String(name || graph?.activeSchema || graph?.name || 'Schema').trim().slice(0, 120) || 'Schema';
    // Schéma standard protégé : une sauvegarde sous son nom crée une copie
    // utilisateur — le gabarit canonique n'est jamais écrasé.
    if (isStandardSchemaName(effectiveName)) {
        effectiveName = `${effectiveName} (copie)`;
    }
    const cleanGraph = cleanSchemaGraph(graph, effectiveName);
    const index = list.findIndex((item) => normSchemaName(item.name) === normSchemaName(effectiveName) && sameWorkspace(item.workspace, workspace));
    const entry = {
        id: `schema-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: effectiveName,
        workspace,
        graph: cleanGraph,
        desc: schemaDesc(cleanGraph),
        savedAt: new Date().toISOString(),
        builtin: isStandardSchemaName(effectiveName) || (index >= 0 && list[index].builtin === true) || undefined,
        mode: isCouncilSchemaName(effectiveName) || (index >= 0 && list[index].mode === 'council') ? 'council' : undefined,
    };
    if (index >= 0) {
        entry.id = list[index].id;
        list[index] = entry;
    } else {
        list.push(entry);
    }
    writeSchemas(list);

    try {
        const roster = loadRoster(root);
        dedupeRosterCore(roster);
        const workflow = validateWorkflow({ ...cleanGraph, name: entry.name, activeSchema: entry.name, activeSchemaId: entry.id });
        roster.workflow = workflow;
        writeRoster(root, roster);
    } catch { /* ignore si roster absent */ }

    return entry;
}

function listSchemas(root, all) {
    const workspace = path.resolve(root);
    // Auto-guérison à chaque listage : gabarits standards absents ou divergents
    // sont restaurés depuis .agent/templates/schemas/ avant tout affichage.
    try { restoreStandardSchemas(root); } catch { /* best-effort */ }
    return readSchemas()
        .filter((item) => all || sameWorkspace(item.workspace, workspace))
        .map((item) => ({
            id: item.id,
            name: item.name,
            workspace: item.workspace,
            savedAt: item.savedAt,
            nodes: ((item.graph && item.graph.nodes) || []).length,
            desc: schemaDesc(item.graph || { name: item.name }),
            builtin: item.builtin === true || isStandardSchemaName(item.name),
            mode: schemaModeFor(item),
        }));
}

function renameSchema(root, id, newName) {
    const list = readSchemas();
    const workspace = path.resolve(root);
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return { renamed: false, error: 'schema introuvable' };
    const entry = list[index];
    if (entry.builtin === true || isStandardSchemaName(entry.name)) {
        return { renamed: false, protected: true, name: entry.name };
    }
    let effectiveName = String(newName || '').trim().slice(0, 120);
    if (!effectiveName) return { renamed: false, error: 'nom vide' };
    if (isStandardSchemaName(effectiveName)) effectiveName = `${effectiveName} (copie)`;
    if (list.some((item, i) => i !== index && sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === normSchemaName(effectiveName))) {
        let suffix = 2;
        while (list.some((item, i) => i !== index && sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === normSchemaName(`${effectiveName} ${suffix}`))) suffix++;
        effectiveName = `${effectiveName} ${suffix}`;
    }
    const oldName = entry.name;
    entry.name = effectiveName;
    if (entry.graph && typeof entry.graph === 'object') entry.graph.name = effectiveName;
    entry.savedAt = new Date().toISOString();
    writeSchemas(list);
    // Répercute le nouveau nom sur le workflow actif si ce schéma est chargé.
    try {
        const roster = loadRoster(root);
        if (roster.workflow && roster.workflow.activeSchemaId === id) {
            roster.workflow.activeSchema = effectiveName;
            roster.workflow.name = effectiveName;
            writeRoster(root, roster);
        }
    } catch { /* ignore */ }
    return { renamed: true, oldName, name: effectiveName };
}

function deleteSchema(root, id) {
    const list = readSchemas();
    const target = list.find((item) => item.id === id);
    // Schéma standard protégé : suppression refusée (gabarit canonique).
    if (target && (target.builtin === true || isStandardSchemaName(target.name))) {
        return { deleted: 0, protected: true, name: target.name };
    }
    const next = list.filter((item) => item.id !== id);
    writeSchemas(next);
    const roster = loadRoster(root);
    if (roster.workflow && roster.workflow.activeSchemaId === id) {
        delete roster.workflow.activeSchema;
        delete roster.workflow.activeSchemaId;
        writeRoster(root, roster);
    }
    return { deleted: list.length - next.length };
}

function createEmptySchema(root, name) {
    const list = readSchemas();
    const workspace = path.resolve(root);
    let effectiveName = String(name || '').trim().slice(0, 120) || 'Nouveau schema';
    if (list.some((item) => sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === normSchemaName(effectiveName))) {
        let suffix = 2;
        while (list.some((item) => sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === normSchemaName(`${effectiveName} ${suffix}`))) suffix++;
        effectiveName = `${effectiveName} ${suffix}`;
    }
    const graph = { version: 1, name: effectiveName, entrySessionId: null, nodes: [], edges: [] };
    const entry = {
        id: `schema-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: effectiveName,
        workspace,
        graph,
        desc: "Flux vide : composez votre pipeline agent par agent, puis reliez les blocs.",
        savedAt: new Date().toISOString(),
        builtin: isStandardSchemaName(effectiveName) || undefined,
        mode: isCouncilSchemaName(effectiveName) ? 'council' : undefined,
    };
    list.push(entry);
    writeSchemas(list);

    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    // Snapshot du schéma actif précédent avant de basculer sur le canvas vide.
    if (roster.workflow && roster.workflow.activeSchemaId) {
        syncActiveSchemaSnapshot(root, roster.workflow);
    }
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        for (const member of (roster.core && roster.core[group]) || []) member.hidden = true;
    }
    roster.workflow = validateWorkflow({
        ...graph,
        activeSchema: entry.name,
        activeSchemaId: entry.id,
    });
    writeRoster(root, roster);
    return roster.workflow;
}

function restoreStandardSchemas(root) {
    const templates = readSchemaTemplates(root);
    const workspace = path.resolve(root);
    const list = readSchemas();
    const restored = [];
    for (const tpl of templates) {
        const index = list.findIndex((item) =>
            sameWorkspace(item.workspace, workspace) && normSchemaName(item.name) === normSchemaName(tpl.name));
        // Auto-réparation : un schéma standard divergent du gabarit canonique
        // est rétabli tel quel (corruption évitée — ex. swat-orchestrateur).
        if (index >= 0) {
            const current = list[index];
            if (JSON.stringify(current.graph) !== JSON.stringify(tpl.graph)) {
                list[index] = { ...current, graph: tpl.graph, builtin: true, desc: schemaDesc(tpl.graph) };
                restored.push(`${tpl.name} (repare)`);
            }
            continue;
        }
        list.push({
            id: `schema-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            name: tpl.name,
            workspace,
            graph: tpl.graph,
            desc: schemaDesc(tpl.graph),
            savedAt: new Date().toISOString(),
            builtin: true,
        });
        restored.push(tpl.name);
    }
    if (restored.length) writeSchemas(list);
    return { restored };
}

function updateStandardSchema(root, id, graph) {
    // Promotion officielle d'un schéma standard : écrit le gabarit canonique
    // .agent/templates/schemas/<name>.json ET resynchronise l'entrée banque.
    // C'est l'« ordre contraire » : modification volontaire du modèle gravé.
    const list = readSchemas();
    const workspace = path.resolve(root);
    const entry = list.find((item) => item.id === id);
    if (!entry) return { updated: false, error: 'schema introuvable' };
    if (!(entry.builtin === true || isStandardSchemaName(entry.name))) {
        return { updated: false, error: 'pas un schema standard' };
    }
    const name = entry.name;
    const cleanGraph = cleanSchemaGraph(graph, name);
    const dir = schemaTemplateDir(root);
    const file = path.join(dir, `${name}.json`);
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ name, graph: cleanGraph, mode: entry.mode }, null, 2));
    } catch (error) {
        return { updated: false, error: String(error && error.message || error) };
    }
    const index = list.findIndex((item) => item.id === id);
    list[index] = { ...entry, graph: cleanGraph, desc: schemaDesc(cleanGraph), savedAt: new Date().toISOString(), builtin: true };
    writeSchemas(list);
    return { updated: true, name, template: file };
}

function loadSchema(root, id) {
    const list = readSchemas();
    const entry = list.find((item) => item.id === id);
    if (!entry) throw new Error(`Schema introuvable: ${id}`);
    const roster = loadRoster(root);
    dedupeRosterCore(roster);

    // Sauvegarder l'état courant du schéma précédent avant de basculer
    if (roster.workflow && roster.workflow.activeSchemaId && roster.workflow.activeSchemaId !== id) {
        syncActiveSchemaSnapshot(root, roster.workflow);
    }

    const freshEntry = readSchemas().find((item) => item.id === id) || entry;
    const inSchema = new Set((freshEntry.graph.nodes || []).map((node) => node.sessionId));
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        for (const member of (roster.core && roster.core[group]) || []) member.hidden = !inSchema.has(member.sessionId);
    }
    const workflow = validateWorkflow({
        ...freshEntry.graph,
        name: freshEntry.name,
        activeSchema: freshEntry.name,
        activeSchemaId: freshEntry.id,
        ...(schemaModeFor(freshEntry) ? { mode: 'council' } : {}),
    });
    roster.workflow = workflow;
    writeRoster(root, roster);
    return workflow;
}
function setMemberHidden(root, sessionId, hidden) {
    const roster = loadRoster(root);
    dedupeRosterCore(roster);
    let foundMember = null;
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        for (const member of (roster.core && roster.core[group] || [])) {
            if (member.sessionId === sessionId) {
                member.hidden = Boolean(hidden);
                foundMember = member;
            }
        }
    }
    if (foundMember) {
        if (roster.workflow && Array.isArray(roster.workflow.nodes)) {
            if (hidden) {
                roster.workflow.nodes = roster.workflow.nodes.filter((node) => node.sessionId !== sessionId);
                roster.workflow.edges = (roster.workflow.edges || []).filter((edge) => edge.source !== sessionId && edge.target !== sessionId);
                if (roster.workflow.entrySessionId === sessionId) roster.workflow.entrySessionId = null;
            } else if (!roster.workflow.nodes.some((node) => node.sessionId === sessionId)) {
                const index = roster.workflow.nodes.length;
                roster.workflow.nodes.push({
                    sessionId,
                    role: String(foundMember.role || 'Agent').slice(0, 120),
                    task: '',
                    skills: [],
                    title: String(foundMember.title || '').slice(0, 200),
                    position: { x: 100 + (index % 3) * 280, y: 120 + Math.floor(index / 3) * 170 },
                });
            }
            syncActiveSchemaSnapshot(root, roster.workflow);
        }
        writeRoster(root, roster);
        return true;
    }
    return false;
}

function getWorkflowAgentProfile(root, sessionId) {
    const id = String(sessionId || '');
    const roster = loadRoster(root);
    for (const group of ['devin', 'cerberos', 'bleubites']) {
        const member = (roster.core && roster.core[group] || []).find((item) => item.sessionId === id);
        if (!member) continue;
        const node = (roster.workflow?.nodes || []).find((item) => item.sessionId === id);
        return {
            providerId: String(member.providerId || ''),
            model: String(member.model || ''),
            role: String(node?.role || member.role || 'Agent'),
            title: String(node?.title || member.title || ''),
        };
    }
    return undefined;
}

function cliSessions(root) {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'chats', 'sessions.json'), 'utf8'));
        return Array.isArray(parsed) ? parsed : (parsed.sessions || []);
    } catch {
        return [];
    }
}

module.exports = {
    configureWorkflowNode,
    connectWorkflowAgents,
    disconnectWorkflowAgents,
    readWorkflow,
    removeChatAgent,
    upsertCoreAgent,
    saveWorkflow,
    syncRosterWorkflow,
    upsertChatAgent,
    saveSchema,
    listSchemas,
    loadSchema,
    deleteSchema,
    renameSchema,
    updateStandardSchema,
    createEmptySchema,
    restoreStandardSchemas,
    isStandardSchemaName,
    isCouncilSchemaName,
    setMemberHidden,
    getWorkflowAgentProfile,
    validateWorkflow,
};

if (require.main === module) {
    main().catch(e => { console.error(e.message); process.exit(1); });
}
