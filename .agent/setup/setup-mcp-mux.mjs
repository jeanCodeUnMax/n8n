#!/usr/bin/env node
// setup-mcp-mux.mjs — branche les configs MCP clientes (Devin, Antigravity)
// sur le broker mcp-mux PARTAGÉ au lieu de spawner une flotte par fenêtre.
//
// Ce qui est fait (backup .bak-mux-<ts> avant chaque écriture) :
//   1) ~/.config/mcp-mux/mcp-mux.json : les serveurs déclarés en direct dans
//      les configs clientes sont ajoutés à `servers` (env fusionnée, jamais
//      écrasée). Les entrées existantes et `disabled` sont conservées.
//   2) Chaque config cliente : les entrées devenues couvertes par le mux sont
//      remplacées par UNE entrée "mcp-mux" (shim stdio → broker). Les serveurs
//      déjà couverts restent couverts.
//
// Usage : node setup-mcp-mux.mjs [--verify] [--dry-run]
//         [--client <path>]... (défaut : Devin + les 2 configs AGY)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const VERIFY = args.includes('--verify');
const DRY = args.includes('--dry-run');
const JSON_OUT = args.includes('--json');
const clients = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--client') clients.push(args[++i]);

const HOME = process.env.USERPROFILE || process.env.HOME;
const MUX_CONFIG = path.join(HOME, '.config', 'mcp-mux', 'mcp-mux.json');
const SHIM_JS = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'mcp-mux', 'src', 'shim.mjs');
const SHIM_ENTRY = {
  command: 'node',
  args: [SHIM_JS.replace(/\\/g, '/'), '--config', MUX_CONFIG.replace(/\\/g, '/')],
};

