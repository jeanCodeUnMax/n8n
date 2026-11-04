Param(
    [string]$ConfigPath = "",
    [switch]$DryRun = $false,
    [int]$CacheMaxAgeDays = 30,
    [int]$SemanticMaxAgeDays = 90,
    [int]$StaleCollectionDays = 90
)

# Memory Maintenance - hygiene et auto-observation de la memoire unifiee.
# Lance par start-workspace.ps1 apres beacon-sync. Non-bloquant, non-fatal.
#
# 1. Purge les entrees expirees de semantic-cache.db (expires_at)
# 2. Purge les cles kv de runtime-cache.db plus vieilles que CacheMaxAgeDays
# 3. Nettoie les relations orphelines de memory_mcp.db (entites disparues)
# 4. Signale project_cache expire (ttl > 0) et entites quasi-dupliquees
# 5. WAL checkpoint TRUNCATE sur chaque base touchee
# 6. Detecte les collections zvec obsoletes (rapport seulement)
# 7. Ecrit un rapport auto-observe dans la memoire (kv maintenance:last_report)
#    -> la boucle d'apprentissage lit ce rapport via /reflect.
#
# Usage : memory-maintenance.ps1 [-DryRun] [-ConfigPath <chemin>]

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$ScriptRoot = $PSScriptRoot
$ProjectRoot = (Resolve-Path (Join-Path $ScriptRoot "..\..")).Path
$LogDir = Join-Path $ScriptRoot "..\logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "memory-maintenance.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $entry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $entry -ErrorAction SilentlyContinue } catch { }
    Write-Host $entry
}

# --- Resolution AGENT_DB_ROOT (env > .env > defaut ~/.hephaistos/data) ---
$DbRoot = $env:AGENT_DB_ROOT
if ([string]::IsNullOrWhiteSpace($DbRoot)) {
    $envFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $envFile) {
        foreach ($line in (Get-Content $envFile -ErrorAction SilentlyContinue)) {
            if ($line -match '^\s*AGENT_DB_ROOT\s*=\s*(.+?)\s*$') {
                $DbRoot = [Environment]::ExpandEnvironmentVariables($Matches[1].Trim('"').Trim("'"))
                break
            }
        }
    }
}
if ([string]::IsNullOrWhiteSpace($DbRoot)) {
    $DbRoot = Join-Path $env:USERPROFILE ".hephaistos\data"
}

$report = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    dry_run   = [bool]$DryRun
    db_root   = $DbRoot
    actions   = [System.Collections.Generic.List[string]]::new()
    warnings  = [System.Collections.Generic.List[string]]::new()
    errors    = [System.Collections.Generic.List[string]]::new()
}

function Add-Action { param($k, $v) $report.actions.Add("${k}=${v}") }
function Add-Warn   { param($m) $report.warnings.Add($m); Write-Log $m "WARN" }
function Add-Err    { param($m) $report.errors.Add($m); Write-Log $m "ERROR" }

$sqlite3 = Get-Command sqlite3 -ErrorAction SilentlyContinue
if (-not $sqlite3) {
    Write-Log "sqlite3 introuvable dans le PATH - maintenance impossible." "ERROR"
    exit 2
}

function Invoke-Sql {
    param([string]$Db, [string]$Sql)
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    # stdin : evite la corruption des guillemets JSON par le passage d'arguments natif PS 5.1
    $out = ("PRAGMA busy_timeout=5000;`n" + $Sql) | & sqlite3 -batch $Db 2>&1
    $ErrorActionPreference = $prev
    $lines = @($out | Where-Object { $_ -match '\S' })
    if ($lines.Count -eq 0) { return "0" }
    return ([string]$lines[-1]).Trim()
}

if (-not (Test-Path $DbRoot)) {
    Write-Log "AGENT_DB_ROOT introuvable ($DbRoot) - rien a faire." "WARN"
    exit 0
}

$nowUnix = [int][double]::Parse((Get-Date -UFormat %s))
$nowIso = (Get-Date).ToUniversalTime().ToString("o")
$nowUnixMs = "${nowUnix}000"

