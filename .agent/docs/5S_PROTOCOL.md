# Protocole 5S - Méthode Toyotisme

## Application au Workspace

### 1. SEIRI (Trier) - Éliminer l'inutile

**Règles**:

- Pas de duplication de fichiers
- Pas de code mort
- Pas de MCP non utilisé
- Pas de logs mélangés

**Mise en œuvre**:

```powershell
# Vérifier les duplications
Get-ChildItem -Recurse -File | Group-Object Name | Where-Object Count -gt 1

# Nettoyer les logs anciens
Get-ChildItem "logs/*.log" | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
```

### 2. SEITON (Ranger) - Chaque chose à sa place

**Structure standardisée**:

```text
workspace/
├── .agent/              ← Configuration et scripts
│   ├── agents/          ← Définitions des agents
│   ├── skills/          ← Compétences atomiques
│   ├── rules/           ← Règles globales
│   ├── scripts/         ← Scripts PowerShell
│   ├── knowledge/       ← Documentation
│   └── docs/            ← Protocoles
├── memory-database/     ← Junction vers mémoire unifiée
├── MANIFEST.md          ← État du projet
└── src/                 ← Code source du projet
```

**Règles**:

- Un fichier = une responsabilité
- Un dossier = un domaine
- Pas de fichier à la racine (sauf MANIFEST.md)

### 3. SEISO (Nettoyer) - Maintenir la propreté

**Actions automatiques**:

- Logs séparés par IDE: `cache_devin.log`, `cache_cursor.log`
- Ingestion automatique des logs dans RAG
- Détection des erreurs : digests Beacon + rapport `maintenance:last_report` (kv)

**Vérification quotidienne**:

```powershell
# Vérifier la santé des logs
Get-ChildItem "logs/*.log" | ForEach-Object {
    $errors = Select-String -Path $_.FullName -Pattern "ERROR"
    if ($errors) { Write-Host "Erreurs dans $($_.Name): $($errors.Count)" }
}
```

### 4. SEIKETSU (Standardiser) - Créer des standards

**Standards définis**:

| Élément     | Standard               | Fichier                           |
| ----------- | ---------------------- | --------------------------------- |
| Variables   | .env                   | Portable via ${AGENT_DB_ROOT}     |
| Rules       | global_rules.md        | Source de vérité                  |
| État projet | MANIFEST.md            | Versionné                         |
| Config MCP  | Config IDE personnelle | Chaque utilisateur gère sa config |

**Templates**:

- `Error_Template` → Structure des erreurs
- `Correction_Template` → Structure des corrections
- `Task_Template` → Structure des tâches

### 5. SHITSUKE (Suivre) - Respecter les règles

**Vérification continue**:

- Respect des boundaries agents
- Respect du quota MCP (5 requêtes)
- Respect du protocole de handoff
- Respect de la langue (français)

**Audit automatique**:

```sql
-- Vérifier les tâches sans owner
SELECT * FROM entities WHERE entityType = 'task'
AND id NOT IN (SELECT entity_id FROM observations WHERE content LIKE 'owner:%');

-- Vérifier les erreurs non résolues
SELECT * FROM entities WHERE entityType = 'error'
AND id IN (SELECT entity_id FROM observations WHERE content = 'resolved: false');
```

---

## Intégration dans le Workflow

### Avant chaque session

1. **Seiri**: Vérifier pas de duplication
2. **Seiton**: Vérifier la structure
3. **Seiso**: Vérifier les logs

### Pendant chaque session

4. **Seiketsu**: Respecter les standards
2. **Shitsuke**: Respecter les règles

### Après chaque session

- Mettre à jour MANIFEST.md
- Nettoyer les fichiers temporaires
- Documenter les décisions

---

## Avantages

| Avantage              | Résultat                |
| --------------------- | ----------------------- |
| **Moins d'erreurs**   | Structure claire        |
| **Plus rapide**       | Chaque chose à sa place |
| **Plus stable**       | Standards respectés     |
| **Plus maintenable**  | Nettoyage régulier      |
| **Plus collaboratif** | Règles partagées        |
