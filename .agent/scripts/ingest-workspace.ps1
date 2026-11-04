Param(
    [ValidateSet('watch','once')]
    [string]$Mode = 'once',
    [string]$ConfigPath = "",
    [switch]$Force = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ===========================================================================
# INGESTION — BACKEND RUST UNIFIÉ (hphe-kit / hphe-mcp)
# Remplace l'ancienne chaîne : Get-IngestionFiles + dual-SQLite + cli.py
# (chunking/tagging/embedding -> Qdrant/Zvec).
#
# Désormais UN SEUL binaire :
#   hphe-mcp.exe --tool hephaistos_update '{"root":..., "force":..., "embed":...}'
#
# Ce que fait le backend Rust :
#   - walk du workspace avec .ragignore (syntaxe gitignore, négations incluses)
#     + filet SAFETY non-négociable (.env, *.key/pem/pfx, *.db*, venv, ...)
#   - index plein-texte Tantivy  -> content_search (BM25 + snippets, FRN lié MFT)
#   - miroir KG local           -> memory-database/agentmemory/graph/*.db
#     (entities/observations/relations + edges — même schéma qu'avant)
#   - état incrémental persisté -> data/content-index/ingest-state.json
#   - embed optionnel           -> usearch (2048D via NVIDIA NIM, rag_embedding)
#
# Mode 'watch' : assuré en continu par la boucle d'ingestion de hphe-rest
# (hphe-rest.cmd, HPHE_INGEST_ROOTS + HPHE_INGEST_INTERVAL_S=900). Ce script
# relance un 'once' pour immédiateté puis indique où vit la boucle.
# ===========================================================================

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
# Runtime/data vivent dans l'INSTALL, pas dans le projet (séparation dev/runtime).
$InstallRoot = if ($env:HPHE_INSTALL) { $env:HPHE_INSTALL } else { Join-Path $env:ProgramFiles 'servers\hephaistos2-kit' }
$HpheMcp = Join-Path $InstallRoot "extension\server\hphe-mcp.exe"
$LogDir  = Join-Path $PSScriptRoot "..\logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "ingestion.log"

function Write-Log([string]$Message, [string]$Level = "INFO") {
    $entry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $entry -ErrorAction SilentlyContinue } catch {}
    Write-Host $entry
}

if (-not (Test-Path $HpheMcp)) {
    # fallback : binaire embarqué du projet puis build release
    foreach ($alt in @((Join-Path $ProjectRoot "extension\server\hphe-mcp.exe"),
                       (Join-Path $ProjectRoot "hphe\target\release\hphe-mcp.exe"))) {
        if (Test-Path $alt) { $HpheMcp = $alt; break }
    }
    if (-not (Test-Path $HpheMcp)) { throw "hphe-mcp.exe introuvable ($InstallRoot ni projet)" }
}

$env:HPHE_CONTENT_DIR = Join-Path $InstallRoot "data\content-index"
$env:HPHE_VEC_DIR     = Join-Path $InstallRoot "migrated-vec"
$env:HPHE_ORCH_DB     = Join-Path $InstallRoot "data\orchestrator.db"

$projectTag = Split-Path -Leaf $ProjectRoot
$argsJson = (@{
    root        = $ProjectRoot
    force       = [bool]$Force
    project_tag = $projectTag
    embed       = $false   # embeddings NIM coûteux : explicites via -Embed ci-dessous
} | ConvertTo-Json -Compress)

