<#
.SYNOPSIS
    Injection complète d'un nouveau projet avec brainstorming
.DESCRIPTION
    Crée la structure projet, MANIFEST, roadmap après une phase de définition
.PARAMETER ProjectName
    Nom du projet
.PARAMETER ProjectType
    Type: web, mobile, backend, cli, game, library
.PARAMETER Description
    Description courte du projet
.EXAMPLE
    ./init-project.ps1 -ProjectName "MonJeu" -ProjectType "game" -Description "Jeu Pacman en HTML"
#>

Param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectName,
    
    [ValidateSet('web', 'mobile', 'backend', 'cli', 'game', 'library', 'fullstack')]
    [string]$ProjectType = 'web',
    
    [string]$Description = "",
    
    [switch]$Interactive = $false
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PWD.Path

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  INJECTION PROJET: $ProjectName" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# === PHASE 1: BRAINSTORMING ===
Write-Host "[PHASE 1] Définition du projet" -ForegroundColor Yellow

if ($Interactive -or [string]::IsNullOrEmpty($Description)) {
    Write-Host "`nRépondez aux questions suivantes pour définir le projet:`n" -ForegroundColor White
    
    $Description = Read-Host "1. Description du projet (quoi?)"
    $Objectives = Read-Host "2. Objectifs principaux (pourquoi?)"
    $Constraints = Read-Host "3. Contraintes techniques (comment?)"
    $TargetUsers = Read-Host "4. Utilisateurs cibles (pour qui?)"
    $TechStack = Read-Host "5. Stack technique préférée (langages, frameworks)"
    $Timeline = Read-Host "6. Timeline estimée (semaines)"
    $Priority = Read-Host "7. Priorité (haute/moyenne/basse)"
} else {
    $Objectives = "À définir"
    $Constraints = "À définir"
    $TargetUsers = "À définir"
    $TechStack = "À définir selon le type: $ProjectType"
    $Timeline = "À définir"
    $Priority = "moyenne"
}

# === PHASE 2: STRUCTURE PROJET ===
Write-Host "`n[PHASE 2] Création de la structure" -ForegroundColor Yellow

# Dossiers selon le type
$Folders = switch ($ProjectType) {
    'web' { @('src/components', 'src/pages', 'src/styles', 'src/utils', 'public', 'tests') }
    'mobile' { @('src/screens', 'src/components', 'src/navigation', 'src/services', 'assets', 'tests') }
    'backend' { @('src/routes', 'src/controllers', 'src/models', 'src/middleware', 'src/utils', 'tests') }
    'cli' { @('src/commands', 'src/utils', 'src/config', 'tests') }
    'game' { @('src/game', 'src/assets', 'src/levels', 'src/utils', 'public', 'tests') }
    'library' { @('src', 'dist', 'docs', 'tests') }
    'fullstack' { @('frontend/src', 'backend/src', 'shared', 'tests') }
    default { @('src', 'tests') }
}

foreach ($folder in $Folders) {
    $path = Join-Path $ProjectRoot $folder
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "  ✓ $folder" -ForegroundColor Green
    }
}

# === PHASE 3: MANIFEST ===
Write-Host "`n[PHASE 3] Création du MANIFEST" -ForegroundColor Yellow

$ManifestContent = @"
# MANIFEST - $ProjectName

> Créé le: $(Get-Date -Format 'yyyy-MM-dd')
> Version: 0.1.0
> Type: $ProjectType

## 📋 DÉFINITION DU PROJET

### Description
$Description

### Objectifs
$Objectives

### Contraintes
$Constraints

### Utilisateurs cibles
$TargetUsers

---

## 🏗️ ARCHITECTURE

### Type de projet
**$ProjectType**

### Structure dossiers
``````
$ProjectRoot/
$(foreach ($f in $Folders) { "├── $f/" })
├── .agent/           ← Configuration et scripts
├── .devin/           ← Règles et skills Devin locales
├── memory-database/  ← Mémoire unifiée
└── MANIFEST.md       ← Ce fichier
``````

