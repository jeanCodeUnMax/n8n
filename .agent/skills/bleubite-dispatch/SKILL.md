---
name: bleubite-dispatch
description: "Envoyer une tâche à une fenêtre Bleubite hephaistos-chats : vérifier le roster live (persisté ≠ fenêtre ouverte), lire le provider/modèle réel de la fenêtre, injecter via acp-inject, vérifier l'effet sur disque. À invoquer dès qu'une tâche part vers une session chat-* (nim, nim2, omniroute, openrouter...)."
---

# Bleubite Dispatch — tâches vers les fenêtres hephaistos-chats

Les fenêtres `chat-*` de l'extension **hephaistos-chats** sont de vrais workers :
elles exécutent des `tool_calls` locaux (pas des complétions qui racontent).
Leur boucle outillée vit dans `extensions/hephaistos-chats/acp-server.mjs`.

## Outils dont disposent les Bleubites

- `fs_write_text_file` {path, content} — écrit sous la racine du workspace
- `fs_read_text_file` {path, offset?, max_chars?} — lecture paginée, cap 8000 chars
- `fs_list_directory` {path} — liste un répertoire du workspace
- Confinement strict workspace, anti-`../` par `resolveWorkspacePath`

## Procédure — OBLIGATOIRE, dans l'ordre

1. **Roster live d'abord** : `node .agent/agent-bridge/workspace-roster.js status`
   Une entrée dans `.agent/chats/sessions.json` ≠ une fenêtre ouverte.
2. **Lire le provider/modèle réel** de la session cible dans `sessions.json`
   (champs `provider` + `model`). **INVIOLABLE** : provider, modèle et fenêtre
   sont le choix de l'utilisateur — jamais de migration de provider, jamais de
   changement de fenêtre ; re-sélection de modèle uniquement sur demande
   explicite.
3. **Ping-pong** : pour un check rapide, 3 `acp-inject` **en parallèle**
   (sorties `/tmp/ping-<id>.json`) ; pour un sweep complet,
   `workspace-roster.js ping` (séquentiel, exige `end_turn` + `PONG`).
   Depuis le fix d'observabilité, le message user est flushé + `thoughtChunk`
   émis avant le tour → la fenêtre montre la réception immédiatement.
4. **Surveiller via le bus** (`sessions.json`, `comms.jsonl`) — INTERDICTION
   de dormir en lecture sur un shell en attente : les retries honorent des
   `retry_after` longs, un get_output bloquant ne sert à rien.
5. **Injecter** :
   ```
   node .agent/agent-bridge/acp-inject.js --provider hephaistos \
     --session <chat-XXX> --prompt "<tâche>" --wait turn --timeout 240
   ```
   Exiger `delivered:true` + `stopReason:"end_turn"`. Un `[outils exécutés]`
   dans la réponse = preuve d'exécution.
6. **Vérifier sur disque** — JAMAIS la déclaration du modèle :
   `ls`/`stat`/`read` le fichier censé être produit. Pas de fichier = pas fait.

## Prompt de tâche — œillères, pas de règles globales

Les Bleubites reçoivent un prompt système compact (~300 tokens, rôle + outils +
confinement + "exécute, ne raconte pas"). Ne pas réinjecter AGENTS.md ni les
règles globales : chaque round de tool_call renvoie le contexte complet au
provider, et les petits quotas (ex. Groq 8000 TPM) explosent.

Une bonne consigne tient en 3 phrases : outil + fichiers → analyse → écriture
du livrable + phrase de synthèse.

## Pannes connues et remèdes

| Symptôme | Cause | Remède |
|---|---|---|
| `503 ResourceExhausted` NIM | saturation transitoire par modèle | retry auto intégré (429/502/503/504, honore `retry_after`) |
| `410 Gone` | modèle retiré du catalogue | re-sélectionner un modèle vivant |
| `413 TPM` / `429` Groq | contexte + `max_tokens` > quota minute | déjà mitigé : prompt allégé, lectures capées, fenêtre glissante (2 derniers résultats d'outils entiers), `max_tokens` 1500 |
| `400 tool_use_failed` | JSON d'arguments malformé (newlines bruts) | salvage auto : répare et exécute la génération fautive |
| Pas de `[outils exécutés]` | le modèle a raconté au lieu d'exécuter | relancer avec consigne étape-par-étape ; si le modèle est un "reasoning" instable au tool-calling, proposer une re-sélection à l'utilisateur |
| Timeout inject > 4 min | retries honorent des `retry_after` longs | surveiller via `sessions.json`/`comms.jsonl`, pas en dormant sur le shell |

## Règles

- **Une fenêtre = un provider = un modèle choisi par l'utilisateur.** On ne
  migre jamais une fenêtre vers un autre provider pour contourner une panne.
- **Modèles free uniquement** pour les délégations.
- **Anti-sleep** : pas de `sleep` passif — l'activité remonte via
  `.agent/comms.jsonl` et le bus `:7477`.
- Toute anomalie de worker → Beacon (`worker.failed`) + Second Cerveau.
