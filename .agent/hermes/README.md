> **OBSOLETE (v1)** — ce document décrit l architecture Python/Node pré-unification (Qdrant, Zvec, MCP séparés, Everything.exe). Conservé pour historique/rollback. Référence actuelle : `.agent/ARCHITECTURE.md` + `docs/hephaistos-engine/`.

# Couche d'intégration Hermès pour Hephaistos2-Kit

Ce dossier contient les éléments nécessaires pour utiliser le système de mémoire unifiée, les MCP, les agents et les compétences de Hephaistos2-Kit dans un workspace **Hermès**, sans modifier le projet original.

## Structure

```
.agent/hermes/
├── templates/               # Modèles de fichiers de configuration
│   ├── AGENTS.md            # Règles projet compatibles Hermès
│   └── SOUL.hermes.md       # Identité session sur mesure
├── hermes-init.ps1          # Script d'injection principal
├── skills-adapters/         # Adaptateurs de compétences (futur)
└── agents-ref/              # Références aux agents Hephaistos (futur)
```

## Utilisation

### Injection dans un nouveau projet Hermès

Depuis le répertoire racine d'un projet Hermès :

```powershell
# Depuis le projet cible
pwsh -File ..\..\.agent\hermes\hermes-init.ps1

# Ou avec des paramètres explicites
pwsh -File .agent\hermes\hermes-init.ps1 `
    -ProjectPath <PROJECTS_ROOT>\mon-projet-hermès `
    -ProjectId mon-projet-hermès `
    -DbRoot <HEPHAISTOS_DATA>
```

Le script crée :
1. **Structure de stockage** (`memory-database/`) si absente
2. **Junction** vers le workspace global (mode dual, comme Hephaistos2-Kit)
3. **Couche `.agent/hermes/`** (répertoires pour adaptateurs et refs)
4. **Fichier `.env`** avec `AGENT_DB_ROOT` et `PROJECT_ID`
5. **Fichier `AGENTS.md`** — règles projet compatibles Hermès
6. **Fichier `SOUL.hermes.md`** — identité session sur mesure

### Ce que fait l'injection

| Étape | Action | Ne modifie PAS |
|-------|--------|----------------|
| 1 | Crée `memory-database/` local | Rien |
| 2 | Établit junction vers stockage global | Rien (si déjà existant) |
| 3 | Crée `.agent/hermes/templates/` | Rien |
| 4 | Ajoute `.env` si absent, met à jour si nécessaire | `.env` existant sinon |
| 5 | Crée `AGENTS.md` (nouveau fichier) | Fichiers existants |
| 6 | Crée `.agent/hermes/SOUL.hermes.md` | Rien |

**Le projet Hephaistos2-Kit reste intact.** L'injection ajoute uniquement ce qui est nécessaire pour Hermès.

### Après l'injection

1. **Redémarrer Hermès** (ou relancer la session) pour charger `AGENTS.md` + `SOUL.hermes.md`
2. **Vérifier la mémoire** : utiliser `memory_search` (hphe-mcp) pour tester la connexion
3. **Créer un MANIFEST.md** si nécessaire (procédure dans Hephaistos2-Kit)

---

## MCP disponibles (configurez globalement une fois)

Ces MCP sont configurés dans `$HOME/.hermes/config.yaml` (voir `hermes mcp list`) :

| MCP | Chemin serveur | Usage |
|-----|----------------|-------|
| Memory | `<HEPHAISTOS_ROOT>/mcp/servers/memory/dist/index.js` | Knowledge Graph |
| Qdrant | `<HEPHAISTOS_ROOT>/mcp/servers/qdrant-mcp-server/build/index.js` | Vector 2048D |
| Zvec | `<HEPHAISTOS_ROOT>/mcp/servers/zvec-mcp-server/build/index.js` | Vector 384D local |
| sqlite-node | `<HEPHAISTOS_ROOT>/mcp/servers/mcp-quick-sqlite3/dist/index.js` | SQLite multi-DB |
| filesystem | `<HEPHAISTOS_ROOT>/mcp/servers/filesystem/dist/index.js` | Fichiers |
| kaggle | `<HEPHAISTOS_ROOT>/mcp/servers/kaggle-mcp/.venv/Scripts/kaggle-mcp-server.exe` | Kaggle |
| colab-mcp | `uvx git+https://github.com/googlecolab/colab-mcp` | Colab |
| devin/context7 | `<USERPROFILE>/AppData/Roaming/npm/node_modules/@upstash/context7-mcp/dist/index.js` | Docs libs |

---

## Concepts clés

### Stockage dual (local + global)

Le système utilise deux niveaux de stockage :

- **Local** : `memory-database/` dans le projet — toujours présent, contient l'agentmemory locale
- **Global** : `<HEPHAISTOS_DATA>/current_workspace/<PROJECT_ID>/` — stockage partagé accessible par tous les projets via junction

La junction permet au projet de "voir" le stockage global tout en gardant une structure locale cohérente.

### AGENT_DB_ROOT

Variable d'environnement qui définit la racine de stockage global. Dans ce projet, elle est définie dans `.env` :

```
AGENT_DB_ROOT=<HEPHAISTOS_DATA>
PROJECT_ID=mon-projet-hermès
```

### PROJECT_ID

Identifiant unique du projet pour l'isolation mémoire. Permet à plusieurs projets d'utiliser la même base globale sans conflit.

---

## Adaptateurs de compétences (futur)

Le répertoire `skills-adapters/` est réservé aux adaptateurs de compétences spécifiques à Hermès. Ces adaptateurs permettront de :

- Traduire les appels MCP traditionnels en appels compatibles avec les outils Hermès
- S'adapter aux spécificités du workspace Hermès (chemins, permissions, etc.)
- Fournir des wrappers pour les fonctionnalités fréquentes

## Références aux agents Hephaistos (futur)

Le répertoire `agents-ref/` contiendra des références aux agents Hephaistos2-Kit pour utilisation dans Hermès via `delegate_task`. Chaque fichier décrira :

- Le rôle de l'agent
- Les compétences associées
- Les protocoles d'interaction
- Les chemins d'accès aux ressources

---

## Dépannage

### La mémoire ne semble pas accessible

1. Vérifier que les MCP sont démarrés : `hermes mcp list`
2. Vérifier que `AGENT_DB_ROOT` est correct dans `.env`
3. Vérifier la junction : `Get-Item memory-database | Select-Object LinkType, Target`

### Le workspace global n'est pas créé

1. Vérifier que le répertoire parent existe : `Test-Path <HEPHAISTOS_DATA>/current_workspace`
2. Si nécessaire, créer manuellement : `New-Item -ItemType Directory -Path <HEPHAISTOS_DATA>/current_workspace -Force`

---

*Dernière mise à jour : 2026-09-17*
