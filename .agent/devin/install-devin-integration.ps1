# install-devin-integration.ps1 — installe la couche Devin globale Hephaistos2-Kit
# Usage : pwsh -File .agent\devin\install-devin-integration.ps1 [-HermesSkillsDir <path>]
[CmdletBinding()]
param(
    [string]$HermesSkillsDir = "$env:LOCALAPPDATA\hermes\skills",
    [string]$DevinConfigDir  = "$env:USERPROFILE\.config\devin",
    [string]$DevinSkillsDir  = "$env:APPDATA\devin\skills"
)

$ErrorActionPreference = 'Stop'
$LayerDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Installation couche Devin (Hephaistos2-Kit) ===" -ForegroundColor Cyan

# 1. Scripts
$scriptsTarget = Join-Path $DevinConfigDir 'scripts'
New-Item -ItemType Directory -Force -Path $scriptsTarget | Out-Null
Copy-Item (Join-Path $LayerDir 'scripts\*.mjs') $scriptsTarget -Force
Write-Host "[1/4] Scripts copiés -> $scriptsTarget" -ForegroundColor Green

# 2. Hooks : fusion dans config.json (backup d'abord)
$configFile = Join-Path $DevinConfigDir 'config.json'
if (-not (Test-Path $configFile)) { '{}' | Set-Content $configFile -Encoding UTF8 }
Copy-Item $configFile "$configFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force

$cfg = Get-Content $configFile -Raw | ConvertFrom-Json
if (-not $cfg.hooks) { $cfg | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{}) }

$events = @{
    SessionStart      = 'session-start'
    UserPromptSubmit  = 'prompt-submit'
    Stop              = 'stop'
}
foreach ($evt in $events.Keys) {
    $cmd = "node '$($scriptsTarget -replace '\\','\\')\awareness.mjs' $($events[$evt])"
    if (-not $cfg.hooks.$evt) {
        $cfg.hooks | Add-Member -NotePropertyName $evt -NotePropertyValue @()
    }
    $already = $cfg.hooks.$evt | Where-Object { $_.hooks | Where-Object { $_.command -like '*awareness.mjs*' } }
    if (-not $already) {
        $cfg.hooks.$evt += [pscustomobject]@{
            hooks = @([pscustomobject]@{ type = 'command'; command = $cmd; timeout = 30 })
        }
        Write-Host "[2/4] Hook '$evt' ajouté" -ForegroundColor Green
    } else {
        Write-Host "[2/4] Hook '$evt' déjà présent (skip)" -ForegroundColor Yellow
    }
}
$cfg | ConvertTo-Json -Depth 20 | Set-Content $configFile -Encoding UTF8

# 3. Skills Hermès -> Devin global
if (Test-Path $HermesSkillsDir) {
    New-Item -ItemType Directory -Force -Path $DevinSkillsDir | Out-Null
    $excludeHermes = @('jointes', 'chat-id', 'session-id', 'jointes-project', 'chat-id-project')
    Get-ChildItem -Path $HermesSkillsDir -Directory | Where-Object { $excludeHermes -notcontains $_.Name } | ForEach-Object {
        $dst = Join-Path $DevinSkillsDir $_.Name
        if (-not (Test-Path $dst)) {
            Copy-Item $_.FullName $dst -Recurse -Force
        }
    }
    $count = (Get-ChildItem $DevinSkillsDir -Directory).Count
    Write-Host "[3/4] $count skills copiés/présents -> $DevinSkillsDir" -ForegroundColor Green
} else {
    Write-Host "[3/4] Skills Hermès introuvables : $HermesSkillsDir (skip)" -ForegroundColor Yellow
}

# 3b. Skills binôme canoniques (jointes, chat-id) -> global (toutes les sessions/workspaces)
$KitRoot = Split-Path -Parent (Split-Path -Parent $LayerDir)
$kitSkills = Join-Path $KitRoot '.devin\skills'
if (Test-Path $kitSkills) {
    $canonicalPairs = @(
        @{ SourceDir = 'chat-id-project'; CanonicalName = 'chat-id' },
        @{ SourceDir = 'jointes-project'; CanonicalName = 'jointes' }
    )
    foreach ($dstRoot in @($DevinSkillsDir, (Join-Path $DevinConfigDir 'skills'))) {
        New-Item -ItemType Directory -Force -Path $dstRoot | Out-Null
        foreach ($pair in $canonicalPairs) {
            $srcDir = Join-Path $kitSkills $pair.SourceDir
            $targetDir = Join-Path $dstRoot $pair.CanonicalName
            $targetFile = Join-Path $targetDir 'SKILL.md'
            if (-not (Test-Path $targetFile)) {
                if (Test-Path (Join-Path $srcDir 'SKILL.md')) {
                    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
                    $content = Get-Content (Join-Path $srcDir 'SKILL.md') -Raw
                    $sourceName = [regex]::Escape($pair.SourceDir)
                    $namePattern = "(?m)^name:\s*$sourceName\s*$"
                    if ($content -notmatch $namePattern) {
                        Write-Warning "Frontmatter invalide dans $srcDir\SKILL.md; skill globale $($pair.CanonicalName) ignorée"
                        continue
                    }
                    $content = [regex]::Replace($content, $namePattern, "name: $($pair.CanonicalName)", 1)
                    Set-Content -Path $targetFile -Value $content -Encoding UTF8
                }
            }
        }
    }
    # doc du protocole embarquée à côté de la skill globale
    $protoDoc = Join-Path $KitRoot 'docs\protocole-binome\README.md'
    if (Test-Path $protoDoc) {
        foreach ($dstRoot in @($DevinSkillsDir, (Join-Path $DevinConfigDir 'skills'))) {
            $protoTarget = Join-Path $dstRoot 'jointes\protocole-binome.md'
            if (-not (Test-Path $protoTarget)) {
                Copy-Item $protoDoc $protoTarget -Force
            }
        }
    }
    Write-Host "[3b] Skills binôme canoniques (/chat-id, /jointes) vérifiées/installées -> global" -ForegroundColor Green
} else {
    Write-Host "[3b] .devin/skills introuvable (kit absent) - skip" -ForegroundColor Yellow
}

# 4. Rappel enregistrement orchestrateur
Write-Host "[4/4] Pour enregistrer Devin dans l'orchestrateur MCP :" -ForegroundColor Cyan
Write-Host '  register_agent("devin", "cli", {"skills":["*"],"command":"devin -p \"{message}\" --respect-workspace-trust false"})'
Write-Host "=== Terminé. Vérifiez avec /hooks et /mcp dans une session Devin. ===" -ForegroundColor Cyan
