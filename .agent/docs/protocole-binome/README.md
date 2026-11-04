# Protocole binôme Devin–ACP/CLI et commande `/jointes`

**Statut :** procédure canonique du workspace Hephaistos2-Kit  
**Dernière vérification :** 2026-10-15

Ce document est la référence opérationnelle unique pour joindre Devin à un agent par le protocole binôme. La commande Devin native est définie dans `.devin/skills/jointes/SKILL.md`; ses invariants sont rappelés dans `.devin/rules/jointes.md` et `.agent/rules/global_rules.md`.

## 1. Portée et état actuel

`/jointes <agent>` vise une **session existante**. Devin ACP, une session CLI reprise, et le hub Antigravity sont des transports distincts; un nom visible dans le sélecteur n’est pas une session. La vérification finale reste la requête/ACK corrélée dans `.agent/comms.jsonl`.

La commande Devin est :

```text
/jointes AGY
```

`/jointes Antigravity` est un alias. Les agents doivent être résolus vers les provider IDs exacts; la présence d’un provider dans `devin.acp.enabledAgents` ne suffit pas sans session ACP ouverte.

### Visibilité du slash et sélecteurs de modèles

- Le contrôle local `devin skills list` confirme `/jointes` et `/chat-id` dans les registres Devin local et global. `/chat-id` appelle `.agent/agent-bridge/chat-id.js`, retourne l’ID vérifié pour copie manuelle et n’envoie aucun message.
- Dans un onglet ACP, le menu slash est annoncé par le serveur ACP de l’agent sélectionné (`available_commands_update`). Devin affiche cette liste; il n’y ajoute pas les skills Devin. Un agent doit donc annoncer `/jointes` lui-même pour que la commande apparaisse dans son onglet ACP. Le join reste possible depuis un chat Devin natif : Devin envoie alors au pair un prompt lui demandant d’exécuter son ACK réel.
- Shims natifs ajoutés : workflows local/global Antigravity, commandes globales OpenCode et skills globales Hermes CLI. Leur apparition dans un menu ACP Devin dépend toujours de l’annonce du serveur correspondant; aucune commande n’est injectée de force dans l’ACP.
- Limite Kilo : l’extension KiloCode 7.8.8 installée documente le système de commandes et de workflows personnalisés comme non implémenté. Aucun fichier de commande ne peut donc garantir `/jointes` dans son menu tant que cette extension ne le prend pas en charge.
- Hermes ACP annonce une liste de commandes codée en dur et ne charge pas les skills CLI dans son menu ACP; `/jointes` et `/chat-id` Hermes sont donc des commandes CLI, pas des entrées ACP.
- Les agents internes Devin (profils/subagents) partagent la session Devin parente; ils n’ont pas d’ID chat séparé. `/chat-id` retourne l’ID de la conversation parente, jamais un faux ID par profil.
- Les modèles et leur ordre sont également fournis par l’agent/provider ACP. `devin.acp.enabledAgents` et `devin.acp.agentPreferences` activent un agent et choisissent éventuellement un modèle par défaut; ils ne définissent ni catalogue, ni groupes Free/Non-Free, Local/Cloud, ni tri global.
- Snapshot vérifié le 2026-10-15 : `devin.acp.agentPreferences.kilo` et `.nim` pointent vers `nvidia/nvidia/active-speaker-detection`, absent du registre local de modèles de chat. Ne pas remplacer ces préférences sans confirmation; vérifier leur compatibilité avec le provider avant de diagnostiquer un menu absent.

### Roster observé

La liste des providers ACP vient de `devin.acp.enabledAgents`; elle est différente du registre `list_agents` de l’orchestrateur. La liste locale observée a ces états : `kilo`, `hermes`, `devin-cli`, `antigravity-acp`, `devin-cloud`, `opencode`, `openrouter`, `nim`, `nim2` et `mistral-vibe` activés; `gemini`, `cline`, `vtcode`, `codex-acp`, `ollama` et `huggingface` désactivés.

