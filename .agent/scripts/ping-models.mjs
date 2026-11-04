#!/usr/bin/env node
/**
 * ping-models.mjs — campagne de ping d'inférence réel sur la chaîne providers.
 * Alimente orchestrator.db::model_health (pickModel s'en sert pour éviter les
 * modèles en échec récent et préférer les plus rapides).
 *
 * Usage : node ping-models.mjs [--all] [--supplier nim2] [--timeout 20000]
 *   (défaut)   : ping la LISTE PAR DÉFAUT provisoire (paires gros/petit par supplier)
 *   --all      : ping le catalogue complet des suppliers listés (lent)
 *   --supplier : limite à un supplier
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
// Registre lisible des modèles : .agent/model-registry/<supplier>.md
// (régénéré depuis model_health ; la section "## Notes" de chaque fichier
// est préservée — c'est là qu'on annonce les modèles morts/lents).
const REGISTRY_DIR = join(HERE, '..', 'model-registry');

// DB canonique = hphe-mcp (ex-orchestrator-server Node absorbé). Env prioritaire : HPHE_ORCH_DB.
const INSTALL = process.env.HPHE_INSTALL
  || (process.env.ProgramFiles ? join(process.env.ProgramFiles, 'servers', 'hephaistos2-kit') : null);
const DB = process.env.HPHE_ORCH_DB || process.env.ORCHESTRATOR_DB
  || (INSTALL ? join(INSTALL, 'data', 'orchestrator.db') : null);
if (!DB) {
  console.error('[ping-models] orchestrator.db introuvable : définissez HPHE_ORCH_DB');
  process.exit(2);
}

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const onlySupplier = args.includes('--supplier') ? args[args.indexOf('--supplier') + 1] : null;
const TIMEOUT = args.includes('--timeout') ? +args[args.indexOf('--timeout') + 1] : 20000;

// ---- Endpoints d'inférence par supplier (miroir du probe available_models de hphe-mcp) ----
function endpoint(supplier) {
  switch (supplier) {
    case 'nim': return { url: `${process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'}/chat/completions`, key: process.env.NVIDIA_API_KEY };
    case 'nim2': return { url: `${process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'}/chat/completions`, key: process.env.NVIDIA_API_KEY_2 };
    case 'openrouter':
    case 'openrouter-free': return { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY };
    case 'kilo': return { url: 'https://api.kilo.ai/api/gateway/chat/completions', key: process.env.KILO_API_KEY };
    case 'nous': {
      try {
        const auth = JSON.parse(readFileSync(join(process.env.LOCALAPPDATA || '', 'hermes/auth.json'), 'utf-8'));
        const tok = auth?.providers?.nous?.access_token;
        if (!tok) return { error: 'nous access_token absent' };
        return { url: 'https://inference-api.nousresearch.com/v1/chat/completions', key: tok };
      } catch (e) { return { error: `nous auth: ${e.message}` }; }
    }
    case 'ollama': return { url: 'http://localhost:11434/v1/chat/completions' };
    default: return { error: `supplier inconnu: ${supplier}` };
  }
}

// ---- Liste par défaut provisoire : paires gros/petit DISTINCTES par supplier ----
// NIM1 ≠ NIM2 volontairement ; openrouter = dernier recours (:free uniquement).
const DEFAULT_LIST = [
  { supplier: 'nim2', model: 'nvidia/nemotron-3-super-120b-a12b' },      // gros agents
  { supplier: 'nim2', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' },  // petit agents
  { supplier: 'nim',  model: 'nvidia/nemotron-3-ultra-550b-a55b' },      // gros directs
  { supplier: 'nim',  model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' }, // petit directs
  { supplier: 'nous', model: 'poolside/laguna-s-2.1:free' },             // hermes free
  { supplier: 'nous', model: 'poolside/laguna-xs-2.1:free' },
  { supplier: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  { supplier: 'openrouter', model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free' },
];

// provider_prefs → supplier (pour écrire la colonne provider attendue par pickModel)
const SUPPLIER_TO_PROVIDER = { nim: 'nvidia-nim', nim2: 'nvidia-nim2', openrouter: 'openrouter-free', 'openrouter-free': 'openrouter-free', kilo: 'kilo-free', nous: 'hermes-free', ollama: 'ollama' };

async function ping(supplier, model) {
  const ep = endpoint(supplier);
  if (ep.error) return { supplier, model, available: 0, latency_ms: null, error: ep.error };
  if (!ep.key && supplier !== 'ollama') return { supplier, model, available: 0, latency_ms: null, error: 'clé absente' };
  const started = Date.now();
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ep.key ? { Authorization: `Bearer ${ep.key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      signal: ctl.signal
    });
    clearTimeout(t);
    const ok = r.status >= 200 && r.status < 300;
    return { supplier, model, available: ok ? 1 : 0, latency_ms: Date.now() - started, status: r.status, error: ok ? null : (await r.text()).slice(0, 200) };
  } catch (e) {
    return { supplier, model, available: 0, latency_ms: Date.now() - started, error: e.name === 'AbortError' ? `timeout ${TIMEOUT}ms` : String(e.message || e) };
  }
}

async function catalog(supplier) {
  // --all : récupère le catalogue du supplier (GET /models)
  const ep = endpoint(supplier);
  if (ep.error || !ep.key) return [];
  try {
    const url = ep.url.replace(/\/chat\/completions$/, '/models');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${ep.key}` } });
    const d = await r.json();
    const ids = (d.data || []).map(m => m.id).filter(Boolean);
    if (supplier.startsWith('openrouter')) {
      // ne garder que les :free — dernier recours
      return ids.filter(i => i.endsWith(':free'));
    }
    return ids;
  } catch { return []; }
}

const db = new DatabaseSync(DB);
db.exec(`CREATE TABLE IF NOT EXISTS model_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT, supplier TEXT, provider TEXT, model TEXT,
  available INTEGER, latency_ms INTEGER, checked_at TEXT DEFAULT (datetime('now')))`);
const ins = db.prepare('INSERT INTO model_health(supplier,provider,model,available,latency_ms,checked_at) VALUES(?,?,?,?,?,datetime(\'now\'))');

let jobs = DEFAULT_LIST;
if (ALL) {
  jobs = [];
  const suppliers = onlySupplier ? [onlySupplier] : ['nim', 'nim2', 'openrouter'];
  for (const s of suppliers) {
    const ids = await catalog(s);
    console.log(`${s}: ${ids.length} modèles au catalogue`);
    for (const id of ids) jobs.push({ supplier: s, model: id });
  }
}
if (onlySupplier && !ALL) jobs = jobs.filter(j => j.supplier === onlySupplier);

console.log(`Ping de ${jobs.length} modèle(s)…`);
const results = [];
for (const j of jobs) {
  const r = await ping(j.supplier, j.model);
  ins.run(r.supplier, SUPPLIER_TO_PROVIDER[r.supplier] || r.supplier, r.model, r.available, r.latency_ms);
  results.push(r);
  console.log(`${r.available ? 'OK ' : 'KO  '} ${r.supplier.padEnd(12)} ${r.model.padEnd(48)} ${r.latency_ms ?? '-'}ms${r.error ? '  ' + r.error.slice(0, 80) : ''}`);
}
const okCount = results.filter(r => r.available).length;
console.log(`\n${okCount}/${results.length} disponibles — model_health alimentée.`);
// Liste par défaut = meilleur gros + meilleur petit par supplier
console.log('\n--- LISTE PAR DÉFAUT PROVISOIRE (top par supplier) ---');
const bySupplier = {};
for (const r of results.filter(r => r.available)) (bySupplier[r.supplier] ||= []).push(r);
for (const [s, rs] of Object.entries(bySupplier)) {
  rs.sort((a, b) => a.latency_ms - b.latency_ms);
  for (const r of rs.slice(0, 3)) console.log(`  ${s}: ${r.model} (${r.latency_ms}ms)`);
}

// ---- Registre lisible : .agent/model-registry/<supplier>.md ----
// Une ligne par modèle (état + latence du dernier ping). La section "## Notes"
// de chaque fichier est préservée entre les régénérations.
function writeRegistry() {
  mkdirSync(REGISTRY_DIR, { recursive: true });
  const latest = db.prepare(
    `SELECT supplier, provider, model, available, latency_ms, checked_at
     FROM model_health
     WHERE id IN (SELECT MAX(id) FROM model_health GROUP BY provider, model)`
  ).all();
  const groups = {};
  for (const r of latest) (groups[r.supplier] ||= []).push(r);
  const stamp = new Date().toISOString();
  for (const [supplier, rows] of Object.entries(groups)) {
    rows.sort((a, b) => (b.available - a.available) || ((a.latency_ms ?? 9e9) - (b.latency_ms ?? 9e9)));
    const file = join(REGISTRY_DIR, `${supplier}.md`);
    let notes = '';
    if (existsSync(file)) {
      const prev = readFileSync(file, 'utf-8');
      const i = prev.indexOf('\n## Notes');
      if (i >= 0) notes = prev.slice(i);
    }
    const lines = [
      `# Registre ${supplier} — ${stamp}`,
      '',
      'État = dernier ping réel (model_health). `OK`=répond, `KO`=mort/indispo, `—`=pas de latence mesurée.',
      'Tri : disponibles d\'abord, puis par latence croissante. Annotations humaines/agent en bas, section préservée.',
      '',
      '| État | Modèle | Provider | Latence | Dernier ping |',
      '|---|---|---|---|---|',
      ...rows.map(r => `| ${r.available ? 'OK' : 'KO'} | \`${r.model}\` | ${r.provider} | ${r.latency_ms != null ? r.latency_ms + 'ms' : '—'} | ${r.checked_at || '—'} |`),
    ];
    writeFileSync(file, lines.join('\n') + (notes || '\n\n## Notes\n\n') + '\n');
    console.log(`registre: ${file} (${rows.length} modèles)`);
  }
}
writeRegistry();
