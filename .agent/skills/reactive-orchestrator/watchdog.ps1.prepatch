[CmdletBinding()]
param(
  [string]$WorkspaceRoot,
  [ValidateRange(5, 3600)]
  [int]$IntervalSeconds = 60,
  [ValidateRange(1, 1440)]
  [int]$StaleTaskMinutes = 30,
  [ValidateRange(1, 1440)]
  [int]$CriticalTaskMinutes = 90,
  [string]$HeartbeatTaskId = '',
  [string]$AgyCascadeId = '7f0aa3fb-9e17-4a4f-8c4f-b6ce12157dd3',
  [string]$AgyModel = 'MODEL_PLACEHOLDER_M418',
  [switch]$Once,
  [switch]$SkipBootstrap,
  [switch]$NoMcpConfigRepair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $WorkspaceRoot) {
  $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}
$WorkspaceRoot = (Resolve-Path -LiteralPath $WorkspaceRoot).Path

# Single-instance par workspace : l'extension orchestrator-monitor spawn le
# watchdog avec backoff — si un demon manuel tourne deja (ou double fenetre
# IDE sur le meme workspace), le second spawn sort immediatement au lieu de
# dupliquer snapshots/alertes. -Once reste hors mutex (diagnostic pur).
$script:InstanceMutex = $null
if (-not $Once) {
  try {
    $mutexName = 'hephaistos-watchdog-' + ($WorkspaceRoot -replace '[^a-zA-Z0-9]', '-').ToLower()
    $script:InstanceMutex = [System.Threading.Mutex]::new($false, $mutexName)
    if (-not $script:InstanceMutex.WaitOne(0)) {
      Write-Output ('{"level":"info","event":"already_running","details":{"workspace":"' + $WorkspaceRoot + '"}}')
      exit 0
    }
  } catch { $script:InstanceMutex = $null }
}

$script:AgentDir = Join-Path $WorkspaceRoot '.agent'
$script:LogPath = Join-Path $script:AgentDir 'logs\reactive-orchestrator-watchdog.jsonl'
$script:StatePath = Join-Path $PSScriptRoot 'watch-state.json'
$script:CommsPath = Join-Path $script:AgentDir 'comms.jsonl'
$script:McpCall = Join-Path $WorkspaceRoot '.agent\devin\scripts\mcp-call.mjs'
$script:BridgeHelper = Join-Path $WorkspaceRoot '.agent\agent-bridge\devin-hub.js'
$script:AgyHelper = Join-Path $WorkspaceRoot '.agent\agent-bridge\agy-hub.js'
$script:DbPath = if ($env:ORCHESTRATOR_DB) {
  $env:ORCHESTRATOR_DB
} elseif ($env:HPHE_ORCH_DB) {
  $env:HPHE_ORCH_DB
} else {
  Join-Path $env:ProgramFiles 'servers\hephaistos2-kit\data\orchestrator.db'
}
$script:Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$script:State = @{
  alerts = @{}
  commsOffset = [long]0
  cpuHighSince = $null
  lastAgyWakeAt = $null
  lastAcpProbeAt = $null
  lastMuxCheckAt = $null
  muxDriftSignature = $null
  taskFirstSeen = @{}
  taskStatuses = @{}
  wokenTasks = @{}
}
$script:ActiveAlertKeys = @{}
$script:PendingWakeNotes = [System.Collections.Generic.List[string]]::new()
$stateLoaded = $false

if (Test-Path -LiteralPath $script:StatePath) {
  try {
    $loaded = Get-Content -LiteralPath $script:StatePath -Raw | ConvertFrom-Json -AsHashtable
    foreach ($key in @('alerts', 'taskFirstSeen', 'taskStatuses', 'wokenTasks')) {
      if (-not $loaded.Contains($key) -or $loaded[$key] -isnot [System.Collections.IDictionary]) { $loaded[$key] = @{} }
    }
    foreach ($key in @('commsOffset', 'cpuHighSince', 'lastAgyWakeAt', 'lastAcpProbeAt', 'lastMuxCheckAt', 'muxDriftSignature')) {
      if (-not $loaded.Contains($key)) { $loaded[$key] = $null }
    }
    if ($loaded.commsOffset -isnot [long] -and $loaded.commsOffset -isnot [int]) {
      $loaded.commsOffset = [long]0
    }
    $script:State = $loaded
    $stateLoaded = $true
  } catch {
    Write-Warning 'Watchdog state is unreadable; starting with a clean in-memory state.'
  }
}
if (-not $stateLoaded -and (Test-Path -LiteralPath $script:CommsPath)) {
  $script:State.commsOffset = (Get-Item -LiteralPath $script:CommsPath).Length
}

function Write-Log {
  param(
    [Parameter(Mandatory)][string]$Level,
    [Parameter(Mandatory)][string]$Category,
    [hashtable]$Details = @{}
  )
  $record = [ordered]@{
    ts = [DateTime]::UtcNow.ToString('o')
    level = $Level
    event = $Category
    details = $Details
  }
  $line = $record | ConvertTo-Json -Compress -Depth 8
  [System.IO.File]::AppendAllText($script:LogPath, $line + "`n", $script:Utf8NoBom)
  Write-Output $line
}

