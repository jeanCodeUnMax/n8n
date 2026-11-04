# Hephaistos2-Kit Architecture

> Comprehensive AI Agent Capability Expansion Toolkit

---

## 📋 Overview

Hephaistos2-Kit is a modular system consisting of:

- **22 Specialist Agents** - Role-based AI personas
- **45 Skills** - Domain-specific knowledge modules (incluant `chat-id-project` et `jointes-project`)
- **11 Workflows** - Slash command procedures
- **.devin Layer** - Règles locales (`.devin/rules/`) et skills locales (`.devin/skills/`) pour Devin

---

## 📁 Arborescence — séparation PROJET / INSTALL

| Rôle | Chemin | Contenu |
| --- | --- | --- |
| **PROJET (dev)** | `<repo>` = dossier du clone (emplacement libre, auto-détecté par `install.ps1`) | sources complètes : `hphe/` (workspace Rust), `extension/`, `extensions/orchestrator-monitor/`, `.agent/`, `docs/`, `tests/`, `tools/`, `.git`, `install.ps1` |
| **INSTALL (runtime)** | `%ProgramFiles%\servers\hephaistos2-kit\` par défaut (`-InstallRoot` / `HPHE_INSTALL`) | runtime seul : `extension/server/` (hphe-mcp, hphe-rest, hphe-indexd + `.cmd`), `data/` (content-index, orchestrator.db, logs), `migrated-vec/`, `memory-database` (jonction ou dossier réel) |

> **Ne jamais mélanger les deux.** Le projet se développe, l'install s'exécute.
> `install.ps1` (à la racine projet) fait le deploy : build dans le projet →
> binaires vers l'install → config MCP vers les chemins install.
>
> `servers/everything-mcp` = shim de jonctions : chemins *runtime*
> (`extension`, `data`, `migrated-vec`, `memory-database`) → install ;
> chemins *sources* (`hphe`, `.agent`, `docs`, `tests`, `tools`, `extensions`…) → projet.
> Tâche planifiée `hphe-indexd` (SYSTEM, démarrage) → binaire install.
> Anciens MCP archivés dans `servers/servers_backup/`.
> MCP dans Devin : **`Hephaistos-everything-search`**.
>
> **Accès distant (CerberOS/Hermes laptop)** : MCP-over-SSH — entrée
> `authorized_keys` à commande forcée → `hphe-mcp-launch.cmd` (pas de proxy
> applicatif). Côté laptop : `mcp_servers.hephaistos` = `ssh -T win-mcp`.
> Voir `docs/cerberos-mcp-mux-config.md`. Règle : tous les agents (y compris
> distants) passent par ce serveur — les MCP séparés `filesystem`/`memory`/
> `sqlite-node` pour CerberOS n'existent pas.

---

## ⚙️ Backend unifié Rust — `hphe-mcp` (58 outils, UN SEUL MCP)

> **Depuis T-unification (commit `55fb057`), tous les services d'infrastructure
> sont absorbés dans UN binaire Rust : `extension/server/hphe-mcp.exe`.**
> Les MCP externes `orchestrator`, `nim-router`, `model-discovery`,
> `agentmemory`, `qdrant`, `zvec` sont **désactivés** (config préservée,
> rollback possible). `everything-search` = point d'entrée unique.
>
> Les 58 outils correspondent à la source du projet. Le runtime installé reste à 57 jusqu’à un déploiement autorisé; Beacon reste désactivé.

| Famille | Outils | Backend |
| --- | --- | --- |
| **Index NTFS** | `everything_search`, `search_files`, `everything_count`, `everything_index_stats`, `hphe_health` | `hphe-indexd` (SYSTEM task) : $MFT → 6,4M entrées, USN live, pipe `\\.\pipe\hphe-index` |
| **Contenu** | `content_ingest`, `content_search` | Tantivy `install/data/content-index` (BM25+snippets, FRN lié MFT) |
| **Vecteurs** | `vec_search`, `vec_stats`, `semantic_search`, `hybrid_search` | usearch `install/migrated-vec/*.usearch` (2048D) |
| **Orchestration** | `list_agents`, `create_task`, `update_task`, `delete_task`, `list_tasks`, `get_next_task`, `dispatch_task`, `suggest_agent`, `register_agent`, `update_agent`, `list_prompt_templates`, `set_prompt_template`, `list_worktrees`, `worktree_cleanup` | `orchestrator.db` (env `HPHE_ORCH_DB`) — pickAgent/pickModel portés du JS |
| **NIM/modèles** | `nim_domains` (17), `nim_models`, `nim_chat`, `nim_chat_model`, `nim_embed` (2048D), `available_models` | NVIDIA NIM x2 + OpenRouter free + Ollama — absorbe nim-router + model-discovery |
| **Mémoire** | `memory_write`, `memory_read`, `memory_search`, `memory_list`, `memory_update`, `memory_stats`, `project_init` | agentmemory JSON sous `HPHE_MEMORY_ROOT` (configuré par `install.ps1 -MemoryRoot`, défaut `<install>/data/agentmemory`) |
| **Ingestion** | `beacon_ingest`, `hephaistos_update` (= "Hephaistos update force") | Tantivy + KG mirror (`current_workspace/agentmemory/graph/*.db`) + vecteurs optionnels + état incrémental + `.ragignore` |
| **FS** | `fs_*` (18 outils) | allowed_roots inchangés |

**REST** : `hphe-rest.exe` (127.0.0.1:8792, même 58 outils + `/health`).
Démarré au logon via `Startup/hphe-rest.cmd` ; porte aussi la **boucle
d'ingestion automatique** (`HPHE_INGEST_ROOTS`, intervalle `HPHE_INGEST_INTERVAL_S`=900s).

**CLI** : `hphe-mcp.exe --tool <name> --args '<json>'` — ex. update force :
`hphe-mcp.exe --tool hephaistos_update --args '{"root":".","force":true,"embed":false}'`

**Scripts remplacés** : `.agent/rag/*.py` (cli/pipeline/chunker/embedder/router/
rag_rest_bridge) → voir `_archive/agent-rag/DEPRECATED-BY-RUST.md` ;
`ingest-workspace.ps1`/`auto-ingest.ps1` → wrappers fins vers le binaire.

---

## 🔌 `sqlite-node` — bus temps réel entre agents (MCP partagé)

Complémentaire de hphe-mcp : **tous les agents ACP/CLI se raccordent au même
serveur sqlite-node et donc aux mêmes bases SQLite** — c'est le canal
d'échange en temps réel entre agents, sans passer par des fichiers markdown.
Un agent dépose un état/requête, un autre le lit à l'instant d'après.

| Alias | Base | Rôle |
| --- | --- | --- |
| `cache` | `current_workspace/cache/runtime-cache.db` | **Canal éphémère** (kv, TTL 1h) : signaux/requêtes/états entre agents — lecture+écriture |
| `memory` | `current_workspace/agentmemory/graph/memory_mcp.db` | KG partagé (entities/observations/relations) — lecture |
| `graph` | `current_workspace/agentmemory/graph/graph-memory.db` | Traversals edges — lecture |
| `orchestrator` | `<install>/data/orchestrator.db` | État des tâches — lecture diag (écriture via outils `*_task`) |

- Launch : `node <serveurs>/mcp-quick-sqlite3/dist/sqlite-node-launch.mjs` — le
  **wrapper porte les env vars lui-même** (MEMORY_DB/GRAPH_DB/CACHE_DB/
  ORCHESTRATOR_DB) : si `mcp_config.json` est régénéré et perd l'env, les
  alias restent câblés (régression du 2026-10-22).
- `install.ps1` réécrit le bloc env complet à chaque install (`-Elevated`).
- Règle : KG = alimenté par le pipeline (mirror_kg), pas par écriture agent
  directe. Le canal `cache` est celui des échanges agents↔agents.

---

## 🏗️ Directory Structure

```plaintext
.agent/
├── ARCHITECTURE.md          # This file
├── REGISTRY.md              # Agents/capabilities registry + known issues
├── agents/                  # 22 Specialist Agents
├── skills/                  # 45 Skills (dont chat-id-project et jointes-project)
├── workflows/               # 11 Slash Commands (chat-id/jointes migrés vers skills, archivés .bak)
├── rules/                   # Global Rules (incl. memory discipline)
├── knowledge/               # Durable knowledge: ADR decisions/, architecture/, docs/
│                            #   → indexed by auto-ingest (searchable by all agents)
├── consciousness/           # Consciousness spec: 5-layer map (Awareness→Memory→
│                            #   Reflection→Intention). Reflection/Intention = /reflect
├── memory/                  # Unified memory docs + policy
│                            #   (rag/ archivé → _archive/agent-rag/)
├── scripts/                 # Master validation + ingestion scripts
└── logs/                    # Runtime logs (gitignored)
```

---

## 🔁 Boucle d'apprentissage fermée (Learning Loop)

Le système n'est pas un simple stockage : c'est une boucle où chaque couche
réinjecte dans la suivante.

```plaintext
Sessions agents (Devin, agy, kilo, hermes, Claude…)
      │  capture passive
      ▼
Beacon ── service Windows BeaconCollector (auto, survit au logout)
      │  ~/.beacon/endpoint/logs/runtime.jsonl
      ▼
beacon_ingest.py (au start-workspace) — distillation en digests
      │  metadata.source = "beacon"
      ▼
Mémoire unifiée : memory_mcp.db (KG) + graph-memory.db + usearch embarqué
      (Qdrant/Zvec externes remplacés par hphe-vec — voir section Rust)
      ▲                                        │
      │ memory_write + ADR                     │ memory_search / semantic_search
      │                                        ▼
/reflect (fin de session/phase) ◄──── Agents (action + retrieval)
      │
      ▼
.agent/knowledge/decisions/*.md ── indexé par auto-ingest ──┐
      (carve-out dans ingest-workspace.ps1)                 │
      ▲────────────────────── re-retrieval ◄────────────────┘

Auto-observation : memory-maintenance.ps1 (au start-workspace) purge les
caches expirés + relations orphelines, checkpoint WAL, et écrit son rapport
dans kv 'maintenance:last_report' → consommé par /reflect.
```

| Dossier | Rôle dans la boucle |
| --- | --- |
| `knowledge/` | Connaissance **durable et auditable** : ADR (decisions/), docs d'archi. Lu avant décision, écrit après (double écriture avec memory_write). Indexé → cherchable. |
| `consciousness/` | **Spécification** des couches Awareness→Memory→Reflection→Intention. Awareness≈Beacon, Memory≈mémoire unifiée, Reflection+Intention≈`/reflect`. Doc de référence, indexée comme corpus. |

---

## 🤖 Agents (22)

Specialist AI personas for different domains.

| Agent                    | Focus                      | Skills Used                                              |
| ------------------------ | -------------------------- | -------------------------------------------------------- |
| `orchestrator`           | Multi-agent coordination   | parallel-agents, behavioral-modes                        |
| `project-planner`        | Discovery, task planning   | brainstorming, plan-writing, architecture                |
| `frontend-specialist`    | Web UI/UX                  | frontend-design, nextjs-react-expert, tailwind-patterns  |
| `backend-specialist`     | API, business logic        | api-patterns, nodejs-best-practices, database-design     |
| `api-designer`           | REST/GraphQL/OpenAPI       | api-patterns, architecture, clean-code                   |
| `database-architect`     | Schema, SQL                | database-design                                          |
| `mobile-developer`       | iOS, Android, RN           | mobile-design                                            |
| `game-developer`         | Game logic, mechanics      | game-development                                         |
| `devops-engineer`        | CI/CD, Docker              | deployment-procedures, server-management                 |
| `security-auditor`       | Security compliance        | vulnerability-scanner, red-team-tactics                  |
| `penetration-tester`     | Offensive security         | red-team-tactics                                         |
| `test-engineer`          | Testing strategies         | testing-patterns, tdd-workflow, webapp-testing           |
| `debugger`               | Root cause analysis        | systematic-debugging                                     |
| `performance-optimizer`  | Speed, Web Vitals          | performance-profiling                                    |
| `seo-specialist`         | Ranking, visibility        | seo-fundamentals, geo-fundamentals                       |
| `documentation-writer`   | Manuals, docs              | documentation-templates                                  |
| `product-manager`        | Requirements, user stories | plan-writing, brainstorming                              |
| `product-owner`          | Strategy, backlog, MVP     | plan-writing, brainstorming                              |
| `qa-automation-engineer` | E2E testing, CI pipelines  | webapp-testing, testing-patterns                         |
| `code-archaeologist`     | Legacy code, refactoring   | clean-code, code-review-checklist                        |
| `explorer-agent`         | Codebase analysis          | architecture, plan-writing, systematic-debugging         |
| `memory-agent`           | Memory management          | architecture, systematic-debugging                       |

---

## 🧩 Skills (41)

Modular knowledge domains that agents can load on-demand. based on task context.

### Frontend & UI

| Skill                   | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `nextjs-react-expert`   | Next.js & React modern patterns                                                                              |
| `web-design-guidelines` | Web UI audit - 100+ rules for accessibility, UX, performance (Vercel)                                        |
| `tailwind-patterns`     | Tailwind CSS v4 utilities                                                                                    |
| `frontend-design`       | UI/UX patterns, design systems                                                                               |

### Backend & API

| Skill                   | Description                    |
| ----------------------- | ------------------------------ |
| `api-patterns`          | REST, GraphQL, tRPC            |
| `nodejs-best-practices` | Node.js async, modules         |
| `python-patterns`       | Python standards, FastAPI      |
| `rust-pro`              | Rust patterns, hphe codebase   |

### Database

| Skill             | Description                 |
| ----------------- | --------------------------- |
| `database-design` | Schema design, optimization |

### Cloud & Infrastructure

| Skill                   | Description               |
| ----------------------- | ------------------------- |
| `deployment-procedures` | CI/CD, deploy workflows   |
| `server-management`     | Infrastructure management |

### Testing & Quality

| Skill                   | Description              |
| ----------------------- | ------------------------ |
| `testing-patterns`      | Jest, Vitest, strategies |
| `webapp-testing`        | E2E, Playwright          |
| `tdd-workflow`          | Test-driven development  |
| `code-review-checklist` | Code review standards    |
| `lint-and-validate`     | Linting, validation      |

### Security

| Skill                   | Description              |
| ----------------------- | ------------------------ |
| `vulnerability-scanner` | Security auditing, OWASP |
| `red-team-tactics`      | Offensive security       |

### Architecture & Planning

| Skill           | Description                |
| --------------- | -------------------------- |
| `app-builder`   | Full-stack app scaffolding |
| `architecture`  | System design patterns     |
| `plan-writing`  | Task planning, breakdown   |
| `brainstorming` | Socratic questioning       |

### Mobile

| Skill           | Description           |
| --------------- | --------------------- |
| `mobile-design` | Mobile UI/UX patterns |

### Game Development

| Skill              | Description           |
| ------------------ | --------------------- |
| `game-development` | Game logic, mechanics |

### SEO & Growth

| Skill              | Description                   |
| ------------------ | ----------------------------- |
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals |
| `geo-fundamentals` | GenAI optimization            |

### Shell/CLI

| Skill                | Description               |
| -------------------- | ------------------------- |
| `bash-linux`         | Linux commands, scripting |
| `powershell-windows` | Windows PowerShell        |

### Other

| Skill                     | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `clean-code`              | Coding standards (Global)                               |
| `behavioral-modes`        | Agent personas                                          |
| `parallel-agents`         | Multi-agent patterns                                    |
| `mcp-builder`             | Model Context Protocol                                  |
| `documentation-templates` | Doc formats                                             |
| `i18n-localization`       | Internationalization                                    |
| `performance-profiling`   | Web Vitals, optimization                                |
| `systematic-debugging`    | Troubleshooting                                         |
| `intelligent-routing`     | Routage automatique des requêtes vers l'agent approprié |

### Hephaistos & Orchestration

| Skill            | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| `boost`          | `/boost` — mode haute performance (délégation agressive, recherche Hephaistos-first) |
| `hephaistos-kit` | Référence du kit : serveur unifié hphe-mcp, propagation `.agent/`                    |
| `obsidian`       | `/obsidian` — second cerveau partagé Devin↔agy (triage, sessions, anti-patrons)      |
| `orchestrator`   | Playbook délégation `dispatch_task` (CLI agents, worktrees, providers)               |

---

## 🔄 Workflows (12)

Slash command procedures. Invoke with `/command`.

| Command          | Description                                        |
| ---------------- | -------------------------------------------------- |
| `/brainstorm`    | Socratic discovery                                 |
| `/create`        | Create new features                                |
| `/debug`         | Debug issues                                       |
| `/deploy`        | Deploy application                                 |
| `/enhance`       | Improve existing code                              |
| `/orchestrate`   | Multi-agent coordination                           |
| `/plan`          | Task breakdown                                     |
| `/preview`       | Preview changes                                    |
| `/reflect`       | Fin de session : apprentissages → memory + ADR     |
| `/status`        | Check project status                               |
| `/test`          | Run tests                                          |
| `/ui-ux-pro-max` | Design with 50 styles                              |

---

## 🎯 Skill Loading Protocol

```plaintext
User Request → Skill Description Match → Load SKILL.md
                                            ↓
                                    Read references/
                                            ↓
                                    Read scripts/
```

### Skill Structure

```plaintext
skill-name/
├── SKILL.md           # (Required) Metadata & instructions
├── scripts/           # (Optional) Python/Bash scripts
├── references/        # (Optional) Templates, docs
└── assets/            # (Optional) Images, logos
```

### Enhanced Skills (with scripts/references)

| Skill           | Files | Coverage                         |
| --------------- | ----- | -------------------------------- |
| `ui-ux-pro-max` | 27    | 50 styles, 21 palettes, 50 fonts |
| `app-builder`   | 20    | Full-stack scaffolding           |

---

## 📜 Scripts (2)

Master validation scripts that orchestrate skill-level scripts.

### Master Scripts

| Script          | Purpose                                 | When to Use              |
| --------------- | --------------------------------------- | ------------------------ |
| `checklist.py`  | Priority-based validation (Core checks) | Development, pre-commit  |
| `verify_all.py` | Comprehensive verification (All checks) | Pre-deployment, releases |

### Usage

```bash
# Quick validation during development
python .agent/scripts/checklist.py .

# Full verification before deployment
python .agent/scripts/verify_all.py . --url http://localhost:3000
```

### What They Check

**checklist.py** (Core checks):

- Security (vulnerabilities, secrets)
- Code Quality (lint, types)
- Schema Validation
- Test Suite
- UX Audit
- SEO Check

**verify_all.py** (Full suite):

- Everything in checklist.py PLUS:
- Lighthouse (Core Web Vitals)
- Playwright E2E
- Bundle Analysis
- Mobile Audit
- i18n Check

Les scripts sont listés dans [`scripts/`](scripts/).

---

## 📊 Statistics

| Metric              | Value                         |
| ------------------- | ----------------------------- |
| **Total Agents**    | 22                            |
| **Total Skills**    | 48                            |
| **Total Workflows** | 12                            |
| **Total Scripts**   | 2 (master) + 18 (skill-level) |
| **Coverage**        | ~90% web/mobile development   |

---

## 🛡️ Fallback & Robustesse

| Condition                  | Comportement                                            |
| -------------------------- | ------------------------------------------------------- |
| ARCHITECTURE.md absent     | Skip silencieux + log mémoire (tags='startup,fallback') |
| intelligent-routing absent | Routing manuel vers agents                              |
| agents vides               | Fallback 'mode orchestrator seul'                       |
| skills manquants           | Réponse générique + annonce 'Skills non chargés'        |

---

## 🔗 Quick Reference

| Need     | Agent                 | Skills                                |
| -------- | --------------------- | ------------------------------------- |
| Web App  | `frontend-specialist` | react-best-practices, frontend-design |
| API      | `backend-specialist`  | api-patterns, nodejs-best-practices   |
| Mobile   | `mobile-developer`    | mobile-design                         |
| Database | `database-architect`  | database-design, prisma-expert        |
| Security | `security-auditor`    | vulnerability-scanner                 |
| Testing  | `test-engineer`       | testing-patterns, webapp-testing      |
| Debug    | `debugger`            | systematic-debugging                  |
| Plan     | `project-planner`     | brainstorming, plan-writing           |

## 10. MCP — mcp-mux (canon)

Les serveurs MCP des IDE passent par le **broker mcp-mux** (`~/.config/mcp-mux/mcp-mux.json`) — un seul processus shim (`mcp-mux/src/shim.mjs`) proxifie tous les serveurs (~305 outils). `mcp_config.json` ne contient que l'entree `mcp-mux` **activee**. `setup-mcp-mux.mjs` est idempotent (skip si deja muxee) et borne ses backups a 5. Le watchdog re-applique si Devin reecrit sa config — c'est voulu.
