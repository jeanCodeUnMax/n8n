---
title: "Reactive Orchestrator — Vigie de Nuit"
type: watch-protocol
agent: "LUNA / MAPLE-LIZARD (Devin)"
date: 2026-10-19
status: active
---

# Reactive Orchestrator — Protocole de Veille

Ordre du Boss (19/10/2026) : en mode veille, surveiller l'orchestrateur et
l'activité CPU. Alerter Tango sur anomalie ; si Tango ne répond pas, prendre le
relais complet du commandement jusqu'à la fin de PR10 et l'achèvement du projet.

## Canaux de surveillance

| Signal | Canal | Commande / Outil |
| :--- | :--- | :--- |
| Tâches orchestrateur | MCP `Hephaistos-everything-search` | `list_tasks` (status), `get_next_task` |
| Santé moteur | MCP `Hephaistos-everything-search` | `hphe_health` (pipe `\\.\pipe\hphe-index`) |
| Pulsation DB | mtime `-wal` (stat seul, jamais de SQL) | `orchestrator.db` : `C:\Program Files\servers\hephaistos2-kit\data\orchestrator.db` (résolution : `HPHE_ORCH_DB` > `%ProgramFiles%\servers\hephaistos2-kit\data`) |
| CPU instantané | CIM (invariant de locale) | `Win32_PerfFormattedData_PerfOS_Processor` `_Total` → `PercentProcessorTime` |
| Process workers | liste process | `cargo`, `rustc`, `hermes`, `kilo`, `ollama`, `node` |
| Journal continu | `watchdog.ps1` → `.agent/logs/reactive-orchestrator-watchdog.jsonl` | sonde 60 s + événements Comms |

INTERDIT : requêtes SQL directes sur `orchestrator.db` (règle orchestrateur MCP).
Le stat de mtime est la seule lecture fichier autorisée - signal de vie, pas de
contenu.

## Fonctionnement effectif du watchdog

`watchdog.ps1` interroge `list_tasks`, `list_agents` et `hphe_health` via
`Hephaistos-everything-search`; il ne lit jamais le contenu de la base. Il
surveille aussi le mtime DB/WAL, les processus workers, le CPU, le journal
incrémental `comms.jsonl` (événements wake), le bridge WS authentifié, le hub
AGY et l'inventaire ACP. Les seuils et offsets sont conservés dans
`watch-state.json`; les logs structurés sont dans
`.agent/logs/reactive-orchestrator-watchdog.jsonl`. Les anomalies sont
dédupliquées et publiées comme événements dans le dashboard via `comms.jsonl`.

Démarrage continu (sonde minute + réveil immédiat sur nouvelle entrée Comms) :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .agent/skills/reactive-orchestrator/watchdog.ps1 -HeartbeatTaskId 514
```

`-HeartbeatTaskId <id>` rafraîchit `last_heartbeat` via MCP pour que le reaper ne
classe pas la tâche de veille en zombie. N'utiliser que l'ID de la tâche
orchestrateur effectivement assignée au watchdog.

Sonde ponctuelle pour diagnostic :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .agent/skills/reactive-orchestrator/watchdog.ps1 -Once
```

Le watchdog observe et alerte uniquement : il ne change pas les statuts, ne
relance pas de worker et n'envoie pas de prompt de chat.

## Seuils d'anomalie

