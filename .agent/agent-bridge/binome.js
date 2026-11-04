#!/usr/bin/env node
/**
 * binome.js — protocole de pairage Devin ⇄ agents ACP/CLI vérifiés.
 *
 * Request/ACK corrélés par pairId, nom de paire, IDs de session et transports.
 * Une paire expire après 15 minutes; les handshakes legacy sont ignorés.
 * Les transports ACP, CLI et hub sont explicités; aucun fallback de session.
 *
 * Usage :
 *   node binome.js --as devin --peer agy --peer-via hub --self <id> --to <id> join
 *   node binome.js --as devin --peer hermes --peer-via acp --self <id> --to <id> join
 *   node binome.js --as devin --peer kilo --peer-via cli --self <id> --to <id> join
 *   node binome.js --as <agent> --via <acp|cli|hub|cascade> --peer <agent> pair
 *   node binome.js --as <agent> --peer <agent> send "..."
 *
 * --as et --peer sont des noms canoniques; les IDs de session restent obligatoires quand plusieurs cibles existent.
 */
'use strict';

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const comms = require('./comms');
const agyHub = require('./agy-hub');
const devinHub = require('./devin-hub');
const agentAdapters = require('./agent-adapters');
const WORKSPACE = process.env.HEPHAISTOS_WORKSPACE || process.cwd();
const PAIR_ACK_TIMEOUT_MS = 120000;

const argv = process.argv.slice(2);
function opt(name) {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
}
const me = agentAdapters.resolveAgent(opt('--as'));
const peer = agentAdapters.resolveAgent(opt('--peer') || (me === 'devin' ? 'agy' : 'devin'));
const via = (opt('--via') || (me === 'agy' ? 'hub' : 'acp')).toLowerCase();
const peerVia = (opt('--peer-via') || (peer === 'agy' ? 'hub' : 'acp')).toLowerCase();
const planModel = opt('--model');
const rawTaskId = opt('--task-id');
const taskId = rawTaskId && /^\d+$/.test(rawTaskId) ? Number(rawTaskId) : undefined;
const OPT_WITH_VAL = new Set(['--as', '--peer', '--to', '--self', '--session', '--via', '--peer-via', '--model', '--task-id']);
const positional = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
        if (OPT_WITH_VAL.has(argv[i])) i++;
        continue;
    }
    positional.push(argv[i]);
}
const cmd = positional[0];
const rest = positional.slice(1);
const session = opt('--session') || ((cmd === 'join' || cmd === 'pair') ? (rest[0] || 'binome') : 'binome');

if (planModel && peerVia !== 'hub') {
    console.error('[binome] --model est réservé aux envois hub AGY; ACP/CLI gardent leur modèle provider');
    process.exit(64);
}
// --model reste disponible en override explicite; absent, le send garde le
// modèle actuellement sélectionné dans la fenêtre de chat AGY (pas de défaut forcé).

function providerId(agent, transport) {
    if (transport === 'hub') return agent === 'agy' ? 'agy-hub' : null;
    if (transport === 'cascade') return agent === 'devin' ? 'devin-cascade' : null;
    return agentAdapters.providerIdFor(agent);
}
function transportSupported(agent, transport) {
    if (transport === 'hub') return agent === 'agy';
    if (transport === 'cascade') return agent === 'devin';
    if (transport === 'cli') return agentAdapters.cliSessionSupported(agent);
    return transport === 'acp' && Boolean(agentAdapters.providerIdFor(agent));
}
function safeSessionLabel(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value);
}
function validIdentity(agent) {
    return Boolean(agent && agentAdapters.providerIdFor(agent));
}

if (cmd !== 'tail' && (!validIdentity(me) || !validIdentity(peer) || me === peer || !cmd ||
    !transportSupported(me, via) || !transportSupported(peer, peerVia) || !safeSessionLabel(session))) {
    console.error('usage: node binome.js --as <agent> [--via acp|cli|hub|cascade] [--peer <agent>] [--peer-via acp|cli|hub|cascade] [--self <sessionId>] [--to <peerSessionId>] [--session <name>] [--model <hub-model-id>] [--task-id <id>] <join|send|ask|pair|tail> ...');
    process.exit(64);
}