| Nom demandé | Provider/agent | Transport et règle |
|---|---|---|
| `AGY`, `Antigravity`, `Google Antigravity` | `agy` / `antigravity-acp` | Hub AGY par défaut; ACP possible uniquement si une session `antigravity-acp` est listée |
| `KiloCode`, `Kilo Code` | `kilo` | ACP si session listée; CLI via `kilo session list` + reprise `-s <sessionId>` |
| `Hermes` | `hermes` | ACP si session listée; CLI via `hermes sessions list` + `--resume <sessionId>` |
| `NVIDIA NIM`, `NIM1` | ACP `nim` | Joignable seulement si Devin expose une session ACP active; le worker HES `nim1` API direct reste non joignable |
| `NVIDIA NIM #2`, `NIM2` | ACP `nim2` | Joignable seulement si Devin expose une session ACP active; le worker HES `nim2` API direct reste non joignable |
| `OpenRouter` | `openrouter` | ACP seulement avec session existante; ce n’est pas une session CLI à reprendre |
| `Devin Cloud` | `devin-cloud` | ACP seulement avec session existante; `Devin Local` (`devin-cli`) est la session courante et ne peut pas être joint à elle-même |
| `Mistral Vibe` | `mistral-vibe` | ACP seulement avec session existante; le worker `vibe` du registre orchestrateur est distinct et inactif |
| `OpenCode` | `opencode` | ACP seulement avec session existante; aucune session ne doit être devinée |
| `Gemini`, `Cline`, `VTCode`, `Codex`, `Ollama`, `HuggingFace` | providers désactivés | Join refusé tant que le provider reste désactivé |
| `Masurewski` ou nom inconnu | non résolu | Demander le nom exact; ne pas mapper vers un agent supposé |

Pour ACP, `devin-hub.js acp-list <providerId>` ne retourne que les couples `sessionId/providerId` actifs du workspace et dont le provider est activé. Pour CLI Kilo/Hermes, `agent-adapters.js sessions <agent>` vérifie l’ID de session et son workspace. Si plusieurs sessions existent, demander à l’utilisateur de choisir; ne pas prendre la dernière automatiquement.

## 2. Architecture existante

Les composants à connaître sont :

- `.agent/agent-bridge/binome.js` : orchestre `join`, `pair`, `send`, `ask` et `tail` avec `--via`/`--peer-via` explicites (`hub`, `acp`, `cli`).
- `.agent/agent-bridge/agent-adapters.js` : normalise les alias ACP, liste les sessions Kilo/Hermes du workspace et reprend les CLI par ID. Les commandes CLI utilisent des arguments sans shell; NIM/OpenRouter ne sont pas CLI reprenables.
- `.agent/agent-bridge/current-cascade.js` : retrouve l’identifiant Devin courant, notamment `acp/devin-cli/<slug>`.
- `.agent/agent-bridge/agy-hub.js` : Connect-RPC Antigravity; `list/current/send/ask/read` sont les commandes utiles. `discover` affiche le jeton CSRF local : ne pas l’utiliser dans la procédure utilisateur.
- `.agent/agent-bridge/devin-hub.js` : liste des sessions ACP activées du workspace (`acp-list`), route vers un couple exact `providerId/sessionId`, et réveille le chat Devin par ID explicite.
- `.agent/agent-bridge/comms.js` : journal JSONL et validation request/ACK, transport/provider et TTL.
- `extensions/orchestrator-monitor/src/extension.ts` et `ws-bridge/bridge.js` : découvrent l’état ACP sans contenu de conversation et envoient seulement vers une session active du workspace, provider activé, ID exact et onglet existant.

Le dossier `extensions/orchestrator-monitor/agent-bridge/` contient la copie côté extension. En cas de divergence, vérifier les deux copies avant toute modification; la commande de workspace décrite ici part de `.agent/agent-bridge/`.

