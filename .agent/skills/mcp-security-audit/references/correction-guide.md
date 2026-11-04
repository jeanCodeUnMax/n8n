# Guide de correction des ports MCP exposés

## Récapitulatif des services et ports

| Service | Port(s) | Constat | Priorité |
|---|---|---|---|
| Qdrant (qdrant.exe) | 6333, 6334 | Écoute 0.0.0.0, pas d'API key | HAUTE |
| PostgreSQL (postgres.exe) | 5432 | Écoute 0.0.0.0, mot de passe faible (n8n1234) | HAUTE |
| Ollama (ollama.exe) | 11434 | Écoute 0.0.0.0, pas d'auth | MOYENNE |
| agentmemory (node.exe) | 3333-3341 | 7 instances orphelines, stdio attendu | HAUTE |
| monitor.js (script maison) | 3055 | Écoute 0.0.0.0 | MOYENNE |

## Correction Qdrant

### Option A — Configuration interne

1. Localiser la config Qdrant :
   - `%APPDATA%\Qdrant\qdrant_config.json` ou `%LOCALAPPDATA%\Qdrant\config.yaml`
   - Si inexistant, créer

2. Modifier le binding :
   ```json
   { "host": "127.0.0.1", "port": 6333 }
   ```
   ou en variable d'environnement :
   ```
   QDRANT__HOST=127.0.0.1
   QDRANT__PORT=6333
   ```

3. Redémarrer le service Qdrant

### Option B — Firewall Windows

```cmd
netsh advfirewall firewall add rule name="Block-Qdrant-External" dir=in action=block protocol=TCP localport=6333 remoteip=any profile=any
netsh advfirewall firewall add rule name="Block-Qdrant-External-6334" dir=in action=block protocol=TCP localport=6334 remoteip=any profile=any
```

### Vérification

```powershell
Get-NetTCPConnection -LocalPort 6333,6334 -State Listen | Select-Object LocalAddress, LocalPort
```
Doit retourner uniquement 127.0.0.1 ou ::1

## Correction PostgreSQL

1. Éditer `postgresql.conf` :
   - Chemin typique : `C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`
   - Modifier : `listen_addresses = '127.0.0.1'`
   - Redémarrer le service (`services.msc` ou `pg_ctl restart`)

2. Vérifier `pg_hba.conf` :
   - Commenter/supprimer les lignes avec `0.0.0.0/0` ou `::0/0`
   - Garder : `host all all 127.0.0.1/32 scram-sha-256`
   - Recharger : `pg_ctl reload`

3. Renforcer le mot de passe :
   ```sql
   ALTER USER postgres PASSWORD '<nouveau_mot_de_passe_fort>';
   ```
   - Mettre à jour `POSTGRES_PASSWORD` dans `mcp_config.json`

### Vérification

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | Select-Object LocalAddress, LocalPort
```

## Correction Ollama

1. Éditer le fichier de config Ollama :
   - Localiser : `%LOCALAPPDATA%\Ollama\config.yaml`
   - Ajouter : `host: 127.0.0.1`

2. Ou via variable d'environnement :
   ```
   OLLAMA_HOST=http://127.0.0.1:11434
   ```

3. Authentification (si exposition nécessaire) :
   ```
   ollama serve --auth
   ```

### Vérification

```powershell
Get-NetTCPConnection -LocalPort 11434 -State Listen | Select-Object LocalAddress, LocalPort
curl http://127.0.0.1:11434/api/tags  # doit fonctionner
curl http://<IP_LOCALE>:11434/api/tags  # doit échouer
```

## Correction agentmemory (processus node.exe sur ports 3333-3341)

### Identification

1. Lire le fichier source du serveur :
   - `<REPOS>\agentMemory\out\mcp-server\server.js`
2. Chercher les appels de binding :
   - `server.listen(...)`
   - `app.listen(...)`
   - `express()`
   - `createServer(...)`
   - `net.createServer(...)`
3. Si présent, supprimer ou conditionner à un flag explicite (`--port`, `MCP_MODE=stdio`)

### Arrêt des instances orphelines

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 3333 -and $_.LocalPort -le 3341 } | Select-Object OwningProcess, LocalPort
Stop-Process -Id <liste_des_PIDs>
```

## Correction monitor.js (port 3055)

1. Ouvrir `<REPOS>\maigret\.agent\scripts\monitor.js`
2. Identifier la ligne de binding (`.listen(3055, '0.0.0.0')` ou `.listen(3055)`)
3. Modifier pour `.listen(3055, '127.0.0.1')`
4. Redémarrer le script

## Procédure générique de restriction par firewall

Pour tous les services non reconfigurables :

```cmd
netsh advfirewall firewall add rule name="Block-<Service>" dir=in action=block protocol=TCP localport=<PORT> remoteip=any profile=any
```

> Note : Ces règles bloquent l'accès depuis le réseau externe (et local). L'accès localhost reste fonctionnel.

## Ordre de correction recommandé

1. Qdrant (priorité haute) — données vectorielles sensibles
2. PostgreSQL (priorité haute) — base de données avec mot de passe faible
3. agentmemory instances (priorité haute) — processus orphelines
4. Ollama (priorité moyenne) — modèles locaux
5. monitor.js (priorité moyenne) — script maison

## Vérification globale post-correction

```powershell
# Lister tous les ports encore exposés
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' } | Format-Table LocalAddress, LocalPort, OwningProcess

# Vérifier spécifiquement les ports MCP
$mcpPorts = 6333,6334,5432,11434,3333,3334,3335,3336,3337,3338,3339,3340,3341,3055
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $mcpPorts } | Select-Object LocalAddress, LocalPort, OwningProcess, @{N='ProcessName';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}}
```

**Résultat attendu** : `LocalAddress` = `127.0.0.1` ou `::1` pour tous les ports MCP, ou ports ne sont plus écoutés.

## Sécurisation du fichier mcp_config.json

- Le fichier contient des secrets en clair (API keys, mot de passe PostgreSQL)
- Solutions :
  1. Utiliser des variables d'environnement (`${env:MISTRAL_API_KEY}`) au lieu des valeurs littérales
  2. Utiliser un vault (Windows Credential Manager, HashiCorp Vault) si le MCP client le supporte
  3. Restreindre les permissions du fichier en lecture seule :
     ```cmd
     icacls "%USERPROFILE%\AppData\Roaming\devin\mcp_config.json" /grant:r "%USERNAME%:R"
     ```

## Dépendances

- PowerShell (built-in Windows)
- Accès administrateur pour `netsh advfirewall` et écriture dans `Program Files`
- Accès aux fichiers de configuration (MCP, services)