async function sessionsFor(agent, transport) {
    if (transport === 'hub') {
        const hub = agyHub.discoverHub(WORKSPACE);
        return (await agyHub.listConversations(hub)).map((item) => ({ sessionId: item.cascadeId, summary: item.summary || '' }));
    }
    if (transport === 'acp') {
        // Fenêtres hephaistos-chats : inventaire = .agent/chats/sessions.json
        if (providerId(agent, transport) === 'hephaistos') {
            try {
                const file = path.join(WORKSPACE, '.agent', 'chats', 'sessions.json');
                const sessions = JSON.parse(fs.readFileSync(file, 'utf8'));
                return (Array.isArray(sessions) ? sessions : []).map((s) => ({
                    sessionId: s.id, summary: s.title || s.model || '',
                }));
            } catch {
                return [];
            }
        }
        return devinHub.listAcpSessions(providerId(agent, transport), 7477, WORKSPACE);
    }
    return agentAdapters.listSessions(agent, { cwd: WORKSPACE });
}

function idMatches(a, b) {
    if (!a || !b) return false;
    return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
}

async function resolveSession(agent, transport, requested) {
    if (agent === 'devin') {
        if (requested) return /^[A-Za-z0-9._/-]{7,200}$/.test(requested) ? requested : null;
        const targetProv = transport === 'acp' ? 'devin-cli' : (transport === 'cascade' ? 'cascade' : null);
        const active = devinHub.getActiveCascade(targetProv);
        if (active) return active;
        const fallback = devinHub.getActiveCascade('devin-cli');
        return fallback || null;
    }
    const sessions = transport === 'cli'
        ? await agentAdapters.listSessions(agent, { cwd: WORKSPACE }).catch(() => [])
        : await sessionsFor(agent, transport).catch(() => []);
    // --to n'override que si l'ID existe réellement dans l'inventaire du transport indiqué.
    if (requested) return sessions.some((s) => idMatches(s.sessionId, requested)) ? requested : null;
    // Plusieurs sessions sans cible explicite = refus ; jamais de choix implicite (ni la 1re, ni la plus récente).
    return sessions.length === 1 ? sessions[0].sessionId : null;
}

async function myCascade() {
    return resolveSession(me, via, opt('--self'));
}

function safeId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._:/-]{7,300}$/.test(value)) throw new Error('[binome] session ID invalide');
    return value;
}

function buildJoinPrompt(targetAgent, targetTransport, targetId, localId) {
    const command = [
        'node', '.agent/agent-bridge/binome.js', '--as', targetAgent,
        '--via', targetTransport, '--self', safeId(targetId),
        '--peer', me, '--peer-via', via, '--to', safeId(localId),
        '--session', session, 'join'
    ].join(' ');
    return `Depuis la racine du workspace ${WORKSPACE}, exécute exactement cette commande dans ta session ${targetAgent} : ${command}. Ne crée pas de nouvelle conversation, ne fais aucune autre modification et renvoie le JSON produit.`;
}

