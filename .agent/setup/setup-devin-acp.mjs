#!/usr/bin/env node
// setup-devin-acp.mjs — provisionne les agents ACP dans les settings Devin IDE.
//
// Cible : %APPDATA%\devin\User\settings.json (JSONC toléré : commentaires +
// virgules finales stripped avant parse).
//
// Ce que ce script garantit (merge non-destructif, --force pour écraser) :
//   devin.acp.enabledAgents     — providers du kit activés/désactivés
//   devin.acp.agentEnv          — PATH augmenté des binaires détectés
//   devin.acp.agentPreferences  — entrées créées si absentes (pas de modèle
//                                 par défaut : choisi dans l'UI, lié au compte)
//   devin.acp.preferredAgent    — défini seulement si absent
//   acp/registry.json           — entrées ACP (id → cmd/args) créées si
//                                 absentes, mises à jour en --force.
//                                 ATTENTION : Devin lit le registre via
//                                 getWindsurfConfigDirectory() = Code\User\acp,
//                                 PAS devin\User\acp (miroir kit, docs).
//
// Usage : node setup-devin-acp.mjs [--verify] [--force] [--preferred <id>]
//                                [--settings <path>] [--registry <path>]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { localPath } from '../agent-bridge/local-paths.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const VERIFY = has('--verify');
const FORCE = has('--force');
const SETTINGS = opt('--settings',
  path.join(process.env.APPDATA || '', 'devin', 'User', 'settings.json'));
// Devin Desktop lit le registre local via getWindsurfConfigDirectory() →
// %APPDATA%\Code\User\acp\registry.json. %APPDATA%\devin\User\acp est le
// miroir historique du kit (skills/docs y pointent) — on écrit les deux.
const REGISTRIES = opt('--registry')
  ? [opt('--registry')]
  : [
      path.join(process.env.APPDATA || '', 'Code', 'User', 'acp', 'registry.json'),
      path.join(process.env.APPDATA || '', 'devin', 'User', 'acp', 'registry.json'),
    ];

// Providers reconnus par le kit (miroir de la config de référence).
const KIT_ENABLED = {
  'devin-cli': true, 'devin-cloud': true, 'opencode': true,
  'antigravity-acp': true, 'hermes': true, 'mistral-vibe': true,
  'openrouter': true, 'ollama': true, 'nim': true, 'nim2': true,
  'omniroute': true,
  'kilo': false, 'gemini': false, 'cline': false, 'vtcode': false,
  'codex-acp': false, 'huggingface': false,
};

// Providers qui reçoivent un PATH augmenté (mêmes que la config de référence).
const KIT_ENV_PROVIDERS = [
  'antigravity-acp', 'opencode', 'openrouter', 'ollama',
  'nim', 'nim2', 'kilo', 'mistral-vibe', 'omniroute',
];

// Modes sûrs quand une entrée de prefs est créée ex nihilo (jamais de modèle
// codé : il dépend du compte/abonnement de l'utilisateur).
const KIT_PREF_DEFAULTS = {
  'devin-cli': { mode: 'accept-edits' },
  'hermes': { mode: 'build' },
  'ollama': { mode: 'build' },
  'nim': { mode: 'build' },
  'nim2': { mode: 'build' },
  'antigravity-acp': { mode: 'default' },
};

