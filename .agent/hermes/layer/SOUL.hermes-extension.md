# SOUL.hermes-extension.md — Hephaistos2-Kit Unified Memory System

> Ce fichier s'applique APRÈS le SOUL.md global de Hermès (`$HOME/.hermes/SOUL.md`).
> Il ajoute la connaissance du système de mémoire unifiée de Hephaistos2-Kit.

---

## 🧠 MCP UNIFIÉS DISPONIBLES (Hephaistos2-Kit)

⚠️ **Stack v2 unifiée (2026-10)** : les ex-serveurs Memory/Qdrant/Zvec/orchestrator/model-discovery/nim-router sont **absorbés** dans le serveur unique `Hephaistos-everything-search` (`hphe-mcp`, ~58 outils). Les outils `mcp_Memory_*`, `mcp_qdrant_*`, `mcp_zvec_*` n'existent plus — ne jamais les appeler.

### hphe-mcp (`Hephaistos-everything-search`)

| Outil | Description |
|-------|-------------|
| `memory_search` / `memory_read` / `memory_list` | KV agentmemory : recherche/lecture/inventaire (JSON par projet sous `${HPHE_MEMORY_ROOT}/`) |
| `memory_write` / `memory_update` / `memory_stats` | Écriture/mise à jour d'entrées mémoire + compteurs |
| `content_search` | Recherche BM25 exacte dans le contenu indexé du workspace (Tantivy) |
| `semantic_search` | Recherche vectorielle sémantique (hphe-vec, usearch HNSW 2048D, NIM interne) |
| `hybrid_search` | Fusion BM25 + vectoriel — défaut pour « où est implémenté X » |
| `everything_search` / `everything_count` / `everything_index_stats` | Index NTFS $MFT instantané (tout le disque) |
| `vec_search` / `vec_stats` | Appel vectoriel brut (vecteur via `nim_embed`) |
| `nim_embed` / `nim_chat` / `nim_models` / `nim_domains` | Embeddings 2048D + inférence NVIDIA NIM |
| `everything`/`fs_*` | Lecture/écriture fichiers bornée par `.mcp-access` (profil `external` = read-only restreint) |
| `dispatch_task` / `create_task` / `update_task` / `list_tasks` / `get_next_task` / `list_agents` / `suggest_agent` | Orchestrateur : file de tâches + spawn CLI agents |
| `available_models` / `set_prompt_template` / `list_prompt_templates` | Probe modèles live + rôles de prompt |
| `hephaistos_update` | Relancer l'ingestion du workspace |

**Usage prioritaire** :
- Avant toute tâche : `memory_search` (contexte/décisions existantes) + `hybrid_search` (code)
- Après toute décision : `memory_write` avec tags (`architecture`, `security`, `decision`) + ADR `.agent/knowledge/decisions/` si structurelle
- Localisation fichiers : `everything_search` (disque) / `content_search` (contenu workspace)

### sqlite-node MCP (SQLite multi-DB, read-mostly pour le KG)

| Outil | Description |
|-------|-------------|
| `query_data` / `execute_query` | SELECT / écriture SQL sur les bases aliasées |
| `list_tables` / `describe_table` / `list_databases` | Introspection |

**Aliases utiles** : `memory` → KG (`memory_mcp.db`), `graph` → edges (`graph-memory.db`), `cache` → `runtime-cache.db`, `orchestrator` → tasks (lecture seule côté agent).

**Usage prioritaire** :
- KG read-only : traversals, requêtes de chemin, connectivité (`memory`/`graph`)
- Le KG est **read-mostly** : ses écritures passent par le pipeline d'ingestion (`mirror_kg`), pas par des appels agent — pour enrichir le KG, écrire dans `.agent/knowledge/` ou `.agent/memory/`

---

## 📋 PROCÉDURES D'USAGE DU SYSTÈME DE MÉMOIRE UNIFIÉE

### Flux de travail complet

1. **Début de session** : `memory_search` (contexte, préférences, décisions passées, requêtes fréquentes)
2. **Avant une tâche** : `hybrid_search`/`content_search` sur le workspace — réutiliser l'existant (économie de tokens)
3. **Pendant la tâche** : `memory_write` pour les jalons ; `everything_search`/`content_search` pour la navigation
4. **Après une décision importante** : `memory_write` + tags (`architecture`, `security`, `decision`) ; ADR fichier si structurelle
5. **Fin de session** : leçons via `memory_write` (tag `lesson`) ; intentions non réalisées (tag `intention`)

### Routage recherche

| Besoin | Outil |
|--------|-------|
| Fichier par nom/chemin (disque entier) | `everything_search` |
| Texte/code exact (workspace) | `content_search` |
| Concept/sens (langage naturel) | `semantic_search` |
| Mixte (défaut) | `hybrid_search` |
| Souvenirs/décisions agents | `memory_search` + `sqlite-node` `memory`/`graph` |

