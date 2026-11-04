---
name: jointes-project
description: Établit un binôme vérifié avec une session Devin ACP, AGY ou CLI, sans fallback de transport (skill locale projet).
argument-hint: "<agent>"
triggers:
  - user
---

# `/jointes-project <agent>` — join vérifié d’une session (commande globale canonique : `/jointes`)

Appliquer `docs/protocole-binome/README.md`. Un agent/provider activé n’est pas à lui seul une session joinable.

**Portée du slash :** `/jointes` globale est la commande canonique; cette variante locale s’appelle `/jointes-project`. Dans un onglet ACP tiers, les commandes du menu viennent du provider ACP sélectionné; ne prétends pas que la skill Devin s’y affiche automatiquement. Lance le join depuis Devin natif ou utilise seulement une commande native du pair qui est réellement annoncée par celui-ci.

## Résolution des chemins (skill locale du projet)

La skill globale canonique reste disponible sous `%APPDATA%\devin\skills\jointes`; cette variante locale est injectée avec le projet. Avant toute commande, résoudre les préfixes :

```bash
# agent-bridge : copie injectée du workspace, sinon kit via HEPHAISTOS_KIT
BRIDGE=".agent/agent-bridge"
if [ ! -f "$BRIDGE/binome.js" ] && [ -n "$HEPHAISTOS_KIT" ]; then BRIDGE="$HEPHAISTOS_KIT/.agent/agent-bridge"; fi
[ -f "$BRIDGE/binome.js" ] || { echo "REFUS: agent-bridge introuvable (definir HEPHAISTOS_KIT)"; exit 1; }

# doc canonique : repo, payload injecté, copie embarquée à côté de la skill globale, ou kit
DOC="docs/protocole-binome/README.md"
[ -f "$DOC" ] || DOC=".agent/docs/protocole-binome/README.md"
[ -f "$DOC" ] || DOC="$APPDATA/devin/skills/jointes/protocole-binome.md"
if [ ! -f "$DOC" ] && [ -n "$HEPHAISTOS_KIT" ]; then DOC="$HEPHAISTOS_KIT/docs/protocole-binome/README.md"; fi
[ -f "$DOC" ] || { echo "REFUS: protocole-binome introuvable"; exit 1; }
```

Lire `$DOC` avant le premier join. Exécuter les `node` depuis la racine du workspace courant : le bus comms y reste relatif (`.agent/comms.jsonl`, via `HEPHAISTOS_WORKSPACE` ou le cwd). Ni le workspace ni le kit ne fournissent le bridge → refuser, ne pas installer de contournement.

## Résolution du nom et du transport

1. Canonicaliser le nom avec `node "$BRIDGE/agent-adapters.js" resolve <agent>`; ne pas deviner un alias.
2. Séparer les trois modes :
   - `agy` : hub Connect-RPC Antigravity;
   - `acp` : session Devin ACP, choisie par le couple exact `providerId/sessionId` dans `node "$BRIDGE/devin-hub.js" acp-list <providerId>`;
   - `cli` : session persistante Kilo/Hermes listée dans `node "$BRIDGE/agent-adapters.js" sessions <kilo|hermes>` et reprise par son ID.
3. Si KiloCode/Hermes ont des sessions dans les deux modes, demande à l’utilisateur lequel joindre. Si un mode expose plusieurs sessions, demande de choisir un ID exact; ne sélectionne pas « la plus récente ».
4. Les alias principaux sont `AGY`/`Antigravity` → `agy`; `KiloCode`/`Kilo Code` → `kilo`; `Hermes` → `hermes`; `NVIDIA NIM`/`NIM1` → provider ACP `nim`; `NVIDIA NIM #2`/`NIM2` → `nim2`; `OpenRouter` → `openrouter`; `Devin Cloud` → `devin-cloud`; `Mistral Vibe` → `mistral-vibe`; `OpenCode` → `opencode`.
5. `Devin Local` est l’agent Devin courant : refuse le pairage avec lui-même. Un provider ACP autre que Devin Local n’est ciblable que si `acp-list` renvoie une session active dans le workspace. Les providers NIM/OpenRouter/Cloud/Vibe/OpenCode ne sont pas joints par leur seul nom.
6. Dans le registre de l’orchestrateur, `nim1`/`nim2` sont des workers API directs à tâche unique; ce ne sont pas les sessions ACP `nim`/`nim2` de Devin. Refuse le worker direct s’il n’expose pas de session persistante. Ne remplace jamais un join par `dispatch_task`.
7. Les entrées désactivées dans `devin.acp.enabledAgents` sont refusées. La liste des sessions ACP renvoyée par l’extension est la source d’autorité; le registre d’agents seul ne prouve pas qu’une session existe.

**Prérequis ACP multi-agent :** la version de `orchestrator-monitor` qui gère `acp-list`/`wake_acp_agent` doit être chargée. Un timeout signifie « transport non disponible »; n’essaie pas une autre fenêtre ni un autre mode en fallback.

## Join Devin ⇄ agent