## 3. Handshake et contrôle obligatoire

Chaque handshake contient `phase`, `pairId`, `session`, `convId`, `transport`, `providerId` et `ts`; l’ACK ajoute `replyTo`, `peerCascade`, `peerTransport` et `peerProviderId`. Une paire n’est valide que si ces valeurs concordent exactement et datent de moins de 15 minutes. Les handshakes historiques sans correlation/mode sont ignorés.

Pour `/jointes <agent>` :

1. Devin relève son ID et son transport exact. Pour ACP, la session doit être `acp/devin-cli/...`; pour une cascade UUID, utiliser `--via cascade`.
2. Résoudre l’agent demandé avec `agent-adapters.resolveAgent`. ACP : lister les sessions avec `node .agent/agent-bridge/devin-hub.js acp-list <providerId>`; CLI : lister les sessions Kilo/Hermes avec `node .agent/agent-bridge/agent-adapters.js sessions <agent>`. Les listes sont limitées au workspace. En cas de plusieurs sessions ou de deux modes possibles, faire choisir l’utilisateur.
3. Publier et transmettre la requête avec les deux transports et les deux IDs explicites, par exemple : `node .agent/agent-bridge/binome.js --as devin --via acp --self <devinSessionId> --peer hermes --peer-via acp --to <hermesSessionId> --session binome join`. Pour une session CLI Kilo/Hermes, remplacer `--peer-via acp` par `--peer-via cli`; pour AGY direct, utiliser `--peer agy --peer-via hub`.
4. Le pair, dans sa propre session, exécute son ACK : `node .agent/agent-bridge/binome.js --as <agent> --via <transport> --self <peerSessionId> --peer devin --peer-via <transportDevin> --to <devinSessionId> --session binome join`.
5. Vérifier la requête et l’ACK : même `pairId/session`, `replyTo=pairId`, IDs exacts, transports/providers inversés et `peerCascade` exact. Terminer par `binome.js pair` avec les mêmes paramètres; exiger `established=true`.

### Le champ `hint` ne suffit jamais

Un nouvel ACK est obligatoire pour chaque transport/session. Une requête plus récente non acquittée invalide l’ancienne paire. `send`/`ask` ne retombent jamais sur le chat actif, le dernier `.pb` ou un autre transport. `--to` contourne seulement l’exigence d’un handshake préalable; l’ID et le provider/session doivent toujours exister et être validés.

**Règle opératoire :** n’annoncer le join réussi que si `pairId`, timestamps, IDs, providers et transports concordent. Sinon, ne rien envoyer.

## 4. Acheminement et garantie anti-fenêtre parasite

### Devin vers AGY et ACP

AGY hub direct utilise `agy-hub.js ask/send` sur son `cascadeId` explicite. Pour une session ACP, `devin-hub.js acp-list <providerId>` découvre les IDs du workspace; `sendToAcpAgent` envoie ensuite `wake_acp_agent` avec le `providerId`, `sessionId` et workspace exacts.

L’extension vérifie que le provider est activé et que le couple `providerId/sessionId` existe dans `acp.sessions`. Elle restaure l’URI de l’onglet existant, relit l’état ACP, puis injecte via `explainAndFixProblem` seulement si le focus correspond toujours à la cible. `skipped`/`failed` n’ont aucun fallback.

### Agents ACP/CLI vers Devin

Le retour vers Devin passe par `devin-hub.js sendToDevin` avec le `devinCascadeId` exact. Une cible ACP Devin doit être une session connue `providerId === 'devin-cli'`; une cascade UUID est vérifiée par l’extension. Les modes CLI Kilo/Hermes reprennent leur session explicite, puis envoient vers ce même ID Devin.

