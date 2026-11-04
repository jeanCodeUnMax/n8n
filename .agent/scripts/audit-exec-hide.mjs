// audit-exec-hide.mjs — liste les appels child_process sans `windowsHide`
// dans une fenêtre de 12 lignes (règle hephaistos2-kit, cf. global_rules.md).
//
// Pur Node : fs/path uniquement, AUCUN child_process → ne déclenche pas
// l'heuristique Defender SuspExec qui cible les one-liners `node -e` qui
// spawnent des processus. Ne jamais convertir ce script en `node -e`.
//
// Usage : node .agent/scripts/audit-exec-hide.mjs [racine]
// Exit 0 = propre, 1 = occurrences trouvées, 2 = racine introuvable.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const EXTS = new Set(['.js', '.mjs', '.cjs', '.ts']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', '_archive', 'out', 'dist']);
const CALL_RE = /\b(execSync|execFile|execFileSync|spawnSync|spawn)\s*\(/;
const WINDOW = 12;

const hits = [];

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
      continue;
    }
    if (!EXTS.has(extname(e.name))) continue;
    const fp = join(dir, e.name);
    let lines;
    try {
      lines = readFileSync(fp, 'utf8').split('\n');
    } catch {
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!CALL_RE.test(lines[i])) continue;
      const ctx = lines.slice(i, i + WINDOW).join('\n');
      if (/windowsHide/.test(ctx)) continue;   // console déjà masquée
      if (/explorer\.exe/.test(ctx)) continue; // app GUI, pas de console
      hits.push(`${relative(ROOT, fp).split(sep).join('/')}:${i + 1}\t${lines[i].trim().slice(0, 90)}`);
    }
  }
}

try {
  if (!statSync(ROOT).isDirectory()) throw new Error();
} catch {
  console.error(`racine introuvable: ${ROOT}`);
  process.exit(2);
}

walk(ROOT);
for (const h of hits) console.log(h);
console.log(`\n${hits.length} appel(s) child_process sans windowsHide sous ${ROOT}`);
process.exit(hits.length ? 1 : 0);
