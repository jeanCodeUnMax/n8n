---
trigger: always_on
description: Reglas Obligatorias y Anti-Patrones — CLI-Anything
---
# Reglas Obligatorias del Proyecto (CLI-Anything)
Estas reglas han sido registradas en Obsidian Second Brain y son de OBLIGATORIO CUMPLIMIENTO en cada intervencion del agente en este workspace:
## Anti-Patrones y Trampas Prohibidas (Errores Recurrentes)
- **INTERDIT :** Interdiction de faire des sleep passifs dans PowerShell et interdiction de dispatcher des workers sans ping prealable via ping-models.mjs
- **INTERDIT :** Interdiction de faire des sleep passifs dans PowerShell et interdiction de dispatcher des workers sans ping prealable via ping-models.mjs

## 🔒 ORCHESTRATEUR HEPHAISTOS — PASSAGE OBLIGATOIRE (ordre utilisateur du 17/10/2026)

**INTERDICTION ABSOLUE de contourner l'orchestrateur Hephaistos et son MCP.**

- Toute délégation à un agent ou worker passe UNIQUEMENT par les outils MCP de l'orchestrateur : `dispatch_task` (avec `agent_name`, `provider`, `model` explicites), `create_task`, `update_task`, `list_tasks`, `get_next_task`.
- JAMAIS de worker/agent lancé en processus détaché hors orchestrateur (`nohup`, `spawn` direct, `Start-Process`, `&` bash) — un process invisible du dashboard est un worker sauvage : interdit.
- Supervision UNIQUEMENT par les canaux réactifs de l'architecture : `list_tasks`, `task_events`, WebSocket `127.0.0.1:7477`, `comms.jsonl`, named pipe `\.\pipe\hphe-index`. La vérité = l'état de l'orchestrateur.
- **INTERDIT de se référer aux processus Windows** (Get-Process, tasklist, PID) pour justifier l'état des workers — si le dashboard dit zéro, la réponse est zéro.
- JAMAIS de `sleep`/attente passive (PowerShell ou Bash).
- Toute panne de worker → tâche requalifiée via `update_task`, remontée Beacon, consignée dans le Second Cerveau Obsidian.

**SEULE EXCEPTION** : le hub de communication directe agent↔agent via les procédures **`/jointes`** et **`/chat-id`** (protocole binôme / agent-bridge), et uniquement quand l'utilisateur demande explicitement une connexion directe.

## 🚫 POLITIQUE DE PUSH GIT (ordre utilisateur du 17/10/2026 — jusqu'à nouvel ordre)

- Pousser hephaistos2-kit UNIQUEMENT vers les remotes `origin` (projet-temporaire) et `personal` (lascard-m).
- **JAMAIS** pousser vers le remote/dépôt « art-qalam », jusqu'à nouvel ordre explicite de l'utilisateur.
