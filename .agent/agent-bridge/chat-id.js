#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const agentAdapters = require('./agent-adapters');
const devinHub = require('./devin-hub');

const WORKSPACE = path.resolve(__dirname, '..', '..');
const OPTS = new Set(['--agent', '--via', '--session']);

function option(name) {
    const args = process.argv.slice(2);
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
}

function parseCurrentDevinSession() {
    const script = path.join(__dirname, 'current-cascade.js');
    const raw = execFileSync(process.execPath, [script, '--json'], {
        cwd: WORKSPACE,
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true
    }).trim();
    const value = JSON.parse(raw);
    if (!agentAdapters.sessionIdValid(value.id)) {
        throw new Error('la session Devin courante est absente ou invalide');
    }
    return value;
}

function devinIdentity(value) {
    const id = typeof value === 'string' ? value : value.id;
    const meta = typeof value === 'string' ? {} : value;
    return {
        providerId: id.startsWith('acp/devin-cli/') ? 'devin-cli' : 'devin-cascade',
        transport: id.startsWith('acp/devin-cli/') ? 'acp' : 'cascade',
        sessionId: id,
        ...(meta.title ? { title: meta.title } : {}),
        ...(meta.userMessageCount !== null && meta.userMessageCount !== undefined
            ? { userMessageCount: meta.userMessageCount } : {}),
        ...(meta.createdAt ? { createdAt: meta.createdAt } : {})
    };
}

function getAgyCurrentSession() {
    const script = path.join(__dirname, 'agy-hub.js');
    const id = execFileSync(process.execPath, [script, 'current'], {
        cwd: WORKSPACE,
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true
    }).trim();
    if (!agentAdapters.sessionIdValid(id)) throw new Error('aucune session AGY courante vérifiée');
    return id;
}

function selectAcpSession(sessions, requestedId) {
    if (requestedId) {
        const exact = sessions.find((session) => session.sessionId === requestedId);
        if (!exact) throw new Error('ID ACP absent du provider/workspace demandé');
        return exact;
    }

    const focused = sessions.filter((session) => session.focused === true);
    if (focused.length === 1) return focused[0];
    if (focused.length > 1) throw new Error('plusieurs sessions ACP focalisées; fournir --session <sessionId>');
    const ids = sessions.map((session) => session.sessionId).filter(Boolean);
    throw new Error(ids.length
        ? `aucune session ACP focalisée; choisir --session parmi: ${ids.join(', ')}`
        : 'aucune session ACP vérifiée dans ce workspace');
}

function selectCliSession(agent, sessions, requestedId) {
    if (requestedId) {
        const exact = sessions.find((session) => session.sessionId === requestedId);
        if (!exact) throw new Error('ID CLI absent du registre workspace vérifié');
        return exact.sessionId;
    }
    if (sessions.length === 1) return sessions[0].sessionId;
    if (sessions.length > 1) {
        throw new Error(`plusieurs sessions ${agent}/cli; choisir --session parmi: ${sessions.map((s) => s.sessionId).join(', ')}`);
    }
    throw new Error(`aucune session ${agent}/cli vérifiée dans ce workspace`);
}

async function resolveChatId() {
    const requestedAgent = option('--agent');
    const requestedVia = option('--via');
    const requestedId = option('--session');

    for (const name of OPTS) {
        if (process.argv.includes(name) && !option(name)) throw new Error(`${name} requiert une valeur`);
    }

    if (!requestedAgent) {
        const sessions = await devinHub.listAcpSessions(undefined, 7477, WORKSPACE);
        if (sessions.some((session) => session.focused)) {
            const session = selectAcpSession(sessions);
            return {
                agent: agentAdapters.resolveAgent(session.providerId) || session.providerId,
                providerId: session.providerId,
                transport: 'acp',
                sessionId: session.sessionId,
                workspace: WORKSPACE
            };
        }
        const id = parseCurrentDevinSession();
        return { agent: 'devin', ...devinIdentity(id), workspace: WORKSPACE };
    }

    const agent = agentAdapters.resolveAgent(requestedAgent);
    if (!agent) throw new Error(`agent inconnu: ${requestedAgent}`);
    const via = (requestedVia || (agent === 'agy' ? 'hub' : agent === 'devin' ? 'current' : 'acp')).toLowerCase();

    if (agent === 'devin' && ['current', 'acp', 'cascade'].includes(via)) {
        const id = parseCurrentDevinSession();
        if (requestedId && requestedId !== id.id) throw new Error('ID fourni différent de la session Devin courante');
        if (via === 'cascade' && id.id.startsWith('acp/')) throw new Error('la session courante Devin est ACP, pas une cascade UUID');
        if (via === 'acp' && !id.id.startsWith('acp/devin-cli/')) throw new Error('la session courante Devin n’est pas une session acp/devin-cli');
        return { agent, ...devinIdentity(id), workspace: WORKSPACE };
    }

    if (agent === 'agy' && via === 'hub') {
        return { agent, providerId: 'agy-hub', transport: 'hub', sessionId: getAgyCurrentSession(), workspace: WORKSPACE };
    }

    if (via === 'acp') {
        const providerId = agentAdapters.providerIdFor(agent);
        if (!providerId) throw new Error(`${agent} n’a pas de provider ACP configuré`);
        const sessions = await devinHub.listAcpSessions(providerId, 7477, WORKSPACE);
        const session = selectAcpSession(sessions, requestedId);
        return { agent, providerId, transport: 'acp', sessionId: session.sessionId, workspace: WORKSPACE };
    }

    if (via === 'cli') {
        if (!agentAdapters.cliSessionSupported(agent)) throw new Error(`transport CLI non pris en charge pour ${agent}`);
        const sessions = await agentAdapters.listSessions(agent, { cwd: WORKSPACE });
        const sessionId = selectCliSession(agent, sessions, requestedId);
        return { agent, providerId: agentAdapters.providerIdFor(agent), transport: 'cli', sessionId, workspace: WORKSPACE };
    }

    if (via === 'hub' && agent !== 'agy') throw new Error(`transport hub non pris en charge pour ${agent}`);
    throw new Error(`transport non pris en charge: ${via}`);
}

async function main() {
    try {
        console.log(JSON.stringify(await resolveChatId(), null, 1));
    } catch (error) {
        console.error(`[chat-id] ${error.message}`);
        process.exitCode = 1;
    }
}

if (require.main === module) void main();

module.exports = { selectAcpSession, selectCliSession, resolveChatId };
