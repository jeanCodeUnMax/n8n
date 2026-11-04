param(
    [string]$ExpectedVersion = '0.0.61',
    [ValidateSet('devin', 'vscode', 'windsurf', 'all')]
    [string]$TargetIde = 'devin',
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ext  = Join-Path $root 'extensions\orchestrator-monitor'
$selectedIdes = if ($TargetIde -eq 'all') { @('devin', 'vscode', 'windsurf') } else { @($TargetIde) }
$script:ok = 0; $script:warn = 0; $script:fail = 0
function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Pass($m) { $script:ok++;   Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { $script:warn++; Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail($m) { $script:fail++; Write-Host "  [FAIL] $m" -ForegroundColor Red }

if (-not $CheckOnly) {
    Step '[1/6] Build orchestrator-monitor (npm i + tsc + vsce)'
    Push-Location $ext
    $vsix = $null
    try {
        if (-not (Test-Path 'node_modules')) { npm install | Out-Null }
        npm run compile 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Pass 'tsc compile OK' } else { Fail 'tsc a echoue'; Pop-Location; exit 1 }
        npx --yes @vscode/vsce package 2>&1 | Out-Null
        $vsix = Get-ChildItem *.vsix | Sort-Object { [version]($_.BaseName -replace '.*-','') } | Select-Object -Last 1
        if ($vsix) { Pass "VSIX produit : $($vsix.Name)" } else { Fail 'pas de .vsix produit'; Pop-Location; exit 1 }
    } finally { Pop-Location }

    Step '[2/6] Installation du VSIX'
    $installed = 0
    foreach ($ide in $selectedIdes) {
        if ($ide -eq 'devin') {
            # devin n'a pas de --install-extension : extraction directe du VSIX
            # dans .devin\extensions\<id-ver>. Jamais 'code' (lance VS Code).
            $pkg = [IO.Path]::Combine($vsix.FullName)
            $tmp = Join-Path $env:TEMP ("hpx-" + [guid]::NewGuid().ToString('N'))
            $zip = "$tmp.zip"
            Copy-Item $pkg $zip -Force
            Expand-Archive $zip $tmp -Force
            $pj = Get-Content (Join-Path $tmp 'extension\package.json') -Raw | ConvertFrom-Json
            $dest = Join-Path $env:USERPROFILE ".devin\extensions\$($pj.publisher).$($pj.name)-$($pj.version)"
            Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
            New-Item -ItemType Directory -Force $dest | Out-Null
            Copy-Item -Recurse -Force (Join-Path $tmp 'extension\*') $dest
            Remove-Item -Recurse -Force $tmp, $zip -ErrorAction SilentlyContinue
            if (Test-Path $dest) {
                Pass "installee pour 'devin' -> $dest - RELOAD la fenetre (Ctrl+Shift+P -> Developer: Reload Window)"
                $installed++
            } else {
                Warn "extraction VSIX echouee pour 'devin'"
            }
            continue
        }
        $cli = if ($ide -eq 'windsurf') { 'windsurf' } else { 'code' }
        $extraArgs = @()
        $cmd = Get-Command $cli -ErrorAction SilentlyContinue
        if ($cmd) {
            $installArgs = @('--install-extension', $vsix.FullName, '--force') + $extraArgs
            & $cmd.Source @installArgs 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Pass "installee pour '$ide' via $cli - RELOAD la fenetre (Ctrl+Shift+P -> Developer: Reload Window)"
                $installed++
            } else {
                Warn "installation echouee pour '$ide' via $cli"
            }
        } else {
            Warn "CLI '$cli' absent pour la cible '$ide'"
        }
    }
    if (-not $installed) { Warn "aucune cible installee - installer a la main depuis $($vsix.FullName)" }
} else {
    Step '[1/6] Build & Install - sautes (-CheckOnly)'
}

Step '[3/6] Version extension installee vs attendue'
$extDirs = @()
foreach ($ide in $selectedIdes) {
    $extensionRoot = switch ($ide) {
        'devin' { Join-Path $env:USERPROFILE '.devin\extensions' }
        'vscode' { Join-Path $env:USERPROFILE '.vscode\extensions' }
        'windsurf' { Join-Path $env:USERPROFILE '.codeium\windsurf\extensions' }
    }
    $extDirs += Get-ChildItem (Join-Path $extensionRoot 'hephaistos.orchestrator-monitor-*') -ErrorAction SilentlyContinue
}

$foundVersion = $null
$latestDir = $null
foreach ($d in $extDirs) {
    $pkg = Join-Path $d.FullName 'package.json'
    if (Test-Path $pkg) {
        try {
            $v = (Get-Content $pkg -Raw | ConvertFrom-Json).version
            if (-not $foundVersion -or [version]$v -gt [version]$foundVersion) {
                $foundVersion = $v
                $latestDir = $d.FullName
            }
        } catch {}
    }
}
if ($foundVersion) {
    if ([version]$foundVersion -ge [version]$ExpectedVersion) {
        Pass "orchestrator-monitor v$foundVersion detectee (attendue >= $ExpectedVersion, chemin: $latestDir)"
    } else {
        Warn "orchestrator-monitor v$foundVersion obsolette (attendue >= $ExpectedVersion) - relancer sans -CheckOnly pour maj"
    }
} else {
    Fail "orchestrator-monitor non detectee dans les extensions IDE (attendue >= $ExpectedVersion)"
}

Step '[4/6] Antigravity - CLI, extension et hub'
$agy = Join-Path $env:LOCALAPPDATA 'agy\bin\agy.exe'
if (Test-Path $agy) { Pass "agy.exe trouve : $agy" } else { Fail 'agy.exe absent - installer Antigravity' }
$hubs = Get-CimInstance Win32_Process -Filter "Name='agy.exe'" |
    Where-Object { $_.CommandLine -match '--hub' -and $_.CommandLine -match '--hub-port' }
if ($hubs) {
    foreach ($h in $hubs) {
        $port = [regex]::Match($h.CommandLine, '--hub-port[ =](\d+)').Groups[1].Value
        Pass "hub agy actif (PID $($h.ProcessId), port $port)"
    }
} else { Warn 'aucun hub agy actif - demarre avec le panneau Antigravity de l IDE' }

Step '[5/6] Surfaces de regles et canal binome'
# Surfaces de regles
$surfScript = Join-Path $PSScriptRoot 'setup-agent-surfaces.ps1'
if (Test-Path $surfScript) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $surfScript -Verify 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Pass 'surfaces de regles conformes (devin, claude, windsurf, gemini)' }
    else { Warn 'surfaces de regles non conformes - lancer setup-agent-surfaces.ps1 pour resynchroniser' }
} else { Warn "script surfaces introuvable : $surfScript" }

