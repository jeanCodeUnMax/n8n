#!/usr/bin/env node
// skill-mux registry-builder — scanne toutes les racines de skills connues,
// déduplique par nom, catégorise, écrit .agent/skill-registry.json.
// Usage : node registry-builder.mjs [--root <dir> ...] [--out <file>]

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = resolve(HERE, '..');
const REPO = resolve(AGENT_DIR, '..');
const HOME = homedir();

// Racines configurables : .agent/skill-mux/roots.json (versionné, portable)
// + roots.local.json (extras machine, gitignoré). Placeholders supportés :
// ~ (home), %VAR% et ${VAR} (env), <repo> (racine du repo). Si aucun fichier
// n'existe, repli sur les défauts codés ci-dessous.
function expandPath(p) {
    return resolve(String(p)
        .replace(/^~(?=[/\\]|$)/, HOME)
        .replace(/<repo>/g, REPO)
        .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, v) => process.env[v] || m)
        .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, v) => process.env[v] || m));
}

function loadRoots() {
    const roots = [];
    for (const f of ['roots.json', 'roots.local.json']) {
        const fp = join(HERE, f);
        if (!existsSync(fp)) continue;
        try {
            const list = JSON.parse(readFileSync(fp, 'utf8'));
            for (const r of Array.isArray(list) ? list : list.roots || []) {
                if (r?.path) roots.push({ path: expandPath(r.path), label: r.label || f, priority: roots.length });
            }
        } catch { /* fichier illisible : on ignore */ }
    }
    return roots.length ? roots : DEFAULT_ROOTS;
}

// Ordre = priorité de déduplication : le premier trouvé gagne le nom.
const DEFAULT_ROOTS = [
    { path: join(AGENT_DIR, 'skills'), label: 'canonical', priority: 0 },
    { path: join(REPO, 'plugin-devin', 'skills'), label: 'plugin-devin', priority: 1 },
    { path: join(HOME, '.agents', 'skills'), label: 'user-agents', priority: 2 },
    { path: join(HOME, '.config', 'devin', 'skills'), label: 'user-devin', priority: 3 },
    { path: join(HOME, 'AppData', 'Roaming', 'devin', 'skills'), label: 'devin-runtime', priority: 4 },
    { path: join(HOME, '.claude', 'skills'), label: 'claude', priority: 5 },
    { path: join(HOME, '.kilocode', 'skills'), label: 'kilocode', priority: 6 },
    { path: join(HOME, '.roo', 'skills'), label: 'roo', priority: 7 },
    { path: join(HOME, '.trae', 'skills'), label: 'trae', priority: 8 },
    { path: join(HOME, '.gemini', 'config', 'skills'), label: 'gemini', priority: 9 },
    { path: join(HOME, '.grok', 'skills'), label: 'grok', priority: 10 },
    { path: join(HOME, 'AppData', 'Local', 'hermes', 'skills'), label: 'hermes', priority: 11 },
    { path: join(HOME, '.codex', '.tmp', 'plugins'), label: 'codex-plugins', priority: 12 },
    { path: 'C:/Program Files/servers/everything-mcp/.agent/skills', label: 'everything-mcp', priority: 13 },
    { path: 'C:/Program Files/servers/orchestrator-server/.agent/skills', label: 'orchestrator-server', priority: 14 },
];

const MAX_DEPTH = 5;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '__pycache__']);

function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const out = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([a-zA-Z_-]+)\s*:\s*(.+)$/);
        if (kv) out[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
}

// Devine la catégorie depuis le chemin relatif à la racine scannée.
// Ignore les dossiers fourre-tout (plugins, skills, builtin...) pour atteindre
// le premier segment significatif — codex: plugins/<pack>/skills/<name>.
const GENERIC_SEGMENTS = new Set(['plugins', 'skills', 'skill', 'builtin', 'global', 'src', 'lib']);
function categoryOf(root, skillDir) {
    const rel = skillDir.slice(root.length).replace(/^[/\\]+/, '');
    const parts = rel.split(/[/\\]/).filter(Boolean);
    for (const seg of parts.slice(0, -1)) {
        if (!GENERIC_SEGMENTS.has(seg.toLowerCase())) return seg;
    }
    return '';
}

function scanRoot(rootPath, label, priority, found) {
    if (!existsSync(rootPath)) return 0;
    let count = 0;
    const walk = (dir, depth) => {
        if (depth > MAX_DEPTH) return;
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        const skillFile = entries.find(e => e.isFile() && /^skill\.md$/i.test(e.name));
        if (skillFile) {
            const skillPath = join(dir, skillFile.name);
            let meta = {};
            try { meta = parseFrontmatter(readFileSync(skillPath, 'utf8').slice(0, 8192)); } catch { }
            const name = meta.name || basename(dir);
            const entry = {
                name,
                description: meta.description || '',
                path: dir,
                file: skillPath,
                source: label,
                category: categoryOf(rootPath, dir),
                priority,
            };
            if (!found.has(name)) {
                found.set(name, { ...entry, aliases: [] });
                count++;
            } else {
                found.get(name).aliases.push({ path: dir, source: label });
            }
            return; // SKILL.md trouvé : ne pas descendre dans les sous-dirs de ce skill
        }
        for (const e of entries) {
            if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
                walk(join(dir, e.name), depth + 1);
            }
        }
    };
    walk(rootPath, 0);
    return count;
}

export function buildRegistry(extraRoots = []) {
    const roots = [...extraRoots.map((p, i) => ({ path: resolve(p), label: 'extra', priority: -1 - i })), ...loadRoots()];
    const found = new Map();
    const perSource = {};
    for (const r of roots) {
        const n = scanRoot(r.path, r.label, r.priority, found);
        if (n) perSource[r.label] = (perSource[r.label] || 0) + n;
    }
    const skills = [...found.values()]
        .map(s => ({ name: s.name, description: s.description, path: s.path, file: s.file, source: s.source, category: s.category, aliases: s.aliases }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const categories = [...new Set(skills.map(s => s.category).filter(Boolean))].sort();
    return {
        version: 1,
        builtAt: new Date().toISOString(),
        total: skills.length,
        sources: perSource,
        categories,
        skills,
    };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const args = process.argv.slice(2);
    const extra = [];
    let out = join(AGENT_DIR, 'skill-registry.json');
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--root' && args[i + 1]) extra.push(args[++i]);
        if (args[i] === '--out' && args[i + 1]) out = resolve(args[++i]);
    }
    const reg = buildRegistry(extra);
    writeFileSync(out, JSON.stringify(reg, null, 1));
    console.log(`registry: ${reg.total} skills -> ${out}`);
    for (const [src, n] of Object.entries(reg.sources)) console.log(`  ${src}: ${n}`);
}
