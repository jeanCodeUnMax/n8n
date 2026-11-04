---
name: flux
description: "Piloter le flux de travail SWAT de l'extension hephaistos-chats : detecter le schema actif, verifier les agents, prompter chaque noeud et lancer le pipeline (revue code, audit secu, arbitrage, commit/push, doc vault). Utiliser pour /flux, 'lance le flux', 'workflow', 'swat', 'schema actif'."
---

# /flux — Pilote du flux SWAT hephaistos-chats

Le canvas React Flow de l'extension `hephaistos-chats` n'est pas un dessin : c'est le **graphe d'orchestration actif**. Le schema que l'utilisateur selectionne dans le panneau « Schemas » devient immediatement le plan de travail de l'orchestrateur (Devin = Cash = noeud d'entree).

## 1. Detecter le schema actif

Le schema actif est **persiste**, pas deduit du canvas :

```powershell
node -e "const w=JSON.parse(require('fs').readFileSync('.agent/workspace-roster.json','utf8')).workflow;console.log(w.activeSchema,'/',w.activeSchemaId,'| entry:',w.entrySessionId);for(const n of w.nodes)console.log(' ',n.sessionId,'|',n.role,'|',(n.task||'').slice(0,50))"
```

`activeSchema`/`activeSchemaId` survivent aux sauvegardes (preserve dans `saveWorkflow`/`syncRosterWorkflow`/`readWorkflow`). Le nom du flux est aussi affiche en banniere du canvas.

Source canonique : `.agent/workspace-roster.json` (champ `workflow`). Schemas sauvegardes : `~/.hephaistos-workflow-schemas.json` (filtre `workspace` insensible a la casse). Le watcher extension repousse `schemas_state` au panneau en ~250 ms — creer/renommer/charger un schema via le bridge se reflete dans l'UI **sans reload**.

## 2. Verifier l'etat des agents avant lancement

Pour chaque noeud du graphe :

- `sessionId` valide, unique, present dans le roster visible (pas `hidden`).
- `role` + `task` remplis et coherents avec la mission en cours — **re-ecrire `task` a chaque nouvelle mission**.
- Edges : chaque `source`/`target` pointe vers un noeud existant ; le graphe reste acyclique (le validateur rejette cycles, doublons, positions hors limites).
- Pas de touristes : un agent sans lien ni mission ne doit pas apparaitre sur le canvas.

Roster live :

```powershell
node .agent/agent-bridge/workspace-roster.js status
```

Ping de vie (PING/PONG, persiste les statuts) :

```powershell
node .agent/agent-bridge/workspace-roster.js ping --write
```

Un agent qui ne repond pas est sorti du SWAT (`setMemberHidden` ou `remove`) et remplace.

## 3. Prompter chaque noeud

L'ecriture de la mission d'un noeud se fait via l'API du bridge (pas en editant le JSON) :

```javascript
const api = require('./.agent/agent-bridge/workspace-roster.js');
api.configureWorkflowNode(process.cwd(), '<sessionId>', { task: '<mission>', role: '<role>' });
```

La tache du noeud apparait dans l'inspecteur « Configuration agent » du canvas et sert de prompt de reference pour le tour injecte.

## 4. Injecter les tours — transports

Deux transports distincts, jamais confondus :

| Cible | sessionId | Commande |
|---|---|---|
| **Bleubites** (fenetres chat de l'extension) | `chat-*` | `node .agent/agent-bridge/acp-inject.js --provider hephaistos --session <id> --prompt "<prompt>" --wait turn` |
| **Devin ACP** (sessions devin-cli) | `acp/devin-cli/<slug>` | `node .agent/agent-bridge/devin-hub.js send "<prompt>" <cascadeId>` |

- `acp-inject --list` → providers injectables (`hephaistos`, `cerberos`, `kilo`, `hermes`, `opencode`…). **`devin-cli` n'est PAS injectable** — passer par `devin-hub` (hub ws://127.0.0.1:7477).
- `devin-hub.js acp-list` → sessions ACP du workspace pour retrouver le cascadeId d'un `acp/devin-cli/<slug>`.
- `--wait turn` bloque jusqu'a `end_turn` ; un `delivered`/`pending` n'est PAS une preuve — verifier la reponse dans `.agent/chats/sessions.json` (dernier message assistant) ou `.agent/comms.jsonl`.
- La preuve d'execution d'un agent = artefact sur disque ou reponse correlee, jamais sa seule declaration.

## 5. Lancer le flux

Deux modes :

**A. Bouton « Lancer le flux » du canvas** → `workflowRunner.ts` execute les noeuds dans l'ordre topologique : chaque noeud recoit son `task` + les sorties des amonts via `completeTurn`/`runIdeAgentTurn`. Progression poussee au canvas (`workflow_progress`).

**B. Orchestration manuelle (orchestrateur = toi)** — quand le runner n'est pas disponible ou que l'utilisateur demande un pilotage explicite : executer les hops dans l'ordre du graphe, transmettre les sorties d'un hop au prompt du hop suivant, arbitrer, et ne remonter a l'utilisateur que la synthese finale. **Ne jamais faire le travail soi-meme** — les noeuds travaillent, l'orchestrateur supervise.

## 6. Pattern canonique `swat-orchestrateur`

```
entree (Devin, orchestrateur)
  -> Codeur          (analyse/production)
  -> Reviewer + Auditeur-securite   (fork)
  -> Sentinelle      (arbitrage GO/NO-GO)
  -> Verif-Submodules(preflight git)
  -> Integrateur-Git (Devin ACP : stage/commit/push)
  -> Documentaliste  (maj vault Obsidian)
```

## 7. Regles dures

- Le schema actif = la verite. Ne jamais orchestrer sur un autre graphe que `activeSchema` (lu dans `.agent/workspace-roster.json`). Si aucun schéma n'est actif, charger le schéma de workspace le plus pertinent via `listSchemas`/`loadSchema`.
- Dispatch formel obligatoire : en orchestration manuelle ou automatique, chaque hop/tâche confié à un nœud doit obligatoirement être créé (`create_task` ou `dispatch_task`) et mis à jour (`update_task`) sur l'orchestrateur MCP `Hephaistos-everything-search`. Interdiction de simuler le pipeline en texte seul.
- `schema load` masque les membres hors-schema (`hidden`) — ne pas les reactiver.
- Un node sans `sessionId` valide, sans task, ou orphelin = anomalie a reparer avant lancement.
- Toute creation/rename/load/delete de schema passe par le bridge (`saveSchema`, `renameSchema`, `loadSchema`, `listSchemas`) — jamais d'edit direct du fichier schemas.
- Ne jamais exposer cles, tokens CSRF ou secrets dans les prompts injectes.
- Missions finies → rapporter a l'utilisateur : verdict de chaque hop + artefacts produits (commit hash, chemin de la note vault).

## 8. Protocole d'escalade (anti-blocage muet)

Tout agent/worker qui recoit une fin de non-recevoir (refus provider, blocage IP/copyright, timeout repete, modele mort, outil indisponible) DOIT :

1. Ecrire immediatement un evenement dans `.agent/comms.jsonl` :
   `{src:"<sessionId|worker>", dst:"orchestrateur", kind:"blocked", text:"<raison exacte + prompt/etape>"}` — append JSONL, jamais d'edit.
2. Logger la meme ligne dans son fichier de statut/rapport.
3. Reformuler UNE fois si le blocage est un refus de contenu (prompt trop proche d'une IP : reformuler en archetypes generiques, retirer tout nom de marque/personne) ; si le blocage est technique, ne PAS boucler.
4. Passer a l'etape suivante du run et noter l'echec dans le rapport final.

L'orchestrateur surveille `comms.jsonl` pour `kind:"blocked"` : c'est LE canal d'alerte. Des qu'un blocked arrive, l'orchestrateur avise : reformuler, re-router, remplacer l'agent, ou decider avec l'utilisateur.

Interdit : boucle muette, retry infini, declaration de succes sans artefact verifie sur disque.

## 9. Retour d'expérience — pieges rencontres et regles definitives

- **Plugin Devin = repertoire** `.devin-plugin/plugin.json` + `commands/*.md` + `skills/<nom>/SKILL.md` + `rules/*.md`. Enregistrement : `plugins/lock.json` (requirements + resolved, source local). Nom canonique : **hephaistos2-kit**, jamais hephaistos-devin.
- **Prompts workers : chemins ABSOLUS obligatoires** — un fs_write relatif peut rapporter "ok" et ecrire hors workspace (perdu silencieusement).
- **Verifier les findings d'audit sur disque** — les agents peuvent lire des versions perimees ; un FAIL sur fichier stale se verifie avant arbitrage.
- **Synchro canvas** : le roster change via CLI n'atteint le graphe que si le watcher pousse `workflow_state` (corrige 0.3.12). Toute modif workflow doit etre visible sans reload.
- **Commandes .md ≠ code** : les slash commands du plugin decrivent l'appel a `bin/hphe.js` — l'executable fait le travail.
- **hphe-mcp.exe = client du pipe hphe-index** : instances multiples OK, pas de "--stdio" a passer, methodes MCP `tools/call` + `protocolVersion`.
- Un livrable par prompt worker ; verifier chaque artefact sur disque avant le hop suivant.