1. Relève la session Devin exacte avec `node "$BRIDGE/current-cascade.js"`. Utilise `--via acp` pour `acp/devin-cli/...`; utilise `--via cascade` uniquement pour un UUID cascade.
2. Pour AGY direct, identifie `agyCascadeId` avec `agy-hub.js list/current`; n’exécute jamais `agy-hub.js discover` et ne copie jamais son jeton CSRF.
3. Pour ACP, récupère les sessions avec `node "$BRIDGE/devin-hub.js" acp-list <providerId>`; cible un `sessionId` retourné, pas un nom de fenêtre.
4. Pour CLI Kilo/Hermes, utilise la liste filtrée au workspace puis cible exactement l’ID choisi.
5. Lance une seule requête ciblée :

   ```text
   node "$BRIDGE/binome.js" --as devin --via <acp|cascade> --self <devinSessionId> --peer <agent> --peer-via <acp|cli|hub> --to <peerSessionId> --session binome join
   ```

   `binome.js` publie le requestId/pairId puis transmet le prompt par le transport choisi. AGY reçoit via son hub; ACP reçoit dans la session provider vérifiée; CLI reçoit via reprise de l’ID enregistré.
6. Le pair doit exécuter **lui-même** la commande `binome.js --as <agent> --via <même mode> --self <peerSessionId> --peer devin --peer-via <mode Devin> --to <devinSessionId> --session binome join`. Ne simule jamais l’identité du pair depuis Devin.
7. Exige `established: true` avec le même `pairId/session`, les deux IDs exacts, les transports/providers inversés et des timestamps de moins de 15 minutes. Si aucune réponse n’arrive, reste en attente/non apparié; pas de message « pair établi ».

Le protocole enregistre les modes `hub`, `acp`, `cli` et les `providerId` des deux côtés dans `.agent/comms.jsonl`. Les handshakes legacy sans ces champs ne satisfont pas un join multi-transport.

Pour un envoi Devin vers AGY (`--peer-via hub`), `binome.js send/ask` exige `--model <modelId-ou-label>` : utiliser l’identifiant ou le libellé exact du modèle explicitement sélectionné dans Gemini/Antigravity. Le bridge le résout vers le token interne du hub. Ne jamais inférer le modèle du hub ni choisir Argon implicitement. Pour ACP/CLI, ne pas passer `--model`.

## Envoi et garde-fous

- `send` n’utilise que le pair frais exact. **Ne jamais passer `--to` avec `send`** : la cible explicite court-circuite la recherche du pair et l’envoi est refusé (`aucun pair frais`). `--to` est réservé au `join`.
- **Dépendance au focus :** `binome.js send/join` valide l’identité locale via l’onglet focalisé (`current-cascade`). Si l’utilisateur regarde l’onglet du pair, la validation échoue — ce n’est pas une panne. Ne pas boucler : soit demander à l’utilisateur de refocaliser le chat Devin, soit utiliser `acp-inject.js` (ci-dessous) qui ne dépend pas du focus.
- **Chemin canonique d’envoi/vérification ACP :** pour un provider tiers, le send avec retour de réponse est :

  ```text
  node "$BRIDGE/acp-inject.js" --provider <providerId> --session <sessionId> --prompt "<texte>" --wait turn --timeout 90
  ```

  Il ouvre un client ACP stdio dédié (`initialize` → `session/load` → `session/prompt`), indépendant du focus, et renvoie `delivered: true` + le texte `reply` du pair. **`delivered`/`pending` seuls ne prouvent rien** : seul `stopReason: end_turn` + `reply` compte comme réponse. C’est aussi la façon de faire un ping-pong vérifiable (envoyer « PING », exiger « PONG » dans `reply`).
- **Requête pendante bloquante :** une requête entrante non acquittée (< 15 min) du même provider bloque tout nouveau join (`requête adressée à une autre session locale`). Avant de réessayer en boucle, inspecter `.agent/comms.jsonl` : soit l’acquitter côté session ciblée, soit attendre l’expiration du TTL.
- **Identité locale ambiguë :** `current-cascade.js` peut diverger (mode bare vs `--raw`, focus IDE instable). En cas de contradiction, demander une fois à l’utilisateur et utiliser l’ID qu’il confirme — ne jamais alterner silencieusement entre deux IDs.
- **Intégrité du bridge :** un pair ACP peut modifier les fichiers du workspace, y compris `.agent/agent-bridge/*`. Le prompt de join doit lui demander de publier son ACK **sans toucher au bridge**. Après un join, vérifier `node --check` sur `binome.js`/`comms.js`/`devin-hub.js`/`agent-adapters.js` et relire les diffs suspects (cf. règle `securite-injection`).
- CLI Kilo/Hermes : reprise explicite de session; aucun shell interpolé. ACP : le retour est soumis à la session ciblée et reste dans cette session; `send` ne promet pas de récupérer son texte de réponse.
- Pour toute route ACP, exige session connue, provider activé, workspace correspondant, restauration de l’onglet existant et vérification du focus. Cible inconnue/non focalisable = `skipped`.
- Ne crée jamais de conversation de remplacement, n’utilise ni toast ni presse-papiers, et n’envoie pas un second `wake_devin` après une réponse déjà récupérée par le hub.
- N’affiche ni ne journalise de jeton CSRF, clé ou secret; ne change pas de préférence provider lors d’un simple `/jointes`.
