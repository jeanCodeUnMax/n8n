#!/usr/bin/env node
// current-cascade.js — imprime le cascadeId de la conversation Devin ACTIVE.
//
// Source PRIMAIRE (fiable) : le globalStorage Devin persiste chaque session
// chat sous la clé `windsurf.acp.sessioninfo.session.<id>` avec info.updatedAt
// — l'horodatage reflète l'activité utilisateur réelle (champ "updatedAt" mis
// à jour quand l'utilisateur parle dans cette conversation).
//   → %APPDATA%/Devin/User/globalStorage/state.vscdb (SQLite)
//
// Fallback : heuristique .pb (~/.codeium/windsurf/cascade/*.pb le plus récent)
// — moins fiable : des writes de fond polluent les mtimes (chats vierges
// créés au reload, wakes injectés, etc.).
//
// Usage : node current-cascade.js   →  "72f64bf0-e339-..."

const fs = require('fs');
const path = require('path');
const os = require('os');

const DRAFT_TITLES = new Set(['Awaiting User\'s Request', 'New Cascade', '']);

// Providers acceptés : 'cascade' (conversations Devin classiques) et
// 'devin-cli' (sessions agent Devin — la surface où tourne l'utilisateur dans
// Devin Desktop ; ids de la forme "acp/devin-cli/<slug>"). Les autres
// providers ACP (kilo, hermes, cline...) sont des workers, jamais la fenêtre
// utilisateur.
const USER_PROVIDERS = new Set(['cascade', 'devin-cli']);

// 1) Source fiable : sessioninfo.updatedAt dans le globalStorage Devin
//    raw=true → inclut les drafts (pour savoir si le panel est sur un composer vide)
function fromSessionInfo(raw, json = false) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const dbPath = path.join(appdata, 'Devin', 'User', 'globalStorage', 'state.vscdb');
    if (!fs.existsSync(dbPath)) return '';
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare(
        "SELECT value FROM ItemTable WHERE key LIKE 'windsurf.acp.sessioninfo.session.%'"
      ).all();
      let best = '', bestTs = '', bestTitle = '', bestProvider = '', bestUser = null, bestCreated = '';
      for (const r of rows) {
        try {
          const p = JSON.parse(r.value);
          if (!USER_PROVIDERS.has(p.providerId)) continue;
          // Les drafts vides ont un cascadeId ÉPHÉMÈRE : le premier
          // sendCascadeInput les matérialise sous un id DIFFÉRENT -> le
          // message part dans une fenêtre neuve. On les exclut du pick,
          // sauf en mode raw où on veut justement savoir si on est dessus.
          const title = p.info?.title || '';
          if (!raw && DRAFT_TITLES.has(title)) continue;
          // Sessions devin-cli avec 0 message utilisateur = sessions spawnées
          // (sub-agents / daemons partageant un requestingTabId) — jamais la
          // fenêtre où l'utilisateur écrit.
          const meta = p.info?._meta || {};
          const userCount = typeof meta['cognition.ai/userMessageCount'] === 'number'
              ? meta['cognition.ai/userMessageCount'] : null;
          if (p.providerId === 'devin-cli' && !raw && userCount === 0) continue;
          const id = p.info?.sessionId || '';
          const ts = p.info?.updatedAt || '';
          if (id && ts > bestTs) {
            bestTs = ts; best = id; bestTitle = title;
            bestProvider = p.providerId; bestUser = userCount;
            bestCreated = meta['cognition.ai/createdAt'] || '';
          }
        } catch { /* entrée non-JSON */ }
      }
      return raw ? JSON.stringify({ id: best, title: bestTitle })
          : json ? JSON.stringify({
              id: best, title: bestTitle, provider: bestProvider,
              userMessageCount: bestUser, createdAt: bestCreated, updatedAt: bestTs
          }) : best;
    } finally { db.close(); }
  } catch { return ''; }
}

// 2) Fallback : .pb le plus récemment écrit
function fromPbMtime() {
  const dir = path.join(os.homedir(), '.codeium', 'windsurf', 'cascade');
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.pb') && !f.endsWith('.archived'))
      .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return files.length ? files[0].f.replace(/\.pb$/, '') : '';
  } catch { return ''; }
}

if (process.argv.includes('--raw')) {
  const raw = fromSessionInfo(true);
  if (!raw || raw === '{"id":"","title":""}') { console.error('aucune session'); process.exit(1); }
  console.log(raw);
  process.exit(0);
}

// --json : sélection FILTRÉE (brouillons exclus) + métadonnées différenciantes
if (process.argv.includes('--json')) {
  const out = fromSessionInfo(false, true);
  const parsed = JSON.parse(out || '{}');
  if (!parsed.id) { console.error('current-cascade: aucune cascade trouvée'); process.exit(1); }
  console.log(out);
  process.exit(0);
}

const id = fromSessionInfo() || fromPbMtime();
if (!id) { console.error('current-cascade: aucune cascade trouvée'); process.exit(1); }
console.log(id);
