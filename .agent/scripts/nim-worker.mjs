#!/usr/bin/env node
/**
 * nim-worker.mjs — worker NIM à protocole DIRECT (pas de CLI intermédiaire).
 * POST OpenAI-compatible vers integrate.api.nvidia.com avec la clé du compte.
 *
 * Usage: node nim-worker.mjs --account <1|2> --model <id> --message "<msg>"
 *          [--task-id <n>]
 *   --account 1 → NVIDIA_API_KEY (NIM1)   --account 2 → NVIDIA_API_KEY_2 (NIM2)
 *
 * Le message peut contenir un chemin de livrable `.agent/xxx.ext` : la réponse
 * du modèle y est écrite (convention orchestrateur — livrable = fichier).
 * Sinon la réponse est imprimée sur stdout (→ log de dispatch).
 * --task-id : clôture la tâche dans orchestrator.db (status completed/failed)
 * — le worker est de l'infra, pas un agent tiers ; seuls devin/agy dispatch.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, isAbsolute, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Résolution DB : env explicite > HPHE_INSTALL > install standard (%ProgramFiles%\servers) >
// profil user. Aucun chemin machine en dur : sans candidat existant, on abort.
const DB_CANDIDATES = [
  process.env.HPHE_ORCH_DB,
  process.env.ORCHESTRATOR_DB,
  process.env.HPHE_INSTALL && join(process.env.HPHE_INSTALL, 'data', 'orchestrator.db'),
  process.env.ProgramFiles && join(process.env.ProgramFiles, 'servers', 'hephaistos2-kit', 'data', 'orchestrator.db'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, 'hephaistos2-kit', 'data', 'orchestrator.db'),
].filter(Boolean);
const DB = DB_CANDIDATES.find((p) => existsSync(p));
if (!DB) {
  console.error('[nim-worker] orchestrator.db introuvable : définissez HPHE_ORCH_DB ou HPHE_INSTALL');
  process.exit(2);
}

// Tâche orchestrateur (si --task-id) : description + expected_artifact lus en
// DB — le prompt ne suffit pas toujours à transporter le contrat complet.
function readTask(taskId) {
  if (!taskId) return null;
  try {
    const db = new DatabaseSync(DB);
    const row = db.prepare("SELECT title, description, expected_artifact, created_at, workspace FROM tasks_todo WHERE id=?").get(+taskId);
    db.close();
    return row || null;
  } catch { return null; }
}

// Gate anti-livrable-factice (audit F3/C1) : completed n'est autorisé que si
// l'artifact attendu existe, est un FICHIER REGULIER NON VIDE, reste sous la
// racine de la tâche (workspace DB sinon cwd du worker) et a été produit
// après le dispatch (mtime > created_at). Tout le reste => failed.
function gateArtifact(taskId, writtenPath) {
  if (!taskId) return { ok: true };
  let row = null;
  try {
    const db = new DatabaseSync(DB);
    row = db.prepare("SELECT expected_artifact, created_at, workspace FROM tasks_todo WHERE id=?").get(+taskId);
    db.close();
  } catch { /* best-effort */ }
  const artifact = (row?.expected_artifact && String(row.expected_artifact).trim()) || writtenPath;
  if (!artifact) return { ok: true };
  const root = (row?.workspace && String(row.workspace).trim()) || process.cwd();
  let rootReal;
  try { rootReal = realpathSync(root); } catch { rootReal = resolve(root); }
  const p = isAbsolute(artifact) ? artifact : join(rootReal, artifact);
  try {
    const st = statSync(p);
    if (!st.isFile()) return { ok: false, err: `artifact n'est pas un fichier regulier: ${p}` };
    if (st.size === 0) return { ok: false, err: `artifact vide: ${p}` };
    const pReal = realpathSync(p);
    const rel = relative(rootReal, pReal);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { ok: false, err: `artifact hors workspace (path traversal refuse): ${pReal}` };
    }
    if (row?.created_at) {
      const createdMs = Date.parse(String(row.created_at).replace(' ', 'T') + 'Z');
      if (!isNaN(createdMs) && st.mtimeMs <= createdMs) {
        return { ok: false, err: `artifact anterieur au dispatch (mtime <= created_at): ${p}` };
      }
    }
    return { ok: true, path: pReal };
  } catch (e) {
    return { ok: false, err: `artifact absent ou illisible: ${p} (${e.message})` };
  }
}

function closeTask(taskId, status, result) {
  if (!taskId) return;
  try {
    const db = new DatabaseSync(DB);
    db.prepare("UPDATE tasks_todo SET status=?, result=? WHERE id=?").run(status, String(result).slice(0, 4000), +taskId);
    db.prepare("INSERT INTO task_events(task_id,event,detail,ts) VALUES(?,?,?,datetime('now'))")
      .run(String(taskId), status === 'completed' ? 'completed' : 'failed', `nim-worker: ${String(result).slice(0, 500)}`);
    db.close();
  } catch (e) { console.error(`[nim-worker] closeTask ${taskId}: ${e.message}`); }
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
};

