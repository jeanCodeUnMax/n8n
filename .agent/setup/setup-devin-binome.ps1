<#
.SYNOPSIS
    Configure le canal binome Devin <-> Antigravity et les hooks Devin.
.DESCRIPTION
    Installe/verifie tout ce qui touche Devin pour le binome :
      - hooks awareness.mjs (session-start, prompt-submit, stop)
      - extension monitor dans .devin/extensions et bridge ACP/WS
      - binome.js pair (validation en lecture seule, sans handshake automatique)
      - verification bridge WS 7477 + requête/ACK corrélés dans comms.jsonl
    Ne change pas le provider ACP préféré et n'établit pas de pair automatiquement.

    Tous les chemins sont RELATIFS au script (via $PSScriptRoot).
    Aucun chemin absolu codé en dur.
.EXAMPLE
    pwsh -File .agent\setup\setup-devin-binome.ps1
    pwsh -File .agent\setup\setup-devin-binome.ps1 -Verify
#>
[CmdletBinding()]
param(
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$KitRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DevinConfig = Join-Path $env:USERPROFILE '.config\devin'

$script:ok = 0; $script:warn = 0; $script:fail = 0
function Pass($m) { $script:ok++;   Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { $script:warn++; Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail($m) { $script:fail++; Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

if ($Verify) {
    Step 'Verification configuration binome Devin'

    # 1. Hooks awareness.mjs dans config.json
    $configFile = Join-Path $DevinConfig 'config.json'
    if (Test-Path $configFile) {
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        $hasHooks = $false
        if ($cfg.hooks) {
            foreach ($evt in @('SessionStart','UserPromptSubmit','Stop')) {
                if ($cfg.hooks.$evt) {
                    $match = $cfg.hooks.$evt | Where-Object { $_.hooks | Where-Object { $_.command -like '*awareness.mjs*' } }
                    if ($match) { $hasHooks = $true; break }
                }
            }
        }
        if ($hasHooks) { Pass 'hooks awareness.mjs dans ~/.config/devin/config.json' }
        else { Fail 'hooks awareness.mjs absents' }
    } else { Fail "config.json Devin introuvable : $configFile" }

    # 2. awareness.mjs present sur disque
    $awareness = Join-Path $KitRoot '.agent\devin\scripts\awareness.mjs'
    if (Test-Path $awareness) { Pass "awareness.mjs present : $awareness" }
    else { Fail "awareness.mjs absent : $awareness" }

    # 3. preferredAgent (config IDE interne — pas dans un settings.json standard)
    # On vérifie juste que l'extension monitor est installée (c'est elle qui gère ACP)
    $extDir = Join-Path $env:USERPROFILE '.devin\extensions'
    if (Test-Path $extDir) {
        $ext = Get-ChildItem $extDir -Filter 'hephaistos.orchestrator-monitor-*' -Directory | Sort-Object Name -Descending | Select-Object -First 1
        if ($ext) {
            try {
                $version = (Get-Content (Join-Path $ext.FullName 'package.json') -Raw | ConvertFrom-Json).version
                if ([version]$version -ge [version]'0.0.58') { Pass "extension monitor installee : $($ext.Name)" }
                else { Warn "extension monitor ${version}; l'injection ACP directe requiert 0.0.58+" }
            } catch { Warn 'version extension monitor illisible' }
        } else { Warn 'extension monitor non detectee dans .devin/extensions' }
    } else { Warn 'dossier .devin/extensions absent' }

    # 4. Bridge 7477
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', 7477)
        $tcp.Close()
        Pass 'bridge WS 7477 vivant'
    } catch { Fail 'bridge 7477 muet — extension orchestrator-monitor pas active' }

    # 5. Vérification de la découverte ACP multi-agent (lecture seule)
    $devinHub = Join-Path $KitRoot '.agent\agent-bridge\devin-hub.js'
    if (Test-Path $devinHub) {
        Push-Location $KitRoot
        try {
            $acpRaw = & node $devinHub acp-list 2>$null
            if ($LASTEXITCODE -eq 0) {
                $acpSessions = ($acpRaw | Out-String) | ConvertFrom-Json
                Pass "ACP discovery active ($(@($acpSessions).Count) sessions dans ce workspace)"
            } else { Warn 'ACP discovery non repondante; recharger la fenetre Devin' }
        } catch { Warn 'ACP discovery impossible; verifier l extension 0.0.58 et recharger Devin' }
        finally { Pop-Location }
    } else { Warn 'devin-hub.js absent; discovery ACP indisponible' }

    # 6. État du pair calculé par binome.js (lecture seule, handshakes corrélés)
    $binome = Join-Path $KitRoot '.agent\agent-bridge\binome.js'
    if (Test-Path $binome) {
        Push-Location $KitRoot
        try {
            $pairRaw = & node $binome --as devin pair 2>$null
            if ($LASTEXITCODE -eq 0) {
                $pair = ($pairRaw | Out-String) | ConvertFrom-Json
                if ($pair.established -and $pair.pairId) { Pass "pair frais vérifié ($($pair.pairId))" }
                else { Warn 'aucun pair frais; lancer /jointes AGY' }
            } else { Warn 'vérification du pair échouée; lancer /jointes AGY' }
        } catch { Warn 'vérification du pair impossible; lancer /jointes AGY' }
        finally { Pop-Location }
    } else { Warn 'binome.js absent' }

    Write-Host "`nRESULTAT : $script:ok OK, $script:warn avertissement(s), $script:fail echec(s)" -ForegroundColor Cyan
    if ($script:fail -gt 0) { exit 1 } else { exit 0 }
}

# --- MODE INSTALLATION ---
Step 'Configuration binome Devin'

# 1. Hooks awareness.mjs
$installScript = Join-Path $KitRoot '.agent\devin\install-devin-integration.ps1'
if (Test-Path $installScript) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $installScript 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Pass 'hooks awareness.mjs installes' }
    else { Warn 'install-devin-integration a retourne une erreur' }
} else { Fail "install-devin-integration.ps1 introuvable : $installScript" }

# 2. Extension monitor (gère le canal ACP + bridge 7477)
$extDir = Join-Path $env:USERPROFILE '.devin\extensions'
if (Test-Path $extDir) {
    $ext = Get-ChildItem $extDir -Filter 'hephaistos.orchestrator-monitor-*' -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if ($ext) { Pass "extension monitor detectee : $($ext.Name)" }
    else { Warn 'extension monitor pas encore installee — lance install-extension-hub.ps1' }
} else { Warn 'dossier .devin/extensions absent — extension monitor pas installee' }

# 3. Disponibilité de la commande binôme (aucun handshake automatique à l'installation)
$binome = Join-Path $KitRoot '.agent\agent-bridge\binome.js'
if (Test-Path $binome) {
    Pass 'binome.js disponible; établir un pair frais avec /jointes AGY'
} else { Fail "binome.js introuvable : $binome" }

# 4. Verification finale
Step 'Verification finale'
& $PSCommandPath -Verify
exit $LASTEXITCODE
