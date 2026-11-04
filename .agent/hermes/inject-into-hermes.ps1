#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Injecte la couche d'intégration Hermès (Hephaistos2-Kit Unified Memory System)
    dans la configuration de Hermès (~/.hermes/).
.DESCRIPTION
    Copie les fichiers de la couche Hermès depuis .agent/hermes/layer/
    vers ~/.hermes/ pour que Hermès puisse utiliser le système de mémoire unifiée.
.PARAMETER LayerPath
    Chemin du répertoire layer (par défaut: .agent/hermes/layer/)
.PARAMETER HermèsHome
    Chemin de la racine Hermès (par défaut: $HOME/.hermes)
.PARAMETER Force
    Écraser les fichiers existants sans confirmation
.EXAMPLE
    pwsh -File .agent/hermes/inject-into-hermès.ps1
.EXAMPLE
    pwsh -File .agent/hermes/inject-into-hermès.ps1 -Force
#>
[CmdletBinding()]
param(
    [string]$LayerPath = (Join-Path $PSScriptRoot 'layer'),
    [string]$HermèsHome = (Join-Path $env:HOME '.hermes'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ============================================================
# VÉRIFICATION DES CHEMINS
# ============================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  INJECTION COUCHE HERMÈS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$LayerPath = Resolve-Path $LayerPath -ErrorAction SilentlyContinue
if (-not $LayerPath) {
    Write-Host "Erreur: LayerPath introuvable: $LayerPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $LayerPath)) {
    Write-Host "Erreur: Le répertoire layer n'existe pas: $LayerPath" -ForegroundColor Red
    exit 1
}

$HermèsHome = if ($HermèsHome -eq "$env:HOME/.hermes") {
    # Utiliser HERMES_HOME si défini, sinon HOME/.hermes
    $env:HERMES_HOME ?? (Join-Path $env:HOME '.hermes')
} else {
    Resolve-Path $HermèsHome -ErrorAction SilentlyContinue
}

if (-not $HermèsHome) {
    Write-Host "Erreur: HermèsHome introuvable" -ForegroundColor Red
    exit 1
}

Write-Host "Layer source  : $LayerPath"
Write-Host "Hermès home   : $HermèsHome`n"

# ============================================================
# CRÉER LES RÉPERTOIRES DESTINATION
# ============================================================
Write-Host "[1/4] Création des répertoires destination..." -ForegroundColor Yellow

$DestSOsulExt = Join-Path $HermèsHome 'SOUL.hermes-extension.md'
$DestAGENTS = Join-Path $HermèsHome 'AGENTS.md'
$DestSkillsAdapters = Join-Path $HermèsHome 'skills-adapters'
$DestAgentsRef = Join-Path $HermèsHome 'agents-ref'

$dirsToCreate = @($DestSkillsAdapters, $DestAgentsRef)
foreach ($dir in $dirsToCreate) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  + $dir" -ForegroundColor Gray
    }
}

# ============================================================
# COPIER SOUL.hermes-extension.md
# ============================================================
Write-Host "[2/4] Injection de SOUL.hermes-extension.md..." -ForegroundColor Yellow

$SourceSOsulExt = Join-Path $LayerPath 'SOUL.hermes-extension.md'
if (Test-Path $SourceSOsulExt) {
    if (Test-Path $DestSOsulExt) {
        if ($Force) {
            Copy-Item -Path $SourceSOsulExt -Destination $DestSOsulExt -Force
            Write-Host "  ~ $DestSOsulExt écrasé" -ForegroundColor Cyan
        } else {
            Write-Host "  ~ $DestSOsulExt existe déjà (utiliser -Force pour écraser)" -ForegroundColor Yellow
            $response = Read-Host "Ecraser? (o/n)"
            if ($response -eq 'o' -or $response -eq 'O') {
                Copy-Item -Path $SourceSOsulExt -Destination $DestSOsulExt -Force
                Write-Host "  ✓ Écrasé" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Annulé" -ForegroundColor Yellow
            }
        }
    } else {
        Copy-Item -Path $SourceSOsulExt -Destination $DestSOsulExt
        Write-Host "  ✓ $DestSOsulExt créé" -ForegroundColor Green
    }
} else {
    Write-Host "  ! SOUL.hermes-extension.md non trouvé dans le layer" -ForegroundColor Yellow
}

