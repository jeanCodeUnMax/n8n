# MCP AutoStart - Script de demarrage automatique multi-IDE
# Ce script doit etre execute au demarrage de l'IDE (Devin, Antigravity, Cursor, KiloCode...)

param(
    [int]$DelayBetweenServers = 5
)

$ErrorActionPreference = "SilentlyContinue"

# Configuration des chemins - premier fichier de config MCP trouvé parmi les IDE connus
$IdeConfigCandidates = @(
    "$env:APPDATA\devin\mcp_config.json",
    "$env:USERPROFILE\.antigravity\mcp_config.json",
    "$env:USERPROFILE\.cursor\mcp.json",
    "$env:USERPROFILE\.kilocode\mcp_config.json",
    "$env:USERPROFILE\.config\kilo\mcp_config.json",
    "$env:APPDATA\Code\User\globalStorage\kilocode.kilo-code\settings\mcp_settings.json",
    "$env:APPDATA\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json",
    "$env:APPDATA\Cursor\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json",
    "$env:APPDATA\Antigravity\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json",
    "$env:APPDATA\Antigravity\User\globalStorage\kilocode.kilo-code\settings\mcp_settings.json"
)
$ConfigFile = $IdeConfigCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

$StateDir = Join-Path $PSScriptRoot "..\logs"
$LogFile = Join-Path $StateDir "mcp_autostart.log"
$PidFile = Join-Path $StateDir "mcp_pids.json"
if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Host $logEntry
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Get-MCPServersFromConfig {
    try {
        if (!(Test-Path $ConfigFile)) {
            Write-Log "ERREUR: Fichier de configuration introuvable: $ConfigFile"
            return $null
        }
        
        $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        $servers = @()
        
        foreach ($serverName in $config.mcpServers.PSObject.Properties.Name) {
            $serverConfig = $config.mcpServers.$serverName
            
            # Vérifier si le serveur n'est pas désactivé
            if ($serverConfig.disabled -eq $true) {
                Write-Log "Serveur [$serverName] désactivé, ignoré"
                continue
            }
            
            # Convertir l'objet d'environnement en hashtable (Requis par Start-Process)
            $envTable = @{}
            if ($serverConfig.PSObject.Properties.Name -contains "env" -and $null -ne $serverConfig.env) {
                foreach ($prop in $serverConfig.env.PSObject.Properties) {
                    $envTable[$prop.Name] = [string]$prop.Value
                }
            }
            
            $server = @{
                Name = $serverName
                Command = $serverConfig.command
                Args = $serverConfig.args
                Env = if ($envTable.Count -gt 0) { $envTable } else { $null }
                Delay = $DelayBetweenServers
            }
            
            $servers += $server
        }
        
        return $servers
    } catch {
        Write-Log "ERREUR lors de la lecture de la configuration: $($_.Exception.Message)"
        return $null
    }
}

# Nettoyer les anciens processus au demarrage
function Clear-StaleProcesses {
    Write-Log "Nettoyage des processus MCP existants..."
    
    # Obtenir la liste des serveurs actifs depuis la configuration
    $serversConfig = Get-MCPServersFromConfig
    if ($null -eq $serversConfig) {
        Write-Log "ERREUR: Impossible de charger la configuration pour le nettoyage"
        return
    }
    
    # Construire une regex avec tous les noms de serveurs actifs
    $serverNames = $serversConfig | ForEach-Object { $_.Name }
    $serverRegex = ($serverNames -join "|").Replace("-", "\-").Replace("_", "\_")
    
    Write-Log "Recherche de processus pour les serveurs actifs: $($serverNames -join ', ')"
    
    Get-Process -Name "node", "python" -ErrorAction SilentlyContinue | ForEach-Object {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        if ($cmd -match $serverRegex) {
            Write-Log "  Arret processus existant: PID $($_.Id) (correspond à: $serverRegex)"
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    
    Start-Sleep -Seconds 2
}

# Demarrage sequentiel
function Start-SequencialServers {
    Write-Log "=== DEMARRAGE SEQUENTIEL DES SERVEURS MCP ==="
    
    # Obtenir la configuration dynamique
    $ServerOrder = Get-MCPServersFromConfig
    
    if ($null -eq $ServerOrder) {
        Write-Log "ERREUR: Impossible de charger la configuration des serveurs"
        return @{}
    }
    
    Write-Log "Serveurs à démarrer: $($ServerOrder.Count)"
    
    $startedPids = @{}
    
    foreach ($server in $ServerOrder) {
        Write-Log "Demarrage: [$($server.Name)]"
        
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $server.Command
            $quotedArgs = $server.Args | ForEach-Object { 
                if ($_ -match ' ' -and !($_ -match '^".*"$')) { "`"$_`"" } else { $_ }
            }
            $psi.Arguments = $quotedArgs -join " "
            $psi.UseShellExecute = $false  # Changé à false pour permettre les variables d'environnement
            $psi.CreateNoWindow = $true
            $psi.WindowStyle = "Hidden"
            
            # Extraire le dossier de travail (CWD) à partir du premier argument (le script)
            $scriptPath = $server.Args[0]
            if (Test-Path $scriptPath) {
                $psi.WorkingDirectory = [System.IO.Path]::GetDirectoryName($scriptPath)
            } else {
                $psi.WorkingDirectory = $env:USERPROFILE
            }
            
            # Configurer les variables d'environnement
            if ($server.Env) {
                foreach ($envVar in $server.Env.PSObject.Properties) {
                    $psi.EnvironmentVariables[$envVar.Name] = $envVar.Value
                }
            }
            
            $process = [System.Diagnostics.Process]::Start($psi)
            
            Start-Sleep -Milliseconds 500
            
            if ($process.HasExited -and $process.ExitCode -ne 0) {
                Write-Log "  ERREUR: Code sortie $($process.ExitCode)"
            } else {
                $startedPids[$server.Name] = $process.Id
                Write-Log "  OK: PID $($process.Id)"
            }
            
            # Delai avant le prochain serveur
            Write-Log "  Attente: $($server.Delay) secondes"
            Start-Sleep -Seconds $server.Delay
            
        } catch {
            Write-Log "  ERREUR: $($_.Exception.Message)"
        }
    }
    
    # Sauvegarder les PIDs
    $startedPids | ConvertTo-Json | Out-File $PidFile -Encoding UTF8
    
    Write-Log "=== DEMARRAGE TERMINE ==="
    return $startedPids
}

# === MAIN (DÉSACTIVÉ) ===
# NOTE: Le démarrage manuel des serveurs MCP est désactivé.
# Utilisez votre IDE (Devin, Antigravity, Cursor, KiloCode, Cline) pour configurer et lancer vos serveurs MCP.
# Cela évite les conflits de ports et les doublons de processus.

Write-Log "!!! INFO: Démarrage manuel MCP désactivé. L'IDE gère désormais les serveurs."
# Clear-StaleProcesses
# $pids = Start-SequencialServers
# Write-Log "Serveurs actifs: $($pids.Count)"
# $pids.GetEnumerator() | ForEach-Object {
#     Write-Log "  $($_.Key): PID $($_.Value)"
# }