async function sendToPeer(text, target, waitSec = 0, model = null) {
    if (peer === 'devin') {
        const result = await devinHub.sendToDevin(text, target, 7477, me);
        return { sent: true, target, result };
    }
    if (peerVia === 'hub') {
        // Tunnel canonique : démon ws-bridge 7477 -> extension -> hub agy.exe.
        // replyToCascadeId = ma session => la réponse du pair est relayée dans
        // MA conv par l'extension (pas de fenêtre parasite). Le RPC direct
        // (agyHub.sendMessage) n'est qu'un fallback hors-ligne pour `ask`.
        try {
            const replyTo = me === 'devin' && via === 'acp' ? await myCascade() : null;
            await devinHub.sendToAntigravity(text, target, replyTo, 7477, me);
            return { sent: true, target, via: 'ws-bridge' };
        } catch (err) {
            if (!waitSec) throw new Error(`[binome] tunnel 7477 indisponible : ${err.message}`);
            const hub = agyHub.discoverHub(WORKSPACE);
            const result = await agyHub.ask(hub, target, text, waitSec, model);
            return { sent: true, target, replies: result.replies.map((reply) => reply.text), timedOut: result.timedOut, via: 'rpc-direct-fallback' };
        }
    }
    if (peerVia === 'acp') {
        // Fenêtres hephaistos-chats : le bridge wake_acp_agent ne les connaît pas,
        // le transport canonique est acp-inject vers le serveur ACP de l'extension.
        if (providerId(peer, peerVia) === 'hephaistos') {
            const acpInject = require('./acp-inject');
            const res = await acpInject.inject({
                providerId: 'hephaistos', sessionId: target, text,
                cwd: WORKSPACE, wait: 'delivered', timeoutMs: 180000,
            });
            return { sent: true, target, providerId: 'hephaistos', delivered: res.delivered };
        }
        const result = await devinHub.sendToAcpAgent(text, target, providerId(peer, peerVia), 7477, WORKSPACE);
        if (result.status === 'skipped') {
            return { sent: false, skipped: true, status: 'skipped', target, providerId: result.providerId };
        }
        if (result.status !== 'sent') throw new Error(`[binome] ACP route ${result.status}: ${peer}/${target}`);
        return { sent: true, target, providerId: result.providerId };
    }
    const reply = agentAdapters.sendToSession(peer, target, text, { cwd: WORKSPACE, timeoutMs: Math.max(waitSec, 120) * 1000 });
    return { sent: true, target, reply };
}

async function waitForPair(pairId, localId, peerId) {
    const deadline = Date.now() + PAIR_ACK_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const pair = comms.findEstablishedPair(comms.tail(1000), me, session, Date.now(), peer, via, peerVia);
        if (pair && pair.pairId === pairId && pair.myCascade === localId && pair.peerCascade === peerId) return pair;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
}

