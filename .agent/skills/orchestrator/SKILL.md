---
name: orchestrator
description: "Délégation intelligente multi-agents via l'orchestrateur MCP v2 : dispatch_task choisit l'agent par skill, le modèle free live, et le prompt de rôle. À invoquer pour toute tâche à sous-traiter (code, debug, review, docs, test, explore) ou quand l'utilisateur dit 'orchestrateur' / 'dispatche' / 'délègue'."
---

# Orchestrateur intelligent — délégation multi-agents

> Le rôle de l'agent principal (Devin/Antigravity) est **architecte** : planifier, dispatcher, vérifier, synthétiser. L'exécution va aux agents CLI enregistrés.

## Déclencheurs

Utiliser ce skill quand : l'utilisateur dit « orchestrateur », « dispatche », « délègue », ou qu'une tâche doit partir vers un autre agent (code, debug, review, docs, test, explore).

## Pré-requis et Vérifications Systématiques (OBLIGATOIRES)

1. **Ping Préalable et Provider Chain :**
   Avant TOUT dispatch de tâche, tester impérativement l'état des modèles via `node scripts/ping-models.mjs` ou interroger l'orchestrateur. Respecter strictement l'ordre de priorité défini dans `provider_chain`.
2. **Filtrage Strict par Type de Modèle (Chat vs Embedding) :**
   Ne JAMAIS router une tâche de génération de texte (`docs`, `code`, `review`, etc.) vers un modèle d'embedding (ex. `nemoretriever`, `nomic-embed-text`). Vérifier les capacités via `nim_domains` ou la configuration du modèle.
3. **Validation des Wrappers sous Windows :**
   Ne jamais invoquer de shims npm `.cmd` avec des slashes Unix depuis un autre lecteur (cause racine de `MODULE_NOT_FOUND` sur `kilo.cmd`). Utiliser des chemins Windows normalisés ou invoquer directement `node.exe <script.js>`.
4. **Validation des Paramètres Hermes CLI :**
   L'appel en mode one-shot `hermes -z` requiert obligatoirement le couple `--provider <p>` ET `--model <m>`. Ne jamais omettre `--model`.
5. **INTERDICTION DU SLEEP PASSIF :**
   Interdiction formelle d'exécuter des `sleep` passifs ou des boucles d'attente bloquantes dans PowerShell / Bash. L'orchestrateur émet des notifications réactives `[WAKE]` dans `.agent/comms.jsonl` et via WebSocket (:7477).

## Prise en compte du schéma actif (OBLIGATOIRE)

Avant tout dispatch, lire `.agent/workspace-roster.json` → `workflow.activeSchema` / `activeSchemaId` :

1. **Le schéma actif fait foi.** Les nœuds du graphe React Flow (rôles, tasks, skills par `sessionId`) définissent la chaîne de travail — ne pas router hors schéma.
2. **Cibler par rôle du schéma** : `task_type` → nœud correspondant (code→Codeur, test→Testeur, review→Reviewer/Auditeur-securite, docs→Documentaliste-Vault, explore→Chercheur/Analyste). La `task` du nœud est la mission écrite par l'utilisateur — l'inclure dans `context`.
3. **Ordre des edges** : dispatcher dans l'ordre du graphe (entrée → sortie) ; un hop en aval attend la fin de l'amont.
4. **`agent_name` = sessionId du nœud** (chat-* pour Bleubites, acp/<provider>/<session> pour agents IDE) — jamais de worker spawné hors du graphe.
5. **Fallback** : aucun schéma actif → routing classique par skills ; schéma présent mais nœud absent → warn + fallback skills pour CE hop seulement.

## Clôture automatique des tâches (mot-clé DONE)

Convention obligatoire : **chaque mission dispatchée doit exiger dans son prompt que le worker termine sa réponse par `DONE:<task_id>`**. La fenêtre hephaistos-chats détecte ce mot-clé dans la réponse finale (`acp-server.mjs`) et appelle `update_task` avec `status: done` — plus besoin que l'agent connaisse les outils MCP ni que l'orchestrateur surveille la fenêtre.

- Prompt de mission : terminer par `... puis termine ta réponse par DONE:<id>` (ex. `DONE:744`).
- Ne jamais clore une tâche à la place du worker : laisser `pending` jusqu'au DONE, sauf annulation explicite (`delete_task`).
- `status: done` (pas `completed`) : la porte `expected_artifact` rejette `completed` quand l'artefact n'est pas un fichier existant.

## Procédure de délégation

```
dispatch_task(title, task_type, context, files, workspace, [agent_name], [priority])
```

1. **`task_type`** parmi `code` | `debug` | `review` | `docs` | `test` | `explore` — détermine le prompt de rôle et le matching de skills.
2. **`context`** : le spécifique — problème, objectif, contraintes. Le template du rôle structure l'exécution.
3. **`files`** : fichiers concernés (tableau de chemins).
4. **`agent_name`** : optionnel, force un agent précis. Sinon le routeur choisit par skill (puis wildcard `*`).
5. L'orchestrateur sonde les modèles free valides, respecte `providers`/`model_prefs` de l'agent, rend le prompt, crée la tâche, assigne et notifie le CLI de l'agent.

## Outils utiles autour

- `suggest_agent(task_type)` → matching d'agent avec configuration active.
- `available_models` → modèles free/local opérationnels à l'instant T.
- `set_prompt_template(role, template)` → configurer un rôle custom (placeholders `{{task}} {{context}} {{files}} {{model}}`).
- `update_agent(agent_name, config)` → ajuster skills/providers/command/model_prefs.
- `list_tasks` / `update_task` / `get_next_task` / `create_task` — supervision du cycle de vie des tâches.

## Règles d'Exécution et Tolérance Zéro Déchets

- **Modèles gratuits uniquement** pour les délégations CLI (sauf `agy` : abonnement inclus).
- **Jamais de SQL direct** sur orchestrator.db — uniquement les outils MCP.
- **`full_prompt:true`** dans la config agent = le CLI reçoit le prompt complet (ex: `agy --print`).
- **Aucune tolérance pour les fiches tronquées :** Interdiction de livrer des fiches mentionnant "Pas de documentation exploitable" sans exploration réelle et exhaustive des fichiers du projet.
- **Télémétrie et Rétroaction :** Toute panne de worker ou anomalie doit être remontée à Beacon (`agent.tool_misuse`, `worker.failed`) et enregistrée dans le Second Cerveau Obsidian.