# ============ 1. semantic-cache.db : purge expires_at + age ============
$semDb = Join-Path $DbRoot "semantic-cache-data\semantic-cache.db"
if (-not (Test-Path $semDb)) { $semDb = Join-Path $DbRoot "current_workspace\agentmemory\cache\semantic-cache.db" }
$semPurged = 0
if (Test-Path $semDb) {
    try {
        $semCutoff = $nowUnix - ($SemanticMaxAgeDays * 86400)
        $semCutoffMs = "${semCutoff}000"
        $expired = [int](Invoke-Sql $semDb "SELECT COUNT(*) FROM semantic_entries WHERE expires_at IS NOT NULL AND expires_at > 0 AND ((expires_at > 1000000000000 AND expires_at < $nowUnixMs) OR (expires_at < 1000000000000 AND expires_at < $nowUnix));")
        $old = [int](Invoke-Sql $semDb "SELECT COUNT(*) FROM semantic_entries WHERE created_at > 1000000000000 AND created_at < $semCutoffMs;")
        $semPurged = $expired + $old
        if ($semPurged -gt 0) {
            if (-not $DryRun) {
                Invoke-Sql $semDb "DELETE FROM semantic_entries WHERE (expires_at IS NOT NULL AND expires_at > 0 AND ((expires_at > 1000000000000 AND expires_at < $nowUnixMs) OR (expires_at < 1000000000000 AND expires_at < $nowUnix))) OR (created_at > 1000000000000 AND created_at < $semCutoffMs);" | Out-Null
            }
            Write-Log "semantic-cache : $semPurged entrees purgees ($expired expirees, $old agees)"
        }
        Add-Action "semantic_cache_purged" $semPurged
        if (-not $DryRun) { Invoke-Sql $semDb "PRAGMA wal_checkpoint(TRUNCATE);" | Out-Null }
    } catch { Add-Err "semantic-cache: $($_.Exception.Message)" }
}

# ============ 2. runtime-cache.db : purge kv agees ============
$rtDb = Join-Path $DbRoot "current_workspace\agentmemory\cache\runtime-cache.db"
$rtPurged = 0
if (Test-Path $rtDb) {
    try {
        $cutoff = (Get-Date).AddDays(-$CacheMaxAgeDays).ToUniversalTime().ToString("o")
        # Ne jamais purger les cles d'etat internes (last_*, maintenance:*)
        $rtPurged = [int](Invoke-Sql $rtDb "SELECT COUNT(*) FROM kv WHERE updated_at < '$cutoff' AND key NOT LIKE 'maintenance:%' AND key NOT LIKE 'last_%';")
        if ($rtPurged -gt 0) {
            if (-not $DryRun) {
                Invoke-Sql $rtDb "DELETE FROM kv WHERE updated_at < '$cutoff' AND key NOT LIKE 'maintenance:%' AND key NOT LIKE 'last_%';" | Out-Null
            }
            Write-Log "runtime-cache : $rtPurged cles purgees (> $CacheMaxAgeDays jours)"
        }
        Add-Action "runtime_cache_purged" $rtPurged
        if (-not $DryRun) { Invoke-Sql $rtDb "PRAGMA wal_checkpoint(TRUNCATE);" | Out-Null }
    } catch { Add-Err "runtime-cache: $($_.Exception.Message)" }
}

