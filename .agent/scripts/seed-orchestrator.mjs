#!/usr/bin/env node
/**
 * seed-orchestrator.mjs — peuple orchestrator.db sur install fraîche / réparation.
 *
 * - agents          : insère les entrées manquantes (par agent_name), ne touche
 *                     jamais celles existantes — les customisations survivent.
 * - provider_prefs  : seedé SEULEMENT si la table est vide — l'ordre/enabled
 *                     restent la vérité du monitor (drag&drop), jamais écrasés.
 *
 * Portabilité : les commandes utilisent %LOCALAPPDATA%, %APPDATA%, %USERPROFILE%
 * (expansion cmd.exe au spawn) — pas de C:\Users\<moi> en dur.
 *
 * Usage :
 *   node seed-orchestrator.mjs [--db <path>]   (défaut: HPHE_ORCH_DB ou
 *      <install>\data\orchestrator.db)
 */
import { DatabaseSync } from 'node:sqlite';

const argv = process.argv.slice(2);
const dbIdx = argv.indexOf('--db');
// Résolution : --db > HPHE_ORCH_DB > ORCHESTRATOR_DB > <install>\data\orchestrator.db
// (<install> = HPHE_INSTALL ou %ProgramFiles%\servers\hephaistos2-kit).
const INSTALL = process.env.HPHE_INSTALL
    || (process.env.ProgramFiles ? process.env.ProgramFiles + '/servers/hephaistos2-kit' : null);
const DB_PATH = dbIdx >= 0
    ? argv[dbIdx + 1]
    : (process.env.HPHE_ORCH_DB || process.env.ORCHESTRATOR_DB
        || (INSTALL && INSTALL + '/data/orchestrator.db'));
if (!DB_PATH) {
    console.error('[seed] orchestrator.db introuvable : passez --db <path> ou définissez HPHE_ORCH_DB');
    process.exit(2);
}

