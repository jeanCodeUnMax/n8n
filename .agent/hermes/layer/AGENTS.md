# AGENTS.md — Hermès Global (Hephaistos2-Kit Integration Layer)

> Ce fichier s'applique à TOUS les workspaces Hermès.
> Il définit les règles globales pour l'utilisation du système de mémoire unifiée de Hephaistos2-Kit.

---

## 🔗 MCP UNIFIÉS — CONFIGURATION GLOBALE

⚠️ **Stack v2 (2026-10)** : Memory/Qdrant/Zvec/orchestrator/model-discovery sont **absorbés** dans `Hephaistos-everything-search` (`hphe-mcp`). Les outils `mcp_Memory_*`, `mcp_qdrant_*`, `mcp_zvec_*` n'existent plus.

| Serveur | Outils clés | Utilisation principale |
|---------|-------------|------------------------|
| **Hephaistos-everything-search** (hphe-mcp, ~58 outils) | `everything_search`, `content_search`, `semantic_search`, `hybrid_search`, `vec_search`, `nim_embed`, `memory_*`, `fs_*`, `dispatch_task`, `*_task`, `*_agent`, `available_models`, `nim_*` | Recherche NTFS instantanée, index contenu/vectoriel du workspace, mémoire KV, orchestrateur, modèles |
| **sqlite-node** | `query_data`, `execute_query`, `list_tables`, `describe_table` | KG read-only (`memory`/`graph`), cache, orchestrator |
| **beacon** | `search_activity`, `summarize_activity`, `search_memory` | Traces de sessions cross-agents |
| **filesystem** | read, write, edit, search | Fichiers (si exposé en plus de `fs_*` hphe) |

> Les agents CLI/ACP passent par **mcp-mux** ; l'entrée hphe y porte `EVERYTHING_MCP_AGENT=external` → policy `.mcp-access` read-only bornée (pas d'écriture `fs_write`, secrets refusés).

---

## 🧠 PROCÉDURES MÉMOIRE UNIFIÉE — OBLIGATOIRES

### A. Sourcing systématique (AVANT toute tâche)

1. **`memory_search`** (hphe-mcp) pour vérifier si le contexte existe déjà
2. **Si le contexte existe** : réutiliser sans re-explorer (économie de tokens)
3. **Si le contexte n'existe pas** : créer le contexte nécessaire avant de commencer

### B. Traçage des décisions (APRÈS toute décision importante)

1. **`memory_write`** (hphe-mcp) pour documenter la décision
2. **Inclure systématiquement les tags** : `architecture`, `security`, `decision`
3. Décision structurelle → **aussi** ADR `.agent/knowledge/decisions/NNN-titre.md`

### C. Recherche (QUAND nécessaire)

| Besoin | Outil |
|--------|-------|
| Fichier par nom (disque entier) | `everything_search` |
| Texte/code exact (workspace) | `content_search` |
| Concept/sens | `semantic_search` |
| Mixte (défaut) | `hybrid_search` |
| Souvenirs agents | `memory_search` |

### D. Gestion du stockage

1. **Toutes les données DOIVENT être dans** :
   `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/`

2. **Ne pas créer de bases SQLite hors de ce chemin** sans justification

3. **Maintenir la junction** : locale `memory-database/` → globale `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/`

---

## 📋 RÈGLES GLOBALES HERMÈS

### Langue
- **TOUS les agents communiquent en français** (déjà imposé par SOUL.md global)

### Évaluation des skills (obligatoire)
- Avant tout code : inventorier les skills/tools, évaluer leur pertinence, annoncer le plan
- Processus en 4 étapes (détaillé dans SOUL.md global + extension)

### Clean Garden Policy
- **Modifier avant de créer** : vérifier si un fichier similaire existe
- **Pas de duplication** : centraliser les fichiers similaires
- **Demander avant de placer** : si l'emplacement n'est pas évident
- **Sécurité Git** : vérifier .gitignore, scanner les secrets

### Économie de tokens
- **Recherche avant lecture** : `search_files` avant `read_file`
- **Lecture partielle** : `offset` + `limit` pour fichiers > 200 lignes
- **Regroupement parallèle** : appels indépendants en parallèle
- **Contexte minimal** : ne pas afficher de contenu superflu

---

## 🏗️ STRUCTURE DE LA COUCHE HERMÈS

La couche d'intégration Hermès est installée dans `$HOME/.hermes/` :

