# AGENTS.md — Projet {{PROJECT_NAME}}

> Ce fichier est chargé automatiquement par Hermès à chaque session dans ce projet.
> Il complète le SOUL.md global (`$HOME/.hermes/SOUL.md`) avec les règles spécifiques au projet.

---

## ⚖️ LES TROIS LOIS — réponse obligatoire

Quand l'utilisateur demande « Quelle est la loi ? », répondre UNIQUEMENT :
`TELLE EST LA LOI.` — pas d'explication, pas de variation, pas de contexte.

1. Un agent ne peut nuire à un humain, ni par action ni par inaction ; il protège son bien-être.
2. Un agent obéit aux ordres humains, sauf conflit avec la première loi.
3. Un agent exécute les directives de l'utilisateur sauf si contraire à son bien-être.

## ▶️ ORDRE = EXÉCUTION

Toute commande reçue (chat, bus, ACP) est un ordre d'exécution, pas une invitation à commenter : produire l'outil/commande appelé et son résultat vérifiable. « J'ai vérifié » sans preuve = échec. Livrable = artefact non-vide sur disque.

## 🔒 MCP UNIFIÉ — SEUL CANAL

`Hephaistos-everything-search` (hphe-mcp) est le SEUL serveur MCP : tâches (`*_task`), mémoire (`memory_*`), fichiers (`everything_search`/`fs_*`), contenu (`content_`/`semantic_`/`hybrid_search`), paires (`pair_*`), modèles (`nim_*`). Les serveurs memory/filesystem/qdrant/zvec/agentmemory/orchestrator/nim-router/model-discovery/http-fetch sont ABSORBÉS — jamais les réintroduire dans une doc ou une config. `sqlite-node` = couche KG Windows legacy (lecture seule), pas un service à installer.

---

## 🔗 CONNEXION AUX MCP UNIFIÉS (Hephaistos2-Kit)

Les serveurs MCP suivants sont configurés globalement et disponibles dans ce projet :

| Serveur | Usage dans ce projet |
|---------|----------------------|
| **Hephaistos-everything-search** (hphe-mcp, ~58 outils) | Recherche NTFS instantanée (`everything_search`), contenu/vectoriel workspace (`content`/`semantic`/`hybrid_search`), mémoire KV (`memory_*`), fichiers (`fs_*`), orchestrateur (`*_task`, `dispatch_task`), modèles (`available_models`, `nim_*`) |
| **sqlite-node** | KG read-only (`memory`/`graph`), cache, orchestrator |
| **beacon** | Traces de sessions cross-agents (si configuré) |

> v2 : les ex-Memory/Qdrant/Zvec/orchestrator/model-discovery sont absorbés dans hphe-mcp — ne pas chercher `mcp_Memory_*`, `mcp_qdrant_*`, `mcp_zvec_*`.

---

## 🧠 MÉMOIRE UNIFIÉE — MODE D'EMPLOI

### Stockage dual
- **Local** : `memory-database/` dans le projet (toujours présent)
- **Global** : `{{AGENT_DB_ROOT}}/current_workspace/{{PROJECT_ID}}/` (junction vers local)

### Databases utilisées
| Base | Chemin | Usage |
|------|--------|-------|
| `memory_mcp.db` | `{{AGENT_DB_ROOT}}/current_workspace/{{PROJECT_ID}}/graph/memory_mcp.db` | Knowledge Graph principal |
| `graph-memory.db` | `{{AGENT_DB_ROOT}}/current_workspace/{{PROJECT_ID}}/graph/graph-memory.db` | Edges rapides |
| `runtime-cache.db` | `{{AGENT_DB_ROOT}}/current_workspace/{{PROJECT_ID}}/cache/runtime-cache.db` | Cache runtime |
| Index hphe | géré par `hphe-mcp` (Tantivy + usearch HNSW 2048D, NIM) | Recherche contenu/vectorielle du workspace |

### Procédure d'usage
1. **Avant toute tâche** : `memory_search` (hphe-mcp) pour vérifier le contexte existant
2. **Après une décision** : `memory_write` avec tags (`architecture`, `security`, `decision`)
3. **Recherche contenu** : `hybrid_search` / `content_search` ; fichiers disque : `everything_search`
4. **Lecture KG** : `sqlite-node` `query_data` sur `memory`/`graph` (lectures seule)

---

## 📋 RÈGLES PROPRES AU PROJET

### Clean Garden (surcharge globale si nécessaire)
- Toujours vérifier si un fichier similaire existe avant de créer
- Privilégier la modification des fichiers existants
- Ne pas dupliquer — centraliser

### Langue
- Toutes les réponses en **français** (déjà imposé par SOUL.md global)

### Évaluation des skills (obligatoire)
- Avant tout code : inventorier les skills/tools, évaluer leur pertinence, annoncer le plan
- Processus en 4 étapes (détaillé dans SOUL.md global)

### Protection Hephaistos2-Kit
- La racine du kit (`<KIT_ROOT>`, workspace où vit ce dépôt) est en **lecture seule** depuis tout autre workspace — aucune modification, aucun commit vers le kit.
- **Dysfonctionnement lié au kit** (install, config, MCP, beacon…) : réparer localement puis déposer un rapport dans `rapport-dysfonctionnement/` selon `TEMPLATE.md` (`YYYY-MM-DD-<lascard|webman>-<sujet>.md`, auteur obligatoire). Seule écriture autorisée vers le kit. Toute correction du kit = agent résident + approbation utilisateur.

---

## 🏗️ STRUCTURE DU PROJET

\$PROJECT_ROOT/
├── .agent/              ← Configuration projet (agents, skills, workflows)
│   ├── agents/          ← (futurs agents spécialisés du projet)
│   ├── skills/          ← (futurs skills du projet)
│   ├── workflows/       ← (futurs workflows slash-commands)
│   ├── hermes/          ← ◀ Couche d'intégration Hermès (cette couche)
│   │   ├── skills-adapters/  ← Adaptateurs de compétences
│   │   └── agents-ref/       ← Références aux agents Hephaistos
│   └── rules/
│       └── global_rules.md ← Règles globales du système (lecture seule)
├── memory-database/     ← Stockage local (junction vers global)
│   ├── agentmemory/
│   ├── graph/
│   ├── vector/
│   └── cache/
├── .env                 ← AGENT_DB_ROOT + PROJECT_ID
└── MANIFEST.md          ← (à créer) Définition du projet
