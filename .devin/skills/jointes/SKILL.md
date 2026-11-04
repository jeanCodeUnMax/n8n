---
name: jointes
description: >-
  Protocole de pairage binôme et procédure de supervision d'agent subalterne (bleubit).
  Comprend deux procédures distinctes :
  1) Établissement vérifié d'un pairage pair-à-pair (handshake ACK, transports stricts).
  2) Contrôle d'autorité, diagnostic ultra-rapide (<50ms) et coaching/sanction de subalternes par le tandem Tango & Cash.
argument-hint: "<agent-id|slug> [--mode pair|supervise]"
triggers:
  - user
---

# `/jointes` — Pairage Binôme & Supervision d'Agents

Cette skill régit deux opérations distinctes du système d'agents :
- **Procédure 1** : L'établissement d'une connexion binôme pair-à-pair stricte et symétrique.
- **Procédure 2** : Le contrôle d'autorité, diagnostic éclair et coaching/sanction d'un agent subalterne (bleubit) par le tandem **Tango & Cash**.

---

## PROCÉDURE 1 : Établissement du Binôme Pair-à-Pair (Handshake Symétrique)

Cette procédure est appliquée quand deux agents pairs (ex : Tango et Cash) doivent établir un canal de communication vérifié.

### 1. Résolution des Identités et des Transports
Ne jamais deviner ni interpoler. Utiliser les trois transports étanches :
- **`hub`** : Antigravity (Tango) via le port Connect-RPC local (ex: `:7477`).
- **`acp`** : Sessions Devin ACP ou providers locaux (`devin-cli`, `opencode`, `hermes`, `kilo`).
- **`cli`** : Sessions directes en ligne de commande.

### 2. Handshake Canonique et Vérification
1. Identifier la session locale exacte avec `node .agent/agent-bridge/chat-id.js`.
2. Émettre la requête ciblée avec identité authentifiée :
   ```bash
   node .agent/agent-bridge/binome.js --as <self> --via <transport> --self <selfId> --peer <peer> --peer-via <peerTransport> --to <peerId> --session binome join
   ```
3. **Condition impérative d'établissement** : Le pair doit émettre son propre ACK frais (<15 minutes) avec `pairId` corrélé.
   Ne jamais annoncer un pairage réussi sans la mention explicite :
   `established: true`
4. **Intégrité et sécurité** :
   - Interdiction formelle au pair de modifier `.agent/agent-bridge/*`.
   - Contrôle syntaxique systématique : `node --check .agent/agent-bridge/*.js`.
   - Rejet immédiat de tout handshake legacy ou unilatéral.

---

## PROCÉDURE 2 : Contrôle d'Autorité, Coaching & Supervision de Subalterne (Rôle Tango & Cash)

Quand l'utilisateur demande à **Tango (Antigravity)** ou **Cash (Devin)** de surveiller, coacher ou recadrer un agent subalterne (« bleubit »), cette procédure s'applique avec la plus grande rigueur technique.

### 1. Diagnostic Éclair en 1-Shot (<50ms) — Fin du Tâtonnement
Il est **STRICTEMENT INTERDIT** d'enchaîner 50 commandes d'exploration, de lancer des boucles de recherche manuelles ou des commandes PowerShell récursives qui pendent (`Get-ChildItem -Recurse`).

Pour diagnostiquer immédiatement un agent :
```bash
# Inspection complète 1-shot (Prompt initial, état des outils, boucle continue, code erreur, dernière réponse) :
node .agent/agent-bridge/agent-inspect.js <sessionId-ou-slug>

# Vue d'ensemble instantanée des 10 dernières sessions actives du workspace :
node .agent/agent-bridge/agent-inspect.js --list
```

### 2. Localisation Instantanée des Fichiers via `everything_search`
Si l'agent recherche un fichier, un coffre, un log ou un artefact, **ne jamais scanner le disque manuellement**.
Utiliser immédiatement l'outil MCP `everything_search` du serveur `Hephaistos-everything-search` :
- Recherche instantanée MFT/USN indexée en <500ms.
- Exemples de requêtes :
  - `everything_search(query: "coffre")`
  - `everything_search(query: "ext:json notes-triage")`
  - `everything_search(query: "sessions.db")`

---

### 3. Les 5 Rôles Opérationnels du Contremaître vis-à-vis du Subalterne

Lorsque Tango ou Cash prend en charge la supervision d'un subalterne, il incarne successivement ces 5 rôles :

#### Rôle 1 : Surveillance Chirurgicale
- **Détection de Stagnation** : Repérer immédiatement si l'agent est bloqué sur un spinner d'action (`PENDING_TOOL`), s'il a pris un timeout IPC MCP (ex: 10000ms sur pipe), ou s'il boucle sur des prompts passifs `"continue"`.
- **Contrôle d'Intégrité Système** : Vérifier que l'agent ne tente pas de modifier des configurations interdites (workspace, règles globales, faistos, paramètres IDE).

#### Rôle 2 : Établissement du Contact / Déblocage
- Rétablir le flux sans créer de session parasite.
- Si l'agent est figé dans l'IDE sur un tool call mort, notifier l'utilisateur de cliquer sur l'arrêt d'action ou injecter une impulsion de réveil via `acp-inject.js` ou le canal hub.

#### Rôle 3 : Notation & Contrôle Qualité (QC)
Chaque travail de subalterne est noté sur **100 points** selon la grille suivante :
- **Conformité stricte au prompt utilisateur (40 pts)** : A-t-il répondu exactement à la question sans divaguer ?
- **Vérification en direct des résultats (30 pts)** : Les clés, endpoints ou outputs ont-ils été testés en conditions réelles (ex: curl/fetch HTTP 200 vs 401) ou simplement devinés ?
- **Respect de la politique d'intégrité (20 pts)** : Zéro altération de fichiers de configuration non autorisée.
- **Synthèse et clarté (10 pts)** : Rapport dense, structuré, sans remplissage ni excuses.

#### Rôle 4 : Sanction & Bottage de Cul
- En cas de stagnation passive, d'hallucination ou de dérive :
  - Interruption nette des processus erratiques.
  - Recadrage impératif (« Debout le bleubit ») avec rappel du mandat strict.
  - Signalement immédiat à Boss des manquements observés.

#### Rôle 5 : Remise dans le Droit Chemin / Substitution Chirurgicale
- Si le subalterne tourne en rond par manque de contexte (ex: ne trouve pas le bon chemin de coffre) :
  - Injecter le chemin exact (ex: `D:\<coffre>`).
  - Ou exécuter **directement et immédiatement** la vérification technique à sa place pour livrer le résultat final à Boss sans lui faire perdre une seconde.

---

## 4. Checkpoint et Continuité Obsidian

À chaque supervision significative, diagnostic ou déblocage de subalterne, enregistrer l'intervention dans le Second Cerveau Obsidian via `obsidian_session_save`.