### Stack technique
$TechStack

---

## 🎯 ROADMAP

### Sprint 1: Initialisation
- [ ] Setup environnement
- [ ] Configuration base
- [ ] Tests infrastructure

### Sprint 2: MVP
- [ ] Fonctionnalités core
- [ ] Tests unitaires
- [ ] Documentation

### Timeline estimée
$Timeline semaines

### Priorité
$Priority

---

## 📊 MÉTRIQUES

| Métrique | Valeur initiale |
|----------|-----------------|
| Progression | 0% |
| Tests | 0 |
| Documentation | MANIFEST.md |

---

## 🚧 CONTRAINTES TECHNIQUES

### Règles projet
1. **Clean Garden**: Chaque chose à sa place
2. **5S**: Trier, Ranger, Nettoyer, Standardiser, Suivre
3. **Tests**: TDD obligatoire pour nouvelles fonctionnalités
4. **Docs**: Mettre à jour MANIFEST après chaque sprint

### Limitations
- À définir selon l'avancement

---

## 📝 DÉCISIONS ARCHITECTURALES

### ADR-001: Choix du type projet
**Date**: $(Get-Date -Format 'yyyy-MM-dd')
**Décision**: Type `$ProjectType`
**Raison**: $Description

---

## 🔄 PROCHAINES ÉTAPES

1. Finaliser la stack technique
2. Créer les premiers fichiers de code
3. Configurer l'environnement de dev
4. Écrire les premiers tests

---

*Ce manifeste est versionné dans Git. Mettre à jour à chaque changement majeur.*
"@

$ManifestPath = Join-Path $ProjectRoot "MANIFEST.md"
$ManifestContent | Set-Content $ManifestPath -Encoding UTF8
Write-Host "  ✓ MANIFEST.md créé" -ForegroundColor Green

# === PHASE 4: COUCHE AGENT & BRIDGE ===
Write-Host "`n[PHASE 4] Injection de la couche Agent (.agent et .devin) et vérification du bridge" -ForegroundColor Yellow

$SyncScript = Join-Path $PSScriptRoot "sync-agent-layer.ps1"
if (Test-Path $SyncScript) {
    Write-Host "  Synchronisation des couches .agent et .devin..." -ForegroundColor Cyan
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $SyncScript -Target $ProjectRoot
}

# Vérification du daemon WS Bridge (:7477)
$bridgeUp = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('127.0.0.1', 7477)
    $tcp.Close()
    $bridgeUp = $true
} catch { }

