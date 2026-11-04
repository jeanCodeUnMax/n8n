# Adaptateurs de compétences — Hermès Integration Layer

Ce répertoire contient des adaptateurs (wrappers documentaires) qui permettent à Hermès d'utiliser la stack unifiée de Hephaistos2-Kit v2.

> ⚠️ **Stack v2 (2026-10)** : Memory/Qdrant/Zvec/orchestrator/model-discovery sont **absorbés** dans `Hephaistos-everything-search` (`hphe-mcp`, ~58 outils). Les outils `mcp_Memory_*`, `mcp_qdrant_*`, `mcp_zvec_*` n'existent plus.

## Structure

```
skills-adapters/
├── memory-utils.md      # Mémoire unifiée : KV agentmemory (memory_*) + KG (sqlite-node)
├── vector-search.md     # Recherche : everything_search / content / semantic / hybrid / vec / nim_embed
├── task-management.md   # Tâches : orchestrateur hphe-mcp (dispatch_task, *_task)
├── project-utils.md     # Utilitaires projet (manifest, roadmap, etc.)
└── README.md            # Ce fichier — index des adaptateurs
```

## Usage

Ces adaptateurs sont des **références de procédures** (pas du code exécutable) : chaque fichier documente les outils réels, leurs paramètres et les patterns d'usage. Le contenu détaillé vit dans les fichiers eux-mêmes — ce README n'est que l'index.

## Routage rapide

| Besoin | Fichier | Outils clés |
|--------|---------|-------------|
| Se souvenir / retrouver une décision | `memory-utils.md` | `memory_search`, `memory_write`, `memory_update` |
| Chercher du code/contenu/fichiers | `vector-search.md` | `hybrid_search`, `content_search`, `everything_search` |
| Planifier/déléguer une tâche | `task-management.md` | `dispatch_task`, `create_task`, `update_task`, `suggest_agent` |
| KG / SQL direct (read-only) | `memory-utils.md` §KG | `sqlite-node` `query_data` (alias `memory`, `graph`, `cache`) |
| Embeddings/inférence NIM | `vector-search.md` | `nim_embed`, `nim_chat_model`, `available_models` |

## Bases sqlite-node (alias)

| Alias | Chemin | Usage |
|-------|--------|-------|
| `memory` | `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/graph/memory_mcp.db` | KG (entités, observations, relations) — read-only côté agent |
| `graph` | `.../graph/graph-memory.db` | Edges (traversals rapides) |
| `cache` | `.../cache/runtime-cache.db` | Cache runtime |
| `orchestrator` | `orchestrator.db` (HPHE_ORCH_DB) | Tasks/agents — **lecture seule** (écritures via outils `*_task`) |
