> **OBSOLETE (v1)** — ce document décrit l architecture Python/Node pré-unification (Qdrant, Zvec, MCP séparés, Everything.exe). Conservé pour historique/rollback. Référence actuelle : `.agent/ARCHITECTURE.md` + `docs/hephaistos-engine/`.

# Analyse de l'Architecture Mémoire Multi-Bases

## 🔍 Vue d'Ensemble

Cette analyse détaille l'architecture de stockage distribuée du système de mémoire unifié.

---

## 1. Architecture Globale - Vue Macro

```mermaid
flowchart TB
    subgraph ENV["⚙️ CONFIGURATION (.env)"]
        DUAL_MODE["Mode DUAL activé"]
        GLOBAL_PATH["AGENT_DB_ROOT<br/><HEPHAISTOS_DATA>/"]
        JUNCTION["Junction Link<br/>memory-database → current_workspace"]
    end

    subgraph STORAGE["🗄️ STOCKAGE"]
        direction TB

        subgraph GLOBAL["🌍 GLOBAL (<HEPHAISTOS_DATA>/)"]
            GLOBAL_DB["current_workspace/"]
        end

        subgraph LOCAL["📁 LOCAL (Projet)"]
            LOCAL_DB["memory-database/<br/>← Junction (cache, graph, vector)"]
        end
    end

    subgraph SYNC["🔄 SYNCHRONISATION"]
        INGEST["Auto-Ingest Monitor"]
        SYNC_ARROW["Synchronisation DUAL"]
    end

    DUAL_MODE --> JUNCTION
    GLOBAL_PATH --> GLOBAL_DB
    JUNCTION --> LOCAL_DB

    GLOBAL_DB <-->|"Synchronisation"| LOCAL_DB

    INGEST --> SYNC_ARROW

    style ENV fill:#2d3748,stroke:#1a202c,color:#fff
    style GLOBAL fill:#1a365d,stroke:#1a202c,color:#fff
    style LOCAL fill:#2c5282,stroke:#1a202c,color:#fff
    style SYNC fill:#44337a,stroke:#1a202c,color:#fff
```

---

## 2. Structure Détaillée des Bases

```mermaid
flowchart LR
    subgraph LOCAL["📁 memory-database/"]
        direction TB

        subgraph CACHE["cache/"]
            RC2["runtime-cache.db<br/>└─ kv table<br/>   (key, value, updated_at)<br/>   ← MCP Cache Server"]
            SC2["semantic-cache.db<br/>└─ semantic_entries<br/>   (key, value, embedding, TTL)"]
        end

        subgraph GRAPH["graph/"]
            MCP["memory_mcp.db<br/>├─ entities<br/>├─ observations<br/>├─ relations<br/>└─ *_v2 tables"]
            GM["graph-memory.db<br/>└─ edges<br/>   (from_id, to_id, type)"]
        end

        subgraph VECTOR["vector/"]
            direction TB

            subgraph QDRANT["qdrant/"]
                QDB["qdrant.db<br/>└─ documents<br/>   (id, path, sha256, content)"]
            end

            subgraph ZVEC["zvec/"]
                ZDB["zvec.db<br/>└─ documents"]
                ZIDX["6 Indexs HNSW<br/>├─ entities_index<br/>├─ concepts_index<br/>├─ actions_index<br/>├─ relations_index<br/>├─ context_index<br/>└─ learning_insights"]
            end
        end
    end

    subgraph AGENT["📁 agentmemory/"]
        direction TB
        AC["cache/runtime-cache.db"]
        AG["graph/memory_mcp.db<br/>graph-memory.db"]
        AV["vector/qdrant/<br/>vector/zvec/"]
    end

    LOCAL -->|"Isolation Agents"| AGENT

    style LOCAL fill:#2c5282,stroke:#1a202c,color:#fff
    style AGENT fill:#1a365d,stroke:#1a202c,color:#fff
```

---

## 3. Rôle de Chaque Base de Données

```mermaid
mindmap
  root((Mémoire Unifiée))
    Cache
      semantic-cache.db
        Cache avec embeddings
        Recherche sémantique rapide
        TTL configurable
      runtime-cache.db
        Key-Value simple
        Accès ultra-rapide
        Pas d'embedding
    Graph
      memory_mcp.db
        Entités et observations
        Relations typées
        Knowledge Graph MCP
      graph-memory.db
        Arêtes simples
        Relations binaires
        Traversals rapides
    Vector
      qdrant.db
        2048 dimensions
        Catégorique
        Collections: code, doc, config
      zvec.db
        384 dimensions
        Sémantique
        Collections: concepts, entities
```

---

## 4. Flux de Données - Mode DUAL

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant Monitor as Auto-Ingest
    participant Global as GLOBAL Storage
    participant Local as LOCAL Storage
    participant MCP as MCP Servers

    User->>Monitor: Modification fichier

    par Ingestion Parallèle
        Monitor->>Global: Ingest <HEPHAISTOS_DATA_DIR>/memory
        Global-->>Monitor: OK
    and
        Monitor->>Local: Ingest memory-database/agentmemory
        Local-->>Monitor: OK
    end

    Note over Global,Local: Synchronisation DUAL

    User->>MCP: Requête mémoire
    MCP->>Local: Cache lookup
    Local-->>MCP: Résultat
    MCP-->>User: Réponse