if ($bridgeUp) {
    Write-Host "  [OK] WS Bridge actif sur le port 7477" -ForegroundColor Green
} else {
    Write-Host "  [INFO] WS Bridge inactif sur le port 7477 - tentative de demarrage..." -ForegroundColor Yellow
    $bridgeCandidates = @(
        (Join-Path $PSScriptRoot "..\..\extensions\orchestrator-monitor\ws-bridge\bridge.js")
    )
    $bridgeCandidates += Get-ChildItem "$env:USERPROFILE\.devin\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    $bridgeCandidates += Get-ChildItem "$env:USERPROFILE\.vscode\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    $bridgeJs = $bridgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($bridgeJs) {
        Start-Process node -ArgumentList "`"$bridgeJs`"" -WorkingDirectory (Split-Path $bridgeJs -Parent) -WindowStyle Hidden -Environment @{ HEPHAISTOS_WORKSPACE = $ProjectRoot } -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "  [OK] WS Bridge demarre ($bridgeJs)" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Bridge script non trouve, demarre au besoin par start-workspace.ps1" -ForegroundColor DarkGray
    }
}

# Verification version orchestrator-monitor (>= 0.0.61, injection ACP stdio)
$expectedExtVer = '0.0.61'
$extDirs = @()
$extDirs += Get-ChildItem "$env:USERPROFILE\.devin\extensions\hephaistos.orchestrator-monitor-*" -ErrorAction SilentlyContinue
$extDirs += Get-ChildItem "$env:USERPROFILE\.vscode\extensions\hephaistos.orchestrator-monitor-*" -ErrorAction SilentlyContinue
$foundExt = $null
foreach ($d in $extDirs) {
    $pkg = Join-Path $d.FullName 'package.json'
    if (Test-Path $pkg) {
        try {
            $v = (Get-Content $pkg -Raw | ConvertFrom-Json).version
            if (-not $foundExt -or [version]$v -gt [version]$foundExt) { $foundExt = $v }
        } catch {}
    }
}
if ($foundExt -and [version]$foundExt -ge [version]$expectedExtVer) {
    Write-Host "  [OK] orchestrator-monitor v$foundExt detectee (attendue >= $expectedExtVer)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] orchestrator-monitor >= $expectedExtVer non detectee (lancer .agent\setup\install-extension-hub.ps1)" -ForegroundColor Yellow
}

# Verification surfaces de regles (devin, claude, windsurf, gemini)
$surfScript = Join-Path $PSScriptRoot "..\setup\setup-agent-surfaces.ps1"
if (Test-Path $surfScript) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $surfScript -Verify 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] surfaces de regles conformes (devin, claude, windsurf, gemini)" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] surfaces de regles non conformes (lancer setup-agent-surfaces.ps1)" -ForegroundColor Yellow
    }
}

# Verification canal binome (comms.jsonl)
$commsCandidates = @(
    (Join-Path $ProjectRoot ".agent\comms.jsonl")
)
$commsTarget = $commsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($commsTarget) {
    $cLines = Get-Content $commsTarget -Tail 80 -ErrorAction SilentlyContinue
    $hasDevin = $cLines | Where-Object { $_ -match '"src":"devin"' -and $_ -match '"convId":' }
    $hasAgy   = $cLines | Where-Object { $_ -match '"src":"agy"' -and $_ -match '"convId":' }
    if ($hasDevin -and $hasAgy) {
        Write-Host "  [OK] canal binome actif (IDs devin et agy publies)" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] canal binome : lancer 'node .agent/agent-bridge/binome.js join' pour apparier" -ForegroundColor DarkGray
    }
}

# Verification couche 2.1 (veille reactive + obligation documentaire)
$wdScript = Join-Path $ProjectRoot ".agent\skills\reactive-orchestrator\watchdog.ps1"
$rdRule   = Join-Path $ProjectRoot ".agent\rules\rapport-dysfonctionnement.md"
$rdDir    = Join-Path $ProjectRoot "Rapport de dysfonctionnement et correction"
if (Test-Path $wdScript) {
    Write-Host "  [OK] watchdog reactif present (.agent/skills/reactive-orchestrator)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] watchdog.ps1 absent — scaffold via: hphe-mcp --tool project_init" -ForegroundColor Yellow
}
if (Test-Path $rdRule) {
    Write-Host "  [OK] regle rapport-dysfonctionnement presente" -ForegroundColor Green
} else {
    Write-Host "  [WARN] regle rapport absente — scaffold via: hphe-mcp --tool project_init" -ForegroundColor Yellow
}
if (-not (Test-Path $rdDir)) { New-Item -ItemType Directory -Path $rdDir -Force | Out-Null }
Write-Host "  [OK] repertoire Rapport de dysfonctionnement et correction present" -ForegroundColor Green
Write-Host "  [INFO] .vscode/tasks.json n'est plus injecte (2.1) — watchdog auto-start via extension orchestrator-monitor" -ForegroundColor DarkGray

# === PHASE 4b: STOCKAGE MEMOIRE DUAL-MODE (reprend start-workspace.ps1) ===
# LOCAL  : memory-database/agentmemory + .agent/memory-database/{graph,vector,cache}
# GLOBAL : si .env definit AGENT_DB_ROOT -> <root>/memory-database = junction
#          vers $AGENT_DB_ROOT/current_workspace/{cache,graph,vector}
Write-Host "`n[PHASE 4b] Stockage memoire dual-mode" -ForegroundColor Yellow

# Lecture .env -> AGENT_DB_ROOT
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if (-not $_.StartsWith('#') -and $_ -match '=') {
            $parts = $_.Split('=', 2)
            if ($parts[0].Trim() -eq 'AGENT_DB_ROOT' -and $parts[1].Trim()) {
                $env:AGENT_DB_ROOT = $parts[1].Trim() -replace '^["'']|["'']$', ''
            }
        }
    }
}

