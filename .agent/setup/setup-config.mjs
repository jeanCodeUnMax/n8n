#!/usr/bin/env node
// Hephaistos — injection de la configuration de référence (2026-10-07).
// Idempotent : ré-exécutable sans casse. Backup .bak-<ts> avant chaque écriture.
// Usage : node .agent/setup/setup-config.mjs [--db <chemin-orchestrator.db>]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');                    // racine Hephaistos2-Kit
const HOME = homedir();
const argv = process.argv.slice(2);
const dbArg = argv.indexOf('--db');
// DB canonique = hphe-mcp (ex-orchestrator-server Node absorbé). Env prioritaire : HPHE_ORCH_DB.
const INSTALL = process.env.HPHE_INSTALL
  || (process.env.ProgramFiles ? join(process.env.ProgramFiles, 'servers', 'hephaistos2-kit') : null);
const DB = dbArg > -1 ? argv[dbArg + 1]
  : process.env.HPHE_ORCH_DB || process.env.ORCHESTRATOR_DB
    || (INSTALL ? join(INSTALL, 'data', 'orchestrator.db') : null);
if (!DB) { console.error('[setup-config] orchestrator.db introuvable : --db <path> ou HPHE_ORCH_DB requis'); process.exit(2); }

let ok = 0, warn = 0, fail = 0;
const pass = (m) => { ok++; console.log('  [OK]   ' + m); };
const wrn  = (m) => { warn++; console.log('  [WARN] ' + m); };
const bad  = (m) => { fail++; console.log('  [FAIL] ' + m); };
const backup = (p) => { const b = p + '.bak-' + Date.now(); copyFileSync(p, b); return b; };

console.log('=== [1/5] Variables d\'environnement ===');
for (const v of ['NVIDIA_API_KEY', 'NVIDIA_API_KEY_2', 'GEMINI_API_KEY']) {
  process.env[v] ? pass(v + ' présente')
    : wrn(v + ' ABSENTE — setx ' + v + ' "<clé>" dans un terminal, puis rouvrir les terminaux');
}

console.log('=== [2/5] Gemini CLI (~/.gemini/settings.json) ===');
try {
  const p = join(HOME, '.gemini', 'settings.json');
  if (!existsSync(p)) wrn('settings.json absent — le CLI créera le fichier au 1er run');
  else {
    const s = JSON.parse(readFileSync(p, 'utf8'));
    s.security = s.security || {}; s.security.auth = s.security.auth || {};
    s.telemetry = s.telemetry || {};
    const cur = s.security.auth.selectedType;
    if (cur === 'gemini-api-key' && s.telemetry.enabled === false) pass('déjà conforme (api-key + telemetry off)');
    else {
      const b = backup(p);
      s.security.auth.selectedType = 'gemini-api-key';   // oauth-personal → IneligibleTierError
      s.telemetry.enabled = false;                        // collector local absent = ~80 s de retry
      writeFileSync(p, JSON.stringify(s, null, 2));
      pass('selectedType=gemini-api-key, telemetry=false (backup: ' + b + ')');
    }
  }
} catch (e) { bad('settings.json : ' + e.message); }

console.log('=== [3/5] Hermes (%LOCALAPPDATA%/hermes/config.yaml) ===');
try {
  const p = join(process.env.LOCALAPPDATA || join(HOME, 'AppData', 'Local'), 'hermes', 'config.yaml');
  if (!existsSync(p)) wrn('config.yaml absent — hermes non installé ?');
  else {
    let y = readFileSync(p, 'utf8');
    if (/api_key_env:\s*NVIDIA_API_KEY_2/.test(y)) pass('déjà sur NIM2');
    else {
      backup(p);
      y = y.replace(/api_key_env:\s*\S+/g, 'api_key_env: NVIDIA_API_KEY_2');
      if (!/api_key_env:/.test(y)) y = 'api_key_env: NVIDIA_API_KEY_2\n' + y;
      writeFileSync(p, y);
      pass('api_key_env=NVIDIA_API_KEY_2 (backup .bak-*)');
    }
    /base_url:\s*https:\/\/integrate\.api\.nvidia\.com/.test(y) ? pass('base_url NIM OK')
      : wrn('base_url à vérifier : attendu https://integrate.api.nvidia.com/v1');
  }
} catch (e) { bad('config.yaml : ' + e.message); }

