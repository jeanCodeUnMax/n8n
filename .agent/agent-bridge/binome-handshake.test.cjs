'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const commsCopies = [
    require('./comms'),
    require(path.join(__dirname, '..', '..', 'extensions', 'orchestrator-monitor', 'agent-bridge', 'comms.js'))
];
const agentAdapters = require('./agent-adapters');
const now = Date.parse('2026-10-15T12:00:00.000Z');
const request = (overrides = {}) => ({
    ts: new Date(now - 1000).toISOString(),
    src: 'devin',
    dst: 'agy',
    kind: 'handshake',
    phase: 'request',
    pairId: 'pair-current',
    session: 'binome',
    convId: 'devin-current',
    ...overrides
});
const ack = (overrides = {}) => ({
    ts: new Date(now).toISOString(),
    src: 'agy',
    dst: 'devin',
    kind: 'handshake',
    phase: 'ack',
    pairId: 'pair-current',
    replyTo: 'pair-current',
    session: 'binome',
    convId: 'agy-current',
    peerCascade: 'devin-current',
    ...overrides
});

for (const [index, comms] of commsCopies.entries()) {
    test(`copy ${index + 1}: legacy and stale handshakes cannot establish a pair`, () => {
        const legacy = {
            ts: new Date(now - 1000).toISOString(),
            src: 'agy', dst: 'devin', kind: 'handshake',
            text: 'session binome', convId: 'agy-old'
        };
        const ttl = comms.PAIRING_TTL_MS || 15 * 60 * 1000;
        const stale = request({ ts: new Date(now - ttl - 1).toISOString() });

        assert.equal(comms.findPendingHandshake([legacy], 'agy', 'devin', 'binome', now), null);
        assert.equal(comms.findEstablishedPair([legacy, ack()], 'devin', 'binome', now), null);
        assert.equal(comms.findPendingHandshake([stale], 'devin', 'agy', 'binome', now), null);
        assert.equal(comms.findEstablishedPair([stale, ack()], 'devin', 'binome', now), null);
    });

    test(`copy ${index + 1}: only the fresh matching request/ack pair establishes`, () => {
        const req = request();
        const pending = comms.findPendingHandshake([req], 'devin', 'agy', 'binome', now);
        assert.equal(pending.pairId, req.pairId);
        assert.equal(comms.findEstablishedPair([req], 'devin', 'binome', now), null);

        const entries = [req, ack()];
        const devinPair = comms.findEstablishedPair(entries, 'devin', 'binome', now);
        const agyPair = comms.findEstablishedPair(entries, 'agy', 'binome', now);
        assert.equal(devinPair.myCascade, 'devin-current');
        assert.equal(devinPair.peerCascade, 'agy-current');
        assert.equal(agyPair.myCascade, 'agy-current');
        assert.equal(agyPair.peerCascade, 'devin-current');

        for (const badAck of [
            ack({ replyTo: 'another-pair' }),
            ack({ session: 'other-session' }),
            ack({ peerCascade: 'devin-old' }),
            ack({ dst: 'kilo' })
        ]) {
            assert.equal(comms.findEstablishedPair([req, badAck], 'devin', 'binome', now), null);
        }
    });

    test(`copy ${index + 1}: ACP/CLI modes and provider IDs are cross-checked`, () => {
        const req = request({
            src: 'devin', dst: 'kilo', pairId: 'pair-kilo-cli', convId: 'devin-session',
            peerCascade: 'kilo-session', transport: 'acp', peerTransport: 'cli',
            providerId: 'devin-cli', peerProviderId: 'kilo'
        });
        const response = ack({
            src: 'kilo', dst: 'devin', pairId: 'pair-kilo-cli', replyTo: 'pair-kilo-cli',
            convId: 'kilo-session', peerCascade: 'devin-session', transport: 'cli', peerTransport: 'acp',
            providerId: 'kilo', peerProviderId: 'devin-cli'
        });
        const pair = comms.findEstablishedPair([req, response], 'devin', 'binome', now, 'kilo', 'acp', 'cli');
        assert.equal(pair.myCascade, 'devin-session');
        assert.equal(pair.peerCascade, 'kilo-session');
        assert.equal(comms.findPendingHandshake([req], 'devin', 'kilo', 'binome', now, 'cli', 'acp'), null);
        assert.equal(comms.findEstablishedPair([req, response], 'devin', 'binome', now, 'kilo', 'cli', 'acp'), null);
        assert.equal(comms.findEstablishedPair([req, ack({
            src: 'kilo', dst: 'devin', pairId: 'pair-kilo-cli', replyTo: 'pair-kilo-cli',
            convId: 'kilo-session', peerCascade: 'devin-session', transport: 'cli', peerTransport: 'acp',
            providerId: 'openrouter', peerProviderId: 'devin-cli'
        })], 'devin', 'binome', now, 'kilo', 'acp', 'cli'), null);
    });

    test(`copy ${index + 1}: an unanswered newer request supersedes an older pair`, () => {
        const oldRequest = request({ pairId: 'pair-old', ts: new Date(now - 2000).toISOString() });
        const oldAck = ack({ pairId: 'pair-old', replyTo: 'pair-old', ts: new Date(now - 1000).toISOString() });
        const newRequest = request({ pairId: 'pair-new', ts: new Date(now - 500).toISOString() });
        const entries = [oldRequest, oldAck, newRequest];

        assert.equal(comms.findEstablishedPair(entries, 'devin', 'binome', now), null);
        assert.equal(comms.findPendingHandshake(entries, 'devin', 'agy', 'binome', now).pairId, 'pair-new');
    });

    test(`copy ${index + 1}: target resolution never falls back to an active chat`, () => {
        const pair = comms.findEstablishedPair([request(), ack()], 'devin', 'binome', now);
        assert.equal(comms.resolvePairTarget(null, 'devin-current', pair), 'agy-current');
        assert.equal(comms.resolvePairTarget(null, 'devin-other', pair), null);
        assert.equal(comms.resolvePairTarget(null, 'devin-current', null), null);
        assert.equal(comms.resolvePairTarget('agy-explicit', 'devin-other', null), 'agy-explicit');
    });
}

