# Adaptateur Projet — Hephaistos2-Kit

> Wrapper pour les opérations courantes sur les projets.

---

### Créer un MANIFEST.md

```
Équivalent: Template Hephaistos2-Kit (init-project.ps1)

Usage: Initialiser un nouveau projet avec le MANIFEST standard.
```

**Procédure :**
1. Identifier le type de projet (web, mobile, backend, cli, game, library, fullstack)
2. Remplir les informations de base (nom, description, objectifs, contraintes, etc.)
3. Générer le fichier MANIFEST.md avec la structure standard
4. Créer la structure de dossiers appropriée

**Exemple de structure MANIFEST :**
```
# MANIFEST - {project_name}

> Créé le: {date}
> Version: 0.1.0
> Type: {project_type}

## DÉFINITION DU PROJET
- Description: {description}
- Objectifs: {objectifs}
- Contraintes: {contraintes}
- Utilisateurs cibles: {users}

## ARCHITECTURE
- Type de projet: {project_type}
- Structure dossiers: {liste des dossiers}
- Stack technique: {tech_stack}

## ROADMAP
- Sprint 1: Initialisation
- Sprint 2: MVP
- Sprint 3: ...

## MÉTRIQUES
| Métrique | Valeur initiale |
|----------|-----------------|
| Progression | 0% |
| Tests | 0 |
| Documentation | MANIFEST.md |

## DÉCISIONS ARCHITECTURALES
- ADR-001: {décision}
```

---

### Lire un MANIFEST.md existant

```
Usage: Lire et parser un MANIFEST.md existant pour obtenir le contexte du projet.
```

**Procédure :**
1. Lire le fichier `{project_root}/MANIFEST.md`
2. Extraire les sections clés (définition, architecture, roadmap, métriques)
3. Retourner les informations structurées

**Exemple d'usage :**
```
# Avec filesystem MCP
mcp_filesystem_read_file(path="{project_root}/MANIFEST.md")
→ Retourne: contenu complet du MANIFEST

# Parser manuellement pour extraire les sections
# (description, objectifs, architecture, roadmap, etc.)
```

---

### Vérifier la structure du projet

```
Équivalents: Scripts Hephaistos2-Kit (checklist.py, verify_all.py) ou vérification manuelle

Usage: Vérifier que la structure du projet est conforme aux standards.
```

**Procédure :**
1. Vérifier que les fichiers essentiels existent :
   - `.env` (avec AGENT_DB_ROOT et PROJECT_ID)
   - `AGENTS.md` (règles projet)
   - `memory-database/` (structure de stockage)
2. Vérifier la junction locale → globale (si applicable)
3. Vérifier que les MCP sont configurés dans `~/.hermes/config.yaml`
4. Vérifier que les scripts sont accessibles (si nécessaire)

**Exemple :**
```
# Vérification manuelle des fichiers critiques
mcp_filesystem_list_directory(path="{project_root}")
→ Vérifier: .env, AGENTS.md, memory-database/, .agent/hermes/ existent

# Vérifier la junction
Get-Item "{project_root}/memory-database" | Select-Object LinkType, Target
→ Vérifier: LinkType = "Junction" et Target pointe vers le workspace global
```

---

### Lister les MCP disponibles

```
Équivalent: hermes mcp list (CLI) ou lecture de ~/.hermes/config.yaml

Usage: Obtenir la liste des MCP configurés et disponibles.
```

**Procédure :**
1. Lister les MCP via la commande `hermes mcp list`
2. Ou lire le fichier de configuration `~/.hermes/config.yaml`
3. Documenter les MCP disponibles avec leurs outils et leurs usages

**Exemple :**
```
# Via CLI (si disponible dans le contexte)
hermes mcp list
→ Retourne: liste de tous les MCP avec leur statut et nombre d'outils

# Ou lire la configuration directement
mcp_filesystem_read_file(path="$HOME/.hermes/config.yaml")
→ Parser la section "mcp_servers" pour extraire les MCP configurés
```

---

### Résumé des adaptateurs

| Adaptateur | Fichier | MCP utilisé | Usage principal |
|------------|---------|-------------|-----------------|
| Mémoire | `memory-utils.md` | Memory MCP | KG: créer/lier/observer/supprimer entités, search, read_graph |
| Vector search | `vector-search.md` | Qdrant + Zvec | Recherche catégorique + sémantique, EMBED-FIRST, fusion |
| SQLite | `sqlite-utils.md` | sqlite-node | Multi-DB: connect, query, execute, describe, list_tables |
| Tâches | `task-management.md` | orchestrator MCP ou sqlite-node | Créer/suivre/tâches |
| Projet | `project-utils.md` | filesystem MCP | MANIFEST, structure, vérification |

**Total : 5 adaptateurs documentés.**