function Get-Field {
  param($Object, [Parameter(Mandatory)][string]$Name)
  if ($null -eq $Object) { return $null }
  if ($Object -is [System.Collections.IDictionary]) {
    if ($Object.Contains($Name)) { return $Object[$Name] }
    return $null
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return $null
}

function ConvertTo-UtcDateTime {
  param($Value, $Fallback = $null)
  if ($Value -is [DateTime]) { return $Value.ToUniversalTime() }
  $parsed = [DateTimeOffset]::MinValue
  $styles = [System.Globalization.DateTimeStyles]::AssumeUniversal
  if ([DateTimeOffset]::TryParse(
      [string]$Value,
      [System.Globalization.CultureInfo]::InvariantCulture,
      $styles,
      [ref]$parsed
    )) {
    return $parsed.UtcDateTime
  }
  return $Fallback
}

function Save-State {
  $temporaryPath = "$script:StatePath.tmp"
  $json = $script:State | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($temporaryPath, $json, $script:Utf8NoBom)
  Move-Item -LiteralPath $temporaryPath -Destination $script:StatePath -Force
}

function Write-CommsEvent {
  param([Parameter(Mandatory)][string]$Code, [string]$TaskId = '')
  $text = if ($TaskId) { "[WATCHDOG] code=$Code taskId=$TaskId" } else { "[WATCHDOG] code=$Code" }
  $entry = [ordered]@{
    ts = [DateTime]::UtcNow.ToString('o')
    src = 'watchdog'
    dst = 'dashboard'
    kind = 'event'
    text = $text
  }
  if ($TaskId) { $entry.taskId = $TaskId }
  $line = ($entry | ConvertTo-Json -Compress -Depth 4) + "`n"
  [System.IO.File]::AppendAllText($script:CommsPath, $line, $script:Utf8NoBom)
}

function Add-WakeNote {
  param([Parameter(Mandatory)][string]$Note)
  if (-not $script:PendingWakeNotes.Contains($Note)) {
    $script:PendingWakeNotes.Add($Note)
  }
}

function Set-Alert {
  param(
    [Parameter(Mandatory)][string]$Key,
    [Parameter(Mandatory)][string]$Code,
    [string]$TaskId = ''
  )
  $script:ActiveAlertKeys[$Key] = $true
  if (-not $script:State.alerts.ContainsKey($Key)) {
    $script:State.alerts[$Key] = [DateTime]::UtcNow.ToString('o')
    $details = @{ code = $Code }
    if ($TaskId) { $details.taskId = $TaskId }
    Write-Log -Level 'warning' -Category 'alert' -Details $details
    try { Write-CommsEvent -Code $Code -TaskId $TaskId } catch {
      Write-Log -Level 'error' -Category 'comms_write_failed' -Details @{}
    }
    if ($Code -notmatch '^wakeup_wake-noroute$') {
      $alertLabel = if ($TaskId) { "ALERT:$Code(#$TaskId)" } else { "ALERT:$Code" }
      Add-WakeNote -Note $alertLabel
    }
  }
}

function Invoke-NodeText {
  param(
    [Parameter(Mandatory)][string]$ScriptPath,
    [string[]]$NodeArgs = @()
  )
  if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "Node helper not found: $ScriptPath"
  }
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $output = & $node $ScriptPath @NodeArgs 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Node helper failed with exit code $LASTEXITCODE" }
  return ($output -join "`n")
}

function Invoke-McpJson {
  param(
    [Parameter(Mandatory)][string]$Tool,
    [string]$ArgsJson = '{}'
  )
  $oldTimeout = $env:MCP_CALL_TIMEOUT_MS
  $env:MCP_CALL_TIMEOUT_MS = '20000'
  try {
    $raw = Invoke-NodeText -ScriptPath $script:McpCall -NodeArgs @(
      'Hephaistos-everything-search', $Tool, $ArgsJson
    )
    return $raw | ConvertFrom-Json -AsHashtable
  } finally {
    $env:MCP_CALL_TIMEOUT_MS = $oldTimeout
  }
}