Write-Log "[ingest] Rust backend — root=$ProjectRoot force=$Force mode=$Mode"
# hphe-rest détient l'IndexWriter Tantivy pour sa boucle : passer par REST
# (sérialisé) évite le LockBusy. Fallback exe direct seulement si REST down.
# Auth (revue sécu) : /tools/* exige Bearer HPHE_REST_TOKEN ou le fichier
# <install>\data\hphe-rest.token écrit par hphe-rest au boot.
$restTok = $env:HPHE_REST_TOKEN
if (-not $restTok) {
    $tokFile = Join-Path $InstallRoot "data\hphe-rest.token"
    if (Test-Path $tokFile) { $restTok = (Get-Content $tokFile -Raw -ErrorAction SilentlyContinue).Trim() }
}
$restHeaders = @{}
if ($restTok) { $restHeaders['Authorization'] = "Bearer $restTok" }
$restUp = $false
# Timeout large + retry : sous commit Tantivy la reponse /health peut
# prendre >2s. Un faux negatif basculerait sur l'exe direct -> LockBusy.
foreach ($try in 1..2) {
    try {
        $h = Invoke-RestMethod -Uri "http://127.0.0.1:8792/health" -TimeoutSec 8
        $restUp = ($h.status -eq 'healthy')
        if ($restUp) { break }
    } catch { }
    Start-Sleep -Milliseconds 800
}

if ($restUp -and -not $restTok) {
    Write-Log "[ingest] aucun token REST (HPHE_REST_TOKEN ni data\hphe-rest.token) — exe direct." "WARN"
    $restUp = $false
}

if ($restUp) {
    if ($h.ingest_busy) {
        Write-Log "[ingest] boucle hphe-rest en cours — appel mis en file d'attente, patience..."
    }
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8792/tools/hephaistos_update" `
            -Method Post -ContentType 'application/json' -Headers $restHeaders -Body $argsJson -TimeoutSec 1800
        $json = ($resp | ConvertTo-Json -Compress -Depth 6)
    }
    catch {
        # LockBusy = la boucle hphe-rest ingère déjà (elle couvre cette racine via
        # HPHE_INGEST_ROOTS/découverte .agent) — non-fatal, on ne double pas le writer.
        $detail = $null
        try { $detail = $_.ErrorDetails.Message } catch {}
        if (-not $detail) { try { $detail = $_.Exception.Message } catch {} }
        if (-not $detail) { $detail = "$_" }
        # 401 = serveur authentifié mais token absent/invalide → on bascule
        # proprement sur l'exe direct (mêmes droits locaux, pas de REST).
        if ($detail -match '401|Unauthorized') {
            Write-Log "[ingest] REST refuse l'appel (401) — bascule sur exe direct." "WARN"
            $restUp = $false
        }
        elseif ($detail -match 'LockBusy|index lock') {
            Write-Log "[ingest] index occupé (boucle hphe-rest en cours) — racine déjà couverte, skip." "WARN"
            return
        }
        elseif ($detail -match 'transport connection|hôte distant|forcibly closed|closed the connection|connection.*closed|aborted|timed out|timeout|délai|502|503|504|Bad Gateway|Service Unavailable|Gateway') {
            Write-Log "[ingest] connexion REST interrompue (redémarrage hphe-rest) — racine couverte au prochain cycle, skip." "WARN"
            return
        }
        else {
            throw "hephaistos_update via REST a échoué: $detail"
        }
    }
}
if (-not $restUp) {
    # hphe-mcp logge sur stderr : on capture stderr dans un fichier à part
    # (2>&1 polluerait $out d'ErrorRecords) — LockBusy n'apparait QUE là.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $errFile = [IO.Path]::GetTempFileName()
    $out = & $HpheMcp --tool hephaistos_update --args $argsJson 2>$errFile
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    $json = $out | Where-Object { $_ -match '^\s*\{' } | Out-String
    $allText = ($out | Out-String) + "`n" + (Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
    Remove-Item $errFile -Force -ErrorAction SilentlyContinue
    if ($code -ne 0) {
        # LockBusy = un writer vit déjà (boucle rest relancée entre-temps,
        # ou hphe-rest revenu). Non-fatal : la racine sera couverte au cycle.
        if ($allText -match 'LockBusy|index lock') {
            Write-Log "[ingest] index occupé (writer actif) — racine couverte par la boucle, skip." "WARN"
            return
        }
        throw "hephaistos_update a échoué (exit $code): $($allText.Trim())"
    }
}
Write-Log "[ingest] $json"

if ($Mode -eq 'watch') {
    Write-Log "[ingest] mode watch => boucle assurée par hphe-rest (HPHE_INGEST_ROOTS). Rien d'autre à faire."
}
