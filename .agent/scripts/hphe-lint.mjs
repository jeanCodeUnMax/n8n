#!/usr/bin/env node
/* hphe-lint — vérificateur déterministe de santé des notes (zéro LLM).
 * Inspiré de brain.py (pattern Karpathy) adapté au vault/knowledge hephaistos.
 *
 * Usage :
 *   node hphe-lint.mjs status  [root]          → NEW/CHANGED/DELETED vs manifest
 *   node hphe-lint.mjs done    <src> <notes…>  → enregistre src→notes au manifest
 *   node hphe-lint.mjs lint    [root]          → audit déterministe (exit 2 si soucis)
 *   node hphe-lint.mjs index   [root]          → régénère _INDEX.md
 *
 * Conventions vérifiées (défaut : notes = *.md sous <root>/wiki puis <root>) :
 *   - frontmatter : title, sources, updated présents
 *   - chaque source listée dans `sources:` existe (chemin relatif au root)
 *   - chaque [[lien]] résout vers une note existante (par stem)
 *   - pas d'orphelin (aucun lien entrant), pas de TODO restant
 *   - quote-check : toute ligne  > "…" — <src>  existe MOT POUR MOT dans <src>
 *     (séparateur -, – ou — ; src = chemin relatif au root)
 *   - source modifiée après `done` → notes dérivées marquées "stale"
 *
 * Manifest : <root>/.hphe-lint/manifest.json  (sha256, sources→notes).
 * Config optionnelle <root>/.hphe-lint/config.json : {"sourcesDir":"raw","notesDir":"wiki"}
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const arg = process.argv.slice(2);
const cmd = arg[0] || '';
const root = path.resolve(arg.find(a => !a.startsWith('<') && (a === arg[1])) || process.cwd());
const cfgFile = path.join(root, '.hphe-lint', 'config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const SOURCES = path.join(root, cfg.sourcesDir || 'raw');
const NOTES = path.join(root, cfg.notesDir || 'wiki');
const MANIFEST = path.join(root, '.hphe-lint', 'manifest.json');

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
const load = () => fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const rel = p => path.relative(root, p).replace(/\\/g, '/');
const rglob = (dir, filter) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(d => d.isFile() && filter(d.name)).map(d => path.join(d.path, d.name))
  : [];
const sources = () => rglob(SOURCES, n => true).sort();
const notes = () => rglob(NOTES, n => n.endsWith('.md')).sort();
const LINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
const QUOTE = /^>\s*"(.+?)"\s*[—–-]+\s*(\S+)\s*$/gm;
const SKIP = new Set(['index', '_index', 'hot', 'log', '_moc', 'moc']);

function frontmatter(t) {
  if (!t.startsWith('---')) return null;
  const end = t.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = {};
  for (const l of t.slice(4, end).split('\n')) {
    const i = l.indexOf(':');
    if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return fm;
}

function cmdStatus() {
  const m = load(); let n = 0;
  const known = new Set(Object.keys(m));
  for (const p of sources()) {
    const k = rel(p);
    if (!known.has(k)) { console.log('NEW', k); n++; }
    else if (m[k].sha !== sha(p)) { console.log('CHANGED', k); n++; }
  }
  for (const k of known) if (!fs.existsSync(path.join(root, k))) { console.log('DELETED', k); n++; }
  console.error(`pending: ${n}`);
  return 0;
}

function cmdDone(a) {
  const [src, ...pages] = a;
  const p = path.join(root, src);
  if (!fs.existsSync(p)) { console.error('source introuvable:', src); return 1; }
  for (const w of pages) if (!fs.existsSync(path.join(root, w))) { console.error('note introuvable:', w); return 1; }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  const m = load(); m[src] = { sha: sha(p), pages, at: new Date().toISOString() };
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  console.log(`done: ${src} -> ${pages.length} note(s)`); return 0;
}

function cmdLint() {
  const errs = [], names = {}, text = {};
  for (const p of notes()) { names[path.basename(p, '.md')] = p; text[p] = fs.readFileSync(p, 'utf8'); }
  const inbound = Object.fromEntries(Object.keys(names).map(n => [n, 0]));
  const m = load();
  for (const [p, t] of Object.entries(text)) {
    const base = path.basename(p, '.md').toLowerCase();
    if (SKIP.has(base) || base.startsWith('_index') || base.startsWith('_moc')) continue;
    const fm = frontmatter(t);
    if (!fm) { errs.push(`${rel(p)}: missing frontmatter`); continue; }
    for (const need of ['title', 'sources', 'updated'])
      if (!(need in fm)) errs.push(`${rel(p)}: frontmatter lacks '${need}'`);
    for (const s of (fm.sources || '').match(/[^\s,\[\]]+/g) || [])
      if (!fs.existsSync(path.join(root, s))) errs.push(`${rel(p)}: source ${s} does not exist`);
    for (const [, l] of t.matchAll(LINK))
      if (names[l]) { if (names[l] !== p) inbound[l]++; }
      else errs.push(`${rel(p)}: broken link [[${l}]]`);
    for (const [, q, src] of t.matchAll(QUOTE)) {
      const f = path.join(root, src);
      if (!fs.existsSync(f)) errs.push(`${rel(p)}: quote cites missing ${src}`);
      else if (!(' ' + fs.readFileSync(f, 'utf8').split(/\s+/).join(' ')).includes(' '.join(q.split())))
        errs.push(`${rel(p)}: QUOTE NOT IN SOURCE -> "${q.slice(0, 60)}" (${src})`);
    }
    if (/\bTODO\b/.test(t)) errs.push(`${rel(p)}: unresolved TODO`);
  }
  for (const [n, c] of Object.entries(inbound))
    if (c === 0 && !SKIP.has(n.toLowerCase())) errs.push(`${rel(names[n])}: orphan (no inbound links)`);
  for (const [k, v] of Object.entries(m))
    if (fs.existsSync(path.join(root, k)) && sha(path.join(root, k)) !== v.sha)
      errs.push(`${k}: changed since ingest, pages stale: ${(v.pages || []).join(', ')}`);
  for (const e of errs) console.error(e);
  console.error(`lint: ${errs.length} problem(s) in ${Object.keys(text).length} notes`);
  return errs.length ? 2 : 0;
}

function cmdIndex() {
  const rows = [];
  for (const p of notes()) {
    const base = path.basename(p, '.md');
    if (SKIP.has(base.toLowerCase())) continue;
    const fm = frontmatter(fs.readFileSync(p, 'utf8')) || {};
    rows.push(`- [[${base}]] - ${fm.title || base} (${fm.updated || '?'})`);
  }
  const out = path.join(NOTES, '_INDEX.md');
  fs.writeFileSync(out, '# Index\n\n' + rows.join('\n') + '\n');
  console.log(`index: ${rows.length} notes -> ${rel(out)}`); return 0;
}

const rest = arg.slice(1).filter(a => path.resolve(a) !== root);
process.exitCode = ({ status: cmdStatus, done: () => cmdDone(rest), lint: cmdLint, index: cmdIndex }[cmd]
  || (() => { console.log('usage: hphe-lint.mjs status|done <src> <notes…>|lint|index [root]'); return 1; }))();