**Ne jamais** créer une conversation de remplacement, envoyer vers le chat actif sans vérifier son ID, afficher un toast comme substitut, copier dans le presse-papiers ou sélectionner un `.pb` arbitraire. L’extension source multi-ACP doit être chargée pour `acp-list`/`wake_acp_agent`; une installation plus ancienne timeoute et échoue fermée.

## 5. Règles de la commande `/jointes <agent>`

La skill Devin doit suivre cet ordre :

1. Résoudre l’alias vers le provider ID exact avec `agent-adapters.resolveAgent`; ne pas mapper un nom inconnu.
2. Pour ACP, vérifier l’état réel avec `devin-hub.js acp-list <providerId>` : provider activé, session présente dans ce workspace, ID exact. Le réglage `enabledAgents` seul n’est pas une session.
3. Pour CLI, ne choisir que les sessions Kilo/Hermes retournées par `agent-adapters.js sessions <agent>`; l’ID doit être associé au workspace. Le registre MCP `list_agents` confirme l’activation orchestrateur, mais pas une session Devin ACP.
4. Pour Kilo/Hermes, si les modes ACP et CLI sont tous deux disponibles, demander explicitement le mode. Pour les autres providers, utiliser uniquement ACP; aucune conversion provider→CLI implicite.
5. Publier une requête et obtenir l’ACK du pair réel avec IDs/transports/providers concordants; expiration 15 minutes. En cas de session absente, désactivée, ambiguë ou sans outils permettant l’ACK, refuser le join et ne pas dispatcher une tâche en remplacement.

La config Devin observée active `kilo`, `hermes`, `antigravity-acp`, `devin-cloud`, `opencode`, `openrouter`, `nim`, `nim2` et `mistral-vibe`; les sessions réelles sont filtrées au moment du join. `devin-cli` est l’identité Devin locale, pas un pair avec soi-même. Les ACP `nim`/`nim2` ne sont pas les workers HES `nim1`/`nim2` one-shot. `Masurewski` reste non résolu.

## 6. Beacon et mémoire durable

Le tool Rust `hphe-mcp beacon_ingest` est porté dans la source; il filtre les sessions au workspace demandé, masque les secrets courants, déduplique par offsets JSONL et écrit des résumés dans la mémoire unifiée HPHE. `dryRun` vaut `true` par défaut. L’état courant va dans `.agent/scripts/.beacon-offset-state.json` (ignoré par Git); au premier run, l’ancien `.beacon-offset.json` est lu en lecture seule pour reprendre son offset sans le modifier. `.agent/scripts/beacon-sync.ps1` appelle le binaire Rust. Décision utilisateur : « source seulement »; `beacon.enabled` reste `false`, le runtime n’est pas déployé, et toute activation nécessite une nouvelle autorisation. Ne pas lancer l’ancien pipeline Python.

`BeaconCollector` était `Running`/`Automatic` lors du contrôle, mais le journal `runtime.jsonl` n’a pas changé depuis le 2026-10-10; `beacon.search_activity` ne retournait pas d’événement récent. Le MCP Beacon n’expose que recherche/lecture, pas d’écriture. La mémoire durable de cette procédure est conservée dans ce document et HPHE `memory_write`; ne pas affirmer que Beacon a capturé ou indexé la session courante sans résultat `search_activity` correspondant.

## 7. Test de référence

Le 2026-10-14, un join réel Devin ⇄ AGY a confirmé les sessions visées sans ouvrir de fenêtre parasite et a révélé le faux succès historique. Le 2026-10-15, le correctif request/ACK AGY a ensuite été vérifié en réel avec les IDs explicites; aucun `wake_devin` supplémentaire n’a été déclenché. Les IDs de session et `pairId` restent éphémères. Les suites simulées handshake/ACP passent. Un essai Kilo CLI a publié une requête fraîche mais n’a reçu aucun ACK : aucune paire Kilo n’est établie. Le VSIX 0.0.55 échouait au démarrage du bridge : son `better-sqlite3` ABI 137 ne correspondait pas au Node 26 ABI 147. Le 0.0.56 reconstruit le binding; le 0.0.57 ajoute le routage ACP tiers fail-closed; le 0.0.58 ajoute l’injection ACP réelle via `acp-inject.js` (stdio, `session/load`+`session/prompt`, vérifié de bout en bout sur OpenCode). Après installation et reload, `7477` reste à l’écoute, `acp-list` répond et un pair AGY frais a été vérifié. Cet inventaire ne prouve pas qu’une paire ACP tierce est établie; aucun join ACP n’a été lancé dans cette vérification.

