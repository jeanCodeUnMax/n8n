Param(
    [ValidateSet('auto', 'force', 'skip')]
    [string]$IngestMode = 'auto',
    [bool]$Watch = $true,
    [bool]$Quiet = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Configuration du logging
$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) { $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
$LogDir = Join-Path $ScriptRoot "..\logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$LogFile = Join-Path $LogDir "workspace.log"
$ErrorLogFile = Join-Path $LogDir "error.log"

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    try {
        Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
    }
    catch {
        # Si le fichier log est inaccessible, on continue quand même
    }
    
    Write-Host $logEntry
}

function Set-Junction {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Target,
        [switch]$Optional
    )

    $resolvedTarget = [System.IO.Path]::GetFullPath($Target)
    if (-not (Test-Path $resolvedTarget)) {
        New-Item -ItemType Directory -Path $resolvedTarget -Force | Out-Null
    }

    if (Test-Path $Path) {
        $item = Get-Item $Path -Force -ErrorAction SilentlyContinue
        if ($item -and $item.LinkType -eq "Junction") {
            $currentTarget = @($item.Target)[0]
            if ($currentTarget) {
                $currentTarget = [System.IO.Path]::GetFullPath($currentTarget)
            }
            if ($currentTarget -eq $resolvedTarget) {
                Write-Log "Junction déjà OK: $Path -> $resolvedTarget"
                return
            }
            cmd /c "rmdir `"$Path`"" 2>$null | Out-Null
        }
        else {
            Write-Log "Remplacement du dossier existant par une junction: $Path" "WARN"
            Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
                $dest = Join-Path $resolvedTarget $_.Name
                if (-not (Test-Path -LiteralPath $dest)) {
                    Move-Item -LiteralPath $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
                }
            }
            cmd /c "rmdir /s /q `"$Path`"" 2>$null | Out-Null
            if (Test-Path $Path) {
                Remove-Item -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue
            }
        }
    }

    if (Test-Path $Path) {
        $message = "Impossible de remplacer '$Path' par une junction vers '$resolvedTarget' (dossier verrouillé)."
        if ($Optional) {
            Write-Log "$message Le workspace continue avec le dossier local." "WARN"
            return
        }
        throw $message
    }

    New-Item -ItemType Junction -Path $Path -Target $resolvedTarget -Force | Out-Null
    Write-Log "Junction créée: $Path -> $resolvedTarget"
}

function Write-ErrorLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [ERROR] $Message"
    
    try {
        Add-Content -Path $ErrorLogFile -Value $logEntry -ErrorAction SilentlyContinue
    }
    catch {
        # Si le fichier error log est inaccessible, on continue quand même
    }
    
    Write-Host $logEntry -ForegroundColor Red
}

# $ScriptRoot is already defined at the top
$ProjectRoot = Split-Path -Parent $ScriptRoot  # = .agent folder
$ProjectRootDir = Split-Path -Parent $ProjectRoot  # = actual project root
$autoIngest = Join-Path $ScriptRoot 'auto-ingest.ps1'
$ingestScript = Join-Path $ScriptRoot 'ingest-workspace.ps1'
$ingestConfig = Join-Path $ScriptRoot 'ingestion.config.json'

# --- INITIALISATION STRUCTURELLE CRITIQUE (SYNCHRONE) ---
# En mode GLOBAL (AGENT_DB_ROOT), .agent/memory-database est inutile : le vrai
# stockage vit dans $GlobalWorkspaceDir et memory-database à la racine est une
# junction. Le squelette n'est créé qu'en mode LOCAL (zvec local y écrit).
$MemoryDbRoot = Join-Path $ScriptRoot "../memory-database"
$GraphDir = Join-Path $MemoryDbRoot "graph"
$VectorDir = Join-Path $MemoryDbRoot "vector"
$CacheDir = Join-Path $MemoryDbRoot "cache"
$KnowledgeDir = Join-Path $ScriptRoot "../knowledge"

if (-not (Test-Path $KnowledgeDir)) {
    New-Item -ItemType Directory -Path $KnowledgeDir -Force | Out-Null
}

Write-Log "Structure de répertoires locale synchronisée."