function Invoke-McpMuxCheck {
  # Surveillance des configs MCP clientes (Devin surtout : Devin reecrit
  # %APPDATA%\devin\mcp_config.json en entrees directes — source non
  # identifiee). --verify --json de setup-mcp-mux.mjs est la reference :
  # toute entree de la liste `drift` (muxable ou exclu stale) = derive.
  # Copie forensique du fichier derive, alerte comms, puis reparation
  # (sauf -NoMcpConfigRepair). Verifie toutes les ~5 min max.
  param([Parameter(Mandatory)][DateTime]$Now)
  $setupScript = Join-Path $script:AgentDir 'setup\setup-mcp-mux.mjs'
  if (-not (Test-Path -LiteralPath $setupScript)) { return 'unavailable' }
  $last = ConvertTo-UtcDateTime -Value $script:State.lastMuxCheckAt -Fallback ([DateTime]::MinValue)
  if (($Now - $last).TotalMinutes -lt 5) { return 'skipped' }
  $script:State.lastMuxCheckAt = $Now.ToString('o')

  $verifyOut = ''
  try {
    # Appel direct : --verify sort 1 quand il y a derive, Invoke-NodeText
    # leverait une exception sur exit != 0 et masquait le JSON.
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $verifyOut = & $nodeExe $setupScript '--verify' '--json' 2>$null | Out-String
  } catch {
    $verifyOut = [string]$_
  }
  $drift = @()
  try {
    $parsed = $verifyOut | ConvertFrom-Json -AsHashtable
    $drift = @($parsed.drift)
  } catch { }
  if (-not $drift.Count) {
    $script:State.muxDriftSignature = $null
    return 'ok'
  }

  $signature = ($drift | ConvertTo-Json -Compress -Depth 5)
  # Copie forensique des fichiers client derives (horodatee, 20 max).
  $driftDir = Join-Path $script:AgentDir 'logs\mcp-drift'
  if (-not (Test-Path -LiteralPath $driftDir)) {
    New-Item -ItemType Directory -Path $driftDir -Force | Out-Null
  }
  $stamp = $Now.ToString('yyyyMMdd-HHmmss')
  foreach ($clientPath in @(
      (Join-Path $env:APPDATA 'devin\mcp_config.json'),
      (Join-Path $env:USERPROFILE '.gemini\config\mcp_config.json'),
      (Join-Path $env:USERPROFILE '.gemini\antigravity-ide\mcp_config.json')
    )) {
    if (Test-Path -LiteralPath $clientPath) {
      try {
        Copy-Item -LiteralPath $clientPath -Destination (Join-Path $driftDir "$(Split-Path $clientPath -Leaf)-$stamp.json") -Force
      } catch { }
    }
  }
  Get-ChildItem -LiteralPath $driftDir -Filter '*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip 20 |
    Remove-Item -Force -ErrorAction SilentlyContinue

  if ($signature -ne $script:State.muxDriftSignature) {
    $script:State.muxDriftSignature = $signature
    Write-Log -Level 'warning' -Category 'mcp_config_drift' -Details @{ drift = $drift }
    try { Write-CommsEvent -Code 'mcp_config_drift' } catch { }
  }

  if (-not $NoMcpConfigRepair) {
    try {
      $repairOut = & $nodeExe $setupScript 2>$null | Out-String
      Write-Log -Level 'info' -Category 'mcp_config_repaired' -Details @{ output = @($repairOut -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
    } catch {
      Set-Alert -Key 'mcp:repair-failed' -Code 'mcp_config_repair_failed'
      return 'repair-failed'
    }
    return 'drift-repaired'
  }
  return 'drift'
}

function Read-CommsDelta {
  if (-not (Test-Path -LiteralPath $script:CommsPath)) { return }
  $stream = $null
  try {
    $stream = [System.IO.File]::Open(
      $script:CommsPath,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::ReadWrite
    )
    $offset = [long]$script:State.commsOffset
    if ($offset -gt $stream.Length) { $offset = 0 }
    if ($stream.Length -le $offset) { return }
    $stream.Position = $offset
    $buffer = [byte[]]::new([int]($stream.Length - $offset))
    $read = $stream.Read($buffer, 0, $buffer.Length)
    $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
    $lastNewline = $text.LastIndexOf("`n")
    if ($lastNewline -lt 0) { return }
    $completeText = $text.Substring(0, $lastNewline)
    $script:State.commsOffset = $offset + [System.Text.Encoding]::UTF8.GetByteCount(
      $text.Substring(0, $lastNewline + 1)
    )
  } finally {
    if ($stream) { $stream.Dispose() }
  }

  foreach ($line in $completeText -split "`n") {
    if (-not $line.Trim()) { continue }
    try { $message = $line | ConvertFrom-Json -AsHashtable } catch { continue }
    $kind = [string](Get-Field $message 'kind')
    if (-not $kind.StartsWith('wake', [StringComparison]::OrdinalIgnoreCase)) { continue }
    $details = @{
      kind = $kind
      src = [string](Get-Field $message 'src')
      dst = [string](Get-Field $message 'dst')
    }
    $messageTaskId = Get-Field $message 'taskId'
    if ($null -ne $messageTaskId) { $details.taskId = [string]$messageTaskId }
    Write-Log -Level 'info' -Category 'wakeup' -Details $details
    $msgText = [string](Get-Field $message 'text')
    if ($msgText -match '\[WAKE\]\s+t.che\s+#(\d+)\s+.+\s+(completed|failed|cancelled)') {
      $tid = $Matches[1]
      $tstatus = $Matches[2]
      $wakeKey = "${tid}:${tstatus}"
      if (-not $script:State.wokenTasks.ContainsKey($wakeKey)) {
        $script:State.wokenTasks[$wakeKey] = [DateTime]::UtcNow.ToString('o')
        if ($msgText -match '\(non rout.\)' -and $msgText -notmatch 'agycascade:') {
          Add-WakeNote -Note "TASK #$tid -> $tstatus"
        }
      }
    }
    if ($kind -match '(?i)failed|noroute|unknown|disabled|unsupported') {
      $taskId = if ($null -ne $messageTaskId) { [string]$messageTaskId } else { '' }
      Set-Alert -Key "wakeup:${kind}:$taskId" -Code "wakeup_$kind" -TaskId $taskId
    }
  }
}

function Get-Dependencies {
  param($Task)
  $dependencies = Get-Field $Task 'dependencies'
  if (-not $dependencies) { return @() }
  try {
    $value = ([string]$dependencies) | ConvertFrom-Json
    return @($value | ForEach-Object { [string]$_ })
  } catch {
    return @('__invalid_dependencies__')
  }
}

function Test-DependenciesComplete {
  param($Task, [hashtable]$TasksById)
  foreach ($dependencyId in (Get-Dependencies -Task $Task)) {
    if (-not $TasksById.ContainsKey($dependencyId)) { return $false }
    if ([string]$TasksById[$dependencyId].status -ne 'completed') { return $false }
  }
  return $true
}

function Invoke-Snapshot {
  $script:ActiveAlertKeys = @{}
  $script:PendingWakeNotes.Clear()
  $now = [DateTime]::UtcNow
  Read-CommsDelta

  $tasks = @()
  $agents = @()
  $mcpOk = $false
  try {
    $tasks = @(Invoke-McpJson -Tool 'list_tasks' -ArgsJson '{}')
    $agents = @(Invoke-McpJson -Tool 'list_agents' -ArgsJson '{}')
    $mcpOk = $true
  } catch {
    Set-Alert -Key 'mcp:unavailable' -Code 'orchestrator_mcp_unavailable'
  }
  $watchHeartbeat = $null
  if ($mcpOk -and $HeartbeatTaskId) {
    try {
      $heartbeatArgs = @{ task_id = [string]$HeartbeatTaskId } | ConvertTo-Json -Compress
      $heartbeatResult = Invoke-McpJson -Tool 'task_heartbeat' -ArgsJson $heartbeatArgs
      $watchHeartbeat = (Get-Field $heartbeatResult 'heartbeat') -eq $true
      if (-not $watchHeartbeat) {
        Write-Log -Level 'warning' -Category 'watch_heartbeat_not_applied' -Details @{ taskId = $HeartbeatTaskId }
      }
    } catch {
      $watchHeartbeat = $false
      Write-Log -Level 'error' -Category 'watch_heartbeat_failed' -Details @{ taskId = $HeartbeatTaskId }
    }
  }

  $isInitialStatusSeed = ($script:State.taskStatuses.Count -eq 0)
  $tasksById = @{}
  foreach ($task in $tasks) {
    $taskId = Get-Field $task 'id'
    if ($null -ne $taskId) {
      $idStr = [string]$taskId
      $tasksById[$idStr] = $task
      $curStatus = [string](Get-Field $task 'status')
      $prevStatus = if ($script:State.taskStatuses.ContainsKey($idStr)) { [string]$script:State.taskStatuses[$idStr] } else { $null }
      $script:State.taskStatuses[$idStr] = $curStatus
      if (-not $isInitialStatusSeed -and $prevStatus -ne $curStatus -and $curStatus -in @('completed', 'failed', 'cancelled')) {
        $wakeKey = "${idStr}:${curStatus}"
        if (-not $script:State.wokenTasks.ContainsKey($wakeKey)) {
          $script:State.wokenTasks[$wakeKey] = $now.ToString('o')
          $tTitle = [string](Get-Field $task 'title')
          Add-WakeNote -Note "TASK #$idStr -> $curStatus ($tTitle)"
        }
      }
    }
  }
  $inProgress = @($tasks | Where-Object { $_.status -eq 'in_progress' })
  $pending = @($tasks | Where-Object { $_.status -eq 'pending' })
  $failed = @($tasks | Where-Object { $_.status -eq 'failed' })

  if ($mcpOk) {
    $liveTaskIds = @{}
    foreach ($task in $inProgress) {
      $id = [string](Get-Field $task 'id')
      $liveTaskIds[$id] = $true
      if (-not $script:State.taskFirstSeen.ContainsKey($id)) {
        $script:State.taskFirstSeen[$id] = $now.ToString('o')
      }

      if (-not (Test-DependenciesComplete -Task $task -TasksById $tasksById)) {
        Set-Alert -Key "task:deps:$id" -Code 'task_dependencies_unresolved' -TaskId $id
      }

      $firstSeen = ConvertTo-UtcDateTime -Value $script:State.taskFirstSeen[$id] -Fallback $now
      $ageMinutes = ($now - $firstSeen).TotalMinutes
      if ($ageMinutes -ge $StaleTaskMinutes) {
        Set-Alert -Key "task:stale:$id" -Code 'task_in_progress_stale' -TaskId $id
      }
      if ($ageMinutes -ge $CriticalTaskMinutes) {
        Set-Alert -Key "task:critical:$id" -Code 'task_in_progress_critical' -TaskId $id
      }

      $assignedId = [string](Get-Field $task 'assigned_to')
      if ($assignedId -and -not ($agents | Where-Object { [string]$_.id -eq $assignedId -and [int]$_.active -eq 1 })) {
        Set-Alert -Key "task:inactive-agent:$id" -Code 'task_assigned_agent_inactive' -TaskId $id
      }
    }

    foreach ($taskId in @($script:State.taskFirstSeen.Keys)) {
      if (-not $liveTaskIds.ContainsKey($taskId)) { $script:State.taskFirstSeen.Remove($taskId) }
    }

    foreach ($task in $pending) {
      if (-not (Get-Field $task 'assigned_to') -or -not (Test-DependenciesComplete -Task $task -TasksById $tasksById)) { continue }
      $createdAt = ConvertTo-UtcDateTime -Value (Get-Field $task 'created_at') -Fallback ([DateTime]::MinValue)
      if ($createdAt -ne [DateTime]::MinValue -and
          ($now - $createdAt).TotalMinutes -ge $StaleTaskMinutes) {
        $pendingTaskId = [string](Get-Field $task 'id')
        Set-Alert -Key "task:pending:$pendingTaskId" -Code 'task_pending_stale' -TaskId $pendingTaskId
      }
    }

    $artifactOwners = @{}
    foreach ($task in $inProgress) {
      $artifact = ([string](Get-Field $task 'expected_artifact')).Trim()
      if (-not $artifact) { continue }
      $key = $artifact.ToLowerInvariant()
      if (-not $artifactOwners.ContainsKey($key)) { $artifactOwners[$key] = @() }
      $artifactOwners[$key] += [string]$task.id
    }
    foreach ($owners in $artifactOwners.Values) {
      if ($owners.Count -gt 1) {
        Set-Alert -Key "task:artifact-collision:$($owners -join ',')" -Code 'task_expected_artifact_collision'
      }
    }
  }

  $cpu = $null
  try {
    $cpuRow = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    if ($cpuRow) { $cpu = [int]$cpuRow.PercentProcessorTime }
  } catch { }

  # Audit OOM (rapport 12) : surveiller la charge commit + RAM libre.
  # memFreeMB/commitUsedPct = METRIQUES (observation+alerte), pas liberation.
  $memFreeMB = $null
  $commitUsedPct = $null
  try {
    $osRow = Get-CimInstance Win32_OperatingSystem
    $memFreeMB = [int]($osRow.FreePhysicalMemory / 1024)
    if ($osRow.TotalVirtualMemorySize -gt 0) {
      $commitUsedPct = [int][Math]::Round(100 * ($osRow.TotalVirtualMemorySize - $osRow.FreeVirtualMemory) / $osRow.TotalVirtualMemorySize)
    }
  } catch { }
  if ($null -ne $commitUsedPct -and $commitUsedPct -ge 85) {
    Set-Alert -Key 'mem:commit-high' -Code 'commit_charge_high'
  } elseif ($null -ne $commitUsedPct -and $commitUsedPct -ge 80 -and $script:State.alerts.ContainsKey('mem:commit-high')) {
    $script:ActiveAlertKeys['mem:commit-high'] = $true
  }

  $processes = @()
  try { $processes = @(Get-CimInstance Win32_Process) } catch { }
  $workerProcesses = @($processes | Where-Object {
    $_.Name -match '^(agy|cargo|devin|hermes|kilo|ollama|opencode|rustc|vibe)(\.exe)?$' -or
    ($_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match 'nim-worker\.mjs')
  })
  if ($null -ne $cpu -and $cpu -ge 90 -and $workerProcesses.Count -eq 0) {
    if (-not $script:State.cpuHighSince) { $script:State.cpuHighSince = $now.ToString('o') }
    $cpuStart = ConvertTo-UtcDateTime -Value $script:State.cpuHighSince -Fallback $now
    if (($now - $cpuStart).TotalMinutes -ge 5) {
      Set-Alert -Key 'cpu:high-without-worker' -Code 'cpu_high_without_worker'
    }
  } else {
    $script:State.cpuHighSince = $null
  }

  $dbPulsePath = @("$script:DbPath-wal", $script:DbPath) |
    Where-Object { Test-Path -LiteralPath $_ } |
    Sort-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc } -Descending |
    Select-Object -First 1
  $dbAgeMinutes = $null
  if ($dbPulsePath) {
    $dbAgeMinutes = ($now - (Get-Item -LiteralPath $dbPulsePath).LastWriteTimeUtc).TotalMinutes
    if ($inProgress.Count -gt 0 -and $dbAgeMinutes -ge 30) {
      Set-Alert -Key 'db:stale' -Code 'orchestrator_db_pulse_stale'
    }
  } elseif ($inProgress.Count -gt 0) {
    Set-Alert -Key 'db:missing' -Code 'orchestrator_db_missing'
  }

  $health = 'unknown'
  try {
    $healthRaw = Invoke-NodeText -ScriptPath $script:McpCall -NodeArgs @(
      'Hephaistos-everything-search', 'hphe_health', '{}'
    )
    $healthResult = $healthRaw | ConvertFrom-Json -AsHashtable
    if ($healthResult.status -eq 'healthy' -and $healthResult.pipe_connected) { $health = 'healthy' }
    else { $health = 'unhealthy' }
  } catch { $health = 'unreachable' }
  if ($health -ne 'healthy') {
    try {
      & schtasks.exe /Run /TN '\hphe-indexd' *> $null
      Write-Log -Level 'info' -Category 'hphe_indexd_auto_revive' -Details @{}
      $healthRaw = Invoke-NodeText -ScriptPath $script:McpCall -NodeArgs @(
        'Hephaistos-everything-search', 'hphe_health', '{}'
      )
      $healthResult = $healthRaw | ConvertFrom-Json -AsHashtable
      if ($healthResult.status -eq 'healthy' -and $healthResult.pipe_connected) { $health = 'healthy' }
    } catch { }
  }
  if ($health -in @('unhealthy', 'unreachable')) {
    Set-Alert -Key 'health:hphe' -Code 'hphe_health_failed'
  }

  $bridge = 'unreachable'
  try {
    $bridgeResult = Invoke-NodeText -ScriptPath $script:BridgeHelper -NodeArgs @('status') |
      ConvertFrom-Json -AsHashtable
    if ($bridgeResult.status -eq 'connected') { $bridge = 'connected' }
  } catch { }
  if ($bridge -ne 'connected') {
    try {
      $candidates = @((Join-Path $WorkspaceRoot 'extensions\orchestrator-monitor\ws-bridge\bridge.js'))
      $candidates += Get-ChildItem "$env:USERPROFILE\.devin\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
      $candidates += Get-ChildItem "$env:USERPROFILE\.vscode\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
      $bridgeJs = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
      if ($bridgeJs) {
        Start-Process -FilePath 'node' -ArgumentList "`"$bridgeJs`"" -WorkingDirectory (Split-Path $bridgeJs -Parent) -WindowStyle Hidden -Environment @{ HEPHAISTOS_WORKSPACE = $WorkspaceRoot }
        Write-Log -Level 'info' -Category 'bridge_auto_revive' -Details @{ path = $bridgeJs }
        try {
          $bridgeResult = Invoke-NodeText -ScriptPath $script:BridgeHelper -NodeArgs @('status') |
            ConvertFrom-Json -AsHashtable
          if ($bridgeResult.status -eq 'connected') { $bridge = 'connected' }
        } catch { }
      }
    } catch { }
  }
  if ($bridge -ne 'connected') { Set-Alert -Key 'bridge:down' -Code 'websocket_bridge_unreachable' }

  $agyHub = 'unreachable'
  $agyConversationCount = 0
  try {
    $agyRows = @(Invoke-NodeText -ScriptPath $script:AgyHelper -NodeArgs @('list') |
      ConvertFrom-Json -AsHashtable)
      $agyConversationCount = @($agyRows).Count
    $agyHub = 'connected'
  } catch { }
  if ($agyHub -ne 'connected') { Set-Alert -Key 'hub:agy' -Code 'antigravity_hub_unreachable' }

  $muxStatus = [string](@(Invoke-McpMuxCheck -Now $now)[-1])

  $acpSummary = $null
  $lastAcpProbe = ConvertTo-UtcDateTime -Value $script:State.lastAcpProbeAt -Fallback ([DateTime]::MinValue)
  if (($now - $lastAcpProbe).TotalMinutes -ge 5) {
    try {
      $acpRows = @(Invoke-NodeText -ScriptPath $script:BridgeHelper -NodeArgs @('acp-list') |
        ConvertFrom-Json -AsHashtable)
      $acpSummary = @{}
      foreach ($row in $acpRows) {
        $provider = [string](Get-Field $row 'providerId')
        if (-not $acpSummary.ContainsKey($provider)) {
          $acpSummary[$provider] = @{ listed = 0; focused = 0; freshMin = $null }
        }
        $acpSummary[$provider].listed++
        if ((Get-Field $row 'focused') -eq $true) { $acpSummary[$provider].focused++ }
        $upd = ConvertTo-UtcDateTime -Value (Get-Field $row 'updatedAt') -Fallback $null
        if ($upd) {
          $ageMin = ($now - $upd).TotalMinutes
          if ($null -eq $acpSummary[$provider].freshMin -or $ageMin -lt $acpSummary[$provider].freshMin) {
            $acpSummary[$provider].freshMin = [Math]::Round($ageMin, 1)
          }
        }
      }
      $script:State.lastAcpProbeAt = $now.ToString('o')
    } catch {
      Set-Alert -Key 'hub:acp-list' -Code 'acp_session_inventory_unavailable'
    }
  }

  # --- Reaper ACP : l'IDE (Devin.exe NodeService) spawn des serveurs acp
  # en rafale lors de requetes echouees et ne les referme jamais. On purge
  # les processus acp dont le provider n'a aucune session vivante. ---
  $reapedCount = 0
  try {
    # Chaque provider a desormais son processus propre (registry ACP corrige :
    # nim/ollama/openrouter passent par les adaptateurs cli-anything-*).
    # Un processus n'est purge que si AUCUN provider de son groupe n'a de
    # session vivante.
    $acpWorkerPatterns = @(
      @{ Providers = @('opencode');   Match = { param($w) $w.Name -match '^opencode(\.exe)?$' -and $w.CommandLine -match '\bacp\b' } }
      @{ Providers = @('nim','nim2'); Match = { param($w) $w.Name -match '^node(\.exe)?$' -and $w.CommandLine -match 'nim-acp\.js' } }
      @{ Providers = @('ollama');     Match = { param($w) $w.Name -match '^node(\.exe)?$' -and $w.CommandLine -match 'ollama-acp\.js' } }
      @{ Providers = @('openrouter'); Match = { param($w) $w.Name -match '^node(\.exe)?$' -and $w.CommandLine -match 'openrouter-acp\.js' } }
      @{ Providers = @('kilo');       Match = { param($w) $w.Name -match '^node(\.exe)?$' -and $w.CommandLine -match 'kilocode/cli' -and $w.CommandLine -match '\bacp\b' } }
      @{ Providers = @('hermes');     Match = { param($w) $w.Name -match '^hermes(\.exe)?$' -and $w.CommandLine -match '\bacp\b' } }
    )
    $busyProviders = @($inProgress | ForEach-Object { [string](Get-Field $_ 'provider') } | Where-Object { $_ })
    foreach ($p in $processes) {
      if ($reapedCount -ge 6) { break }
      foreach ($pat in $acpWorkerPatterns) {
        if (-not (& $pat.Match $p)) { continue }
        $ageMin = ($now - $p.CreationDate).TotalMinutes
        if ($ageMin -lt 15) { break }
        $live = $false
        foreach ($prov in $pat.Providers) {
          if ($busyProviders -contains $prov) { $live = $true; break }
          if ($null -ne $acpSummary -and $acpSummary.ContainsKey($prov)) {
            $s = $acpSummary[$prov]
            if ($s.focused -gt 0 -or ($null -ne $s.freshMin -and $s.freshMin -lt 120)) { $live = $true; break }
          }
        }
        if (-not $live -and $null -eq $acpSummary -and $ageMin -lt 60) { $live = $true }
        if (-not $live) {
          try {
            & taskkill.exe /pid $p.ProcessId /t /f *> $null
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            $reapedCount++
            Write-Log -Level 'warning' -Category 'process_reaped' -Details @{ pid = $p.ProcessId; name = $p.Name; providers = $pat.Providers; ageMin = [int]$ageMin }
          } catch { }
        }
        break
      }
    }
    if ($reapedCount -gt 0) { Set-Alert -Key 'reaper:ghosts' -Code 'acp_ghost_workers_reaped' }
  } catch { }

  $summary = @{
    inProgress = $inProgress.Count
    pending = $pending.Count
    failed = $failed.Count
    recentFailedIds = @($failed | Select-Object -First 10 | ForEach-Object { [string]$_.id })
    cpuPercent = $cpu
    memFreeMB = $memFreeMB
    commitUsedPct = $commitUsedPct
    workerCount = $workerProcesses.Count
    dbPulseAgeMinutes = if ($null -ne $dbAgeMinutes) { [Math]::Round($dbAgeMinutes, 1) } else { $null }
    hpheHealth = $health
    bridge = $bridge
    agyHub = $agyHub
    agyConversationCount = $agyConversationCount
    mcpMux = $muxStatus
  }
  if ($HeartbeatTaskId) {
    $summary.watchTaskId = $HeartbeatTaskId
    $summary.watchTaskHeartbeat = $watchHeartbeat
  }
  if ($null -ne $acpSummary) { $summary.acpProviders = $acpSummary }
  Write-Log -Level 'info' -Category 'snapshot' -Details $summary

  if ($script:PendingWakeNotes.Count -gt 0 -and $agyHub -eq 'connected' -and $AgyCascadeId) {
    $wakeText = "[WATCHDOG -> TANGO] " + ($script:PendingWakeNotes -join ' | ') + " (inProgress=$($inProgress.Count), pending=$($pending.Count))"
    try {
      Invoke-NodeText -ScriptPath $script:AgyHelper -NodeArgs @(
        'send', $AgyCascadeId, '--model', $AgyModel, $wakeText
      ) | Out-Null
      $script:State.lastAgyWakeAt = $now.ToString('o')
      Write-Log -Level 'info' -Category 'agy_wake_sent' -Details @{ cascadeId = $AgyCascadeId; notes = @($script:PendingWakeNotes) }
    } catch {
      Write-Log -Level 'error' -Category 'agy_wake_failed' -Details @{ cascadeId = $AgyCascadeId }
    }
  }

  foreach ($key in @($script:State.alerts.Keys)) {
    if (-not $script:ActiveAlertKeys.ContainsKey($key)) { $script:State.alerts.Remove($key) }
  }
  Save-State
}

function Invoke-Bootstrap {
  # Phase BOOT : reprise des fonctions structurelles de l'ancien
  # start-workspace.ps1 — junctions memoire dual-mode, kick ingestion
  # incrementale, ws-bridge :7477, console-hider, beacon-sync, maintenance
  # memoire. Idempotent, chaque etape non fatale ; le monitoring continue
  # quoi qu'il arrive. La boucle d'ingestion continue est portee par
  # hphe-rest.exe :8792 (tache planifiee SYSTEM), pas reproduite ici.
  $logsDir = Split-Path $script:LogPath -Parent
  if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
  }
  $scriptsDir = Join-Path $WorkspaceRoot '.agent\scripts'
  Write-Log -Level 'info' -Category 'bootstrap_started' -Details @{ workspace = $WorkspaceRoot }

  # --- Stockage memoire dual-mode (port de init-project.ps1 Phase 4b) ---
  try {
    $envFile = Join-Path $WorkspaceRoot '.env'
    if (Test-Path -LiteralPath $envFile) {
      Get-Content -LiteralPath $envFile | ForEach-Object {
        if (-not $_.StartsWith('#') -and $_ -match '=') {
          $parts = $_.Split('=', 2)
          if ($parts[0].Trim() -eq 'AGENT_DB_ROOT' -and $parts[1].Trim()) {
            $env:AGENT_DB_ROOT = $parts[1].Trim() -replace '^["'']|["'']$', ''
          }
        }
      }
    }
    $agentMemDb = Join-Path $WorkspaceRoot '.agent\memory-database'
    $localMemDb = Join-Path $WorkspaceRoot 'memory-database'
    if ($env:AGENT_DB_ROOT) {
      $globalDir = Join-Path $env:AGENT_DB_ROOT 'current_workspace'
      foreach ($d in @($globalDir, "$globalDir\cache", "$globalDir\graph", "$globalDir\vector")) {
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
      }
      if (Test-Path -LiteralPath $localMemDb) {
        $it = Get-Item -LiteralPath $localMemDb -Force -ErrorAction SilentlyContinue
        if ($it -and $it.LinkType -eq 'Junction') {
          $cur = @($it.Target)[0]
          if ([IO.Path]::GetFullPath($cur) -ne [IO.Path]::GetFullPath($globalDir)) { $it.Delete() }
        } else {
          Get-ChildItem -LiteralPath $localMemDb -Force -ErrorAction SilentlyContinue | ForEach-Object {
            $dst = Join-Path $globalDir $_.Name
            if (-not (Test-Path -LiteralPath $dst)) { Move-Item $_.FullName $dst -Force -ErrorAction SilentlyContinue }
          }
          Remove-Item -LiteralPath $localMemDb -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
      if (-not (Test-Path -LiteralPath $localMemDb)) {
        New-Item -ItemType Junction -Path $localMemDb -Target $globalDir -Force | Out-Null
      }
      Write-Log -Level 'info' -Category 'bootstrap_memory' -Details @{ mode = 'global'; target = $globalDir }
    } else {
      foreach ($d in @("$localMemDb\agentmemory", "$agentMemDb\graph", "$agentMemDb\vector", "$agentMemDb\cache", (Join-Path $WorkspaceRoot '.agent\knowledge'))) {
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
      }
      Write-Log -Level 'info' -Category 'bootstrap_memory' -Details @{ mode = 'local' }
    }
    $staleJunction = Get-Item -LiteralPath (Join-Path $WorkspaceRoot 'semantic-cache-data') -Force -ErrorAction SilentlyContinue
    if ($staleJunction -and $staleJunction.LinkType -eq 'Junction') { $staleJunction.Delete() }
  } catch {
    Write-Log -Level 'error' -Category 'bootstrap_memory_failed' -Details @{ error = [string]$_ }
  }

  # --- Kicks detaches (pwsh hidden, non-bloquants pour la boucle) ---
  $ingestConfig = Join-Path $scriptsDir 'ingestion.config.json'
  foreach ($kick in @(
      @{ name = 'auto-ingest'; args = @('-File', (Join-Path $scriptsDir 'auto-ingest.ps1'), '-Mode', 'auto', '-ConfigPath', $ingestConfig) }
      @{ name = 'beacon-sync'; args = @('-File', (Join-Path $scriptsDir 'beacon-sync.ps1'), '-ConfigPath', $ingestConfig) }
      @{ name = 'memory-maintenance'; args = @('-File', (Join-Path $scriptsDir 'memory-maintenance.ps1')) }
    )) {
    $target = $kick.args[1]
    if (-not (Test-Path -LiteralPath $target)) { continue }
    try {
      Start-Process -FilePath 'pwsh' -ArgumentList (@('-NoProfile', '-ExecutionPolicy', 'Bypass') + $kick.args) -WindowStyle Hidden -WorkingDirectory $WorkspaceRoot
      Write-Log -Level 'info' -Category 'bootstrap_kick' -Details @{ script = $kick.name }
    } catch {
      Write-Log -Level 'error' -Category 'bootstrap_kick_failed' -Details @{ script = $kick.name; error = [string]$_ }
    }
  }

  # --- Console-hider : masque les consoles des process du kit ---
  $hider = Join-Path $scriptsDir 'console-hider.ps1'
  if (Test-Path -LiteralPath $hider) {
    try {
      $already = Get-CimInstance Win32_Process -Filter "Name='pwsh.exe' or Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'console-hider\.ps1' } |
        Select-Object -First 1
      if (-not $already) {
        Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$hider`"") -WindowStyle Hidden
        Write-Log -Level 'info' -Category 'bootstrap_kick' -Details @{ script = 'console-hider' }
      }
    } catch {
      Write-Log -Level 'error' -Category 'bootstrap_kick_failed' -Details @{ script = 'console-hider'; error = [string]$_ }
    }
  }

  # --- ws-bridge :7477 — fallback si l'extension n'est pas la ---
  try {
    $up = Get-NetTCPConnection -LocalPort 7477 -State Listen -ErrorAction SilentlyContinue
    if (-not $up) {
      $candidates = @((Join-Path $WorkspaceRoot 'extensions\orchestrator-monitor\ws-bridge\bridge.js'))
      $candidates += Get-ChildItem "$env:USERPROFILE\.devin\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
      $candidates += Get-ChildItem "$env:USERPROFILE\.vscode\extensions\hephaistos.orchestrator-monitor-*\ws-bridge\bridge.js" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
      $bridgeJs = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
      if ($bridgeJs) {
        Start-Process -FilePath 'node' -ArgumentList "`"$bridgeJs`"" -WorkingDirectory (Split-Path $bridgeJs -Parent) -WindowStyle Hidden -Environment @{ HEPHAISTOS_WORKSPACE = $WorkspaceRoot }
        Write-Log -Level 'info' -Category 'bootstrap_kick' -Details @{ script = 'ws-bridge'; path = $bridgeJs }
      }
    }
  } catch {
    Write-Log -Level 'error' -Category 'bootstrap_bridge_failed' -Details @{ error = [string]$_ }
  }

  Write-Log -Level 'info' -Category 'bootstrap_done' -Details @{}
}

if ($Once) {
  if (-not $SkipBootstrap) { Invoke-Bootstrap }
  Invoke-Snapshot
  exit 0
}

$timer = [System.Timers.Timer]::new($IntervalSeconds * 1000)
$timer.AutoReset = $true
$commsWatcher = $null
$eventSources = @()
try {
  Register-ObjectEvent -InputObject $timer -EventName Elapsed -SourceIdentifier 'ReactiveWatchdog.Timer' | Out-Null
  $eventSources += 'ReactiveWatchdog.Timer'
  $timer.Start()

  if (Test-Path -LiteralPath $script:AgentDir) {
    $commsWatcher = [System.IO.FileSystemWatcher]::new($script:AgentDir, 'comms.jsonl')
    $commsWatcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::Size
    Register-ObjectEvent -InputObject $commsWatcher -EventName Changed -SourceIdentifier 'ReactiveWatchdog.CommsChanged' | Out-Null
    Register-ObjectEvent -InputObject $commsWatcher -EventName Created -SourceIdentifier 'ReactiveWatchdog.CommsCreated' | Out-Null
    $eventSources += 'ReactiveWatchdog.CommsChanged', 'ReactiveWatchdog.CommsCreated'
    $commsWatcher.EnableRaisingEvents = $true
  }

  if (-not $SkipBootstrap) { Invoke-Bootstrap }
  Write-Log -Level 'info' -Category 'watch_started' -Details @{
    workspace = $WorkspaceRoot
    intervalSeconds = $IntervalSeconds
    database = $script:DbPath
  }
  Invoke-Snapshot
  while ($true) {
    $queuedEvent = Wait-Event -Timeout ($IntervalSeconds + 5)
    if ($queuedEvent) { Remove-Event -EventIdentifier $queuedEvent.EventIdentifier -ErrorAction SilentlyContinue }
    foreach ($queuedEvent in @(Get-Event -ErrorAction SilentlyContinue)) {
      if ($eventSources -contains $queuedEvent.SourceIdentifier) {
        Remove-Event -EventIdentifier $queuedEvent.EventIdentifier -ErrorAction SilentlyContinue
      }
    }
    try { Invoke-Snapshot } catch {
      Write-Log -Level 'error' -Category 'snapshot_failed' -Details @{}
    }
  }
} finally {
  $timer.Stop()
  foreach ($source in $eventSources) {
    Unregister-Event -SourceIdentifier $source -ErrorAction SilentlyContinue
  }
  if ($commsWatcher) {
    $commsWatcher.EnableRaisingEvents = $false
    $commsWatcher.Dispose()
  }
  $timer.Dispose()
}