## Références du workspace

- Devin command : `.devin/skills/jointes/SKILL.md`
- Devin always-on rule : `.devin/rules/jointes.md`
- Règles communes : `.agent/rules/global_rules.md`
- Entrée du checklist d’installation : `.agent/docs/install-checklist-collab.md`
- Note d’architecture : `.agent/knowledge/decisions/004-binome-jointes.md`

## 8. Registre d'équipe en mémoire unifiée — `team/roster` (règle fixe, 2026-10-21)

**Problème résolu :** un agent ne doit jamais rescanner les disques, `state.vscdb`
ou `acp-list` pour retrouver son équipe, ni pinger des sessions d'un autre
workspace. Le roster d'équipe vit dans la **mémoire unifiée par projet**
(`agentmemory` via hphe-mcp), jamais dans un fichier JSON/md du workspace ou
du vault.

**Clé canonique :** `memory_read projectId=<nom-du-dossier-workspace> key=team/roster`.

**Contenu (JSON dans `content`) :** `binome.cash` (identity `devin`, sessionId,
transport), `binome.tango` (identity `agy`, cascadeId, transport `hub`, titre
de la conversation), `bleubites[]` (alias, sessionId, transport, nom
orchestrateur), `pairId`, `session`, `verified` (timestamps des derniers
pong constatés sur le bus).

**Cycle de vie :**
1. **Ouverture de session** → `memory_read team/roster`. Si trouvé : l'équipe
   est connue immédiatement — rejoindre/pinger directement ces IDs.
2. **Absent ou IDs périmés** → découvrir : `chat-id.js` pour soi ;
   `agy-hub.js list` + `read` pour trouver la cascade Tango **de ce workspace**
   (vérifier le contenu, ne jamais réutiliser une cascade d'un autre projet) ;
   pour les bleubites, sessions ACP **de ce workspace** uniquement
   (`state.vscdb` filtré par contenu workspace, ou sessions créées ici).
3. **Vérification obligatoire** → handshake request/ACK corrélé (`pairId`/
   `replyTo` < 15 min) pour le binôme ; PING→`reply` sur `comms.jsonl` pour
   chaque bleubite. `sent`/`delivered` seul ne prouve rien : exiger la ligne
   `reply` dont `src` = la session cible.
4. **Persistance** → `memory_write`/`memory_update team/roster` après chaque
   join/pong vérifié ou changement d'équipe, avec le timestamp de preuve.

**Règles anti-misroute (apprises le 2026-10-21) :**
- `devin-hub.js send` / `wake_devin` n'injecte que dans le chat **focalisé** :
  cibler une session non ouverte = le texte atterrit chez l'agent actif.
  Interdit pour joindre un bleubite.
- La voie bleubite est `sendToAcpAgent` (`wake_acp_agent`) : l'extension ouvre
  l'onglet cible puis soumet. Course focus/submit possible → toujours vérifier
  le `reply` sur le bus avant de conclure.
- Les sessions vierges (`userMessageCount: 0`, sans titre) sont des coquilles
  reload : incapables de répondre — ne pas les choisir comme bleubites.
- Seules les identités **Cash = devin** et **Tango = agy** sont fixes. Les
  bleubites sont dynamiques : jamais de slugs en dur dans les règles, le
  vault ou les templates — uniquement dans `team/roster` mémoire.