# --- LECTURE DU FICHIER .ENV ---
$EnvFile = Join-Path $ProjectRootDir ".env"
if (Test-Path $EnvFile) {
    Write-Log "Lecture de .env..."
    Get-Content $EnvFile | ForEach-Object {
        if (-not $_.StartsWith('#')) {
            $parts = $_.Split('=', 2)
            if ($parts.Count -eq 2) {
                $key = $parts[0].Trim()
                $value = $parts[1].Trim()
                # Supprimer les guillemets si présents
                if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
                    $value = $matches[1]
                }
                if ($key -eq "AGENT_DB_ROOT" -and -not [string]::IsNullOrWhiteSpace($value)) {
                    $env:AGENT_DB_ROOT = $value
                    Write-Log "AGENT_DB_ROOT défini depuis .env: $value"
                }
            }
        }
    }
}

# --- STOCKAGE DUAL-MODE (LOCAL + GLOBAL) ---
# Mode LOCAL: ./memory-database/agentmemory/ (toujours)
# Mode GLOBAL: junction vers stockage externe (optionnel)

$UseGlobalStorage = $false
$GlobalDbRoot = $null

if ($env:AGENT_DB_ROOT) {
    # Mode GLOBAL activé via .env
    $UseGlobalStorage = $true
    $GlobalDbRoot = $env:AGENT_DB_ROOT
}

$LocalMemoryDb = Join-Path $ProjectRootDir "memory-database"

Write-Log "Configuration DUAL-MODE..."

# 1. Structure LOCAL — uniquement en mode local. En mode global, memory-database
#    devient une junction vers le store : tout dossier créé ici serait écrasé.
$localAgentDir = Join-Path $LocalMemoryDb "agentmemory"

if (-not $UseGlobalStorage) {
    foreach ($dir in @($localAgentDir, $GraphDir, $VectorDir, $CacheDir)) {
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    }
}

# 2. Structure GLOBAL (si activé)
if ($UseGlobalStorage) {
    $GlobalWorkspaceDir = Join-Path $GlobalDbRoot "current_workspace"

    Write-Log "Mode GLOBAL activé - DbRoot: $GlobalDbRoot"
    
    # Créer le dossier global s'il n'existe pas
    if (-not (Test-Path $GlobalWorkspaceDir)) { 
        New-Item -ItemType Directory -Path $GlobalWorkspaceDir -Force | Out-Null 
    }
    
    # Créer les sous-dossiers dans le stockage global
    $globalCacheDir = Join-Path $GlobalWorkspaceDir "cache"
    $globalGraphDir = Join-Path $GlobalWorkspaceDir "graph"
    $globalVectorDir = Join-Path $GlobalWorkspaceDir "vector"
    foreach ($dir in @($globalCacheDir, $globalGraphDir, $globalVectorDir)) {
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    }
    
    Set-Junction -Path $LocalMemoryDb -Target $GlobalWorkspaceDir
}
else {
    Write-Log "Mode LOCAL uniquement - Pas de junction"
}

# Nettoyage de la junction obsolète semantic-cache-data (le cache est désormais
# accessible via memory-database/cache — une seule junction racine suffit)
$StaleCacheJunction = Join-Path $ProjectRootDir "semantic-cache-data"
if (Test-Path $StaleCacheJunction) {
    $staleItem = Get-Item $StaleCacheJunction -Force -ErrorAction SilentlyContinue
    if ($staleItem -and $staleItem.LinkType -eq "Junction") {
        $staleItem.Delete()
        Write-Log "Junction obsolète supprimée: $StaleCacheJunction"
    }
}

if ($UseGlobalStorage) {
    Write-Log "Stockage GLOBAL (junction): $LocalMemoryDb -> $GlobalWorkspaceDir"
} else {
    Write-Log "Stockage LOCAL: $localAgentDir"
}