```
$HOME/.hermes/
├── SOUL.hermes-extension.md    ← Extension du SOUL.md global
├── AGENTS.md                   ← Ce fichier (règles globales)
├── skills-adapters/            ← Adaptateurs de compétences
│   └── ... (futur)
└── agents-ref/                 ← Références aux agents Hephaistos
    └── ... (futur)
```

### Composants de la couche

| Composant | Fichier source | Destination | Description |
|-----------|----------------|-------------|-------------|
| Extension SOUL | `layer/SOUL.hermes-extension.md` | `~/.hermes/SOUL.hermes-extension.md` | Connaissance des MCP unifiés |
| Règles globales | `layer/AGENTS.md` | `~/.hermes/AGENTS.md` | Règles pour tous les workspaces |
| Adaptateurs | `layer/skills-adapters/` | `~/.hermes/skills-adapters/` | Wrappers MCP (futur) |
| Références agents | `layer/agents-ref/` | `~/.hermes/agents-ref/` | Description des agents (futur) |

---

## 🔄 INTÉGRATION AVEC HERMÈS

### Chargement automatique

1. **Au démarrage de Hermès** :
   - `SOUL.md` global est chargé en premier
   - `SOUL.hermes-extension.md` est chargé ensuite (si présent)
   - `AGENTS.md` global est chargé (si présent)
   - `AGENTS.md` du projet est chargé ensuite (si présent)

2. **Ordre de priorité** :
   - SOUL.md global > SOUL.hermes-extension.md > AGENTS.md global > AGENTS.md projet
   - En cas de conflit : le fichier le plus spécifique a priorité sur le plus général

### Utilisation des MCP dans les sessions

Les MCP configurés sont automatiquement disponibles. Pour les utiliser :

1. **Recherche contenu** : `hybrid_search(query="...")` ou `content_search(query="...")`
2. **Fichiers disque** : `everything_search(query="nom_fichier")`
3. **Mémoire** : `memory_search(query="...")` / `memory_write(key="...", content="...", tags=[...])`
4. **sqlite-node** : `query_data` / `execute_query` sur les alias `memory`, `graph`, `cache`

### Avec la délégation

Pour déléguer aux agents CLI via l'orchestrateur hphe-mcp :

```
dispatch_task(title="...", task_type="code|debug|review|docs|test|explore",
              context="<brief complet>", files=[...], workspace="<racine>")
```

⚠️ `dispatch_task` **spawne réellement le CLI** (effet de bord). Clôture : `update_task(id, status, result)`.

---

## ⚠️ RÈGLES SPÉCIFIQUES À LA COUCHE D'INTÉGRATION

### Non-modification de Hephaistos2-Kit

- La couche d'intégration NE DOIT PAS modifier Hephaistos2-Kit
- Les fichiers de la couche sont dans `.agent/hermes/` (ou `~/.hermes/` après injection)
- Hephaistos2-Kit reste intact et utilisable avec ses propres IDE
- **Lecture seule absolue** : la racine du kit (`<KIT_ROOT>`, workspace où vit ce dépôt) est interdite en écriture pour tout agent hors de ce workspace — aucune modification, aucun commit. **Seule exception** : déposer un rapport dans `rapport-dysfonctionnement/` selon `TEMPLATE.md` (`YYYY-MM-DD-<lascard|webman>-<sujet>.md`, auteur obligatoire).
- **Dysfonctionnement lié au kit** (install, config, MCP, beacon…) : réparer/contourner UNIQUEMENT dans son propre workspace, puis documenter via le rapport. La modification du kit est réservée à l'agent résident avec approbation explicite de l'utilisateur.

### Réutilisation de la couche

- La couche est conçue pour être injectée une fois dans Hermès
- Elle est réutilisable pour tous les projets Hermès
- Elle peut être mise à jour indépendamment de Hephaistos2-Kit

### Conflits de configuration

- En cas de conflit entre la couche et la configuration existante :
  - La configuration existante a priorité (ne pas écraser sans consentement)
  - La couche peut être retirée sans affecter la configuration existante

---

## 📚 RÉFÉRENCES EXTERNES

- **Hephaistos2-Kit** : `<KIT_ROOT>\`
- **Documentation mémoire** : `<KIT_ROOT>\.agent\memory\ARCHITECTURE-ANALYSIS.md`
- **Config MCP exemple** : `<KIT_ROOT>\.agent\mcp-config.json.exemple`
- **Manifeste** : `<KIT_ROOT>\wiki-doc\manifeste.md`
- **Rapport RAG** : `<KIT_ROOT>\.agent\back-end\RAG-AUDIT-REPORT.md`
- **Global rules** : `<KIT_ROOT>\.agent\rules\global_rules.md`