test('structured handshake fields survive append/read in both comms copies', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'binome-comms-'));
    const file = path.join(directory, 'comms.jsonl');
    const previous = process.env.COMMS_LOG;
    try {
        process.env.COMMS_LOG = file;
        for (const comms of commsCopies) {
            comms.log(request({ transport: 'acp', peerTransport: 'cli', providerId: 'devin-cli', peerProviderId: 'kilo' }));
            const entry = comms.tail(1, file)[0];
            assert.equal(entry.phase, 'request');
            assert.equal(entry.pairId, 'pair-current');
            assert.equal(entry.session, 'binome');
            assert.equal(entry.transport, 'acp');
            assert.equal(entry.peerTransport, 'cli');
            assert.equal(entry.providerId, 'devin-cli');
            assert.equal(entry.peerProviderId, 'kilo');
        }
    } finally {
        if (previous === undefined) delete process.env.COMMS_LOG;
        else process.env.COMMS_LOG = previous;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('agent aliases separate ACP providers from resumable Kilo/Hermes CLI sessions', () => {
    assert.equal(agentAdapters.resolveAgent('KiloCode'), 'kilo');
    assert.equal(agentAdapters.resolveAgent('Hermes'), 'hermes');
    assert.equal(agentAdapters.providerIdFor('NVIDIA NIM #2'), 'nim2');
    assert.equal(agentAdapters.providerIdFor('OpenRouter'), 'openrouter');
    assert.equal(agentAdapters.resolveAgent('Masurewski'), null);
    assert.equal(agentAdapters.cliSessionSupported('Mistral Vibe'), false);
    assert.deepEqual(agentAdapters.parseKiloSessionList('Session ID  Title\nses_abcd123  Current session'), [
        { sessionId: 'ses_abcd123', summary: 'Current session' }
    ]);
    assert.equal(agentAdapters.parseHermesSessionList('Title Workspace Updated ID\n— hephaistos2-kit yesterday 20261013_203532_ea857b')[0].sessionId, '20261013_203532_ea857b');
    assert.equal(agentAdapters.isWithinWorkspace('C:/workspace/sub', 'C:/workspace'), true);
    assert.equal(agentAdapters.isWithinWorkspace('C:/workspace-other', 'C:/workspace'), false);

    const kilo = agentAdapters.buildSessionInvocation('KiloCode', 'ses_abcd123', 'join request');
    assert.equal(kilo.command, process.execPath);
    assert.deepEqual(kilo.args.slice(1), ['run', '--auto', '-s', 'ses_abcd123', 'join request']);
    const hermes = agentAdapters.buildSessionInvocation('Hermes', '20261013_203532_ea857b', 'join request');
    assert.deepEqual(hermes.args, ['--resume', '20261013_203532_ea857b', '-z', 'join request', '--no-restore-cwd']);
    assert.throws(() => agentAdapters.buildSessionInvocation('NVIDIA NIM', 'nim-id-123456', 'join'), /unsupported/);
    assert.throws(() => agentAdapters.buildSessionInvocation('KiloCode', 'bad;id', 'join'), /session ID/);
});
