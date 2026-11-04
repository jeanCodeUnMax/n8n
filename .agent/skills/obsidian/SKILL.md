---
name: obsidian
description: Integration Obsidian - Second Cerveau, Memoire Technique, Tri de Contexte et Sauvegarde de Sessions
triggers:
  - user
---

# /obsidian — Second Cerveau & Memoire Technique Obsidian

Connecte Devin a la voute Obsidian (`$env:OBSIDIAN_VAULT_PATH`) pour la recuperation ultra-rapide de contexte, la capitalisation technique et la persistance des sessions de travail.

## 1. Directives Operationnelles
- Zero emoji en tout temps.
- Recuperation de contexte ultra-compacte (<100 tokens via triage/peek) avant de lire des fichiers entiers.
- Sauvegarde systematique des sessions, pieges techniques et apprentissages.

## 2. Outils MCP (antigravity-obsidian)
Lorsque le serveur MCP `antigravity-obsidian` est actif dans Devin, appeler directement les outils MCP suivants :

### Consultation & Triage
- `obsidian_triage(query)` : Verifie en ultra-bas contexte (<100 tokens) si une skill, solution ou note de memoire existe pour une tache ou un bogue sans saturer la fenetre de contexte.
- `obsidian_peek(noteName)` : Extrait uniquement le resume et la solution technique d'une note, economisant 90% du contexte par rapport a une lecture complete.
- `obsidian_search(query, folder)` : Recherche par mot-cle dans la voute Obsidian (`Memoria`, `Skills`, `Proyectos`, `Todas`).
- `obsidian_read_note(noteNameOrPath)` : Lecture integrale d'une note si une etude approfondie est indispensable.
- `obsidian_status()` : Verifie la connectivite a la voute, le chemin actif et les statistiques de synchronisation.

### Persistance & Apprentissage
- `obsidian_session_save(project, summary, content)` : Enregistre un point de controle de session a la fin d'une tache, d'un bogue resolu ou d'une fonctionnalite.
- `obsidian_session_last(project)` / `session_recall(query, limit)` : Recupere le contexte, les decisions et l'etat de la derniere session de travail sur un projet.
- `obsidian_learn(learning)` : Enregistre une regle ou preference utilisateur au format `[<Projet ou Global>] <regle>` et synchronise les regles du workspace.
- `obsidian_save_memory(title, summary, content, category)` : Enregistre une fiche de memoire technique durable (solution d'infrastructure, piege de dependance, etc.).
- `obsidian_add_antipattern(rule, project)` : Enregistre un anti-patron technique ou une erreur critique a ne jamais reproduire.
- `obsidian_list_antipatterns(project)` : Liste les pieges interdits d'un projet.

### Gestion Hermes & Skills
- `memory_update(target, operation, content)` : Met a jour la memoire bornee (`USER.md` ou `MEMORY.md`). **Partagee avec agy** — ecriture identitaire seulement sur demande explicite.
- `skill_get(skill_name)` : Recupere une skill procedurale vive depuis `01_Skills/`.
- `skill_save(skill_name, content, version_bump)` : Cree ou ameliore une skill procedurale.

### Outils de gestion dynamique — DESACTIVES
`obsidian_tool_create`, `obsidian_tool_install`, `obsidian_tool_run`, `obsidian_tool_uninstall` (et alias `tool_*`) : **non exposes par defaut** dans l'architecture Hephaistos (installation de code tiers, clone GitHub, ecriture `mcp_config.json` — pas le role de ce plugin). Reactivation manuelle : `OBSIDIAN_ALLOW_TOOL_MGMT=1` dans l'env du serveur MCP.

## 3. Fallback CLI (Node.js)
Si le serveur MCP n'est pas directement expose dans la session en cours, utiliser la commande CLI equivalente :
`node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" <commande> [arguments]`

Exemples CLI :
- `node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" triage "<probleme>"`
- `node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" peek "<NomNote>"`
- `node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" session save --project "<Projet>" --summary "<Resume>" --content "<Details>"`
- `node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" session last --project "<Projet>"`
- `node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" learn "[<Projet>] <Regle>"`
- `node "%USERPROFILE%\.gemini\config\skills\antigravity-obsidian\scripts\obsidian.js" status`

## 4. Protocole d'Execution
1. **Au demarrage d'une tache complexe :**
   Appeler `obsidian_session_last` ou `obsidian_triage` pour restaurer le contexte recent et eviter les redondances.
2. **Pendant l'execution :**
   Respecter les anti-patrons enregistres (`obsidian_list_antipatterns`).
3. **A la finalisation :**
   Enregistrer le checkpoint avec `obsidian_session_save`.