```

---

## 5. Analyse des Redondances

```mermaid
flowchart TD
    subgraph VOLONTAIRE["✅ REDONDANCES VOLONTAIRES"]
        V1["semantic-cache.db ×2<br/>MCP direct + Persistance locale"]
        V2["runtime-cache.db ×3<br/>Isolation par couche"]
        V3["memory_mcp.db ×2<br/>Système vs Agents"]
        V4["Vector stores ×2<br/>Isolation agents/système"]
        V5["Zvec indexs ×2<br/>SQLite metadata + HNSW vectors"]
    end

    subgraph JUSTIFICATION["📋 JUSTIFICATIONS"]
        J1["Isolation des responsabilités"]
        J2["Performance (cache local par couche)"]
        J3["Résilience (pas de SPOF)"]
        J4["Mode DUAL = Global + Local synchronisés"]
    end

    VOLONTAIRE --> JUSTIFICATION

    style VOLONTAIRE fill:#276749,stroke:#1a202c,color:#fff
    style JUSTIFICATION fill:#2c5282,stroke:#1a202c,color:#fff
```

---

## 6. Schéma des Tables SQLite

### Cache Sémantique

```sql
-- semantic-cache.db
CREATE TABLE semantic_entries (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    embedding BLOB NOT NULL,      -- Vecteur 2048D ou 384D
    created_at INTEGER NOT NULL,
    expires_at INTEGER,           -- TTL
    metadata TEXT                 -- JSON
);
```

### Memory MCP (Knowledge Graph)

```sql
-- memory_mcp.db
CREATE TABLE entities (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    entityType TEXT NOT NULL,
    created_at DATETIME
);

CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    entity_id INTEGER REFERENCES entities(id),
    content TEXT NOT NULL,
    created_at DATETIME
);

CREATE TABLE relations (
    id INTEGER PRIMARY KEY,
    from_entity TEXT NOT NULL,
    to_entity TEXT NOT NULL,
    relationType TEXT NOT NULL,
    UNIQUE(from_entity, to_entity, relationType)
);
```

### Graph Memory (Arêtes)

```sql
-- graph-memory.db
CREATE TABLE edges (
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(from_id, to_id, type)
);
```

### Vector Stores

```sql
-- qdrant.db / zvec.db
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    content BLOB NOT NULL,
    updated_at TEXT NOT NULL
);

-- zvec/*/metadata.db (par index)
CREATE TABLE config (
    name TEXT NOT NULL,
    dimensions INTEGER NOT NULL,   -- 384 pour zvec
    distance TEXT NOT NULL,        -- Cosine/Euclid/Dot
    enableHybrid INTEGER NOT NULL,
    documentCount INTEGER
);

CREATE TABLE documents (
    doc_id TEXT PRIMARY KEY,
    label INTEGER UNIQUE,
    text TEXT,
    metadata TEXT                  -- JSON
);
```

---

## 7. Collections Vectorielles

```mermaid
flowchart LR
    subgraph QDRANT["QDRANT (2048D - Catégorique)"]
        Q1["code_index"]
        Q2["doc_index"]
        Q3["config_index"]
        Q4["workflow_index"]
        Q5["skill_index"]
    end

    subgraph ZVEC["ZVEC (384D - Sémantique)"]
        Z1["entities_index"]
        Z2["concepts_index"]
        Z3["actions_index"]
        Z4["relations_index"]
        Z5["context_index"]
        Z6["learning_insights"]
    end

    subgraph ROUTING["Routage Dual"]
        R1["Tags Categorique → Qdrant"]
        R2["Tags Sémantique → Zvec"]
        R3["Tags Mixtes → Les deux"]
    end

    ROUTING --> QDRANT
    ROUTING --> ZVEC

    style QDRANT fill:#2c5282,stroke:#1a202c,color:#fff
    style ZVEC fill:#553c9a,stroke:#1a202c,color:#fff
    style ROUTING fill:#744210,stroke:#1a202c,color:#fff
```

---

## 8. Recommandations

### ✅ Optimisations Implémentées

1. **Unification des caches runtime** - RÉALISÉ
   - Cache agentmemory obsolète supprimé (données périmées: 1 fichier vs 150)
   - Architecture réduite de 3 → 2 copies (MCP + Système)
   - Voir: `back-end/README.md`

2. **Clarification graph-memory vs memory_mcp** - DOCUMENTÉ
   - `memory_mcp.db`: Knowledge Graph riche (~225k entités, ~315k observations, ~676k relations — après migration unifiée 2026-10)
   - `graph-memory.db`: Graphe de traversal (edges simples)
   - Voir: `UNIFIED_MEMORY_SYSTEM.md`

3. **Mode DUAL bien conçu** - La synchronisation Global/Local est appropriée pour le partage multi-projets

### Points Positifs

- ✅ Isolation claire entre agents et système
- ✅ Cache multi-niveaux pour performance
- ✅ Routage dual Qdrant/Zvec pour recherche hybride
- ✅ Knowledge Graph intégré (Memory MCP)
- ✅ Mode DUAL pour partage inter-projets

---

## 9. Conclusion

L'architecture présente des **redondances volontaires et justifiées**:

| Type   | Redondance                      | Nécessité                            | Statut       |
| ------ | ------------------------------- | ------------------------------------ | ------------ |
| Cache  | **SQLite unifié** (cache_table) | **Haute** - Performance et isolation | ✅ Optimisé  |
| Graph  | 2 copies (complémentaires)      | **Moyenne** - Rôles distincts        | ✅ Documenté |
| Vector | 2 copies                        | **Haute** - Routage dual 2048D/384D  | ✅ Conservé  |

### Données Réelles (après optimisation)

| Base                      | Entités | Observations | Relations/Edges |
| ------------------------- | ------- | ------------ | --------------- |
| memory_mcp.db (unifié)    | ~225k   | ~315k        | ~676k           |
| graph-memory.db (système) | -       | -            | edges           |

> Les stores agents legacy ont été archivés sous `_archive/2026-10-06/` lors de la migration unifiée — il n'y a plus de copie projet-locale séparée.

La synchronisation DUAL-MODE entre stockage global et local est **architecturalement saine** pour un système de mémoire unifié multi-agents.
