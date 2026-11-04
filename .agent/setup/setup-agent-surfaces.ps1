<#
.SYNOPSIS
    Installe la configuration agents Hephaistos2-Kit sur TOUTES les surfaces IDE.

.DESCRIPTION
    Propage la couche agent (règles globales + skills) vers chaque client :

    RÈGLES — source de vérité : .agent/rules/global_rules.md
      - Devin CLI    : ~/.config/devin/global_rules.md          (copie complète)
      - Devin IDE    : ~/.claude/CLAUDE.md                      (bloc marqué, merge)
      - Windsurf     : ~/.codeium/windsurf/memories/global_rules.md (copie complète)
      - Antigravity  : ~/.gemini/GEMINI.md                      (bloc marqué, merge —
                       le fichier contient l'identité Hermes, jamais écrasé)

    SKILLS — source : %LOCALAPPDATA%/hermes/skills (skills gérées par le kit)
      - %APPDATA%/devin/skills          (Devin global)
      - ~/.config/devin/skills          (Devin CLI)
      - ~/.gemini/config/skills         (Antigravity global)
      - ~/.antigravity/skills           (Antigravity compat)
      ~/.claude/skills n'est PAS touché : bibliothèque utilisateur de ~860 skills.

    Idempotent : ré-exécutable sans casse. Backup .bak-<ts> avant chaque écriture
    de fichier de règles. Les skills copient uniquement les dossiers manquants/
    différents, sans jamais supprimer ce qui existe déjà à destination.

.PARAMETER DryRun
    Affiche les actions sans rien écrire.
.PARAMETER SkipRules
    Ne touche pas aux fichiers de règles.
.PARAMETER SkipSkills
    Ne touche pas aux dossiers de skills.
.PARAMETER HermesSkillsDir
    Source des skills (défaut : %LOCALAPPDATA%\hermes\skills).

.EXAMPLE
    pwsh -File .agent\setup\setup-agent-surfaces.ps1 -DryRun
    pwsh -File .agent\setup\setup-agent-surfaces.ps1
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Verify,
    [switch]$SkipRules,
    [switch]$SkipSkills,
    [string]$HermesSkillsDir = "$env:LOCALAPPDATA\hermes\skills"
)

$ErrorActionPreference = 'Stop'
$KitRoot   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # <kit>/.agent/setup -> <kit>
$RulesSrc  = Join-Path $KitRoot '.agent\rules\global_rules.md'
$markerBeg = '<!-- HEPHAISTOS:RULES:BEGIN -->'
$markerEnd = '<!-- HEPHAISTOS:RULES:END -->'