// Registre ACP canonique du kit — miroir de User/acp/registry.json.
// { name, description, cmd, args?, license? } — version/authors fixes.
// Les entrées inconnues déjà présentes dans le fichier sont conservées.
// Chemins propres à la machine : variables d'environnement d'abord, puis
// .agent/agent-bridge/local-paths.json (gitignoré). Jamais de chemin
// personnel en dur dans le repo.
const LP = (k, envName) => process.env[envName] || localPath(k) || null;
const NODE = LP('nodeExe', 'HEPHAISTOS_NODE') || 'node';
const KIT_ROOT = LP('kitRoot', 'HEPHAISTOS_KIT_ROOT') || '';
const CLI_ANYTHING = LP('cliAnythingRoot', 'CLI_ANYTHING_ROOT') || '';
const SERVERS = LP('serversRoot', 'HEPHAISTOS_SERVERS_ROOT') || '';
const NPM_BIN = process.env.APPDATA ? `${process.env.APPDATA}\\npm` : 'npm';
const LOCAL_BIN = process.env.LOCALAPPDATA || '';
const KIT_REGISTRY = {
  'nim': {
    name: 'NVIDIA NIM',
    description: 'Agent ACP NVIDIA NIM - Canal direct 1 (NVIDIA_API_KEY) via cli-anything-nim. Direct NVIDIA API sans proxy. Priorite 1 : taches courantes/lourdes/importantes, modeles free.',
    cmd: NODE,
    args: [`${KIT_ROOT}\\cli-anything-nim\\bin\\nim-acp.js`, '--account', '1'],
  },
  'nim2': {
    name: 'NVIDIA NIM #2',
    description: 'Agent ACP NVIDIA NIM - Canal direct 2 (NVIDIA_API_KEY_2) via cli-anything-nim. Direct NVIDIA API sans proxy. Priorite 2 : fallback du compte 1.',
    cmd: NODE,
    args: [`${KIT_ROOT}\\cli-anything-nim\\bin\\nim-acp.js`, '--account', '2'],
  },
  'ollama': {
    name: 'Ollama (local + cloud)',
    description: 'Agent ACP Ollama via cli-anything-ollama (127.0.0.1:11434/v1, OpenAI-compatible) - modeles :cloud du compte Ollama accessibles via le daemon local. Priorite 3.',
    cmd: NODE,
    args: [`${KIT_ROOT}\\cli-anything-ollama\\bin\\ollama-acp.js`],
  },
  'hermes': {
    name: 'Hermes',
    description: 'Hermes Agent local (ACP) - priorite 4 : automatismes et taches parallelisees, acces multi-modeles (NIM, OpenRouter :free, Ollama...).',
    license: 'proprietary',
    cmd: `${LOCAL_BIN}\\hermes\\bin\\hermes-acp.exe`,
  },
  'kilo': {
    name: 'KiloCode',
    description: 'Agent ACP KiloCode (kilo acp) - priorite 5 : automatismes et taches parallelisees, acces multi-modeles (NIM, Ollama Cloud, OpenRouter :free).',
    cmd: `${NPM_BIN}\\kilo.cmd`,
    args: ['acp'],
  },
  'openrouter': {
    name: 'OpenRouter',
    description: 'Agent ACP OpenRouter via cli-anything-openrouter (openrouter.ai/api/v1, OPENROUTER_API_KEY) - modeles :free. Priorite 6.',
    cmd: NODE,
    args: [`${KIT_ROOT}\\cli-anything-openrouter\\bin\\openrouter-acp.js`],
  },
  'cerberos': {
    name: 'Cerberos (Herald OS)',
    description: 'Agent ACP Cerberos - pont SSH vers hermes acp sur le laptop Herald OS (alias SSH `herald-slave` dans ~/.ssh/config). Acces distant au chien de garde.',
    license: 'proprietary',
    cmd: NODE,
    args: [LP('cerberosAcpBin', 'CERBEROS_ACP_BIN') || `${CLI_ANYTHING}\\cerberos\\agent-harness\\bin\\cerberos-acp.js`],
  },
  'huggingface': {
    name: 'HuggingFace',
    description: 'Agent ACP HuggingFace via opencode (pas d\'adaptateur natif pour l\'instant - desactive).',
    cmd: `${NPM_BIN}\\opencode.exe`,
    args: ['acp'],
  },
  'cerberos-d2r2': {
    name: 'CerberOS D2R2 (Cerbere)',
    description: 'Agent ACP Cerbere du serveur D2R2 local via SSH + cerbere-agent — NIM2/llama-3.2-11b. Chien de garde tour Debian.',
    cmd: NODE,
    args: [LP('cerberosD2r2Bin', 'CERBEROS_D2R2_BIN') || `${CLI_ANYTHING}/cerberos/agent-harness/bin/d2r2-acp.js`],
  },
  'omniroute': {
    name: 'OmniRoute',
    description: 'Agent ACP OmniRoute - gateway locale multi-providers (localhost:20128, ~440 modeles, auto-fallback) via le harness servers/omni-routeur. Modele fige au spawn (--model), defaut groq/openai/gpt-oss-120b.',
    cmd: NODE,
    args: [`${SERVERS}\\omni-routeur\\index.js`, 'acp'],
  },
};

