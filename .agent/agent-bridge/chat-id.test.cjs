const assert = require('node:assert/strict');
const test = require('node:test');
const { selectAcpSession, selectCliSession } = require('./chat-id');

test('chat-id selects only the unique focused ACP session', () => {
    const sessions = [
        { sessionId: 'acp/kilo/old', focused: false },
        { sessionId: 'acp/kilo/current', focused: true }
    ];
    assert.equal(selectAcpSession(sessions).sessionId, 'acp/kilo/current');
});

test('chat-id requires explicit selection when no ACP session is focused', () => {
    assert.throws(
        () => selectAcpSession([{ sessionId: 'acp/hermes/one', focused: false }]),
        /aucune session ACP focalisée/
    );
});

test('chat-id refuses multiple focused ACP sessions', () => {
    assert.throws(
        () => selectAcpSession([
            { sessionId: 'acp/kilo/one', focused: true },
            { sessionId: 'acp/kilo/two', focused: true }
        ]),
        /plusieurs sessions ACP focalisées/
    );
});

test('chat-id CLI lookup never picks the latest when ambiguous', () => {
    assert.throws(
        () => selectCliSession('kilo', [{ sessionId: 'ses_one' }, { sessionId: 'ses_two' }]),
        /plusieurs sessions kilo\/cli/
    );
    assert.equal(
        selectCliSession('hermes', [{ sessionId: '20261015_190000_abcd1234' }]),
        '20261015_190000_abcd1234'
    );
});