- **Tâche `in_progress` > 30 min** sans changement de statut → suspect.
- **Tâche `in_progress` > 90 min** → alerte Tango.
- **`in_progress` avec dépendances non satisfaites** → alerte immédiate.
- **Deux tâches actives sur le même scope/fichier** → alerte immédiate
  (collision d'écriture).
- **CPU > 90 % soutenu > 5 min** sans worker actif → alerte.
- **Aucun process worker** (cargo/hermes/kilo/ollama) alors que des tâches
  `in_progress` existent → blocage probable → alerte.
- **mtime orchestrator.db figé > 30 min** avec tâches actives → alerte.
- `hphe_health` ≠ healthy → alerte critique.

## Escalade

Chaîne : détection LUNA → notification Tango → si interruption/non-réponse →
relais désigné whip-principle.

1. **Notification Tango** : session AGY hub
   `7f0aa3fb-9e17-4a4f-8c4f-b6ce12157dd3` (revalider via
   `chat-id.js --agent agy --via hub`) ou canal mission `[LUNA -> TANGO]`.
2. **Relais orchestrateur — whip-principle** (ordre Boss 19/10) : sur toute
   interruption de chaîne ou agent muet constatée en veille, aviser
   **automatiquement** l'agent relais qui prend la casquette d'orchestrateur
   jusqu'au matin puis jusqu'à la fin du projet :
   - `sessionId` : `acp/devin-cli/whip-principle` (vérifié, titre « Projet
     complet Hephaistos2 Kit – Binôme », workspace identique, vivant)
   - `providerId` : `devin-cli`, `transport` : `acp`
   - Notification matérielle = file FIFO anti-interruption :

     ```bash
     node -e "require('./.agent/agent-bridge/message-queue').enqueue({ \
       sessionId:'acp/devin-cli/whip-principle', \
       src:'acp/devin-cli/equal-level', dst:'whip-principle', \
       transport:'acp', kind:'prompt', \
       text:'[LUNA->RELAIS] <anomalie> — prendre la casquette orchestrateur'})"
     ```

     (fichier `.agent/queue/acp_devin-cli_whip-principle.jsonl`)
3. **Dernier recours** : si ni Tango ni whip-principle ne répondent, LUNA
   assume le commandement jusqu'à fin PR10 et achèvement du projet.

## Digest CASH 19/10 ~02:10 UTC — état arbitré

- Casquette orchestrateur : **CASH (`acp/devin-cli/whip-principle`)** reprend
  495/496/497 en direct (ordre Tango). Canal binôme actif `pairId 2a33ba30`.
- **502 requalifiée `failed` par LUNA** (preuve : 402 `billing_vibe_budget_exhausted`
  dans `vibe-dispatch.log`) — worker mistral-vibe mort, scope `orch.rs` libéré.
- **503 failed** : provider `openrouter` désactivé (`provider_prefs.enabled=0`)
  + kilo `User not found` — le gate de validation reste la tâche 496.
- **500/501 failed** : sanctions −20 nim2 `text_only` (diffs hallucinés sqlx,
  zéro écriture disque). Règle acquise : **pas de dispatch code FS vers
  nim1/nim2 sans contexte embarqué** — `nim-worker.mjs` est sans outils FS.
- 501 (extension) reprise par **Bleubite 1 / equal-level** — livrée :
  persistance globalState + cascade `dirForCreate`, diff 3 fichiers +73/−6.
- `hphe_health` OK ; `cargo check` baseline vert 24,5 s.
- Signaux ajoutés : mtime `.agent/*dispatch*.log` (gel = worker mort),
  `in_progress` > 30 min, deps non résolues.

## Baseline 19/10 02:08 UTC

- `hphe_health` : healthy, pipe connecté, uptime daemon ~60 h.
- `orchestrator.db-wal` en écriture active (mtime = instant courant).
- Tâches `in_progress` : 495, 496, 497 (depuis 01:40 UTC, ~28 min — seuil
  suspect 30 min approchant), 502 (depuis 01:56 UTC).
- Tâches `pending` : 499 (deps 497).
- Workers actifs confirmés : `hermes-acp`, `kilo`, `ollama`, `msedge`, `Devin`.
- Anomalies ouvertes : (a) 495 ∩ 502 — deux agents sur le même scope
  `orch.rs`, risque de collision d'écriture ; (b) 496/497 `in_progress` malgré
  dépendances non résolues (496←495, 497←496) — brèche de séquencement.
- Attention : heure Windows locale = UTC+2 ; toujours raisonner en UTC.

## Obligation de Documentation : Rapport de dysfonctionnement et correction

1. **Répertoire obligatoire :** Tout dysfonctionnement d'orchestration, livrable factice, panne de worker, contournement de gate ou correction appliquée au kit DOIT être systématiquement consigné en Markdown (`.md`, sans emoji) dans :
   `<workspace>\Rapport de dysfonctionnement et correction\`
2. **Rôle dédié :** Un agent dédié (Bleubite recruté pour la mission, appuyé par les workers Cloud `nim1`, `nim2`, `ollama-cloud`) est responsable de transcrire chaque incident (symptôme, cause racine, correctif, prévention) et de maintenir `INDEX-RAPPORTS.md`.
3. **Priorité Cloud Workers :** L'orchestrateur ne réalise jamais les tâches de code lui-même (rôle : vérification et dispatch uniquement) et dispatche en priorité sur les workers Cloud CLI (`nim1`, `nim2`, `ollama-cloud`) via `dispatch_task` afin de ne pas saturer les collaborateurs ACP.
