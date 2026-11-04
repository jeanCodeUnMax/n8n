---
name: session-id
description: Alias en lecture seule vers la procédure /chat-id pour afficher l’identifiant exact de la session active sans la modifier ni la joindre.
argument-hint: "[agent] [--via acp|cli|hub|cascade] [--session <id>]"
triggers:
  - user
---

# `/session-id` — alias de `/chat-id`

Cette commande est un alias en lecture seule vers la procédure `/chat-id`.

Résoudre le helper avant usage (copie injectée du workspace, sinon canonique du kit) :

```bash
BRIDGE=".agent/agent-bridge"
if [ ! -f "$BRIDGE/chat-id.js" ] && [ -n "$HEPHAISTOS_KIT" ]; then BRIDGE="$HEPHAISTOS_KIT/.agent/agent-bridge"; fi
[ -f "$BRIDGE/chat-id.js" ] || { echo "REFUS: chat-id.js introuvable (definir HEPHAISTOS_KIT)"; exit 1; }
```

Exécuter :

```text
node "$BRIDGE/chat-id.js" [--agent <agent>] [--via <acp|cli|hub|cascade>] [--session <id>]
```

Retourner le `sessionId` exactement comme affiché, sans envoyer de message, sans joindre la session et sans modifier l'état.