# ============ 3-4. memory_mcp.db : relations orphelines + signalements ============
# Canonique v2 : agentmemory\graph (hphe-mcp + sqlite-node y sont repointes)
$kgDb = Join-Path $DbRoot "current_workspace\agentmemory\graph\memory_mcp.db"
$orphans = 0; $dupes = 0
if (Test-Path $kgDb) {
    try {
        $orphans = [int](Invoke-Sql $kgDb "SELECT COUNT(*) FROM relations r WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.name = r.from_entity) OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.name = r.to_entity);")
        if ($orphans -gt 0) {
            if (-not $DryRun) {
                Invoke-Sql $kgDb "DELETE FROM relations WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.name = relations.from_entity) OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.name = relations.to_entity);" | Out-Null
            }
            Write-Log "memory_mcp : $orphans relations orphelines supprimees"
        }
        Add-Action "orphan_relations_deleted" $orphans

        $hasPc = [int](Invoke-Sql $kgDb "SELECT COUNT(*) FROM sqlite_master WHERE name='project_cache';")
        if ($hasPc -gt 0) {
            $pc = [int](Invoke-Sql $kgDb "SELECT COUNT(*) FROM project_cache WHERE ttl > 0;")
            if ($pc -gt 0) { Add-Warn "project_cache : $pc entrees avec TTL - purge geree par le serveur Memory MCP" }
        }

        $dupes = [int](Invoke-Sql $kgDb "SELECT COUNT(*) FROM (SELECT LOWER(TRIM(name)) n, COUNT(*) c FROM entities GROUP BY n HAVING c > 1);")
        if ($dupes -gt 0) { Add-Warn "$dupes groupes d'entites quasi-dupliquees (casse/espaces) - candidats merge via /reflect" }
        Add-Action "entity_dupes_reported" $dupes

        # Entites mortes : ni observation ni relation - bruit pur (rapport seul)
        $dead = [int](Invoke-Sql $kgDb "SELECT COUNT(*) FROM entities e WHERE NOT EXISTS (SELECT 1 FROM observations o WHERE o.entity_id = e.id) AND NOT EXISTS (SELECT 1 FROM relations r WHERE r.from_entity = e.name OR r.to_entity = e.name);")
        if ($dead -gt 0) { Add-Warn "$dead entites mortes (ni observation ni relation) - candidates purge via /reflect" }
        Add-Action "dead_entities_reported" $dead

        # Entites superseded : comptage pour visibilite de la correction semantique
        $sup = [int](Invoke-Sql $kgDb "SELECT COUNT(*) FROM relations WHERE relationType='superseded_by';")
        Add-Action "superseded_relations" $sup

        if (-not $DryRun) { Invoke-Sql $kgDb "PRAGMA wal_checkpoint(TRUNCATE);" | Out-Null }
    } catch { Add-Err "memory_mcp: $($_.Exception.Message)" }
}

# ============ 6. Collections vectorielles obsoletes (rapport seul) ============
$zvecData = Join-Path $DbRoot "current_workspace/vector/zvec-data"
$staleCount = 0
if (Test-Path $zvecData) {
    try {
        $stale = Get-ChildItem $zvecData -Directory -ErrorAction SilentlyContinue | Where-Object {
            $meta = Join-Path $_.FullName "metadata.db"
            (Test-Path $meta) -and ((Get-Item $meta).LastWriteTime -lt (Get-Date).AddDays(-$StaleCollectionDays))
        }
        $staleCount = @($stale).Count
        if ($staleCount -gt 0) { Add-Warn "$staleCount collections zvec sans ecriture depuis $StaleCollectionDays j : $(@($stale | ForEach-Object { $_.Name }) -join ', ')" }
        Add-Action "zvec_stale_collections" $staleCount
    } catch { Add-Err "zvec-scan: $($_.Exception.Message)" }
}

# ============ 6b. Sweep _MEI* (extractions PyInstaller agy/antigravity) ============
# Chaque spawn du CLI packagé extrait ~880 Mo dans %TEMP%\_MEIxxxxxx ; les
# dossiers fuient quand le process est tué -> ~90 Go accumulés en 48h constatés.
# On supprime ceux de plus de 24h (les live des process en cours sont <24h).
$meiPurged = 0
if (-not $DryRun) {
    try {
        $cutoff = (Get-Date).AddHours(-24)
        Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Temp') -Directory -Filter '_MEI*' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            ForEach-Object {
                try { Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop; $script:meiPurged++ }
                catch { }
            }
        if ($meiPurged -gt 0) { Write-Log "sweep _MEI : $meiPurged dossiers PyInstaller supprimes (>24h)" }
        Add-Action "mei_swept" $meiPurged
    } catch { Add-Err "mei-sweep: $($_.Exception.Message)" }
}

# ============ 7. Rapport auto-observe dans la memoire ============
$summary = "maintenance: sem=$semPurged rt=$rtPurged orphelins=$orphans dupes=$dupes dead=$dead superseded=$sup zvec_stale=$staleCount warnings=$($report.warnings.Count) errors=$($report.errors.Count)"
if (Test-Path $rtDb) {
    try {
        $json = ($report | ConvertTo-Json -Compress -Depth 4).Replace("'", "''")
        if (-not $DryRun) {
            Invoke-Sql $rtDb "INSERT INTO kv (key, value, updated_at) VALUES ('maintenance:last_report', '$json', '$nowIso') ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;" | Out-Null
        }
    } catch { Add-Warn "rapport kv non ecrit: $($_.Exception.Message)" }
}
Write-Log $summary
if ($DryRun) { Write-Log "(DryRun - aucune ecriture)" }
exit 0

