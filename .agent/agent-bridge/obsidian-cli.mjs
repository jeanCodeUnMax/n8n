#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

// Chemin du vault : env d'abord, puis local-paths.json (gitignoré, par machine).
const localCfg = (() => { try { return JSON.parse(fsSync.readFileSync(new URL('./local-paths.json', import.meta.url), 'utf8')); } catch { return {}; } })();
const vault = path.resolve(process.env.OBSIDIAN_VAULT_PATH || localCfg.obsidianVault || '.obsidian-vault-unset');
const pluginsDir = path.join(vault, '.obsidian', 'plugins');
const inventoryPath = path.join(vault, '99_Labo', 'SmartComposer_RE', 'INVENTAIRE_outils_plugins.md');
const json = process.argv.includes('--json');
const args = process.argv.slice(2).filter(x => x !== '--json');
const out = value => console.log(json ? JSON.stringify(value, null, 2) : typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const fail = message => { console.error(`Erreur: ${message}`); process.exitCode = 1; };
async function readJson(file, fallback = {}) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
function safe(rel) { const p = path.resolve(vault, rel || ''); if (p !== vault && !p.startsWith(vault + path.sep)) throw new Error('Chemin hors vault'); return p; }
async function plugin(id) { const dir = path.join(pluginsDir, id); const manifest = await readJson(path.join(dir, 'manifest.json'), null); if (!manifest) throw new Error(`Plugin introuvable: ${id}`); return { id, dir, manifest, data: await readJson(path.join(dir, 'data.json')) }; }
async function listFiles(dir = vault, result = []) { for (const e of await fs.readdir(dir, { withFileTypes: true })) { if (e.name === '.obsidian' || e.name === '.trash' || e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) await listFiles(p, result); else result.push(path.relative(vault, p).replaceAll(path.sep, '/')); } return result; }
async function inventory() { const text = await fs.readFile(inventoryPath, 'utf8'); const rows = []; for (const line of text.split(/\r?\n/)) { if (!line.startsWith('| `')) continue; const cells = line.split('|').slice(1, -1).map(x => x.trim()); if (cells.length < 7) continue; rows.push({ id: cells[0].replaceAll('`', ''), name: cells[1], commands: cells[2], views: cells[3], functions: cells[4], verdict: cells[5], priority: cells[6] }); } return rows; }
async function main() {
 const [command, subject, ...rest] = args;
 if (!command || command === 'help') return out({ usage: 'obsidian-cli <plugins|inventory|plugin|vault|smart-composer|smart-context|smart-connections>', commands: ['plugins list', 'inventory list|plugin <id>', 'plugin <id> manifest|config', 'vault list|read|write|search', 'smart-composer config', 'smart-context collect <path>', 'smart-connections index-status'] });
 if (command === 'inventory') { const rows = await inventory(); if (subject === 'list') return out(rows); if (subject === 'plugin') { const row = rows.find(x => x.id === rest[0]); if (!row) throw new Error(`Plugin absent de l'inventaire: ${rest[0]}`); return out(row); } throw new Error('Sous-commande inventory: list ou plugin <id>'); }
 if (command === 'plugins') { const ids = await fs.readdir(pluginsDir); const result = []; for (const id of ids) { const m = await readJson(path.join(pluginsDir, id, 'manifest.json'), null); if (m) result.push({ id, name: m.name, version: m.version }); } return out(result); }
 if (command === 'plugin') { const p = await plugin(subject); if (rest[0] === 'manifest') return out(p.manifest); if (rest[0] === 'config') return out(p.data); throw new Error('Sous-commande plugin: manifest ou config'); }
 if (command === 'vault') { if (subject === 'list') return out(await listFiles()); if (subject === 'read') return out(await fs.readFile(safe(rest[0]), 'utf8')); if (subject === 'write') { await fs.mkdir(path.dirname(safe(rest[0])), { recursive: true }); await fs.writeFile(safe(rest[0]), rest.slice(1).join(' '), 'utf8'); return out({ written: rest[0] }); } if (subject === 'search') { const q = rest.join(' ').toLowerCase(); const found = []; for (const f of await listFiles()) if (/\.(md|txt|json|yaml|yml)$/i.test(f)) { const c = await fs.readFile(safe(f), 'utf8').catch(() => ''); if (c.toLowerCase().includes(q)) found.push(f); } return out({ query: q, results: found }); } throw new Error('Sous-commande vault inconnue'); }
 if (command === 'smart-composer') { const p = await plugin('smart-composer'); if (subject === 'config') return out({ manifest: p.manifest, providers: p.data.providers || [], chatModels: p.data.chatModels || [], selected: { chatModelId: p.data.chatModelId, applyModelId: p.data.applyModelId, embeddingModelId: p.data.embeddingModelId }, mcp: p.data.mcp || {} }); throw new Error('Smart Composer: seule la lecture config est disponible sans Obsidian'); }
 if (command === 'smart-context') { await plugin('smart-context'); if (subject === 'collect') { const c = await fs.readFile(safe(rest[0]), 'utf8'); return out({ path: rest[0], chars: c.length, content: c }); } throw new Error('Smart Context: collect <note>'); }
 if (command === 'smart-connections') { const p = await plugin('smart-connections'); if (subject === 'index-status') return out({ plugin: p.manifest, data: p.data, note: 'Index interne au plugin; le CLI expose ici son état et l’inventaire canonique.' }); }
 throw new Error(`Commande inconnue: ${command}`);
}
main().catch(e => fail(e.message));
