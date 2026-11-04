// task-watch.cjs — watcher push des transitions de taches orchestrateur.
// Se connecte au WS bridge (:7477) et imprime chaque transition de statut.
// Persiste aussi dans .agent/task-events.log. Relance auto sur deconnexion.
const fs = require('fs');
const path = require('path');
let WebSocket;
try { WebSocket = require('ws'); }
catch {
  // fallback : ws du repo ou du monitor installé (toute version) — aucun
  // chemin machine/version en dur.
  const fallbackDirs = [
    path.join(__dirname, 'agent-bridge', 'node_modules', 'ws'),
    path.join(__dirname, '..', 'extensions', 'orchestrator-monitor', 'ws-bridge', 'node_modules', 'ws'),
  ];
  try {
    const extRoot = path.join(process.env.USERPROFILE || '', '.devin', 'extensions');
    for (const name of fs.readdirSync(extRoot)) {
      if (name.startsWith('hephaistos.orchestrator-monitor-')) {
        fallbackDirs.push(path.join(extRoot, name, 'ws-bridge', 'node_modules', 'ws'));
      }
    }
  } catch {}
  for (const p of fallbackDirs) { try { WebSocket = require(p); break; } catch {} }
}
if (!WebSocket) { console.error('[task-watch] module "ws" introuvable — npm i ws'); process.exit(2); }

const LOG = path.join(__dirname, 'task-events.log');
const URL = 'ws://127.0.0.1:7477';
const seen = new Map(); // task id -> last status

// Auth bridge (revue sécu) : ORCH_MONITOR_TOKEN env, sinon ws-bridge.token
// écrit par le bridge au boot dans .agent/ (ici __dirname = .agent).
function wsToken() {
  const envTok = (process.env.ORCH_MONITOR_TOKEN || '').trim();
  if (envTok) return envTok;
  const dirs = [
    __dirname,                                              // .agent/
    path.join(process.cwd(), '.agent'),
    process.env.HEPHAISTOS_WORKSPACE && path.join(process.env.HEPHAISTOS_WORKSPACE, '.agent'),
  ].filter(Boolean);
  for (const d of dirs) {
    try {
      const t = fs.readFileSync(path.join(d, 'ws-bridge.token'), 'utf8').trim();
      if (t) return t;
    } catch { /* absent */ }
  }
  return '';
}
function connectUrl() {
  const tok = wsToken();
  return tok ? `${URL}?token=${encodeURIComponent(tok)}` : URL;
}

function ts() { return new Date().toISOString().slice(11, 19); }
function emit(line) {
  const out = `[${ts()}] ${line}`;
  console.log(out);
  try { fs.appendFileSync(LOG, out + '\n'); } catch {}
}
function track(t) {
  const prev = seen.get(t.id);
  if (prev === t.status) return;
  seen.set(t.id, t.status);
  const tag = { completed: 'DONE', failed: 'FAIL', in_progress: 'RUN', pending: 'PEND' }[t.status] || t.status;
  emit(`${tag} #${t.id} ${(t.title || '').slice(0, 80)}${t.result ? ' (result ok)' : ''}`);
}

function connect() {
  let ws;
  try { ws = new WebSocket(connectUrl()); } catch { return setTimeout(connect, 5000); }
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'task_update' && m.task) track(m.task);
    else if (m.type === 'snapshot' && Array.isArray(m.tasks)) m.tasks.forEach(track);
  });
  ws.on('open', () => emit('watcher connecte au bridge :7477'));
  ws.on('close', () => { emit('bridge ferme — reconnexion dans 5s'); setTimeout(connect, 5000); });
  ws.on('error', () => {}); // close handler fera la reconnexion
}
connect();