console.log('=== [4/5] orchestrator.db — agents + provider_prefs ===');
try {
  const db = new DatabaseSync(DB);
  // Roster actif (REGISTRY.md, 2026-10-14) : agy (défaut), kilo-nim1, ollama-cloud, devin.
  // Les entrées legacy kilo/kilo-free/hermes restent en DB mais désactivées — ne pas les réinjecter.
  // Chemins CLI résolus par variables d'environnement cmd.exe au spawn —
  // aucun C:\Users\<moi> en dur, s'adapte au profil de chaque utilisateur.
  const AGENTS = {
    'kilo-nim1': { providers: ['nvidia-nim2'],
      command: 'cd /d "{workspace}" && "%APPDATA%/npm/kilo.cmd" run -m "nvidia2/{model}" --auto "{message}" > .agent\\kilo-nim1-dispatch.log 2>&1 < NUL' },
    'ollama-cloud': { providers: ['ollama-cloud'],
      command: 'cd /d "{workspace}" && "%USERPROFILE%/.local/bin/hermes.exe" -z "{message}" -m "{model}" --provider ollama-cloud --yolo --no-restore-cwd > .agent\\ollama-cloud-dispatch.log 2>&1 < NUL' },
    agy:         { providers: ['antigravity-subscription'],
      command: '"%LOCALAPPDATA%/agy/bin/agy.exe" --dangerously-skip-permissions --print="{message}" --print-timeout 600s' },
    devin:       { providers: ['devin-subscription'],
      command: 'devin -p "{message}" --respect-workspace-trust false' },
  };
  const sel = db.prepare('SELECT id, config FROM agents WHERE agent_name=?');
  const upd = db.prepare('UPDATE agents SET config=? WHERE id=?');
  for (const [name, want] of Object.entries(AGENTS)) {
    const row = sel.get(name);
    if (!row) { wrn('agent "' + name + '" absent de la DB — créer via l\'orchestrateur'); continue; }
    const cfg = JSON.parse(row.config);
    const changed = cfg.command !== want.command || JSON.stringify(cfg.providers) !== JSON.stringify(want.providers);
    if (!changed) { pass(name + ' : déjà conforme'); continue; }
    cfg.command = want.command; cfg.providers = want.providers;
    upd.run(JSON.stringify(cfg), row.id);
    pass(name + ' : command/providers injectés (' + want.providers[0] + ')');
  }
  const PREFS = [
    ['nvidia-nim', 1, 0], ['nvidia-nim2', 1, 1], ['ollama-cloud', 0, 2], ['ollama', 0, 3],
    ['antigravity-subscription', 1, 4], ['hermes', 1, 5], ['kilocode', 1, 6], ['openrouter-free', 0, 7],
  ];
  const up = db.prepare('INSERT INTO provider_prefs(provider,enabled,position) VALUES(?,?,?) ' +
    'ON CONFLICT(provider) DO UPDATE SET enabled=excluded.enabled, position=excluded.position');
  try { PREFS.forEach(r => up.run(...r)); pass('provider_prefs injectées (ordre chaîne monitor)'); }
  catch { db.prepare('DELETE FROM provider_prefs').run();
    PREFS.forEach(r => db.prepare('INSERT INTO provider_prefs VALUES(?,?,?)').run(...r));
    pass('provider_prefs réécrites'); }
  db.close();
} catch (e) { bad('DB : ' + e.message + ' (vérifier HPHE_ORCH_DB — node:sqlite natif, pas de dépendance externe)'); }

console.log('=== [5/5] Hooks git ===');
const hooks = ['pre-commit', 'pre-push'].map(h => join(ROOT, '.githooks', h));
hooks.every(h => existsSync(h) && readFileSync(h, 'utf8').length > 50)
  ? pass('.githooks/pre-commit + pre-push présents')
  : wrn('hooks vides/absents — git config core.hooksPath .githooks + contenu depuis le repo');

console.log(`\nRÉSULTAT : ${ok} OK, ${warn} avertissement(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
