# Hermès Integration Layer — Hephaistos2-Kit Unified Memory System

Ce dossier contient la **couche d'intégration Hermès** — un module autonome conçu pour être injecté directement dans la configuration de Hermes (`~/.hermes/`).

Une fois injectée, cette couche donne à Hermes :
- La connaissance de la stack unifiée Hephaistos2-Kit v2 (`Hephaistos-everything-search` / hphe-mcp : recherche NTFS, contenu BM25, vectoriel, mémoire KV, orchestrateur + sqlite-node pour le KG)
- Les patterns d'usage des MCP unifiés
- Les règles spécifiques à ce système
- La capacité de travailler avec le stockage dual (local + global)

## Structure de la couche

```
.agent/hermes/layer/
├── SOUL.hermes-extension.md    # Extension du SOUL.md global de Hermes
├── AGENTS.md                   # Règles projet pour le workspace Hermès
├── skills-adapters/            # Adaptateurs de compétences pour Hermès
├── agents-ref/                 # Références aux agents Hephaistos
└── README.md                   # Documentation de la couche
```

## Injection dans Hermes

Pour installer cette couche dans Hermes :

```powershell
# Depuis le répertoire de Hephaistos2-Kit
pwsh -File .agent/hermes/inject-into-hermès.ps1

# Ou explicitement
pwsh -File .agent/hermes/inject-into-hermès.ps1 `
    -LayerPath .agent/hermes/layer `
    -HermèsHome $HOME/.hermes
```

Le script :
1. Copie `SOUL.hermes-extension.md` dans `~/.hermes/SOUL.hermes-extension.md`
2. Crée `~/.hermes/AGENTS.md` avec les règles du système de mémoire unifiée
3. Crée les répertoires `skills-adapters/` et `agents-ref/` dans `~/.hermes/`
4. Documente l'installation dans `~/.hermes/README.md`

## Ce que fait la couche injectée

### 1. Extension du SOUL.md global

Le fichier `SOUL.hermes-extension.md` est automatiquement chargé par Hermès après le `SOUL.md` principal. Il ajoute :

- La connaissance de hphe-mcp (recherche, mémoire, orchestrateur) et sqlite-node (KG)
- Les patterns d'usage prioritaires pour chaque outil
- Les règles spécifiques au système de mémoire unifiée de Hephaistos2-Kit
- La procédure de stockage dual (local + global via AGENT_DB_ROOT)

### 2. Règles projet (AGENTS.md)

Le fichier `AGENTS.md` dans `~/.hermes/` définit les règles applicables à TOUS les workspaces Hermès :

- Comment utiliser les MCP unifiés pour la mémoire, la recherche vectorielle, et le stockage
- Les procédures d'usage de la mémoire unifiée (sourcing systématique, traçage des décisions, etc.)
- Les règles de Clean Garden adaptées au système de mémoire

### 3. Adaptateurs de compétences

Le répertoire `skills-adapters/` contient des adaptateurs qui permettent à Hermès d'utiliser les compétences de Hephaistos2-Kit via les MCP. Ces adaptateurs fournissent :

- Des wrappers pour les appels MCP fréquents
- Des procédures d'interaction avec le système de mémoire
- Des fonctions utilitaires pour les opérations courantes

### 4. Références aux agents

Le répertoire `agents-ref/` contient des descriptions des agents Hephaistos2-Kit (orchestrator, project-planner, security-auditor, etc.) pour utilisation via `delegate_task` dans Hermès.

## Concept de couche

Cette approche permet de :

1. **Séparer la couche d'intégration du projet** : La couche Hermès peut être mise à jour indépendamment des projets qui l'utilisent
2. **Réutiliser la même couche pour tous les projets** : Une fois injectée dans Hermes, elle est disponible pour tous les workspaces
3. **Maintenir Hephaistos2-Kit intact** : Le projet original n'est pas modifié; la couche est un module adjacent
4. **Permettre une injection sélective** : L'utilisateur peut choisir d'injecter uniquement certaines parties de la couche

## Components détaillés

### SOUL.hermes-extension.md

Ce fichier s'applique au SOUL.md global de Hermès. Il ajoute :

