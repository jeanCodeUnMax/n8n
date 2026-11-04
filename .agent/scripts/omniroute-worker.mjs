#!/usr/bin/env node
/**
 * omniroute-worker.mjs — worker OmniRoute à protocole DIRECT (pas de CLI intermédiaire).
 * POST OpenAI-compatible vers la gateway locale OmniRoute (http://localhost:20128/v1)
 * qui route vers ses 14 connexions providers (groq, gemini, nvidia, openrouter…).
 *
 * Usage: node omniroute-worker.mjs --model <id> --message "<msg>" [--task-id <n>]
 *   --model : id OmniRoute (ex: groq/openai/gpt-oss-120b, auto/best-fast).
 *   Auth : OMNIROUTE_API_KEY optionnelle — le plane /v1 est ouvert en local par défaut.
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

const DB_CANDIDATES = [
  process.env.HPHE_ORCH_DB,
  process.env.ORCHESTRATOR_DB,
  process.env.HPHE_INSTALL && join(process.env.HPHE_INSTALL, 'data', 'orchestrator.db'),
  process.env.ProgramFiles && join(process.env.ProgramFiles, 'servers', 'hephaistos2-kit', 'data', 'orchestrator.db'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, 'hephaistos2-kit', 'data', 'orchestrator.db'),
].filter(Boolean);
const DB = DB_CANDIDATES.find((p) => existsSync(p));
// La DB n'est requise que pour --task-id (clôture orchestrateur). Sur les hôtes
// déportés (laptop herald via MCP-over-SSH) le worker tourne standalone.
if (!DB && process.argv.includes('--task-id')) {
  console.error('[omni-worker] orchestrator.db introuvable : définissez HPHE_ORCH_DB ou HPHE_INSTALL');
  process.exit(2);
}

function readTask(taskId) {
  if (!taskId) return null;
  try {
    const db = new DatabaseSync(DB);
    const row = db.prepare("SELECT title, description, expected_artifact, created_at, workspace FROM tasks_todo WHERE id=?").get(+taskId);
    db.close();
    return row || null;
  } catch { return null; }
}

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
      .run(String(taskId), status === 'completed' ? 'completed' : 'failed', `omni-worker: ${String(result).slice(0, 500)}`);
    db.close();
  } catch (e) { console.error(`[omni-worker] closeTask ${taskId}: ${e.message}`); }
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
};

const model = arg('--model') || 'auto/best-fast';
const rawMessage = arg('--message') || process.argv[process.argv.length - 1];
const taskId = arg('--task-id');
let message = rawMessage;
const fileMatch = /file:([\w.\/\\:-]+\.(?:txt|md|json))/i.exec(rawMessage || '');
if (fileMatch) {
  const src = fileMatch[1].trim();
  const rootReal = realpathSync(process.cwd());
  const srcReal = realpathSync(src);
  const rel = relative(rootReal, srcReal);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    console.error(`[omni-worker] file: hors workspace refuse: ${srcReal}`);
    process.exit(1);
  }
  if (!existsSync(srcReal)) { console.error(`[omni-worker] prompt introuvable: ${src}`); process.exit(1); }
  message = `${rawMessage}\n\n${readFileSync(srcReal, 'utf8')}`;
}
const expectRe = arg('--expect') ? new RegExp(arg('--expect'), 'i') : null;
const key = process.env.OMNIROUTE_API_KEY || '';
const base = (process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128/v1').replace(/\/$/, '');

if (!message || message.startsWith('--')) { console.error('message requis'); process.exit(1); }

const taskRow = readTask(taskId);
const msgForDeliverable = fileMatch ? rawMessage.replace(fileMatch[0], '') : rawMessage;
const m = msgForDeliverable.match(/\.agent[\\/][\w.\\/\\-]+\.(?:md|txt|json|js|ts|rs|py|yaml|yml)/i);
const fromMessage = m ? m[0].replace(/\\/g, '/') : null;
const fromTask = taskRow?.expected_artifact ? String(taskRow.expected_artifact).trim() : '';
const deliverable = fromTask || fromMessage || null;
if (taskRow) {
  message += `\n\n## TACHE ORCHESTRATEUR #${taskId}\nTITRE: ${taskRow.title || ''}\nDESCRIPTION:\n${taskRow.description || ''}\nEXPECTED_ARTIFACT: ${taskRow.expected_artifact || deliverable || '(aucun)'}`;
}

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
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
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
    console.error(`OMNIROUTE HTTP ${r.status}: ${body}`);
    closeTask(taskId, 'failed', `HTTP ${r.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  const d = await r.json();
  const msg = d?.choices?.[0]?.message ?? {};
  const content = (msg.content ?? '').trim() || (msg.reasoning_content ?? '').trim();
  const finish = d?.choices?.[0]?.finish_reason ?? '';
  if (!content && finish === 'length') {
    console.error('[omni-worker] réponse vide — max_tokens mangé par le raisonnement');
  }
  const ms = Date.now() - started;
  console.log(`[omni-worker] ${model} — ${ms}ms`);
  if (deliverable) {
    const path = isAbsolute(deliverable) ? deliverable : join(process.cwd(), deliverable);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content.trim() + '\n');
    console.log(`[omni-worker] livrable écrit: ${path} (${content.trim().length} chars)`);
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
  console.error(`[omni-worker] ${why}`);
  closeTask(taskId, 'failed', why);
  process.exit(1);
}
