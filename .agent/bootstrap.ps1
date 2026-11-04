# AGENT System Bootstrap (Asynchrone)
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Configuration - CORRECTION: scripts sont dans scripts/
$ScriptsDir = Join-Path $PSScriptRoot "scripts"
$MonitorScript = Join-Path $ScriptsDir "monitor.js"
$IngestScript = Join-Path $ScriptsDir "auto-ingest.ps1"

# 1. Vérifier et lancer l'Ingestion
# (le Monitor :3055 n'est plus lancé — remplacé par l'extension orchestrator-monitor)
$ingestRunning = Get-Process pwsh -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*auto-ingest.ps1*" }
if (-not $ingestRunning) {
    Start-Process pwsh -ArgumentList "-ExecutionPolicy Bypass -File `"$IngestScript`" -Mode auto" -WindowStyle Hidden -ErrorAction SilentlyContinue
}

# 2. WS Bridge orchestrator-monitor (:7477)
# Dans le kit, l'extension VS Code le lance elle-même ; dans les projets
# synchronisés (ou si l'extension est absente/rechargée), on le démarre ici.
# Multi-candidats : ..\extensions\ n'existe que dans le kit — ailleurs on
# retombe sur l'install Program Files ou l'extension IDE (.devin/.vscode).
$bridgeUp = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('127.0.0.1', 7477)
    $tcp.Close()
    $bridgeUp = $true
} catch { }

if (-not $bridgeUp) {
    $bridgeCandidates = @(
        (Join-Path $PSScriptRoot "..\extensions\orchestrator-monitor\ws-bridge\bridge.js")
    )
    $bridgeCandidates += Get-ChildItem "$env:USERPROFILE\.devin\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    $bridgeCandidates += Get-ChildItem "$env:USERPROFILE\.vscode\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    $bridgeJs = $bridgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($bridgeJs) {
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($node) {
            $wsRoot = Split-Path $PSScriptRoot -Parent
            Start-Process node -ArgumentList "`"$bridgeJs`"" -WorkingDirectory (Split-Path $bridgeJs -Parent) -WindowStyle Hidden -Environment @{ HEPHAISTOS_WORKSPACE = $wsRoot } -ErrorAction SilentlyContinue
        }
    }
}

# Sortie immédiate pour ne pas bloquer l'agent
exit 0