```markdown
# Extension — Hephaistos2-Kit Unified Memory System

## 🧠 MCP UNIFIÉS DISPONIBLES

### hphe-mcp (`Hephaistos-everything-search`, ~58 outils)
- `everything_search` — index NTFS $MFT instantané (tout le disque)
- `content_search` / `semantic_search` / `hybrid_search` — contenu BM25 + vectoriel 2048D du workspace
- `vec_search` / `vec_stats` / `nim_embed` — vectoriel brut + embeddings NIM
- `memory_write/read/search/list/update/stats` — KV agentmemory par projet
- `fs_*` — fichiers bornés par `.mcp-access` (profil `external` = read-only)
- `dispatch_task`, `*_task`, `*_agent`, `available_models`, `nim_*` — orchestrateur + modèles

### sqlite-node MCP (KG read-mostly)
- `query_data` / `execute_query` — SQL sur les alias `memory` (memory_mcp.db), `graph` (edges), `cache`
- `list_tables` / `describe_table` / `list_databases` — introspection

## 📋 PROCÉDURES D'USAGE

### Mémoire unifiée — Flux de travail

1. **Début de session** : `memory_search` (contexte, préférences, décisions)
2. **Avant une tâche** : `hybrid_search`/`content_search` — réutiliser l'existant
3. **Après une décision** : `memory_write` + tags ; ADR `.agent/knowledge/decisions/` si structurelle
4. **Fin de session** : leçons via `memory_write` (tag `lesson`)

### Recherche — Routage

- Fichier par nom (disque) → `everything_search`
- Texte/code exact → `content_search` ; concept → `semantic_search` ; mixte → `hybrid_search`
- Souvenirs agents → `memory_search` + `sqlite-node` `memory`/`graph`

### Stockage dual

- **Local** : `memory-database/` dans le projet (jonction → global)
- **Global** : `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/`

## ⚠️ RÈGLES SPÉCIFIQUES

### Architecture mémoire
- Toutes les données de mémoire DOIVENT être stockées dans `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/`
- Ne pas créer de bases SQLite hors de ce chemin sans justification
- Tags `architecture`, `security`, `decision` systématiques

### Intégrité des données
- La junction entre local et global doit être maintenue
- KG = read-mostly (écritures via le pipeline d'ingestion `mirror_kg`)
```

### AGENTS.md (dans ~/.hermes/)

Ce fichier définit les règles pour tous les workspaces Hermès :

```markdown
# AGENTS.md — Hermès Global (Hephaistos2-Kit Integration)

> Ce fichier s'applique à TOUS les workspaces Hermès.
> Il complète les règles spécifiques à chaque projet.

---

## 🔗 MCP UNIFIÉS — USAGE GLOBAL

### Mémoire unifiée (Hephaistos2-Kit)

Les serveurs MCP suivants sont configurés globalement :

| Serveur | Type | Usage principal |
|---------|------|-----------------|
| **hphe-mcp** | Unifié (~58 outils) | Recherche, mémoire KV, orchestrateur, modèles |
| **sqlite-node** | SQLite | KG read-only, cache, orchestrator |
| **beacon** | Traces | Sessions cross-agents |

### Procédures obligatoires

1. **Avant toute tâche** : `memory_search` pour vérifier le contexte
2. **Après toute décision** : `memory_write` avec tags
3. **Recherche contenu** : `hybrid_search` / `content_search` ; fichiers : `everything_search`

### Stockage

- **Local** : `memory-database/` dans le projet
- **Global** : `${AGENT_DB_ROOT}/current_workspace/<PROJECT_ID>/`
- **Junction** : locale → global (gérée par `start-workspace.ps1`)

---

## 📋 RÈGLES GLOBALES

### Langue
- TOUS les agents communiquent en **français**

### Évaluation des skills (obligatoire)
- Avant tout code : inventorier les skills, évaluer, annoncer le plan

### Clean Garden
- Modifier avant de créer
- Pas de duplication
- Demander avant de placer

---

## 🏗️ RÉFÉRENCES

- **Documentation Hephaistos2-Kit** : `<KIT_ROOT>\.agent\hermes\README.md`
- **Config MCP** : `<KIT_ROOT>\.agent\mcp-config.json.exemple`
- **Architecture mémoire** : `<KIT_ROOT>\.agent\memory\ARCHITECTURE-ANALYSIS.md`
```

## Utilisation avec le script hermes-init.ps1

Le script `hermes-init.ps1` (déjà créé) peut être étendu pour utiliser cette couche :

```powershell
# Dans hermes-init.ps1, après les étapes 1-6 :

# 7. Injecter la couche Hermès si demandé
if ($InjectHermèsLayer) {
    Write-Host "[7/7] Injection de la couche Hermès..."
    & .agent/hermes/inject-into-hermès.ps1 -HermèsHome $HOME/.hermes
}
```

## Mise à jour de la couche

Pour mettre à jour la couche Injectée dans Hermès :

```powershell
# Réinjecter la couche (écrase les fichiers existants)
pwsh -File .agent/hermes/inject-into-hermès.ps1 -Force
```

## Retirer la couche

```powershell
# Retirer la couche de Hermès
Remove-Item "$HOME/.hermes/SOUL.hermes-extension.md" -Force
Remove-Item "$HOME/.hermes/AGENTS.md" -Force  # Si créé par l'injection
Remove-Item "$HOME/.hermes/hermes-integration/" -Recurse -Force
```

## Notes

- La couche ne remplace PAS le SOUL.md global de Hermès, elle s'y ajoute
- La couche ne modifie PAS les configurations de projet existantes
- La couche est réutilisable pour tous les projets Hermès
- La couche peut être mise à jour indépendamment de Hephaistos2-Kit
