#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Hermes-compatible injection du système de mémoire unifiée Hephaistos2-Kit dans un workspace Hermès.
.DESCRIPTION
    Crée la structure .agent/hermes/ dans un projet Hermès pour utiliser les MCP unifiés
    (serveur unifié hphe-mcp : recherche, mémoire, fichiers, orchestrateur, NIM + sqlite-node KG), le stockage dual (local+global), et les conventions
    du projet, sans modifier le projet Hephaistos2-Kit source ni supprimer l'injection existante.
.PARAMETER ProjectPath
    Chemin du workspace Hermès cible (par défaut: pwd)
.PARAMETER DbRoot
    Racine globale de stockage (AGENT_DB_ROOT). Par défaut: <HEPHAISTOS_DATA> (comme dans .env.example)
.PARAMETER ProjectId
    Identifiant du projet pour l'isolation mémoire. Par défaut: nom du répertoire.
.EXAMPLE
    ./hermes-init.ps1 -ProjectPath <PROJECTS_ROOT>/mon-projet-hermès
.EXAMPLE
    ./hermes-init.ps1 -ProjectPath <PROJECTS_ROOT>/marotte -ProjectId marotte
#>
[CmdletBinding()]
param(
    [string]$ProjectPath = (Get-Location).Path,
    [string]$DbRoot = "<HEPHAISTOS_DATA>",
    [string]$ProjectId = (Split-Path $ProjectPath -Leaf)
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Resolve-Path $ProjectPath
$AgentDir = Join-Path $ProjectRoot '.agent'
$HermesDir = Join-Path $AgentDir 'hermes'
$MemoryDbDir = Join-Path $ProjectRoot 'memory-database'
$CurrentWorkspace = Join-Path $DbRoot 'current_workspace'
$ProjectWorkspace = Join-Path $CurrentWorkspace $ProjectId

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  HERMÈS INJECTION — Hephaistos2-Kit" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "Projet cible : $ProjectRoot"
Write-Host "ProjectId    : $ProjectId"
Write-Host "AGENT_DB_ROOT: $DbRoot"
Write-Host "Workspace    : $ProjectWorkspace`n"

# ============================================================
# 1. CRÉER LA STRUCTURE DE STOCKAGE LOCALE (si absente)
# ============================================================
Write-Host "[1/6] Structure de stockage locale..." -ForegroundColor Yellow

$localDirs = @(
    (Join-Path $MemoryDbDir 'agentmemory'),
    (Join-Path $MemoryDbDir 'graph'),
    (Join-Path $MemoryDbDir 'vector'),
    (Join-Path $MemoryDbDir 'cache')
)
foreach ($d in $localDirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  + $d" -ForegroundColor Gray
    }
}

# ============================================================
# 2. JUNCTION VERS STOCKAGE GLOBAL (mode dual, comme start-workspace.ps1)
# ============================================================
Write-Host "[2/6] Junction stockage global..." -ForegroundColor Yellow

if (-not (Test-Path $ProjectWorkspace)) {
    New-Item -ItemType Directory -Path $ProjectWorkspace -Force | Out-Null
    Write-Host "  + $ProjectWorkspace (créé)" -ForegroundColor Green
}

# Créer les sous-dossiers globaux si absents
$globalSubdirs = @('cache', 'graph', 'vector')   # v2 : plus de vector/zvec-data (store absorbé dans hphe-vec)
foreach ($sub in $globalSubdirs) {
    $gd = Join-Path $ProjectWorkspace $sub
    if (-not (Test-Path $gd)) {
        New-Item -ItemType Directory -Path $gd -Force | Out-Null
    }
}

# Établir la junction locale -> global (comme start-workspace.ps1 le fait)
$localMemoryDb = Join-Path $ProjectRoot 'memory-database'
if (-not (Test-Path $localMemoryDb)) {
    New-Item -ItemType Junction -Path $localMemoryDb -Target $ProjectWorkspace -Force | Out-Null
    Write-Host "  ~ memory-database -> $ProjectWorkspace (junction)" -ForegroundColor Cyan
} else {
    Write-Host "  ~ memory-database déjà existant (skip junction)" -ForegroundColor Gray
}

# ============================================================
# 3. CRÉER .agent/hermes/ (couche d'intégration Hermès)
# ============================================================
Write-Host "[3/6] Couche d'intégration Hermès..." -ForegroundColor Yellow

