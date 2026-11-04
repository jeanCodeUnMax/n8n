Param(
    [string]$ConfigPath = "",
    [switch]$DryRun = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$ScriptRoot = $PSScriptRoot
$LogDir = Join-Path $ScriptRoot "..\logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "workspace.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $entry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $entry -ErrorAction SilentlyContinue } catch { }
    Write-Host $entry
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $ScriptRoot "ingestion.config.json"
}

$beaconEnabled = $false
$beaconLogPath = Join-Path $env:USERPROFILE ".beacon\endpoint\logs\runtime.jsonl"
$maxSessions = 20

if (Test-Path $ConfigPath) {
    try {
        $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        if ($null -ne $cfg.beacon) {
            if ($null -ne $cfg.beacon.enabled) { $beaconEnabled = [bool]$cfg.beacon.enabled }
            if ($cfg.beacon.log_path) { $beaconLogPath = [Environment]::ExpandEnvironmentVariables($cfg.beacon.log_path) }
            if ($cfg.beacon.max_sessions) { $maxSessions = [int]$cfg.beacon.max_sessions }
        }
    } catch {
        Write-Log "beacon-sync: config illisible; ingestion refusée" "WARN"
        exit 1
    }
}

if (-not $beaconEnabled) {
    Write-Log "beacon-sync: désactivé dans ingestion.config.json"
    exit 0
}

if (-not (Test-Path $beaconLogPath)) {
    Write-Log "beacon-sync: journal Beacon absent; rien à ingérer" "WARN"
    exit 0
}

$ProjectRootDir = (Resolve-Path (Join-Path $ScriptRoot "..\..")).Path
$InstallRoot = if ($env:HPHE_INSTALL) { $env:HPHE_INSTALL } else { Join-Path $env:ProgramFiles 'servers\hephaistos2-kit' }
$HpheMcp = Join-Path $InstallRoot "extension\server\hphe-mcp.exe"
if (-not (Test-Path $HpheMcp)) {
    foreach ($candidate in @(
        (Join-Path $ProjectRootDir "extension\server\hphe-mcp.exe"),
        (Join-Path $ProjectRootDir "hphe\target\release\hphe-mcp.exe")
    )) {
        if (Test-Path $candidate) { $HpheMcp = $candidate; break }
    }
}
if (-not (Test-Path $HpheMcp)) {
    Write-Log "beacon-sync: hphe-mcp.exe introuvable; port Rust non déployé" "WARN"
    exit 1
}

$argsJson = @{
    workspace = $ProjectRootDir
    projectId = (Split-Path -Leaf $ProjectRootDir)
    limit = $maxSessions
    dryRun = [bool]$DryRun
    logPath = $beaconLogPath
} | ConvertTo-Json -Compress

Write-Log "beacon-sync: ingestion Beacon via hphe-mcp beacon_ingest (dryRun=$DryRun)"
Push-Location $ProjectRootDir
$errFile = [IO.Path]::GetTempFileName()
try {
    $output = & $HpheMcp --tool beacon_ingest --args $argsJson 2>$errFile
    $exitCode = $LASTEXITCODE
    $outputText = ($output | Out-String).Trim()
    $stderrText = Get-Content $errFile -Raw -ErrorAction SilentlyContinue
    if ($exitCode -ne 0) {
        Write-Log "beacon-sync: hphe-mcp a échoué (exit $exitCode): $stderrText" "WARN"
        exit 1
    }
    $report = $outputText | ConvertFrom-Json
    Write-Log "beacon-sync: events=$($report.events), sessions=$($report.sessions), mémoires=$($report.memoriesWritten), failed=$($report.failed), offsetAdvanced=$($report.offsetAdvanced)"
    if ($report.failed -gt 0) { exit 1 }
} catch {
    Write-Log "beacon-sync: exception $_" "WARN"
    exit 1
} finally {
    Remove-Item $errFile -Force -ErrorAction SilentlyContinue
    Pop-Location
}

exit 0