async function join() {
    const id = await myCascade();
    if (!id) throw new Error(`[binome] session locale ${me}/${via} absente ou non vérifiée`);
    const myProviderId = providerId(me, via);
    const peerProviderId = providerId(peer, peerVia);
    const incoming = comms.findPendingHandshake(comms.tail(1000), peer, me, session, Date.now(), peerVia, via);
    let pairId;
    let peerId;

    if (incoming) {
        if (incoming.peerCascade && incoming.peerCascade !== id) throw new Error('[binome] requête adressée à une autre session locale');
        if (incoming.peerProviderId && incoming.peerProviderId !== myProviderId) throw new Error('[binome] provider de destination différent');
        if (incoming.providerId && incoming.providerId !== peerProviderId) throw new Error('[binome] provider source différent');
        if (opt('--to') && incoming.convId !== opt('--to')) throw new Error('[binome] requête provenant d’une autre session pair');
        pairId = incoming.pairId;
        peerId = incoming.convId;
        if (!comms.log({
            src: me, dst: peer, kind: 'handshake', phase: 'ack', pairId, replyTo: pairId,
            session, convId: id, peerCascade: peerId, transport: via, peerTransport: incoming.transport,
            providerId: myProviderId, peerProviderId: incoming.providerId, text: `session ${session} ack`
        })) throw new Error('[binome] ACK non publié dans comms.jsonl');
    } else {
        peerId = await resolveSession(peer, peerVia, opt('--to'));
        if (!peerId && opt('--to')) peerId = opt('--to');
        if (!peerId) throw new Error(`[binome] aucune session explicite/joinable ${peer}/${peerVia}; aucun fallback vers une autre session`);
        pairId = randomUUID();
        if (!comms.log({
            src: me, dst: peer, kind: 'handshake', phase: 'request', pairId,
            session, convId: id, peerCascade: peerId, transport: via, peerTransport: peerVia,
            providerId: myProviderId, peerProviderId, text: `session ${session} request`
        })) throw new Error('[binome] requête non publiée dans comms.jsonl');
        if (me === 'devin') {
            // AGY keeps its full reply in its own chat; the shared bus carries
            // only the structured ACK that the pair verifier needs.
            const waitSec = peerVia === 'hub' ? 0 : 180;
            const delivery = await sendToPeer(buildJoinPrompt(peer, peerVia, peerId, id), peerId, waitSec, planModel);
            if (!delivery.sent) throw new Error(`[binome] demande de join non livrée à ${peer}/${peerId}`);
            const establishedPair = await waitForPair(pairId, id, peerId);
            if (!establishedPair) {
                console.log(JSON.stringify({ me, myCascade: id, peer, peerCascade: peerId, session, pairId, transport: via, peerTransport: peerVia, established: false, hint: `en attente d'un ACK frais de ${peer}` }, null, 1));
                return;
            }
        }
    }

    const current = comms.findEstablishedPair(comms.tail(1000), me, session, Date.now(), peer, via, peerVia);
    const established = Boolean(current && current.pairId === pairId && current.myCascade === id && current.peerCascade === peerId);
    if (established) {
        // FR-09 : persistance durable — survit au restart IDE et au-delà du
        // TTL 15min du handshake comms.jsonl (rejoin sans handshake).
        comms.pairSave({
            pairId, agentA: me, agentB: peer, session,
            transportA: via, transportB: peerVia,
            cascadeA: id, cascadeB: current.peerCascade,
            model: planModel || null,
        });
    }
    console.log(JSON.stringify({
        me, myCascade: id, peer, peerCascade: established ? current.peerCascade : null,
        session, pairId, transport: via, peerTransport: peerVia, established,
        hint: established ? 'pair établi — sessions/transport explicitement vérifiés' : `handshake publié; en attente d'un ACK frais de ${peer}`
    }, null, 1));
}

async function pair() {
    const mine = await myCascade();
    const current = comms.findEstablishedPair(comms.tail(1000), me, session, Date.now(), peer, via, peerVia);
    const toMatch = opt('--to');
    const peerCasc = current?.peerCascade;
    const matchesTo = !toMatch || (Boolean(peerCasc) && (peerCasc === toMatch || peerCasc.endsWith('/' + toMatch) || toMatch.endsWith('/' + peerCasc)));
    const established = Boolean(mine && current && current.myCascade === mine && matchesTo);
    // FR-09 : rejoin sans handshake — dernière paire persistée en DB si le
    // handshake comms.jsonl a expiré (TTL 15min) ou le fichier a tourné.
    const restored = !established ? comms.pairGet(me, peer, session) : null;
    console.log(JSON.stringify({
        me, myCascade: mine, peer,
        peerCascade: established ? current.peerCascade : (restored?.peerCascade || null),
        session, pairId: established ? current.pairId : (restored?.pairId || null), transport: via,
        peerTransport: peerVia, providerId: established ? current.peerProviderId : providerId(peer, peerVia),
        established: established || Boolean(restored), restored: Boolean(restored),
        cascade_stale: Boolean(restored && mine && restored.myCascade !== mine)
    }, null, 1));
}

let messageQueue;
try { messageQueue = require('./message-queue'); } catch { messageQueue = null; }