# ============================================================
# COPIER AGENTS.md (GLOBAL)
# ============================================================
Write-Host "[3/4] Injection de AGENTS.md (global)..." -ForegroundColor Yellow

$SourceAGENTS = Join-Path $LayerPath 'AGENTS.md'
if (Test-Path $SourceAGENTS) {
    if (Test-Path $DestAGENTS) {
        if ($Force) {
            Copy-Item -Path $SourceAGENTS -Destination $DestAGENTS -Force
            Write-Host "  ~ $DestAGENTS écrasé" -ForegroundColor Cyan
        } else {
            Write-Host "  ~ $DestAGENTS existe déjà (utiliser -Force pour écraser)" -ForegroundColor Yellow
            $response = Read-Host "Ecraser? (o/n)"
            if ($response -eq 'o' -or $response -eq 'O') {
                Copy-Item -Path $SourceAGENTS -Destination $DestAGENTS -Force
                Write-Host "  ✓ Écrasé" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Annulé" -ForegroundColor Yellow
            }
        }
    } else {
        Copy-Item -Path $SourceAGENTS -Destination $DestAGENTS
        Write-Host "  ✓ $DestAGENTS créé" -ForegroundColor Green
    }
} else {
    Write-Host "  ! AGENTS.md non trouvé dans le layer" -ForegroundColor Yellow
}

# ============================================================
# (FUTUR) COPIER SKILLS-ADAPTERS ET AGENTS-REF
# ============================================================
Write-Host "[4/4] (Futur) Adaptateurs et références..." -ForegroundColor Yellow

# Pour l'instant, ces répertoires sont vides dans le layer.
# Ils seront remplis ultérieurement avec les adaptateurs de compétences
# et les références aux agents Hephaistos2-Kit.

Write-Host "  + Répertoires créés (à remplir ultérieurement):" -ForegroundColor Gray
Write-Host "    - skills-adapters/ (adaptateurs de compétences Hermès)" -ForegroundColor Gray
Write-Host "    - agents-ref/ (références aux agents Hephaistos)" -ForegroundColor Gray

# ============================================================
# RÉSUMÉ
# ============================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  INJECTION TERMINÉE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Fichiers injectés dans $HermèsHome :" -ForegroundColor White
Write-Host "  SOUL.hermes-extension.md ← Extension du SOUL.md global" -ForegroundColor Green
Write-Host "  AGENTS.md                ← Règles globales pour tous les workspaces" -ForegroundColor Green
Write-Host "  skills-adapters/         ← (répertoire pour adaptateurs)" -ForegroundColor Green
Write-Host "  agents-ref/              ← (répertoire pour références agents)" -ForegroundColor Green

Write-Host "`nCe que la couche apporte à Hermès :" -ForegroundColor Yellow
Write-Host "  • Connaissance du MCP unifié hphe-mcp (65 outils : recherche, mémoire, tâches, fs, NIM) + sqlite-node KG" -ForegroundColor White
Write-Host "  • Procédures d'usage du système de mémoire unifiée" -ForegroundColor White
Write-Host "  • Règles de stockage dual (local + global)" -ForegroundColor White
Write-Host "  • Routage recherche hphe (everything/content/semantic/hybrid)" -ForegroundColor White
Write-Host "  • Intégration avec les agents Hephaistos via delegate_task" -ForegroundColor White

Write-Host "`nProchaines étapes :" -ForegroundColor Yellow
Write-Host "  1. Redémarrer Hermès pour charger les nouveaux fichiers" -ForegroundColor White
Write-Host "  2. Tester la mémoire : memory_search (hphe-mcp)" -ForegroundColor White
Write-Host "  3. Créer des workspaces et lancer le script hermes-init.ps1" -ForegroundColor White
Write-Host "  4. Remplir skills-adapters/ et agents-ref/ (futur)" -ForegroundColor White