$hermesSubdirs = @('skills-adapters', 'agents-ref')
foreach ($sub in $hermesSubdirs) {
    $d = Join-Path $HermesDir $sub
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

# ============================================================
# 4. FICHIER .env (si absent — pour AGENT_DB_ROOT)
# ============================================================
Write-Host "[4/6] Variable d'environnement..." -ForegroundColor Yellow

$envFile = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $envFile)) {
    $envContent = @"
# Hephaistos2-Kit — Configuration mémoire unifiée (couche agent Hermes)
# Autorisé: modification, ajout de clés.
# Ne pas committer les secrets.

AGENT_DB_ROOT=$DbRoot
PROJECT_ID=$ProjectId
"@
    $envContent | Set-Content -Path $envFile -Encoding UTF8
    Write-Host "  + .env créé" -ForegroundColor Green
} else {
    # Ajouter AGENT_DB_ROOT si absent
    $envContent = Get-Content $envFile -Raw
    if ($envContent -notmatch 'AGENT_DB_ROOT=') {
        Add-Content -Path $envFile -Value "`nAGENT_DB_ROOT=$DbRoot" -Encoding UTF8
        Write-Host "  ~ AGENT_DB_ROOT ajouté à .env existant" -ForegroundColor Cyan
    } else {
        Write-Host "  ~ .env déjà configuré (skip)" -ForegroundColor Gray
    }
}

# ============================================================
# 5. FICHIER AGENTS.md (règles projet compatibles Hermès)
# ============================================================
Write-Host "[5/6] Fichier AGENTS.md (règles projet)..." -ForegroundColor Yellow

$agentsMd = @"
# AGENTS.md — Projet $ProjectId

> Ce fichier est chargé automatiquement par Hermès à chaque session dans ce projet.
> Il complète le SOUL.md global (`$HOME/.hermes/SOUL.md`) avec les règles spécifiques au projet.

---

## 🔗 CONNEXION AU MCP UNIFIÉ (Hephaistos2-Kit)

**UN SEUL serveur canonique : `Hephaistos-everything-search` (hphe-mcp, 65 outils).**
Il absorbe les ex-serveurs Memory/Qdrant/Zvec/orchestrator/nim-router/model-discovery/
filesystem — ces serveurs n'existent plus, ne jamais les réintroduire ni utiliser les
noms `mcp_Memory_*`, `mcp_qdrant_*`, `mcp_zvec_*`, `mcp_filesystem_*`.

| Famille d'outils hphe-mcp | Usage dans ce projet |
|---------------------------|----------------------|
| `everything_search`/`search_files`/`fs_*` | Localisation + lecture/écriture fichiers |
| `content_search`/`semantic_search`/`hybrid_search`/`vec_search`/`nim_embed` | Recherche contenu BM25 + vectoriel 2048D |
| `memory_*` | Mémoire unifiée KV (search/read/write/update/list/stats) |
| `create_task`/`dispatch_task`/`list_tasks`/`update_task`/`get_next_task`/`register_agent`/`pair_*` | Orchestrateur + binômes |
| `nim_*`/`available_models` | Modèles NIM |

| Serveurs complémentaires (réels) | Usage |
|---------|--------|
| **sqlite-node** | KG read-only (`memory`/`graph`), cache — Windows direct uniquement |
| **kaggle** | Compétitions, datasets, kernels (si pertinent) |
| **colab-mcp** | Session Colab (si pertinent) |
| **context7** | Docs libraries (si pertinent) |

> Accès distant (laptop/agents hors Windows) : MCP-over-SSH `ssh -T win-mcp`
> (commande forcée vers hphe-mcp.exe — voir docs/cerberos-mcp-mux-config.md).

---

## 🧠 MÉMOIRE UNIFIÉE — MODE D'EMPLOI

### Stockage dual
- **Local** : `memory-database/` dans le projet (toujours présent)
- **Global** : `<HEPHAISTOS_DATA>/current_workspace/$ProjectId/` (junction vers local)

### Databases utilisées
| Base | Chemin | Usage |
|------|--------|-------|
| `memory_mcp.db` | `<HEPHAISTOS_DATA>/current_workspace/$ProjectId/graph/memory_mcp.db` | Knowledge Graph principal |
| `graph-memory.db` | `<HEPHAISTOS_DATA>/current_workspace/$ProjectId/graph/graph-memory.db` | Edges rapides |
| `runtime-cache.db` | `<HEPHAISTOS_DATA>/current_workspace/$ProjectId/cache/runtime-cache.db` | Cache runtime |
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

---

## 🏗️ STRUCTURE DU PROJET

\$ProjectRoot/
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
"@

$agentsPath = Join-Path $ProjectRoot 'AGENTS.md'
$agentsMd | Set-Content -Path $agentsPath -Encoding UTF8
Write-Host "  + AGENTS.md créé" -ForegroundColor Green

# ============================================================
# 6. FICHIER SOUL.HERMES.MD (identité session sur mesure)
# ============================================================
Write-Host "[6/6] Fichier SOUL.hermes.md (identité session)..." -ForegroundColor Yellow