async function send(text, waitSec) {
    const explicitTarget = opt('--to');
    const mine = await myCascade();
    const current = explicitTarget ? null : comms.findEstablishedPair(comms.tail(1000), me, session, Date.now(), peer, via, peerVia);
    // FR-09 : si le handshake comms a expiré, la paire persistée sert de
    // rejoin — mais la session peer stockée doit toujours exister dans
    // l'inventaire du transport (resolveSession valide).
    const restored = (!explicitTarget && (!current || current.myCascade !== mine))
        ? comms.pairGet(me, peer, session)
        : null;
    if (!mine || (!explicitTarget && (!current || current.myCascade !== mine) && !restored)) {
        throw new Error(`[binome] aucun pair frais ${me}/${via} ⇄ ${peer}/${peerVia} pour ${session}; le target explicite --to ne contourne que le handshake, pas la validation de session`);
    }
    const target = explicitTarget
        ? await resolveSession(peer, peerVia, explicitTarget)
        : (current && current.myCascade === mine)
            ? comms.resolvePairTarget(null, mine, current)
            : await resolveSession(peer, peerVia, restored.peerCascade);
    if (!target) throw new Error(`[binome] session cible ${peer}/${peerVia} absente ou non vérifiée`);
    if (restored && restored.myCascade !== mine) {
        // Rejoin effectif : mon id de session a changé (restart) — on
        // rafraîchit la paire persistée avec le nouveau cascade local.
        comms.pairSave({
            pairId: restored.pairId, agentA: me, agentB: peer, session,
            transportA: restored.myTransport || via, transportB: restored.peerTransport || peerVia,
            cascadeA: mine, cascadeB: target, model: restored.model || null,
        });
    }

    // Anti-Interruption : vérifier si la cible est occupée ou si des requêtes sont déjà en attente
    if (messageQueue && (messageQueue.isTargetBusy(peer, peerVia) || messageQueue.queueLength(target, WORKSPACE) > 0)) {
        const qRes = messageQueue.enqueue({
            src: me,
            dst: peer,
            sessionId: target,
            transport: peerVia,
            text,
            kind: 'prompt'
        }, WORKSPACE);
        console.log(JSON.stringify({
            sent: true,
            queued: true,
            position: qRes.position,
            to: `${peer}:${target}`,
            transport: peerVia,
            hint: `La cible ${peer} est actuellement occupée : message placé en file d'attente (position ${qRes.position}) sans interrompre son travail.`,
            ...(taskId !== undefined ? { taskId } : {})
        }));
        return;
    }

    const delivery = await sendToPeer(text, target, waitSec, planModel);
    if (delivery.skipped) {
        comms.log({
            src: me, dst: peer, kind: 'status', text: `[acp] routage skipped: ${peer}/${target}`,
            convId: mine, peerCascade: target, session,
            transport: via, peerTransport: peerVia,
            providerId: providerId(me, via), peerProviderId: providerId(peer, peerVia),
            ...(taskId !== undefined ? { taskId } : {})
        });
        console.log(JSON.stringify({ sent: false, status: 'skipped', to: `${peer}:${target}`, transport: peerVia, ...(taskId !== undefined ? { taskId } : {}) }));
        return;
    }
    comms.log({
        src: me, dst: peer, kind: 'prompt', text, convId: mine, peerCascade: target, session,
        transport: via, peerTransport: peerVia, providerId: providerId(me, via), peerProviderId: providerId(peer, peerVia),
        ...(taskId !== undefined ? { taskId } : {})
    });
    if (delivery.reply) console.log(delivery.reply);
    else if (delivery.replies?.length) delivery.replies.forEach((reply) => console.log(reply));
    else console.log(JSON.stringify({ sent: true, to: `${peer}:${target}`, transport: peerVia, ...(taskId !== undefined ? { taskId } : {}) }));
}


function tail(n) {
    comms.tail(n).forEach((e) =>
        console.log(`[${e.ts}] ${e.src}→${e.dst} ${e.kind}: ${(e.text || '').slice(0, 200)}`));
}

(async () => {
    switch (cmd) {
        case 'join': return join();
        case 'pair': return pair();
        case 'tail': return tail(Number(rest[0]) || 30);
        case 'send': return send(rest.join(' '), 0);
        case 'ask': {
            const last = rest[rest.length - 1];
            const sec = /^\d+$/.test(last || '') ? Number(rest.pop()) : 300;
            return send(rest.join(' '), sec);
        }
        default:
            console.error('cmds: join|send|ask|pair|tail');
            process.exit(2);
    }
})().catch((e) => { console.error('[binome]', e.message); process.exit(1); });