const AGENTS = [
    {
        agent_name: 'agy', agent_type: 'cli', active: 1,
        config: {
            skills: ['code', 'debug', 'review', 'explore', 'docs', 'test', '*'],
            providers: ['antigravity-subscription'],
            command: 'cd /d "{workspace}" && "%LOCALAPPDATA%/agy/bin/agy.exe" --dangerously-skip-permissions --print="{message}" --print-timeout 1800s > .agent\\agy-dispatch.log 2>&1 < NUL',
            full_prompt: true,
            priority: 10,
            notes: 'Antigravity CLI — abonnement, modèles gemini/anthropic via --model. flags AVANT --print. timeout 1800s.'
        }
    },
    {
        agent_name: 'nim1', agent_type: 'cli', active: 1,
        config: {
            command: 'cd /d "{workspace}" && node "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/scripts/nim-worker.mjs" --account 1 --model "{model}" --task-id {task_id} --message "{message}" > "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/nim1-dispatch.log" 2>&1 < NUL',
            transport: 'direct',
            providers: ['nvidia-nim'],
            model_prefs: ['nemotron-3-ultra-550b', 'super-120b'],
            skills: ['code', 'review', 'docs', 'explore', 'test'],
            priority: 20,
            full_prompt: true,
            notes: 'NIM1 = protocole OpenAI DIRECT vers NVIDIA via NVIDIA_API_KEY (compte 1). nim-worker.mjs — aucun CLI intermédiaire. Auto-clôture via --task-id.'
        }
    },
    {
        agent_name: 'nim2', agent_type: 'cli', active: 1,
        config: {
            command: 'cd /d "{workspace}" && node "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/scripts/nim-worker.mjs" --account 2 --model "{model}" --task-id {task_id} --message "{message}" > "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/nim2-dispatch.log" 2>&1 < NUL',
            transport: 'direct',
            providers: ['nvidia-nim2'],
            model_prefs: ['nemotron-3.5-lightning-30b', 'super-120b'],
            skills: ['code', 'review', 'docs', 'explore', 'test'],
            priority: 30,
            full_prompt: true,
            notes: 'NIM2 = protocole OpenAI DIRECT vers NVIDIA via NVIDIA_API_KEY_2 (compte 2). nim-worker.mjs — aucun CLI intermédiaire. Auto-clôture via --task-id.'
        }
    },
    {
        agent_name: 'ollama-cloud', agent_type: 'cli', active: 1,
        config: {
            command: 'cd /d "{workspace}" && "%USERPROFILE%/.local/bin/hermes.exe" --provider ollama-cloud --model "{model}" -z "{message}" --yolo --no-restore-cwd > "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/ollama-cloud-dispatch.log" 2>&1 < NUL',
            full_prompt: true,
            providers: ['ollama-cloud'],
            model_prefs: ['gpt-oss:120b-cloud', 'nemotron-3-ultra:cloud'],
            skills: ['code', 'review', 'docs', 'explore'],
            priority: 40,
            notes: 'Canal dédié Ollama Cloud (forfait payé). Transport = hermes CLI scopé au provider. 1 connexion à la fois (daemon :11434).'
        }
    },
    {
        agent_name: 'devin', agent_type: 'cli', active: 1,
        config: {
            skills: ['*'],
            providers: ['devin-subscription'],
            command: '"%LOCALAPPDATA%/Programs/Devin/bin/devin-desktop.cmd" -p "{message}" --respect-workspace-trust false',
            notes: 'Devin CLI — chemin via %LOCALAPPDATA%.'
        }
    },
    {
        agent_name: 'kilo', agent_type: 'cli', active: 1,
        config: {
            command: 'cd /d "{workspace}" && "%USERPROFILE%/.local/bin/kilo.exe" run -m "{model}" --auto "{message}" > "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/kilo-dispatch.log" 2>&1 < NUL',
            full_prompt: true,
            providers: ['kilo-free', 'openrouter-free'],
            model_prefs: ['free', 'laguna', 'nemotron-3.5-lightning'],
            skills: ['code', 'review', 'docs', 'debug', 'test'],
            priority: 80,
            notes: 'Renfort fin de chaîne : kilo-free puis openrouter-free. Jamais de provider NIM — NIM1/NIM2 sont des workers directs.'
        }
    },
    {
        agent_name: 'hermes', agent_type: 'cli', active: 1,
        config: {
            command: 'cd /d "{workspace}" && "%USERPROFILE%/.local/bin/hermes.exe" --provider {provider_arg} --model "{model}" -z "{message}" --yolo --no-restore-cwd > "%ProgramFiles%/Projet-complet/hephaistos2-kit/.agent/hermes-dispatch.log" 2>&1 < NUL',
            full_prompt: true,
            providers: ['hermes-free', 'openrouter-free'],
            model_prefs: ['free', 'laguna', 'nemotron-3.5-lightning'],
            skills: ['docs', 'explore', 'code', 'review'],
            priority: 90,
            notes: 'Renfort fin de chaîne : hermes-free puis openrouter-free. --provider et --model sont devant -z. Jamais de provider NIM.'
        }
    },
    {
        agent_name: 'vibe', agent_type: 'cli', active: 0,
        config: {
            command: 'cd /d "{workspace}" && "%USERPROFILE%/.local/bin/vibe.exe" -p "{message}" --max-turns 80 --auto-approve > .agent\\vibe-dispatch.log 2>&1 < NUL',
            full_prompt: true,
            providers: ['mistral-vibe'],
            skills: ['code', 'review', 'docs', 'test', 'refactor'],
            model_prefs: ['mistral-medium-3.5'],
            priority: 1,
            env: { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
        }
    }
];

const PROVIDER_PREFS = [
    ['antigravity-subscription', 1, 0],
    ['mistral-vibe', 0, 1],          // désactivé : quota/budget — toggle monitor pour réactiver
    ['nvidia-nim', 1, 2],
    ['nvidia-nim2', 1, 3],
    ['ollama-cloud', 1, 4],
    ['kilo-free', 1, 5],
    ['hermes-free', 1, 6],
    ['openrouter-free', 1, 7],
    ['kilocode', 0, 8],
    ['hermes', 0, 9],
    ['ollama', 0, 10]
];

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");

// Schéma minimal si DB fraîche (hphe-mcp recrée aussi, mais le seed doit être autonome)
db.exec(`CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY, agent_name TEXT NOT NULL, agent_type TEXT NOT NULL,
  config TEXT, active INTEGER DEFAULT 1, capabilities TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS provider_prefs (
  provider TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, position INTEGER)`);
// Colonnes additives post-unification (miroir ensure_schema Rust, idempotent)
const colExists = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some(r => r.name === c);
if (!colExists('agents', 'capabilities')) {
    db.exec('ALTER TABLE agents ADD COLUMN capabilities TEXT');
}
if (!colExists('tasks_todo', 'expected_artifact')) {
    db.exec('ALTER TABLE tasks_todo ADD COLUMN expected_artifact TEXT');
}
if (!colExists('tasks_todo', 'verified_by')) {
    db.exec('ALTER TABLE tasks_todo ADD COLUMN verified_by TEXT');
}
if (!colExists('tasks_todo', 'last_heartbeat')) {
    db.exec('ALTER TABLE tasks_todo ADD COLUMN last_heartbeat TEXT');
}
if (!colExists('provider_prefs', 'disabled_at')) {
    db.exec('ALTER TABLE provider_prefs ADD COLUMN disabled_at TEXT');
}
db.exec(`CREATE TABLE IF NOT EXISTS pairs (
  pair_id TEXT PRIMARY KEY, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
  session TEXT, transport_a TEXT, transport_b TEXT, cascade_a TEXT, cascade_b TEXT,
  model TEXT, established_at TEXT, last_seen TEXT, meta TEXT)`);
// Seed capabilities : workers NIM = pont texte sans outils FS
db.exec(`UPDATE agents SET capabilities='["text_only"]' WHERE agent_name IN ('nim1','nim2') AND capabilities IS NULL`);
db.exec(`UPDATE agents SET capabilities='["fs_read","fs_write","cmd"]' WHERE capabilities IS NULL`);

let insAgents = 0;
const exists = db.prepare('SELECT 1 FROM agents WHERE agent_name=?');
const insA = db.prepare('INSERT INTO agents (agent_name, agent_type, config, active) VALUES (?,?,?,?)');
for (const a of AGENTS) {
    if (!exists.get(a.agent_name)) {
        insA.run(a.agent_name, a.agent_type, JSON.stringify(a.config), a.active);
        insAgents++;
    }
}

let insPrefs = 0;
const prefCount = db.prepare('SELECT COUNT(*) c FROM provider_prefs').get().c;
if (prefCount === 0) {
    const insP = db.prepare('INSERT INTO provider_prefs (provider, enabled, position) VALUES (?,?,?)');
    for (const [p, e, pos] of PROVIDER_PREFS) { insP.run(p, e, pos); insPrefs++; }
}

console.log(JSON.stringify({
    db: DB_PATH,
    agents_inserted: insAgents,
    agents_total: db.prepare('SELECT COUNT(*) c FROM agents').get().c,
    provider_prefs_seeded: insPrefs > 0,
    provider_prefs_total: db.prepare('SELECT COUNT(*) c FROM provider_prefs').get().c
}, null, 1));
