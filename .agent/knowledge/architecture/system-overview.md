> **OBSOLETE (v1)** — ce document décrit l architecture Python/Node pré-unification (Qdrant, Zvec, MCP séparés, Everything.exe). Conservé pour historique/rollback. Référence actuelle : `.agent/ARCHITECTURE.md` + `docs/hephaistos-engine/`.

# Vue d'Ensemble du Système Cascade

**Version:** 2.0
**Date:** 2026-04-06
**Statut:** ✅ Opérationnel

---

## Architecture Globale

```mermaid
graph TB
    subgraph "Interface Utilisateur"
        UI[Desk-Top UI]
    end

    subgraph "Couche MCP"
        MCP[MCP Router]
        CACHE[Cache Server]
        MEMORY[Memory Server]
        ORCH[Orchestrator Server]
    end

    subgraph "Stockage Unifié"
        CACHE_DB[(Cache Runtime<br/>2 copies optimisées)]
        MEMORY_DB[(Memory MCP<br/>82 entités, 584 relations)]
        VECTOR_DB[(Vector Store<br/>Qdrant 1536D + Zvec 384D)]
        GRAPH_DB[(Graph Memory<br/>530 edges)]
    end

    subgraph "Knowledge Base"
        ARCH[Architecture Docs]
        DEC[Decisions ADR]
        EMBED[Embeddings Dual]
    end

    UI --> MCP
    MCP --> CACHE
    MCP --> MEMORY
    MCP --> ORCH

    CACHE --> CACHE_DB
    MEMORY --> MEMORY_DB
    MEMORY --> GRAPH_DB
    ORCH --> VECTOR_DB

    ARCH --> EMBED
    DEC --> ARCH
```

---

## Composants Principaux

### 1. Interface Utilisateur (Desk-Top)

- Interface web moderne avec React
- Accès direct aux configurations MCP
- Tableau de bord des agents
- Visualisation des connaissances

### 2. Couche MCP (Model Context Protocol)

- **Router**: Orchestration des requêtes
- **Cache**: Accès rapide aux données (base unifiée)
- **Memory**: Gestion des connaissances (Knowledge Graph)
- **Orchestrator**: Coordination des agents

### 3. Stockage Unifié (v2.0)

#### Cache Runtime (Unifié)

| Base                                     | Usage                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ |
| current_workspace/cache/runtime-cache.db | MCP Cache Server + Système + Agents (via `memory-database/cache/`) |

**Réduction:** 3 copies → 1 base unifiée

#### Graph Memory (Complémentaire)

| Base            | Rôle            | Données                                     |
| --------------- | --------------- | ------------------------------------------- |
| memory_mcp.db   | Knowledge Graph | 82 entités, 131 observations, 584 relations |
| graph-memory.db | Traversals      | 530 edges simples                           |

#### Vector Store (Dual)

| Store  | Dimensions | Usage                           |
| ------ | ---------- | ------------------------------- |
| Qdrant | 1536D      | Catégorique (code, doc, config) |
| Zvec   | 384D       | Sémantique (entities, concepts) |

### 4. Base de Connaissances

- **Architecture**: Documentation système
- **Decisions**: ADRs et choix techniques
- **Embeddings**: Représentations vectorielles dual

---

## Flux de Données

1. **Requête Utilisateur** → UI
2. **UI** → MCP Router
3. **Router** → Cache lookup
4. **Cache miss** → Vector Store (Qdrant/Zvec)
5. **Relations** → Memory MCP
6. **Résultat** → UI

---

## Sécurité

- Authentification JWT
- Chiffrement des données sensibles
- Isolation des agents
- Audit logging complet

---

## Performance

- Cache multi-niveaux (2 copies optimisées)
- Parallélisation des recherches (Qdrant + Zvec)
- Latence cible: <100ms (cache), <500ms (vector)
- Disponibilité: 99.9%

---

## Documents de Référence

| Document                        | Description                        |
| ------------------------------- | ---------------------------------- |
| `ARCHITECTURE-ANALYSIS.md`      | Architecture complète multi-bases  |
| `RAG-AUDIT-REPORT.md`           | Audit système RAG (Score: 100/100) |
| `memory-policy.md`              | Politiques de gestion              |
| `CACHE-RUNTIME-UNIFICATION.md`  | Optimisation caches                |
| `GRAPH-MEMORY-CLARIFICATION.md` | Rôles graph-memory vs memory_mcp   |