// Dossiers probables des connecteurs ACP — seuls ceux qui EXISTENT sont
// injectés dans le PATH des agents.
const ENV_DIRS = [
  '%LOCALAPPDATA%\\agy\\bin',
  '%LOCALAPPDATA%\\Programs\\agy-acp',
  '%LOCALAPPDATA%\\hermes\\bin',
  '%LOCALAPPDATA%\\hermes\\node',
  '%USERPROFILE%\\.opencode\\bin',
  '%LOCALAPPDATA%\\Programs\\opencode',
  '%LOCALAPPDATA%\\Programs\\vibe',
  '%USERPROFILE%\\.grok\\bin',
  '%LOCALAPPDATA%\\FreeToken\\bin',
].map((p) => p.replace(/%(\w+)%/g, (_, v) => process.env[v] || ''))
  .filter((p) => p && !p.includes('%'));

// Binaires à détecter pour la table --verify (sonde PATH + ENV_DIRS).
const BINARIES = {
  'opencode': 'opencode.exe',
  'antigravity-acp': 'agy_acp_server.exe',
  'hermes': 'hermes.exe',
  'kilo': 'kilo.exe',
  'mistral-vibe': 'vibe-acp.exe',
};

// --- JSONC → JSON -------------------------------------------------------------
function stripJsonc(src) {
  let out = '';
  let i = 0, inStr = false, q = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += src[++i] ?? ''; }
      else if (c === q) inStr = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  // trailing commas
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function findBinary(name) {
  try {
    const out = execFileSync('where.exe', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean);
    if (out.length) return out[0];
  } catch { /* not on PATH */ }
  for (const d of ENV_DIRS) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function augmentPath() {
  const found = ENV_DIRS.filter((d) => fs.existsSync(d));
  return [...found, process.env.PATH || ''].join(';');
}

// --- main ---------------------------------------------------------------------
if (!fs.existsSync(SETTINGS)) {
  console.error(`[FAIL] settings.json introuvable : ${SETTINGS}`);
  console.error('       (Devin Desktop doit avoir été lancé au moins une fois)');
  process.exit(1);
}

const raw = fs.readFileSync(SETTINGS, 'utf8');
let settings;
try {
  settings = JSON.parse(stripJsonc(raw));
} catch (e) {
  console.error(`[FAIL] settings.json non parsable (${e.message}) — corrige-le à la main, je n'écris rien.`);
  process.exit(1);
}

const enabled = settings['devin.acp.enabledAgents'] || {};
const env = settings['devin.acp.agentEnv'] || {};
const prefs = settings['devin.acp.agentPreferences'] || {};
const preferred = settings['devin.acp.preferredAgent'];

const rows = [];
const newPath = augmentPath();
let changed = 0;

for (const [provider, want] of Object.entries(KIT_ENABLED)) {
  const cur = enabled[provider];
  const binary = BINARIES[provider] ? findBinary(BINARIES[provider]) : null;
  const status = cur === want ? 'OK' : 'DIFF';
  rows.push({ provider, want, cur: cur === undefined ? '(absent)' : cur, binary: binary || '—', status });
  if (status === 'DIFF' && (FORCE || cur === undefined || want === true)) {
    enabled[provider] = want; changed++;
  } else if (FORCE && cur !== want) {
    enabled[provider] = want; changed++;
  }
}

// agentEnv : PATH augmenté pour les providers kit (créé si absent ; PATH
// réécrit seulement en --force ou si absent).
for (const p of KIT_ENV_PROVIDERS) {
  if (!env[p] || FORCE) { env[p] = { PATH: newPath }; changed++; }
  else if (!env[p].PATH) { env[p].PATH = newPath; changed++; }
}

// agentPreferences : crée les entrées manquantes, n'écrase jamais un modèle.
for (const [p, def] of Object.entries(KIT_PREF_DEFAULTS)) {
  if (!prefs[p]) { prefs[p] = def; changed++; }
  else { for (const [k, v] of Object.entries(def)) if (prefs[p][k] === undefined) { prefs[p][k] = v; changed++; } }
}

// --- registry.json ------------------------------------------------------------
// Merge non-destructif : entrées absentes ajoutées, divergences seulement en
// --force, entrées inconnues (hors kit) conservées.
function toRegistryEntry(id, def) {
  const bin = { archive: '', cmd: def.cmd };
  if (def.args) bin.args = def.args;
  return {
    id,
    name: def.name,
    version: '1.0.0',
    description: def.description,
    authors: ['local'],
    license: def.license || 'MIT',
    distribution: { binary: { 'windows-x86_64': bin } },
  };
}

const regRows = [];
const regWrites = [];
for (const regPath of REGISTRIES) {
  const scope = regPath.split(path.sep).slice(-4, -3)[0] || regPath;
  let registry = null;
  if (fs.existsSync(regPath)) {
    try {
      registry = JSON.parse(stripJsonc(fs.readFileSync(regPath, 'utf8')));
    } catch (e) {
      console.error(`[WARN] ${regPath} non parsable (${e.message}) — ignoré.`);
    }
  } else {
    registry = { version: '1.0.0', agents: [] };
  }
  if (!registry || !Array.isArray(registry.agents)) continue;
  const byId = new Map(registry.agents.map((a) => [a.id, a]));
  let dirty = false;
  for (const [id, def] of Object.entries(KIT_REGISTRY)) {
    const want = toRegistryEntry(id, def);
    const cur = byId.get(id);
    if (!cur) {
      registry.agents.push(want); dirty = true;
      regRows.push({ id, scope, status: 'AJOUT' });
    } else if (JSON.stringify(cur) !== JSON.stringify(want)) {
      if (FORCE) { registry.agents[registry.agents.indexOf(cur)] = want; dirty = true; }
      regRows.push({ id, scope, status: FORCE ? 'MAJ' : 'DIFF (--force pour écraser)' });
    } else {
      regRows.push({ id, scope, status: 'OK' });
    }
  }
  if (dirty) regWrites.push({ path: regPath, registry });
}

let prefAction = 'conservé';
if (!preferred) {
  const want = opt('--preferred') || (enabled['opencode'] && findBinary(BINARIES['opencode']) ? 'opencode' : 'devin-cli');
  settings['devin.acp.preferredAgent'] = want; prefAction = `défini → ${want}`; changed++;
}

console.log('\n=== devin.acp.enabledAgents ===');
for (const r of rows) {
  const tag = r.status === 'OK' ? '[OK]  ' : '[DIFF]';
  console.log(`${tag} ${r.provider.padEnd(16)} activé=${String(r.cur).padEnd(8)} attendu=${r.want}  binaire=${r.binary}`);
}
console.log(`preferredAgent : ${preferred ?? '(absent)'} (${prefAction})`);
console.log(`env providers  : ${KIT_ENV_PROVIDERS.filter((p) => env[p]).length}/${KIT_ENV_PROVIDERS.length} couverts`);
if (regRows.length) {
  console.log('\n=== acp/registry.json (Code + devin) ===');
  for (const r of regRows) console.log(`[${r.status.padEnd(26)}] ${r.id} (${r.scope})`);
  console.log(`kit couvert : ${regRows.filter((r) => r.status === 'OK').length}/${regRows.length} conformes`);
}

if (VERIFY) {
  const bad = rows.filter((r) => r.status === 'DIFF').length
    + regRows.filter((r) => r.status !== 'OK').length;
  console.log(bad === 0 ? '\n[VERIFY] conforme' : `\n[VERIFY] ${bad} provider(s) non conforme(s) — relance sans --verify`);
  process.exit(bad === 0 ? 0 : 1);
}

if (!changed && !regWrites.length) { console.log('\nRien à écrire — déjà conforme.'); process.exit(0); }

if (changed) {
  settings['devin.acp.enabledAgents'] = enabled;
  settings['devin.acp.agentEnv'] = env;
  settings['devin.acp.agentPreferences'] = prefs;
  const bak = `${SETTINGS}.bak-acp-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(SETTINGS, bak);
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log(`\nÉcrit ${SETTINGS} (${changed} changement(s)), backup → ${path.basename(bak)}`);
}
if (regWrites.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const w of regWrites) {
    fs.mkdirSync(path.dirname(w.path), { recursive: true });
    if (fs.existsSync(w.path)) fs.copyFileSync(w.path, `${w.path}.bak-acp-${stamp}`);
    fs.writeFileSync(w.path, JSON.stringify(w.registry, null, 1) + '\n');
    console.log(`Écrit ${w.path}, backup → .bak-acp-${stamp}`);
  }
}
console.log('Restart complet de Devin requis (le registry ACP est lu au démarrage du process maître, pas au Reload Window).');