$AgentMemDb = Join-Path $ProjectRoot ".agent\memory-database"
$LocalMemDb = Join-Path $ProjectRoot "memory-database"

if ($env:AGENT_DB_ROOT) {
    $globalDir = Join-Path $env:AGENT_DB_ROOT "current_workspace"
    foreach ($d in @($globalDir, "$globalDir\cache", "$globalDir\graph", "$globalDir\vector")) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    if (Test-Path $LocalMemDb) {
        $it = Get-Item $LocalMemDb -Force -ErrorAction SilentlyContinue
        if ($it -and $it.LinkType -eq 'Junction') {
            $cur = @($it.Target)[0]
            if ([IO.Path]::GetFullPath($cur) -eq [IO.Path]::GetFullPath($globalDir)) {
                Write-Host "  [OK] junction memory-database deja correcte" -ForegroundColor Green
            } else { $it.Delete() }
        } else {
            Get-ChildItem -LiteralPath $LocalMemDb -Force -ErrorAction SilentlyContinue | ForEach-Object {
                $dst = Join-Path $globalDir $_.Name
                if (-not (Test-Path $dst)) { Move-Item $_.FullName $dst -Force -ErrorAction SilentlyContinue }
            }
            Remove-Item -LiteralPath $LocalMemDb -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not (Test-Path $LocalMemDb)) {
        New-Item -ItemType Junction -Path $LocalMemDb -Target $globalDir -Force | Out-Null
        Write-Host "  [OK] junction memory-database -> $globalDir" -ForegroundColor Green
    }
} else {
    foreach ($d in @("$LocalMemDb\agentmemory", "$AgentMemDb\graph", "$AgentMemDb\vector", "$AgentMemDb\cache", "$ProjectRoot\.agent\knowledge")) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    Write-Host "  [OK] stockage memoire LOCAL (.agent/memory-database)" -ForegroundColor Green
}
# Nettoyage junction obsolete heritee de la v2
$staleJ = Join-Path $ProjectRoot "semantic-cache-data"
$staleIt = Get-Item $staleJ -Force -ErrorAction SilentlyContinue
if ($staleIt -and $staleIt.LinkType -eq 'Junction') { $staleIt.Delete() }

# === RÉSUMÉ ===
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  INJECTION TERMINÉE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Projet: $ProjectName" -ForegroundColor White
Write-Host "Type: $ProjectType" -ForegroundColor White
Write-Host "Description: $Description" -ForegroundColor White
Write-Host "`nFichiers créés:" -ForegroundColor White
Write-Host "  - MANIFEST.md" -ForegroundColor Green
Write-Host "  - Structure dossiers ($($Folders.Count) dossiers)" -ForegroundColor Green
Write-Host "  - .agent/ (configuration)" -ForegroundColor Green
Write-Host "  - .devin/ (règles et skills Devin)" -ForegroundColor Green

Write-Host "`nProchaines étapes:" -ForegroundColor Yellow
Write-Host "  1. Éditer MANIFEST.md pour compléter la définition" -ForegroundColor White
Write-Host "  2. Lancer la boucle: pwsh -File .agent\scripts\start-workspace.ps1" -ForegroundColor White
Write-Host "  3. Commencer le développement" -ForegroundColor White