# Configuration Devin pour le binome (hooks awareness + IDs)
$devinBinomeScript = Join-Path $PSScriptRoot 'setup-devin-binome.ps1'
if (Test-Path $devinBinomeScript) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $devinBinomeScript -Verify
    if ($LASTEXITCODE -eq 0) { Pass "configuration Devin/hook vérifiée; consulter aussi l’état du pair" }
    else { Warn 'config Devin binome incomplete - lancer setup-devin-binome.ps1' }
} else { Warn "script binome Devin introuvable : $devinBinomeScript" }

# Le contrôle -Verify ci-dessus utilise binome.js pair; ne pas valider des IDs historiques bruts.

Step '[6/6] Sante des services et bridge WS 7477'
$t = Test-NetConnection 127.0.0.1 -Port 7477 -WarningAction SilentlyContinue -InformationLevel Quiet
if ($t) { Pass 'ws-bridge 7477 vivant (orchestrator-monitor actif)' }
else { Warn 'ws-bridge 7477 muet - verifier le demarrage du monitor ou relancer' }

try { $r = Invoke-RestMethod 'http://127.0.0.1:7478/health' -TimeoutSec 3; Pass "a2a-gateway : $($r | ConvertTo-Json -Compress)" }
catch { Warn 'a2a-gateway (7478) down - optionnel (node a2a-gateway\server.js)' }

$bc = Get-Service BeaconCollector -ErrorAction SilentlyContinue
if ($bc -and $bc.Status -eq 'Running') { Pass 'BeaconCollector Running' }
else { Warn 'BeaconCollector arrete - Restart-Service BeaconCollector -Force (admin)' }

Write-Host "`nRESULTAT : $script:ok OK, $script:warn avertissement(s), $script:fail echec(s)" -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