$script:done = 0; $script:skipped = 0; $script:warn = 0; $script:fail = 0
function Ok($m)   { $script:done++;    Write-Host "  [OK]   $m" -ForegroundColor Green }
function Skip($m) { $script:skipped++; Write-Host "  [SKIP] $m" -ForegroundColor DarkGray }
function Warn($m) { $script:warn++;    Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail($m) { $script:fail++;    Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

if ($Verify) {
    Step 'Verification de conformite des surfaces (mode lecture seule)'
    if (-not (Test-Path $RulesSrc)) { Fail "Source regles introuvable : $RulesSrc"; exit 1 }
    $srcNorm = ((Get-Content $RulesSrc -Raw) -replace "`r`n", "`n").Trim()

    # 1. Devin CLI
    $p = "$env:USERPROFILE\.config\devin\global_rules.md"
    if ((Test-Path $p) -and (((Get-Content $p -Raw) -replace "`r`n", "`n").Trim() -eq $srcNorm)) { Ok "Devin CLI (~/.config/devin/global_rules.md) conforme" }
    else { Fail "Devin CLI non conforme ou absent ($p)" }

    # 2. Devin IDE
    $p = "$env:USERPROFILE\.claude\CLAUDE.md"
    if ((Test-Path $p) -and ((Get-Content $p -Raw) -match [regex]::Escape($markerBeg))) { Ok "Devin IDE (~/.claude/CLAUDE.md) bloc Hephaistos present" }
    else { Fail "Devin IDE non conforme ou absent ($p)" }

    # 3. Windsurf
    $p = "$env:USERPROFILE\.codeium\windsurf\memories\global_rules.md"
    if ((Test-Path $p) -and (((Get-Content $p -Raw) -replace "`r`n", "`n").Trim() -eq $srcNorm)) { Ok "Windsurf (~/.codeium/windsurf/memories) conforme" }
    else { Fail "Windsurf non conforme ou absent ($p)" }

    # 4. Antigravity (config/rules + GEMINI.md persona)
    $p = "$env:USERPROFILE\.gemini\config\rules\global_rules.md"
    $p2 = "$env:USERPROFILE\.gemini\GEMINI.md"
    if ((Test-Path $p) -and (((Get-Content $p -Raw) -replace "`r`n", "`n").Trim() -eq $srcNorm)) { Ok "Antigravity config rules (~/.gemini/config/rules) conforme" }
    elseif (Test-Path $p2) { Ok "Antigravity identity (~/.gemini/GEMINI.md) active" }
    else { Fail "Antigravity non conforme ou absent ($p / $p2)" }

    # 5. Devin Global Skills (/chat-id et /jointes)
    $d1 = "$env:APPDATA\devin\skills\chat-id\SKILL.md"
    $d2 = "$env:APPDATA\devin\skills\jointes\SKILL.md"
    if ((Test-Path $d1) -and (Test-Path $d2)) {
        $c1 = Get-Content $d1 -Raw
        $c2 = Get-Content $d2 -Raw
        if (($c1 -match '(?m)^name:\s*chat-id\s*$') -and ($c2 -match '(?m)^name:\s*jointes\s*$')) {
            Ok "Devin global skills (/chat-id, /jointes) conformes"
        } else {
            Fail "Devin global skills frontmatter non conforme"
        }
    } else {
        Fail "Devin global skills manquantes ($d1 ou $d2)"
    }

    # 6. Antigravity Global Skills (~/.gemini/config/skills)
    $a1 = "$env:USERPROFILE\.gemini\config\skills\chat-id\SKILL.md"
    $a2 = "$env:USERPROFILE\.gemini\config\skills\jointes\SKILL.md"
    if ((Test-Path $a1) -and (Test-Path $a2)) {
        $c1 = Get-Content $a1 -Raw
        $c2 = Get-Content $a2 -Raw
        if (($c1 -match '(?m)^name:\s*chat-id\s*$') -and ($c2 -match '(?m)^name:\s*jointes\s*$')) {
            Ok "Antigravity global skills (~/.gemini/config/skills) conformes"
        } else {
            Fail "Antigravity global skills frontmatter non conforme"
        }
    } else {
        Fail "Antigravity global skills manquantes ($a1 ou $a2)"
    }

    Write-Host "`nRESULTAT VERIFICATION : $($script:done) conforme(s), $($script:fail) non conforme(s)" -ForegroundColor Cyan
    if ($script:fail -gt 0) { exit 1 } else { exit 0 }
}

function Backup-And-Write([string]$Path, [string]$Content) {
    if ($DryRun) { Write-Host "  [DRY]  écrirait $Path" -ForegroundColor DarkYellow; return }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    if (Test-Path $Path) {
        Copy-Item $Path "$Path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force
    }
    Set-Content $Path $Content -Encoding UTF8
}

function Copy-Rules-Full([string]$Dest, [string]$Label) {
    $src = Get-Content $RulesSrc -Raw
    $srcNorm = ($src -replace "`r`n", "`n").Trim()
    if (Test-Path $Dest) {
        $curNorm = ((Get-Content $Dest -Raw) -replace "`r`n", "`n").Trim()
        if ($curNorm -eq $srcNorm) { Skip "$Label déjà conforme"; return }
    }
    Backup-And-Write $Dest $src
    Ok "$Label <- copie complète"
}

function Merge-Rules-Block([string]$Dest, [string]$Label) {
    $src = Get-Content $RulesSrc -Raw
    $block = "$markerBeg`n$src`n$markerEnd"
    $cur = if (Test-Path $Dest) { Get-Content $Dest -Raw } else { '' }
    if ($cur -match [regex]::Escape($markerBeg)) {
        # Remplace uniquement le bloc marqué, préserve le reste du fichier.
        $pattern = "(?s)$([regex]::Escape($markerBeg)).*?$([regex]::Escape($markerEnd))"
        $new = [regex]::Replace($cur, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block })
        if ($new -eq $cur) { Skip "$Label bloc déjà à jour"; return }
        Backup-And-Write $Dest $new
        Ok "$Label bloc Hephaistos mis à jour"
    } else {
        # Pas de bloc : on ajoute à la fin, jamais d'écrasement du fichier existant.
        Backup-And-Write $Dest ($cur.TrimEnd() + "`n`n$block`n")
        Ok "$Label bloc Hephaistos ajouté (contenu existant préservé)"
    }
}

# ---------------------------------------------------------------- RÈGLES ----
if (-not $SkipRules) {
    if (-not (Test-Path $RulesSrc)) { throw "Source règles introuvable : $RulesSrc" }
    Step 'Règles globales'
    Copy-Rules-Full  "$env:USERPROFILE\.config\devin\global_rules.md"                'Devin CLI  (~/.config/devin)'
    Merge-Rules-Block "$env:USERPROFILE\.claude\CLAUDE.md"                            'Devin IDE  (~/.claude/CLAUDE.md)'
    Copy-Rules-Full  "$env:USERPROFILE\.codeium\windsurf\memories\global_rules.md"   'Windsurf   (~/.codeium/memories)'
    Copy-Rules-Full  "$env:USERPROFILE\.gemini\config\rules\global_rules.md"         'Antigravity rules (~/.gemini/config/rules)'
    Merge-Rules-Block "$env:USERPROFILE\.gemini\GEMINI.md"                            'Antigravity (~/.gemini/GEMINI.md)'
} else { Step 'Règles globales — ignorées (-SkipRules)' }

# ---------------------------------------------------------------- SKILLS ----
if (-not $SkipSkills) {
    Step 'Skills'
    if (-not (Test-Path $HermesSkillsDir)) {
        Warn "source skills introuvable : $HermesSkillsDir — étape sautée"
    } else {
        # jointes/chat-id sont des VARIANTS par surface (perspective --as propre a
        # chaque agent) : devin -> .devin/skills via install-devin-integration.ps1,
        # AGY -> ~/.gemini/config/skills, hermes -> natif. Ne pas les propager
        # ici : la variante hermes ecraserait celles des autres surfaces.
        $PerAgentSkills = @('jointes', 'chat-id', 'session-id', 'jointes-project', 'chat-id-project')
        $srcDirs = Get-ChildItem $HermesSkillsDir -Directory |
            Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') } |
            Where-Object { $PerAgentSkills -notcontains $_.Name }
        $targets = @(
            @{ Path = "$env:APPDATA\devin\skills";              Label = 'Devin global (%APPDATA%)' },
            @{ Path = "$env:USERPROFILE\.config\devin\skills";  Label = 'Devin CLI (~/.config)' },
            @{ Path = "$env:USERPROFILE\.gemini\config\skills"; Label = 'Antigravity (~/.gemini/config/skills)' },
            @{ Path = "$env:USERPROFILE\.antigravity\skills";   Label = 'Antigravity compat (~/.antigravity/skills)' }
        )
        foreach ($t in $targets) {
            if ($DryRun) { Write-Host "  [DRY]  $($srcDirs.Count) skills -> $($t.Path)" -ForegroundColor DarkYellow; continue }
            New-Item -ItemType Directory -Force -Path $t.Path | Out-Null
            $n = 0
            foreach ($d in $srcDirs) {
                $dst = Join-Path $t.Path $d.Name
                # Copie si absent, ou si le SKILL.md diffère (le kit est la vérité).
                $curSkill = if (Test-Path "$dst\SKILL.md") { Get-Content "$dst\SKILL.md" -Raw } else { '' }
                if (-not (Test-Path $dst) -or
                    (Get-Content (Join-Path $d.FullName 'SKILL.md') -Raw) -ne $curSkill) {
                    Copy-Item $d.FullName $dst -Recurse -Force
                    $n++
                }
            }
            if ($n -gt 0) { Ok "$($t.Label) : $n skill(s) copiée(s)" } else { Skip "$($t.Label) déjà à jour" }
        }

        # Installation des skills globales canoniques AGY (~/.gemini/config/skills) create-if-missing
        $agySkillsDir = "$env:USERPROFILE\.gemini\config\skills"
        $agySources = @(
            @{ Source = Join-Path $KitRoot '.agent\skills\chat-id-project\SKILL.md'; Canonical = 'chat-id' },
            @{ Source = Join-Path $KitRoot '.agent\skills\jointes-project\SKILL.md'; Canonical = 'jointes' }
        )
        foreach ($item in $agySources) {
            $destFile = Join-Path $agySkillsDir "$($item.Canonical)\SKILL.md"
            if (-not (Test-Path $destFile)) {
                if (Test-Path $item.Source) {
                    $sourceName = "$($item.Canonical)-project"
                    $namePattern = "(?m)^name:\s*$([regex]::Escape($sourceName))\s*$"
                    if ($DryRun) { Write-Host "  [DRY] installerait skill AGY canonique $($item.Canonical) -> $destFile" -ForegroundColor DarkYellow }
                    else {
                        $content = Get-Content $item.Source -Raw
                        if ($content -notmatch $namePattern) {
                            Fail "Frontmatter invalide dans $($item.Source) (attendu name: $sourceName)"
                            continue
                        }
                        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destFile) | Out-Null
                        $content = [regex]::Replace($content, $namePattern, "name: $($item.Canonical)", 1)
                        Set-Content -Path $destFile -Value $content -Encoding UTF8
                        Ok "Skill AGY canonique $($item.Canonical) initialisée"
                    }
                }
            } else {
                Skip "Skill AGY globale $($item.Canonical) déjà présente (préservée)"
            }
        }
    }
} else { Step 'Skills — ignorées (-SkipSkills)' }

# ------------------------------------------------------------- RAPPEL ---------
Step 'Rappels'
Write-Host '  - Hooks Devin (awareness.mjs) : pwsh -File .agent\devin\install-devin-integration.ps1' -ForegroundColor DarkGray
Write-Host '  - Env + Gemini CLI + DB     : node .agent\setup\setup-config.mjs' -ForegroundColor DarkGray
Write-Host '  - VSIX monitor + hub agy    : pwsh -File .agent\setup\install-extension-hub.ps1' -ForegroundColor DarkGray
Write-Host "  - Projets cibles (.agent)   : pwsh -File .agent\scripts\sync-agent-layer.ps1 -Target <projet>" -ForegroundColor DarkGray

Write-Host "`nRESULTAT : $($script:done) action(s), $($script:skipped) déjà conforme(s), $($script:warn) avertissement(s)" -ForegroundColor Cyan
