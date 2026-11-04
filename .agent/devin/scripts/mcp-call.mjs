#!/usr/bin/env node
// mcp-call.mjs — generic MCP stdio client for Devin hooks and scripts.
// Usage: node mcp-call.mjs <server-name> <tool-name> [json-args]
// Server definitions are read from Devin's mcp_config.json (%APPDATA%/devin)
// with fallback to mcp-mux config (~/.config/mcp-mux/mcp-mux.json).
// Prints the tool result content as text to stdout. Exit 0 on success.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MCP_CONFIG = process.env.DEVIN_MCP_CONFIG
  || join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'devin', 'mcp_config.json');
const TIMEOUT_MS = Number(process.env.MCP_CALL_TIMEOUT_MS || 20000);

const [serverName, toolName, argsJson] = process.argv.slice(2);
if (!serverName || !toolName) {
  console.error('usage: mcp-call.mjs <server> <tool> [json-args]');
  process.exit(64);
}

let toolArgs = {};
if (argsJson) {
  try { toolArgs = JSON.parse(argsJson); }
  catch { console.error('invalid JSON args'); process.exit(64); }
}

const cfg = JSON.parse(readFileSync(MCP_CONFIG, 'utf8'));
const servers = cfg.mcpServers || cfg;
let def = servers[serverName];
if ((!def || !def.command) && servers['mcp-mux']?.args) {
  const muxArgs = servers['mcp-mux'].args;
  const cfgIdx = muxArgs.indexOf('--config');
  const muxPath = cfgIdx >= 0 && muxArgs[cfgIdx + 1]
    ? muxArgs[cfgIdx + 1]
    : join(homedir(), '.config', 'mcp-mux', 'mcp-mux.json');
  try {
    const muxCfg = JSON.parse(readFileSync(muxPath, 'utf8'));
    const muxSrv = (muxCfg.servers || muxCfg.mcpServers || muxCfg)[serverName];
    if (muxSrv && !muxSrv.disabled && muxSrv.command) def = muxSrv;
  } catch { /* fallback failed */ }
}
if (!def || !def.command) {
  console.error(`unknown stdio server: ${serverName}`);
  process.exit(65);
}

const child = spawn(def.command, def.args || [], {
  env: { ...process.env, ...(def.env || {}) },
  stdio: ['pipe', 'pipe', 'ignore'],
  windowsHide: true,
});

let buf = '';
const pending = new Map();
let nextId = 1;
let done = false;

const timer = setTimeout(() => finish(new Error('timeout')), TIMEOUT_MS);

function send(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
function finish(err, out) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  try { child.kill(); } catch {}
  if (err) { console.error(String(err.message || err)); process.exit(1); }
  process.stdout.write(out ?? '');
  process.exit(0);
}

child.on('error', (e) => finish(e));
child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
    }
  }
});

(async () => {
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'devin-hook', version: '1.0.0' },
  });
  notify('notifications/initialized', {});
  const res = await send('tools/call', { name: toolName, arguments: toolArgs });
  const text = (res?.content || [])
    .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
    .join('\n');
  finish(null, text);
})().catch((e) => finish(e));