### Stockage dual (local + global)

```
LOCAL:  memory-database/  (jonction → global)
          └─ agentmemory/  (KV JSON par projet)
          └─ graph/        (memory_mcp.db + graph-memory.db)
          └─ cache/        (runtime-cache.db)

GLOBAL: ${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/
```

**Règle** : La junction locale → globale assure que le projet voit le stockage global comme local.

---

## ⚠️ RÈGLES SPÉCIFIQUES AU SYSTÈME MÉMOIRE UNIFIÉ

### Architecture et storage

1. **Toutes les données de mémoire DOIVENT être stockées dans** :
   `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/`

2. **Ne pas créer de bases SQLite hors de ce chemin** sans justification explicite

3. **Utiliser les tags systématiquement** :
   - `architecture` — pour les décisions structurelles
   - `security` — pour les aspects de sécurité
   - `mcp-tool` — pour les interactions avec les MCP

4. **Maintenir l'intégrité de la junction** :
   - La junction entre `memory-database/` (local) et le workspace global doit être fonctionnelle
   - Si la junction est cassée, utiliser le mode local temporairement

5. **Ne pas modifier directement les fichiers .db** :
   - Utiliser les MCP pour toutes les opérations sur les bases
   - Les accès directs peuvent corrompre la cohérence local/global

### Intégrité des données

1. **Cohérence local/global** :
   - Les données écrites localement doivent être répliquées vers le global
   - Les données globales doivent être accessibles localement via la junction
   - En cas de conflit, le global a priorité

2. **Gestion des caches** :
   - `runtime-cache.db` est le cache unifié pour MCP + Système + Agents (alias `cache` sqlite-node)
   - Nettoyage : `memory-maintenance.ps1` au `start-workspace` (purge expirés, orphelins KG, WAL checkpoint)

3. **Indexation vectorielle** :
   - L'indexation se fait par le pipeline d'ingestion (`ingest-workspace.ps1` → `ingestion.config.json`, moteur Rust Tantivy + usearch + `mirror_kg`)
   - L'embedding est NIM 2048D interne au serveur (`nvidia/nemotron-3-embed-1b`) — pas d'embedding manuel requis pour `semantic_search`/`hybrid_search`
   - En cas d'échec d'embedding, `content_search` (BM25) reste fonctionnel sans NIM

### Sécurité

1. **Secrets** :
   - Ne jamais stocker de secrets dans la mémoire
   - Utiliser les variables d'environnement pour les informations sensibles
   - Les fichiers `.env` ne doivent pas être commités

2. **Permissions** :
   - Les bases SQLite sont accessibles en lecture/écriture par les MCP
   - Les processus concurrents doivent utiliser les mêmes instances MCP
   - Éviter les accès directs concurrents aux mêmes fichiers .db

---

## 🔄 INTÉGRATION AVEC LES AUTRES COMPOSANTS HERMÈS

### Avec SOUL.md global

Ce fichier s'applique APRÈS le `SOUL.md` global. En cas de conflit :
- Le `SOUL.md` global a priorité sur les règles d'identité (langue, éthique, etc.)
- Cette extension a priorité sur les procédures spécifiques au système mémoire

### Avec AGENTS.md (projet)

Les règles de ce fichier s'appliquent à TOUS les workspaces Hermès. Les `AGENTS.md` de projet peuvent :
- Surcharger les procédures spécifiques au projet
- Ajouter des règles spécifiques au domaine
- Ne PAS modifier les règles du système mémoire unifié

### Avec les compétences (skills)

Les compétences de Hephaistos2-Kit peuvent être utilisées via :
- `delegate_task` pour du traitement parallèle
- Appels directs aux MCP pour les opérations de mémoire
- Adaptateurs dans `skills-adapters/` pour les wrappers spécifiques

### Avec les agents délégués

Les agents Hephaistos2-Kit (orchestrator, project-planner, etc.) peuvent être délégués via `delegate_task`. Ils doivent :
- Utiliser les mêmes MCP que le workspace principal
- Respecter les mêmes règles de mémoire unifiée
- Partager le contexte via la mémoire (KG + vector stores)

---

## 📚 RÉFÉRENCES COMPLÈTES

- **Documentation Hephaistos2-Kit** : `<KIT_ROOT>\.agent\hermes\README.md`
- **Config MCP exemple** : `<KIT_ROOT>\.agent\mcp-config.json.exemple`
- **Architecture mémoire** : `<KIT_ROOT>\.agent\memory\ARCHITECTURE-ANALYSIS.md`
- **Manifeste** : `<KIT_ROOT>\wiki-doc\manifeste.md`
- **Rapport RAG** : `<KIT_ROOT>\.agent\back-end\RAG-AUDIT-REPORT.md`