# Créer les sous-répertoires pour MCP (graph, vector) dans le stockage GLOBAL
$globalGraphDir = Join-Path $LocalMemoryDb "graph"
$globalVectorDir = Join-Path $LocalMemoryDb "vector"
foreach ($dir in @($globalGraphDir, $globalVectorDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

# --- LES SERVEURS MCP SONT GÉRÉS PAR L'IDE (DEVIN) ---
# L'ancien pont REST RAG Python (ports 8001/8002 -> zvec/memory MCP) est
# supprimé : ces serveurs sont absorbés par hphe-mcp (58 outils) et hphe-rest
# (127.0.0.1:8792) gère la boucle d'ingestion. monitor.js (:3055) idem —
# remplacé par l'extension orchestrator-monitor (ws-bridge :7477).
# Restes d'anciens runs : on nettoie juste le pidfile s'il traîne.
$BridgePidFile = Join-Path $ScriptRoot "rag_bridge.pid"
if (Test-Path $BridgePidFile) { Remove-Item $BridgePidFile -Force -ErrorAction SilentlyContinue }

Write-Log "Vérification/ingestion initiale ($IngestMode)"

& pwsh -NoProfile -ExecutionPolicy Bypass -File $autoIngest -Mode $IngestMode -ConfigPath $ingestConfig

# --- CONSOLE HIDER : masque les fenetres console des process du kit ---
# Windows cree une fenetre visible pour tout exe console spawne par un
# parent sans console (IDE, services) : ACP servers, MCP node/python,
# kilo/hermes/agy... Le script tourne cache (mutex single-instance) et
# masque les fenetres ConsoleWindowClass des cmdlines du kit (~3s).
$hider = Join-Path $ScriptRoot 'console-hider.ps1'
if (Test-Path $hider) {
    $already = Get-CimInstance Win32_Process -Filter "Name='pwsh.exe' or Name='powershell.exe'" |
        Where-Object { $_.CommandLine -match 'console-hider\.ps1' } |
        Select-Object -First 1
    if (-not $already) {
        Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$hider`"") -WindowStyle Hidden
        Write-Log "Console hider lancé (masquage des terminaux du kit)"
    }
}

# --- WS BRIDGE :7477 — canal binôme Devin<->AGY + push monitor ---
# L'extension orchestrator-monitor le spawn aussi à l'activation ; ici on
# garantit l'écoute même si l'IDE n'a pas (encore) ouvert le monitor.
# Multi-candidats : le script peut tourner depuis le kit OU depuis un projet
# cible dont le .agent est synchronisé (extensions\... n'existe pas là-bas).
$bridgeCandidates = @(
    (Join-Path $ScriptRoot '..\..\extensions\orchestrator-monitor\ws-bridge\bridge.js')
)
$bridgeCandidates += Get-ChildItem "$env:USERPROFILE\.devin\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
$bridgeCandidates += Get-ChildItem "$env:USERPROFILE\.vscode\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
$bridgeJs = $bridgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($bridgeJs) {
    $up = Get-NetTCPConnection -LocalPort 7477 -State Listen -ErrorAction SilentlyContinue
    if (-not $up) {
        $wsRoot = Split-Path (Split-Path $ScriptRoot -Parent) -Parent
        Start-Process -FilePath 'node' -ArgumentList "`"$bridgeJs`"" -WorkingDirectory (Split-Path $bridgeJs -Parent) -WindowStyle Hidden -Environment @{ HEPHAISTOS_WORKSPACE = $wsRoot }
        Write-Log "ws-bridge lancé (:7477) — $bridgeJs"
    }
}

# --- SYNC BEACON -> MÉMOIRE UNIFIÉE (non-bloquant, non-fatal) ---
# beacon-sync.ps1 appelle le tool Rust hphe-mcp beacon_ingest pour distiller
# runtime.jsonl en mémoires projet; ingestion.config.json reste le coupe-circuit.
$beaconSync = Join-Path $ScriptRoot 'beacon-sync.ps1'
if (Test-Path $beaconSync) {
    Write-Log "Synchronisation Beacon -> mémoire unifiée..."
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $beaconSync -ConfigPath $ingestConfig
}

# --- MAINTENANCE MEMOIRE UNIFIEE (non-bloquant, non-fatal) ---
# Purge caches expires, relations orphelines KG, checkpoint WAL, rapport
# auto-observe dans kv (maintenance:last_report) -> consomme par /reflect.
$memMaint = Join-Path $ScriptRoot 'memory-maintenance.ps1'
if (Test-Path $memMaint) {
    Write-Log "Maintenance memoire unifiee..."
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $memMaint
}

if ($Watch) {
    Write-Log "Lancement de la surveillance continue (Ctrl+C pour arrêter)"
    $cmdArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ingestScript, "-Mode", "watch", "-ConfigPath", $ingestConfig)
    & pwsh @cmdArgs
}
else {
    Write-Log "Surveillance désactivée (paramètre -Watch:$false)"
}
