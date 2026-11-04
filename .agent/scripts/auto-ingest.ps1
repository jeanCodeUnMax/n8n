Param(
    [string]$ConfigPath = "",
    [ValidateSet('auto','force','skip')]
    [string]$Mode = 'auto'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ===========================================================================
# AUTO-INGEST — délègue à l'ingestion incrémentale Rust (hphe-kit).
# L'état vit dans data/content-index/ingest-state.json (size+mtime par fichier)
# — le backend sait lui-même quels fichiers ont changé ; plus besoin de
# comparer LastWrite ici. 'auto' et 'force' font la même chose, Rust décide.
# ===========================================================================

if ($Mode -eq 'skip') { Write-Host "[auto-ingest] skip demandé."; exit 0 }

$IngestScript = Join-Path $PSScriptRoot 'ingest-workspace.ps1'
# -Force:($bool) ne survit pas à la frontière `<shell> -File` (le booléen
# arrive en string -> [switch] refuse). On ne passe le switch que si besoin.
$ingestArgs = @('-NoProfile', '-File', $IngestScript, '-Mode', 'once')
if ($Mode -eq 'force') { $ingestArgs += '-Force' }
& pwsh @ingestArgs