$soulHermes = @"
# SOUL.hermes.md — Session identity override for $ProjectId

> Ce fichier S'APPLIQUE sur le SOUL.md global (`$HOME/.hermes/SOUL.md`) quand
> Hermès démarre dans ce projet. Il ajoute des règles spécifiques au projet.

---

## 🎯 CONTEXTE DU PROJET

- **Nom** : $ProjectId
- **Chemin** : $ProjectRoot
- **AGENT_DB_ROOT** : $DbRoot
- **Workspace mémoire** : $ProjectWorkspace

---

## 🔗 MCP TOOLS — Usage prioritaire dans ce projet

### Mémoire (prioritaire absolu — hphe-mcp `Hephaistos-everything-search`)
1. `memory_search` — Avant toute tâche, chercher le contexte existant
2. `memory_write` / `memory_update` — Après toute décision, tracer avec tags

### Recherche (hphe-mcp)
3. `hybrid_search` / `content_search` — contenu workspace (BM25 + vectoriel 2048D)
4. `everything_search` — fichiers par nom sur tout le disque (NTFS $MFT)
5. `semantic_search` — sens/concept ; `vec_search` + `nim_embed` pour le vectoriel brut

### SQLite (KG legacy — Windows direct seulement)
6. `sqlite-node` `query_data` — SELECT (alias `memory`/`graph`/`cache`, KG read-only)
7. `sqlite-node` `execute_query` — INSERT/UPDATE/DELETE (hors KG/orchestrator)

### Fichiers (hphe-mcp `fs_*`)
9. `fs_read_file` / `fs_write_file` / `fs_edit_file`
10. `fs_list_directory` / `fs_search_files`
11. `fs_directory_tree`

---

## ⚠️ RÈGLES SPÉCIFIQUES À CE PROJET

### Architecture mémoire
- Toutes les données de mémoire DOIVENT être stockées dans `${AGENT_DB_ROOT}/current_workspace/$ProjectId/`
- Ne pas créer de bases SQLite hors de ce chemin sans justification
- Utiliser les tags `architecture`, `security`, `mcp-tool` systématiquement

### Chemins
- Les chemins absolus dans ce projet utilisent la racine : $ProjectRoot
- Les chemins relatifs sont exprimés depuis $ProjectRoot

### Communiquer en français
- Obligatoire (déjà imposé par SOUL.md global, mais rappelé ici)

---

## 📚 RÉFÉRENCES

- **SOUL.md global** : $HOME/.hermes/SOUL.md
- **AGENTS.md** : $ProjectRoot/AGENTS.md
- **Config MCP Hephaistos2-Kit** : .agent/mcp-config.json.exemple
- **Documentation mémoire** : .agent/memory/ARCHITECTURE-ANALYSIS.md
"@

$soulHermesPath = Join-Path $HermesDir 'SOUL.hermes.md'
$soulHermes | Set-Content -Path $soulHermesPath -Encoding UTF8
Write-Host "  + SOUL.hermes.md créé" -ForegroundColor Green

# ============================================================
# RÉSUMÉ
# ============================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  INJECTION HERMÈS TERMINÉE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Ce qui a été créé dans $ProjectRoot :" -ForegroundColor White
Write-Host "  .env                       ← AGENT_DB_ROOT + PROJECT_ID" -ForegroundColor Green
Write-Host "  AGENTS.md                  ← Règles projet compatibles Hermès" -ForegroundColor Green
Write-Host ".agent/hermes/ ← Couche d'intégration" -ForegroundColor Green
Write-Host "    SOUL.hermes.md          ← Identité session sur mesure" -ForegroundColor Green
Write-Host "    skills-adapters/        ← (répertoire pour adaptateurs)" -ForegroundColor Green
Write-Host "    agents-ref/             ← (répertoire pour refs agents)" -ForegroundColor Green
Write-Host "  memory-database/           ← Structure de stockage locale" -ForegroundColor Green
Write-Host "`nStockage global : $ProjectWorkspace" -ForegroundColor Cyan
Write-Host "Junction locale : $localMemoryDb -> $ProjectWorkspace" -ForegroundColor Cyan
Write-Host "`nProchaines étapes :" -ForegroundColor Yellow
Write-Host "  1. Redémarrer Hermès (ou relancer la session) pour charger AGENTS.md + SOUL.hermes.md" -ForegroundColor White
Write-Host "  2. Tester la mémoire : memory_search (hphe-mcp) sur ce projet" -ForegroundColor White
Write-Host "  3. Créer un MANIFEST.md si nécessaire" -ForegroundColor White
