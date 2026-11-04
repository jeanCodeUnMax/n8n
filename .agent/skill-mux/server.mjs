#!/usr/bin/env node
// skill-mux — serveur MCP stdio : registre central des skills de la machine.
// Source de vérité : .agent/skill-registry.json (rebuild à la volée si absent/périmé).
// Outils : skills_list, skills_search, skills_get, skills_categories, skills_refresh, skills_resolve.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = resolve(HERE, '..');
const REGISTRY_PATH = process.env.SKILL_REGISTRY || join(AGENT_DIR, 'skill-registry.json');
const BUILDER = join(HERE, 'registry-builder.mjs');
const MAX_AGE_MS = 10 * 60 * 1000;

let registry = null;

function refreshRegistry() {
    execFileSync(process.execPath, [BUILDER, '--out', REGISTRY_PATH], { stdio: 'ignore' });
    registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    registry._loadedAt = Date.now();
    return registry;
}

function loadRegistry() {
    try {
        const stale = !registry
            || !existsSync(REGISTRY_PATH)
            || (Date.now() - statSync(REGISTRY_PATH).mtimeMs) > MAX_AGE_MS;
        if (stale) return refreshRegistry();
        if (!registry) registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
        return registry;
    } catch {
        return refreshRegistry();
    }
}

function ok(id, text) {
    emit({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
}
function fail(id, message) {
    emit({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `error: ${message}` }], isError: true } });
}
function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

const TOOLS = [
    {
        name: 'skills_list',
        description: 'Liste les skills du registre central. Filtres optionnels : category, source.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string', description: 'Filtre par catégorie exacte' },
                source: { type: 'string', description: 'Filtre par source (canonical, codex-plugins, claude, ...)' },
                limit: { type: 'integer', default: 200 },
            },
        },
    },
    {
        name: 'skills_search',
        description: 'Recherche plein-texte dans noms+descriptions des skills. Retourne name, description, category, source.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'integer', default: 50 },
            },
            required: ['query'],
        },
    },
    {
        name: 'skills_get',
        description: 'Retourne le contenu complet du SKILL.md nommé (à injecter dans un prompt agent).',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' }, path: { type: 'string' } },
        },
    },
    {
        name: 'skills_categories',
        description: 'Liste les catégories et les sources du registre avec comptages.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'skills_refresh',
        description: 'Rescanne les racines et reconstruit le registre.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'skills_resolve',
        description: 'Résout une liste de noms de skills en chemins + descriptions — pour assigner des skills à un agent/workflow.',
        inputSchema: {
            type: 'object',
            properties: { names: { type: 'array', items: { type: 'string' } } },
            required: ['names'],
        },
    },
];

function match(s, q) {
    const t = (s.name + ' ' + s.description + ' ' + s.category).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(w => t.includes(w));
}

function callTool(name, args, id) {
    const reg = loadRegistry();
    switch (name) {
        case 'skills_list': {
            let list = reg.skills;
            if (args.category) list = list.filter(s => s.category === args.category);
            if (args.source) list = list.filter(s => s.source === args.source);
            const lim = args.limit || 200;
            const out = list.slice(0, lim).map(s => ({ name: s.name, category: s.category, source: s.source, description: s.description }));
            return ok(id, JSON.stringify({ total: reg.total, matched: list.length, returned: out.length, skills: out }));
        }
        case 'skills_search': {
            const hits = reg.skills.filter(s => match(s, args.query));
            const lim = args.limit || 50;
            return ok(id, JSON.stringify({
                matched: hits.length,
                skills: hits.slice(0, lim).map(s => ({ name: s.name, description: s.description, category: s.category, source: s.source, path: s.path })),
            }));
        }
        case 'skills_get': {
            const s = args.name ? reg.skills.find(x => x.name === args.name)
                : reg.skills.find(x => x.path === args.path);
            if (!s) return fail(id, `skill introuvable: ${args.name || args.path}`);
            let content = '';
            try { content = readFileSync(s.file, 'utf8'); } catch (e) { return fail(id, `lecture impossible: ${e.message}`); }
            return ok(id, JSON.stringify({ name: s.name, path: s.path, category: s.category, source: s.source, content }));
        }
        case 'skills_categories': {
            const byCat = {};
            const bySrc = {};
            for (const s of reg.skills) {
                byCat[s.category || '(sans)'] = (byCat[s.category || '(sans)'] || 0) + 1;
                bySrc[s.source] = (bySrc[s.source] || 0) + 1;
            }
            return ok(id, JSON.stringify({ total: reg.total, categories: byCat, sources: bySrc }));
        }
        case 'skills_refresh': {
            refreshRegistry();
            return ok(id, JSON.stringify({ rebuilt: true, total: registry.total }));
        }
        case 'skills_resolve': {
            const out = args.names.map(n => {
                const s = reg.skills.find(x => x.name === n)
                    || reg.skills.find(x => x.name.toLowerCase() === n.toLowerCase());
                return s ? { name: s.name, path: s.path, file: s.file, category: s.category, description: s.description, resolved: true }
                    : { name: n, resolved: false };
            });
            return ok(id, JSON.stringify({ resolved: out.filter(x => x.resolved).length, missing: out.filter(x => !x.resolved).length, skills: out }));
        }
        default:
            return fail(id, `outil inconnu: ${name}`);
    }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.method === 'initialize') {
        emit({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'skill-mux', version: '1.0.0' } } });
    } else if (msg.method === 'notifications/initialized') {
        // rien
    } else if (msg.method === 'tools/list') {
        emit({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
    } else if (msg.method === 'tools/call') {
        try { callTool(msg.params.name, msg.params.arguments || {}, msg.id); }
        catch (e) { fail(msg.id, e.message); }
    } else if (msg.method === 'ping') {
        emit({ jsonrpc: '2.0', id: msg.id, result: {} });
    } else if (msg.id !== undefined) {
        emit({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
    }
});