const account = arg('--account') === '1' ? '1' : '2';
const model = arg('--model') || 'nvidia/nemotron-3.5-lightning-30b-a3b';
const rawMessage = arg('--message') || process.argv[process.argv.length - 1];
const taskId = arg('--task-id');
// file:<path> n'importe où dans le message : le fichier est lu et son contenu
// concaténé au prompt (la limite argv ~8K de cmd interdit les gros corpus).
let message = rawMessage;
const fileMatch = /file:([\w.\/\\:-]+\.(?:txt|md|json))/i.exec(rawMessage || '');
if (fileMatch) {
  const src = fileMatch[1].trim();
  // Audit F3 : la source est bornee au cwd du worker (workspace) — pas de
  // lecture arbitraire via `file:` hors projet.
  const rootReal = realpathSync(process.cwd());
  const srcReal = realpathSync(src);
  const rel = relative(rootReal, srcReal);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    console.error(`[nim-worker] file: hors workspace refuse: ${srcReal}`);
    process.exit(1);
  }
  if (!existsSync(srcReal)) { console.error(`[nim-worker] prompt introuvable: ${src}`); process.exit(1); }
  message = `${rawMessage}\n\n${readFileSync(srcReal, 'utf8')}`;
}
// --expect <regex> : le livrable doit matcher (flag i) sinon tâche 'failed'
// avec le contenu réel en diagnostic — jamais de faux positif.
const expectRe = arg('--expect') ? new RegExp(arg('--expect'), 'i') : null;
const key = process.env[account === '1' ? 'NVIDIA_API_KEY' : 'NVIDIA_API_KEY_2'];
const base = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');

if (!key) { console.error(`NVIDIA_API_KEY${account === '1' ? '' : '_2'} absente`); process.exit(1); }
if (!message || message.startsWith('--')) { console.error('message requis'); process.exit(1); }

// Contexte DB d'abord : expected_artifact est le contrat de livrable,
// pas une mention .agent/ dans le prompt (les chemins absolus du vault
// n'étaient jamais écrits — la tâche restait sans fichier).
const taskRow = readTask(taskId);
const msgForDeliverable = fileMatch ? rawMessage.replace(fileMatch[0], '') : rawMessage;
const m = msgForDeliverable.match(/\.agent[\\/][\w.\\/\\-]+\.(?:md|txt|json|js|ts|rs|py|yaml|yml)/i);
const fromMessage = m ? m[0].replace(/\\/g, '/') : null;
const fromTask = taskRow?.expected_artifact ? String(taskRow.expected_artifact).trim() : '';
const deliverable = fromMessage || fromTask || null;
if (taskRow) {
  message += `\n\n## TACHE ORCHESTRATEUR #${taskId}\nTITRE: ${taskRow.title || ''}\nDESCRIPTION:\n${taskRow.description || ''}\nEXPECTED_ARTIFACT: ${taskRow.expected_artifact || deliverable || '(aucun)'}`;
}

// Anti-simulation : le modèle est texte-seul, il ne doit jamais prétendre
// exécuter des appels MCP/outils ni avoir lu/écrit des fichiers.
const SYSTEM = `Tu es un worker texte-seul de l'orchestrateur Hephaistos. REGLES ABSOLUES :
- Tu n'as AUCUN outil : pas de fichiers, pas de shell, pas de MCP.
- INTERDIT de simuler des appels JSON-RPC/MCP (get_next_task, update_task...) — toute trace de simulation invalide le livrable.
- INTERDIT d'affirmer avoir lu ou écrit un fichier — le worker hôte écrit ton texte vers le livrable si nécessaire.
- Produis UNIQUEMENT le contenu demandé par la tâche (code, spec, analyse).`;

const started = Date.now();
try {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 300_000);
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: message }],
      max_tokens: 8192,
      temperature: 0.2,
      stream: false,
    }),
    signal: ctl.signal,
  });
  clearTimeout(t);
  if (!r.ok) {
    const body = (await r.text()).slice(0, 500);
    console.error(`NIM${account} HTTP ${r.status}: ${body}`);
    closeTask(taskId, 'failed', `HTTP ${r.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  const d = await r.json();
  const msg = d?.choices?.[0]?.message ?? {};
  // Modèles à raisonnement (nemotron-*-a3b…) : la réponse peut atterrir dans
  // reasoning_content quand content est vide (raisonnement a tout mangé).
  const content = (msg.content ?? '').trim() || (msg.reasoning_content ?? '').trim();
  const finish = d?.choices?.[0]?.finish_reason ?? '';
  if (!content && finish === 'length') {
    console.error('[nim-worker] réponse vide — max_tokens mangé par le raisonnement');
  }
  const ms = Date.now() - started;
  console.log(`[nim-worker] nim${account} ${model} — ${ms}ms`);
  if (deliverable) {
    const path = isAbsolute(deliverable) ? deliverable : join(process.cwd(), deliverable);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content.trim() + '\n');
    console.log(`[nim-worker] livrable écrit: ${path} (${content.trim().length} chars)`);
    if (expectRe && !expectRe.test(content.trim())) {
      closeTask(taskId, 'failed', `format invalide (attendu /${expectRe.source}/i) — sortie: ${content.trim().slice(0, 300)}`);
      process.exit(2);
    }
    const gate = gateArtifact(taskId, deliverable);
    if (!gate.ok) {
      closeTask(taskId, 'failed', `expected_artifact non satisfait: ${gate.err}`);
      process.exit(2);
    }
    closeTask(taskId, 'completed', `livrable ${deliverable} (${content.length} chars, ${ms}ms, ${model})`);
  } else {
    console.log(content);
    if (expectRe && !expectRe.test(content.trim())) {
      closeTask(taskId, 'failed', `format invalide (attendu /${expectRe.source}/i) — sortie: ${content.trim().slice(0, 300)}`);
      process.exit(2);
    }
    const gate = gateArtifact(taskId, null);
    if (!gate.ok) {
      closeTask(taskId, 'failed', `expected_artifact non satisfait: ${gate.err}`);
      process.exit(2);
    }
    closeTask(taskId, 'completed', `réponse ${content.length} chars (${ms}ms, ${model})`);
  }
} catch (e) {
  const why = e.name === 'AbortError' ? 'timeout 300s' : e.message;
  console.error(`[nim-worker] ${why}`);
  closeTask(taskId, 'failed', why);
  process.exit(1);
}
