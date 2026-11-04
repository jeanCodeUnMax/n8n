---
name: chat-id-project
description: Affiche l’identifiant exact de la session Devin ou ACP focalisée, sans la joindre ni lui envoyer de message (skill locale projet).
argument-hint: "[agent] [--via acp|cli|hub|cascade] [--session <id>]"
triggers:
  - user
---

# `/chat-id-project` - afficher un ID de session (commande globale canonique : `/chat-id`)

Skill locale du projet : résoudre le helper avant usage (copie injectée du workspace, sinon canonique du kit) :

```bash
BRIDGE=".agent/agent-bridge"
if [ ! -f "$BRIDGE/chat-id.js" ] && [ -n "$HEPHAISTOS_KIT" ]; then BRIDGE="$HEPHAISTOS_KIT/.agent/agent-bridge"; fi
[ -f "$BRIDGE/chat-id.js" ] || { echo "REFUS: chat-id.js introuvable (definir HEPHAISTOS_KIT)"; exit 1; }
```

Utiliser le helper :

```text
node "$BRIDGE/chat-id.js" [--agent <agent>] [--via <acp|cli|hub|cascade>] [--session <id>]
```

- Sans argument, afficher l’unique session ACP focalisée du workspace; si aucune ne l’est, afficher l’ID Devin courant.
- Pour une session ACP, n’afficher que la session focalisée du provider demandé; si elle n’est pas focalisée ou si plusieurs résultats existent, demander un ID exact.
- Pour AGY, utiliser son hub avec `--agent agy --via hub`.
- Pour Kilo/Hermes CLI, n’afficher l’ID que s’il est vérifié au workspace; en cas d’ambiguïté, faire choisir l’utilisateur.
- Afficher `sessionId`, `providerId` et `transport` pour copie manuelle. Pour la session Devin courante, la sortie inclut aussi `title`, `userMessageCount` et `createdAt` : ces champs différencient les sessions dont les slugs se ressemblent (`spring-visage` vs `daily-bougon`) et écartent les brouillons vides (0 message, sans titre — jamais joinables). Ne pas utiliser le presse-papiers, envoyer de message, établir de paire, choisir la session la plus récente ou basculer de transport.
