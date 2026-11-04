#!/usr/bin/env node
// acp-dispatch.mjs — minimal ACP (Agent Client Protocol) client over stdio.
// Sends a prompt to an ACP-capable agent CLI and prints the streamed reply.
//
// Usage:
//   node acp-dispatch.mjs --agent hermes --prompt "..." [--cwd DIR] [--timeout SEC]
//   node acp-dispatch.mjs --cmd "kilo acp" --prompt "..."
//
// Known agents: devin (`devin acp`), hermes (`hermes acp`), kilo (`kilo acp`),
// gemini (`gemini --acp`). Others can be passed via --cmd.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const AGENTS = {
  devin: 'devin acp',
  hermes: 'hermes acp --accept-hooks',
  kilo: 'kilo acp',
  gemini: 'gemini --acp',
};

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : dflt;
}
const agentName = arg('agent', null);
const rawCmd = arg('cmd', agentName ? AGENTS[agentName] : null);
const prompt = arg('prompt', null) || argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--agent' && argv[argv.indexOf(a) - 1] !== '--cmd' && argv[argv.indexOf(a) - 1] !== '--cwd' && argv[argv.indexOf(a) - 1] !== '--timeout').join(' ');
const cwd = arg('cwd', process.cwd());
const timeoutSec = Number(arg('timeout', 300));

if (!rawCmd || !prompt) {
  console.error('usage: acp-dispatch.mjs (--agent <devin|hermes|kilo|gemini> | --cmd "<cmd>") --prompt "..." [--cwd DIR] [--timeout SEC]');
  process.exit(64);
}

const child = spawn(rawCmd, {
  shell: true,
  cwd,
  stdio: ['pipe', 'pipe', 'inherit'],
  windowsHide: true,
});

let buf = '';
let nextId = 1;
const pending = new Map();
let sessionId = null;
let out = '';
let done = false;

const timer = setTimeout(() => finish(new Error(`timeout ${timeoutSec}s`)), timeoutSec * 1000);

function request(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
function respond(id, result) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function finish(err) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  try { child.kill(); } catch {}
  if (err) { console.error(String(err.message || err)); process.exit(1); }
  process.stdout.write(out);
  process.exit(0);
}

async function handleServerRequest(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case 'fs/read_text_file':
        return respond(id, { content: readFileSync(params.path, 'utf8') });
      case 'fs/write_text_file':
        writeFileSync(params.path, params.content);
        return respond(id, {});
      case 'session/request_permission': {
        const opts = params?.options || [];
        const opt = opts.find((o) => /allow/i.test(o.kind || o.name || '')) || opts[0];
        return respond(id, { outcome: opt ? { outcome: 'selected', optionId: opt.optionId } : { outcome: 'cancelled' } });
      }
      default:
        return respond(id, null); // unknown request: null result
    }
  } catch (e) {
    respond(id, null);
  }
}

function handleNotification(msg) {
  if (msg.method !== 'session/update') return;
  const u = msg.params?.update;
  if (!u) return;
  if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') {
    out += u.content.text;
  } else if (u.sessionUpdate === 'tool_call' && u.title) {
    out += `\n[tool] ${u.title}\n`;
  }
}

child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && msg.method) {
      handleServerRequest(msg); // server -> client request
    } else if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      handleNotification(msg);
    }
  }
});
child.on('error', (e) => finish(e));
child.on('exit', () => finish(null));

(async () => {
  await request('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: 'acp-dispatch', version: '1.0.0' },
  });
  const s = await request('session/new', { cwd, mcpServers: [] });
  sessionId = s.sessionId;
  const res = await request('session/prompt', {
    sessionId,
    prompt: [{ type: 'text', text: prompt }],
  });
  finish(null);
})().catch((e) => finish(e));
