---
name: mcp-security-audit
description: Audit des fuites de ports MCP locaux.
---

# Audit de sécurité MCP

## Procédure

### 1. Lister les ports

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' } | Select-Object LocalAddress, LocalPort, OwningProcess
```

### 2. Identifier les processus MCP

```powershell
Get-Process -Id <PID> | Select-Object Id, ProcessName, Path, CommandLine
```

### 3. Vérifier la config Devin

Lire `%APPDATA%\Devin\mcp_config.json`. Vérifier stdio vs TCP, URL localhost, secrets en clair.

### 4. Corriger

Voir `references/correction-guide.md` pour les procédures détaillées par service (Qdrant, PostgreSQL, Ollama, agentmemory, monitor.js).

### 5. Générer le rapport

Créer un fichier `correction_port.md` à la racine du dossier serveurs avec le tableau récapitulatif, l'analyse par service, les procédures de correction et les suggestions d'architecture.

## Pièges

- MCP stdio vs TCP : vérifier réel avec netstat
- Processus orphelins : comparer PIDs
- Secrets en clair : renforcer permissions
- Écriture C:\Program Files\ : refusée, utiliser dossier temporaire

## Références

- `references/correction-guide.md` — Guide détaillé de correction des ports MCP exposés (Qdrant, PostgreSQL, Ollama, agentmemory, monitor.js) avec procédures étape par étape et commandes de vérification.

## Dépendances

- PowerShell (built-in Windows)
- Accès administrateur pour `netsh advfirewall` et écriture dans `Program Files`
- Accès aux fichiers de configuration (MCP, services)