const DEFAULT_CLIENTS = [
  path.join(process.env.APPDATA || '', 'devin', 'mcp_config.json'),
  path.join(HOME, '.gemini', 'config', 'mcp_config.json'),
  path.join(HOME, '.gemini', 'antigravity-ide', 'mcp_config.json'),
  // Configs internes des extensions agent (chacune spawnait sa propre copie)
  path.join(process.env.APPDATA || '', 'devin', 'User', 'Claude', 'claude_desktop_config.json'),
  path.join(process.env.APPDATA || '', 'devin', 'User', 'globalStorage', 'kilocode.kilo-code', 'settings', 'mcp_settings.json'),
  path.join(process.env.APPDATA || '', 'devin', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
  path.join(process.env.APPDATA || '', 'devin', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
];
const CLIENTS = clients.length ? clients : DEFAULT_CLIENTS;

// Jamais muxés ni conservés côté client : obsidian-live = mcp-remote vers le
// plugin Local REST API (127.0.0.1:27124) — mort dès qu'Obsidian est éteint.
// L'accès vault est couvert par antigravity-obsidian, hphe fs_* et
// cli-anything-obsidian --local. Retiré aussi du broker s'il y traîne.
const NEVER_MUX = new Set(['obsidian-live']);

// Entrées à ne jamais muxer : celles marquées disabled dans le client.
// (Tout le reste, y compris les serveurs .exe et python, passe par le broker.)
function stripJsonc(src) {
  let out = '', i = 0, inStr = false, q = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inStr) { out += c; if (c === '\\') out += src[++i] ?? ''; else if (c === q) inStr = false; i++; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
const readJson = (p) => JSON.parse(stripJsonc(fs.readFileSync(p, 'utf8')));
const backup = (p) => {
  fs.copyFileSync(p, `${p}.bak-mux-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  // Retention : garder les 5 derniers bak-mux par fichier
  try {
    const dir = path.dirname(p), base = path.basename(p) + '.bak-mux-';
    const olds = fs.readdirSync(dir).filter((f) => f.startsWith(base)).sort();
    for (const f of olds.slice(0, Math.max(0, olds.length - 5))) fs.unlinkSync(path.join(dir, f));
  } catch { /* retention best-effort */ }
};

if (!fs.existsSync(MUX_CONFIG)) { console.error(`[FAIL] ${MUX_CONFIG} introuvable`); process.exit(1); }
const mux = readJson(MUX_CONFIG);
if (!mux.servers || typeof mux.servers !== 'object') mux.servers = {};

// 1) Collecte des serveurs déclarés en direct par les clients -----------------
const clientData = new Map();      // path -> {json, serversKey}
const wanted = new Map();          // name -> {command,args,env}
for (const cp of CLIENTS) {
  if (!fs.existsSync(cp)) { console.log(`[skip] ${cp} absent`); continue; }
  const json = readJson(cp);
  const key = json.mcpServers ? 'mcpServers' : (json.servers ? 'servers' : 'mcpServers');
  const srv = json[key] || {};
  clientData.set(cp, { json, key });
  for (const [name, def] of Object.entries(srv)) {
    if (name === 'mcp-mux' || def.disabled || NEVER_MUX.has(name)) continue;
    if (typeof def.command !== 'string' || !def.command) continue;
    if (!wanted.has(name)) wanted.set(name, { command: def.command, args: def.args || [], env: def.env || {} });
    else {
      // Fusion env : la première vue gagne les clés, les autres complètent.
      const cur = wanted.get(name);
      cur.env = { ...(def.env || {}), ...cur.env };
    }
  }
}

// 2) Mise à jour de mcp-mux.json ---------------------------------------------
// Serveurs gérés par le kit : enregistrés qu'aucun client ne les déclare.
// skill-mux = registre central des skills distribué à tous les agents —
// fait partie de la structure Hephaistos, installé avec le plugin.
const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_SERVERS = {
  'skill-mux': {
    command: 'node',
    args: [path.join(KIT_ROOT, '.agent', 'skill-mux', 'server.mjs').replace(/\\/g, '/')],
    env: {},
  },
};

let added = 0, envMerged = 0, removed = 0;
for (const name of NEVER_MUX) if (mux.servers[name]) { delete mux.servers[name]; removed++; }
for (const [name, def] of Object.entries(KIT_SERVERS)) {
  if (!mux.servers[name]) { mux.servers[name] = def; added++; }
  else {
    // Le chemin du serveur suit le repo courant (repo déplacé = chemin corrigé).
    mux.servers[name].command = def.command;
    mux.servers[name].args = def.args;
  }
}
for (const [name, def] of wanted) {
  if (!mux.servers[name]) { mux.servers[name] = def; added++; }
  else {
    const cur = mux.servers[name];
    cur.env = { ...(def.env || {}), ...(cur.env || {}) }; // l'existant prime
    envMerged++;
  }
}

// 3) Réécriture des configs clientes ------------------------------------------
const report = [];
for (const [cp, { json, key }] of clientData) {
  const srv = json[key] || {};
  const direct = Object.keys(srv).filter((n) => n !== 'mcp-mux' && !(srv[n] && srv[n].disabled));
  const muxable = direct.filter((n) => wanted.has(n) && !mux.servers[n]?.disabled);
  const stale = Object.keys(srv).filter((n) => NEVER_MUX.has(n));
  if (!muxable.length && !stale.length && srv['mcp-mux']) { report.push([cp, 'déjà muxée']); continue; }
  const kept = {};
  for (const n of Object.keys(srv)) if (!muxable.includes(n) && n !== 'mcp-mux' && !NEVER_MUX.has(n)) kept[n] = srv[n];
  const next = { ...json, [key]: { 'mcp-mux': SHIM_ENTRY, ...kept } };
  report.push([cp, `${muxable.length} entrée(s) → mcp-mux${muxable.length ? ' (' + muxable.join(', ') + ')' : ''}${stale.length ? ' ; exclu(s) retiré(s): ' + stale.join(', ') : ''}`, { muxable, stale }]);
  if (!DRY && !VERIFY) { backup(cp); fs.writeFileSync(cp, JSON.stringify(next, null, 2) + '\n'); }
}

if (JSON_OUT) {
  const drift = report
    .filter(([, , info]) => info && (info.muxable.length || info.stale.length))
    .map(([cp, , info]) => ({ client: cp, muxable: info.muxable, stale: info.stale }));
  console.log(JSON.stringify({ added, envMerged, removed, drift }, null, 2));
} else {
  console.log(`mux.json : ${added} serveur(s) ajouté(s), ${envMerged} env fusionnée(s), ${removed} exclu(s) retiré(s)`);
  for (const [cp, what] of report) console.log(`  ${path.basename(path.dirname(cp))}/${path.basename(cp)} : ${what}`);
}
if (!DRY && !VERIFY && (added || removed)) { backup(MUX_CONFIG); fs.writeFileSync(MUX_CONFIG, JSON.stringify(mux, null, 2) + '\n'); }
if (!JSON_OUT) console.log(DRY || VERIFY ? '— simulation, rien écrit —' : 'Terminé. Redémarrer les IDE pour appliquer.');
if (VERIFY && added) process.exit(1);
