# Guide Quickstart - Hephaistos2-Kit

## 🚀 Démarrage Rapide

### 1. Nouveau Projet

```powershell
# Créer un dossier projet
mkdir MonProjet && cd MonProjet

# Initialiser (crée .agent/, mémoire unifiée, MCP config)
pwsh -File .agent/scripts/init-project.ps1
```

### 2. Configurer l'IDE

Chaque utilisateur configure son propre IDE. La config MCP est personnelle.

```powershell
# Démarrer le workspace (injection + surveillance)
pwsh -File .agent\scripts\start-workspace.ps1 -IngestMode auto
```

**Note** : La config MCP se trouve dans le fichier de config de votre IDE :

- Devin : `%APPDATA%/devin/mcp_config.json`
- Antigravity : `~/.antigravity/mcp_config.json`
- Cursor : `~/.cursor/mcp.json`
- KiloCode : `~/.kilocode/mcp_config.json` (ou `~/.config/kilo/mcp_config.json`)
- KiloCode (ext. VS Code) : `%APPDATA%/Code/User/globalStorage/kilocode.kilo-code/settings/mcp_settings.json`
- Cline/Roo (ext.) : `%APPDATA%/<IDE>/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`

### 3. Ouvrir les IDE

```text
Ouvrir Devin → Ouvre le dossier MonProjet
Ouvrir Cursor     → Ouvre le dossier MonProjet
Ouvrir KiloCode → cd MonProjet && kilocode
```

**C'est tout !** Les IDE sont synchronisés.

---

## 📁 Structure Créée

```text
MonProjet/
├── .agent/
│   ├── rules/
│   │   └── global_rules.md      ← Rules globales
│   ├── scripts/
│   │   └── start-workspace.ps1  ← Injection + surveillance
│   └── docs/
│       └── MANIFEST.md          ← État du projet
│
├── memory-database/             ← Junction vers mémoire unifiée
├── .env                          ← Variables d'environnement (portable)
└── MANIFEST.md                   ← Contexte projet figé
```

---

## 🔧 Architecture Portabile

| Élément        | Source                         | Description                          |
| -------------- | ------------------------------ | ------------------------------------ |
| **MCP Config** | Config IDE personnelle         | Chaque utilisateur configure son IDE |
| **Variables**  | `.env`                         | Chemins via `${AGENT_DB_ROOT}`       |
| **Rules**      | `.agent/rules/global_rules.md` | Règles du projet                     |
| **Mémoire**    | `memory-database/`             | Partagée via junction                |

---

## 📋 Rules Globales vs Locales

### Architecture des Rules

```text
┌─────────────────────────────────────────────────────────────┐
│  .agent/rules/global_rules.md (SOURCE DE VÉRITÉ)            │
│                                                               │
│  Contient:                                                    │
│  - Règles Asimov                                             │
│  - Protocole d'évaluation des skills                         │
│  - Clean Garden Policy                                        │
│  - Orchestration MCP                                          │
│  - Langue obligatoire                                         │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Devin     │   │    Cursor       │   │  KiloCode     │
│ .devin/    │   │ .cursor/rules/  │   │ .kilocode/    │
│ rules/        │   │               │   │ rules/        │
│ (copie auto)  │   │ (copie auto)  │   │ (copie auto)  │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Fonctionnement

1. **Rules globales** dans `.agent/rules/global_rules.md`
2. **Sync** copie automatiquement vers chaque IDE
3. **Chaque IDE** lit ses rules locales
4. **Modification** → Modifier `.agent/rules/global_rules.md` → Resync

---

## 🎯 Workflow Typique

```powershell
# 1. Démarrer un projet
mkdir MonJeu && cd MonJeu
pwsh -File .agent/scripts/start-workspace.ps1

# 2. Sync les IDE
pwsh -File .agent\scripts\sync-ide-config.ps1 -IDE all

# 3. Ouvrir Devin
devin-open MonJeu

# 4. Demander une tâche
"Crée un jeu Pacman en HTML"

# 5. Si besoin de changer d'IDE
# Fermer Devin, ouvrir Cursor
# Cursor lit le MANIFEST, voit les tâches en cours
# Continue exactement où Devin s'est arrêté
```

---

## ✅ Checklist de Vérification

- [ ] `.agent/rules/global_rules.md` existe
- [ ] `.env` existe avec `AGENT_DB_ROOT`
- [ ] `MANIFEST.md` existe
- [ ] `memory-database/` est une junction
- [ ] Config MCP personnelle configurée dans l'IDE

---

## 🔄 Mise à Jour

```powershell
# Modifier les variables d'environnement
# Éditer .env

# Redémarrer le workspace
pwsh -File .agent\scripts\start-workspace.ps1 -IngestMode auto
```

---

## 📞 Support

- `MANIFEST.md` → État du projet
- `MCP_COORDINATION.md` → Partage des MCP
- `HANDOFF_PROTOCOL.md` → Transfert inter-IDE
- SQLite → `SELECT * FROM entities WHERE entityType='task'`

---

**C'est simple** :

1. Injection
2. Sync
3. Ouvrir les IDE
4. Travailler
