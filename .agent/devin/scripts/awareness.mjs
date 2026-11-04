#!/usr/bin/env node
// awareness.mjs — Devin lifecycle hook: injects orchestrator + beacon state.
// Usage: node awareness.mjs <session-start|prompt-submit|stop>
// Reads the hook payload on stdin, prints hook JSON on stdout.
// - session-start / prompt-submit -> hookSpecificOutput.additionalContext
// - stop -> decision:block when pending tasks are assigned to "devin"
// State: %USERPROFILE%/.config/devin/state/awareness.json

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_CALL = join(HERE, 'mcp-call.mjs');
const STATE_FILE = join(homedir(), '.config', 'devin', 'state', 'awareness.json');
const AGENT_ID = process.env.DEVIN_AGENT_ID || 'devin';
const EVENT = process.argv[2];

function mcp(server, tool, args = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [MCP_CALL, server, tool, JSON.stringify(args)],
      { timeout: 9000, windowsHide: true, env: { ...process.env, MCP_CALL_TIMEOUT_MS: '8000' } },
      (err, stdout) => resolve(err ? null : stdout.trim())
    );
  });
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); }
    });
    setTimeout(() => resolve({}), 1500);
  });
}

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastCheck: null }; }
}
function saveState(s) {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(s));
  } catch {}
}

function emitContext(eventName, text) {
  if (!text) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
  }));
}

function fmtTasks(tasks) {
  return (tasks || [])
    .slice(0, 10)
    .map((t) => `#${t.id} [${t.status}]${t.assigned_to ? ' @' + t.assigned_to : ''} ${t.title}`)
    .join('\n');
}

const payload = await readStdin();
const state = loadState();
const now = new Date().toISOString();

try {
  // NOTE: orchestrator list_tasks crashes with any filter arg (SQL binding bug)
  // -> fetch unfiltered, filter client-side. assigned_to stores the agent id.
  const [allRaw, agentsRaw, nextRaw, beaconRaw] = await Promise.all([
    mcp('orchestrator', 'list_tasks', {}),
    mcp('orchestrator', 'list_agents', {}),
    mcp('orchestrator', 'get_next_task', { agent_id: AGENT_ID }),
    state.lastCheck
      ? mcp('beacon', 'search_activity', { since: state.lastCheck, limit: '10' })
      : Promise.resolve(null),
  ]);

  const all = allRaw ? JSON.parse(allRaw) : [];
  const agents = agentsRaw ? JSON.parse(agentsRaw) : [];
  const me = agents.find((a) => String(a.agent_name).toLowerCase() === AGENT_ID);
  const myId = me ? String(me.id) : AGENT_ID;
  const pending = all.filter((t) => t.status === 'pending');
  const minePending = all.filter(
    (t) => (t.status === 'pending' || t.status === 'in_progress')
      && String(t.assigned_to) === myId
  );

  if (EVENT === 'stop') {
    // Never block twice in a row for the same turn.
    if (payload.stop_hook_active === true) process.exit(0);
    let next = null;
    try { next = nextRaw ? JSON.parse(nextRaw) : null; } catch {}
    if (next && next.id) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `Orchestrateur : tâche #${next.id} "${next.title}" en attente pour ${AGENT_ID}. Traite-la (ou update_task pour la déléguer/clore) avant de t'arrêter.`,
      }));
    }
    process.exit(0);
  }

  const lines = [];
  if (minePending.length) {
    lines.push(`[orchestrateur] ${minePending.length} tâche(s) assignée(s) à ${AGENT_ID} :`);
    lines.push(fmtTasks(minePending));
  } else if (pending.length) {
    lines.push(`[orchestrateur] ${pending.length} tâche(s) pending non assignées :`);
    lines.push(fmtTasks(pending));
  }
  if (beaconRaw && !/no events|^\[\s*\]$/i.test(beaconRaw)) {
    lines.push('[beacon] activité agents depuis la dernière vérification :');
    lines.push(beaconRaw.slice(0, 1500));
  }

  const eventName = EVENT === 'session-start' ? 'SessionStart' : 'UserPromptSubmit';
  emitContext(eventName, lines.join('\n'));
  state.lastCheck = now;
  saveState(state);
} catch {
  // Hooks must never break the session.
}
process.exit(0);
