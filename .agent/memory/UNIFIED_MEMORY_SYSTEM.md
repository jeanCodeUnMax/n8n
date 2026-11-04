# Système de Mémoire Unifié

**Version:** 2.0
**Date:** 2026-04-06
**Statut:** ✅ Optimisé

---

## Architecture Globale

```mermaid
flowchart TB
    subgraph ENV["⚙️ CONFIGURATION (.env)"]
        DUAL_MODE["Mode DUAL activé"]
        GLOBAL_PATH["AGENT_DB_ROOT<br/><HEPHAISTOS_DATA>/"]
    end

    subgraph STORAGE["🗄️ STOCKAGE"]
        direction TB

        subgraph GLOBAL["🌍 GLOBAL"]
            GLOBAL_DB["current_workspace/"]
        end

        subgraph LOCAL["📁 LOCAL (Projet)"]
            LOCAL_DB["memory-database/<br/>← Junction (cache, graph, vector)"]
        end
    end

    DUAL_MODE --> GLOBAL_DB
    GLOBAL_PATH --> GLOBAL_DB
    GLOBAL_DB <-->|"Synchronisation DUAL"| LOCAL_DB

    style ENV fill:#2d3748,stroke:#1a202c,color:#fff
    style GLOBAL fill:#1a365d,stroke:#1a202c,color:#fff
    style LOCAL fill:#2c5282,stroke:#1a202c,color:#fff
```

---

## Composants

### 1. Cache System (v2.1 - SQLite Unifié)

```mermaid
flowchart LR
    subgraph CACHE["✅ Cache SQLite Unifié"]
        SQLITE["runtime-cache.db<br/>kv<br/>purge par âge via memory-maintenance.ps1"]
    end
```

| Base          | Table       | Usage                                |
| ------------- | ----------- | ------------------------------------ |
| runtime-cache.db | kv | Cache unifié, purge via memory-maintenance.ps1 |

**Optimisation:** Serveur cache MCP supprimé → SQLite natif via sqlite-node

### 2. Graph Memory (Complémentaire)

```mermaid
flowchart LR
    subgraph GRAPH["Graph Memory"]
        MCP_DB["memory_mcp.db<br/>Knowledge Graph riche<br/>~225k entités, ~315k obs, ~676k rel"]
        GM_DB["graph-memory.db<br/>Traversals rapides<br/>edges simples"]
    end

    MCP_DB -->|"Sync edges"| GM_DB
```

| Base                | Rôle                | Données                                          |
| ------------------- | ------------------- | ------------------------------------------------ |
| **memory_mcp.db**   | Knowledge Graph MCP | ~225k entités, ~315k observations, ~676k relations |
| **graph-memory.db** | Traversals          | edges simples                                    |

**Documentation:** `GRAPH-MEMORY-CLARIFICATION.md`

### 3. Vector Store (Dual)

| Store      | Dimensions | Usage       | Collections                                     |
| ---------- | ---------- | ----------- | ----------------------------------------------- |
| **Qdrant** | 2048D      | Catégorique | code, doc, config, workflow, skill (NVIDIA NIM nemotron-3-embed-1b) |
| **Zvec**   | 384D       | Sémantique  | entities, concepts, actions, relations, context |

---

## 🧠 DISCIPLINE DE MÉMOIRE UNIFIÉE

### 1. ANCRAGE DU STOCKAGE

#### Ordre de détection du mode de stockage

1. **Fichier `.env`** → `AGENT_DB_ROOT=/path/to/db` → Mode global
2. **Variable d'environnement** `AGENT_DB_ROOT` → Mode global
3. **Sinon** → Mode local

#### Mode LOCAL (par défaut)

```text
projet/
└── memory-database/
    ├── cache/
    │   └── runtime-cache.db
    ├── graph/
    │   ├── memory_mcp.db
    │   └── graph-memory.db
    └── vector/
        └── hphe-vec/           (index vectoriel hphe-mcp — usearch HNSW 2048D, NIM)
        (les stores v1 zvec-data/ + Qdrant :6333 sont archivés — voir _archive/agent-rag/)
```

#### Mode GLOBAL (via .env)

- **Emplacement** : `${AGENT_DB_ROOT}/current_workspace/`
- **Usage** : Partage de mémoire entre plusieurs projets/agents

##### Layout réel du store (`current_workspace/`)

Deux pipelines mémoire distincts — **ne pas fusionner** :

| Chemin | Rôle |
|---|---|
| `graph/` `cache/` `vector/` | KG d'ingestion/indexation (Beacon → distill, `ingest-workspace.ps1`, pont RAG) |
| `agentmemory/graph/` `agentmemory/cache/` | Mémoire conversationnelle MCP (schéma entities/observations/relations) — atteint aussi via `memory-database/agentmemory/` |
| `orchestrator.db` | Registry des tâches orchestrateur |

Les banques par projet du serveur `agentmemory` vivent **hors de cette vue** :
`${AGENTMEMORY_DATA_ROOT}/<projectId>/agentmemory/` (défaut :
`<install>/data/agentmemory`, cf. `HPHE_MEMORY_ROOT`). Aucun dossier `<nom-de-projet>/` ne doit apparaître
à la racine de `current_workspace` — si c'est le cas, un client a lancé le MCP
sans `AGENTMEMORY_DATA_ROOT`. Voir `_README.md` dans le store.

### 2. SOURCING SYSTÉMATIQUE

- **AVANT TOUTE TÂCHE** : Utiliser `memory_search()` pour identifier le contexte existant
- **DURÉE DE VIE** : Ne jamais supposer qu'une information est "connue" par défaut

### 3. TRACE DE DÉCISION (ADR)

- **APRÈS TOUTE DÉCISION** : Utiliser `memory_write()` pour documenter chaque choix structurel

---

## Politiques d'Accès

### Lecture

1. Vérifier le cache d'abord
2. Si miss, consulter vector store
3. Mettre à jour le cache avec les résultats

### Écriture

1. Écrire dans la base primaire
2. Invalider le cache concerné
3. Mettre à jour les indexes si nécessaire

### Consolidation

- Quotidienne pour les données anciennes
- Automatique basée sur l'usage
- Manuelle via API d'administration

---

## Sécurité

- Chiffrement des données sensibles
- Contrôle d'accès par rôle
- Audit trail complet
- Backup automatique

---

## Performance

- Latence cible: <100ms (cache), <500ms (vector)
- Disponibilité: 99.9%
- Scalabilité: Horizontale
- Monitoring: Métriques en temps réel

---

## Documents de Référence

| Document                   | Description                            |
| -------------------------- | -------------------------------------- |
| `ARCHITECTURE-ANALYSIS.md` | Architecture complète multi-bases      |
| `UNIFIED_MEMORY_SYSTEM.md` | Système de mémoire unifié (v2.1)       |
| `memory-policy.md`         | Politiques de gestion                  |
| `back-end/README.md`       | Archives et historique des changements |
