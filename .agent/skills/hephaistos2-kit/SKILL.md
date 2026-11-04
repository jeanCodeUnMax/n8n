---
name: hephaistos2-kit
description: "Playbook opérationnel maître pour Hephaistos2-Kit : serveur unifié Rust Hephaistos-everything-search (58 outils), recherche NTFS instantanée ($MFT+USN sans Everything.exe), passerelle REST :8792 et Tantivy, orchestrateur multi-agents et monitor WebSocket (:7477), protocole binôme avec distinction stricte ACP vs CLI, intégration Beacon, Second Cerveau Obsidian et gouvernance machine modeste."
triggers:
  - hephaistos2-kit
  - hephaistos2
  - hphe-mcp
  - everything-search
  - orchestrator-monitor
  - /hephaistos2-kit
---

# Hephaistos2-Kit — Guide Opérationnel & Architecture Unifiée

> Ce playbook est la référence opérationnelle définitive pour tout agent IA (Devin, Antigravity, Cursor, Windsurf, Hermes, Kilo) opérant sur ou avec l'écosystème **Hephaistos2-Kit**.
> Naming strict : le projet historique « Hephaistos » est désuet ; seule l'appellation **Hephaistos2-Kit** (et son serveur MCP canonique **Hephaistos-everything-search**) est valide.
> Tout agent démarrant une tâche technique DOIT absorber ce guide pour maîtriser les 58 outils MCP, le protocole binôme, la télémétrie Beacon et la mémoire Obsidian.

---

## 0. Principes Fondamentaux de l'Architecture (100% Rust)

1. **Serveur MCP Unique et Unifié (`hphe-mcp.exe`)** :
   - Nom canonique MCP : **`Hephaistos-everything-search`** (stdio).
   - Intègre **58 outils natifs** compilés en Rust.
   - **Remplacement définitif** : Les 7 serveurs historiques (orchestrator Node, agentMemory, nim-router, model-discovery, qdrant, zvec, pont RAG Python) sont éradiqués et absorbés dans le binaire Rust unique.
2. **Recherche NTFS Instantanée sans Dépendance Externe** :
   - Démon `hphe-indexd.exe` (tâche planifiée SYSTEM) : lecture directe du `$MFT` et journal USN en temps réel.
   - Named pipe `\\.\pipe\hphe-index` : recherches en **< 50 ms** sur tout le système (~6,4M d'entrées).
   - **Zéro dépendance à `Everything.exe`**.
3. **Passerelle HTTP & Ingestion Sérialisée (`hphe-rest.exe` :8792)** :
   - Expose les mêmes outils en HTTP (`POST /call`, `POST /tools/{name}`).
   - Gate mutex interne : sérialise les écritures d'index Tantivy (`ingest_busy` dans `/health`) éliminant 100% des erreurs `LockBusy`.
4. **Gouvernance Machine Modeste & Concurrence Bornée** :
   - Empreinte au repos : ~12,5 Mo de RAM pour `hphe-mcp` et 0% de CPU.
   - Plafond strict : **maximum 2 workers CLI simultanés**.
   - Priorité Windows imposée : `BELOW_NORMAL_PRIORITY_CLASS`.
   - **Mutex Single-Flight ACP** : verrouillage absolu des cascades dans l'IDE (TTL 120s).

---

## 1. Distinction Stricte ACP vs CLI (Protocole Binôme)

La confusion entre les transports ACP et CLI est formellement proscrite :

| Critère | Mode CLI (Workers d'Arrière-Plan) | Mode ACP (Protocole Binôme & Sessions Interactives) |
|---|---|---|
| **Rôle** | Exécution de tâches de fond par l'orchestrateur Hephaistos2-Kit | Collaboration directe, chat interactif et passage de relais |
| **Invocation** | Outil MCP `dispatch_task` uniquement | Commande `/jointes <agent>` ou script `binome.js` |
| **Interface** | Processus headless détaché de l'IDE | Cascade visible avec onglet dédié dans l'IDE |
| **Concurrence** | Max 2 workers simultanés, file d'attente `pending` | Verrou Mutex Single-Flight par couple `providerId/sessionId` |
| **Priorité OS** | `BELOW_NORMAL_PRIORITY_CLASS` (protège la fluidité) | Priorité normale du thread interactif IDE |
| **Règle d'or** | **CLI n'est JAMAIS un fallback d'ACP** | **ACP n'est JAMAIS un fallback de CLI** |

### Mutex Single-Flight ACP (`agent-adapters.js`)
Toute tentative d'injection dans l'IDE doit vérifier `acquireAcpLock(providerId, timeoutMs)`. Si une session est active depuis moins de 120 secondes, l'appel est rejeté immédiatement avec raison explicite. La libération se fait obligatoirement en bloc `finally` via `releaseAcpLock(providerId)`.

---

## 2. Répertoire des 58 Outils MCP (`Hephaistos-everything-search`)

### A. Recherche Système de Fichiers NTFS (`\\.\pipe\hphe-index`)
- `everything_search` / `search_files` : recherche instantanée sur tous les disques NTFS par nom, extension ou filtres.
- `everything_count` : compte les résultats sans transférer les lignes (très rapide).
- `everything_categories` : filtres Everything (`audio:`, `document:`, `exe:`, etc.).
- `everything_index_stats` / `everything_stats` : état de l'index NTFS (entrées, mémoire, statut).
- `everything_refresh` : rafraîchissement forcé de l'index.
- `everything_open_gui` : ouverture du GUI Everything si installé.
- `resolve_path` : résout un ID de ligne interne vers son chemin complet.
- `hphe_health` : test de santé du serveur et de connectivité au named pipe.

### B. Indexation & Recherche Plein-Texte (Tantivy)
- `content_search` : recherche BM25 plein-texte (hits : chemin, score, extrait).
- `content_ingest` : ingère un dossier dans Tantivy (respecte `.ragignore` et filtres de sécurité).
- `hephaistos_update` / `hephaistos_update_force` : cycle complet ingest + embeddings optionnels.

### C. Recherche Vectorielle (USearch HNSW 2048D)
- `vec_search` : recherche k-NN vectorielle brute sur collections usearch locales.
- `semantic_search` : recherche sémantique avec vectorisation automatique.
- `vec_stats` : statistiques des collections vectorielles locales.
- `hybrid_search` : fusion multimodale (nom de fichier + BM25 Tantivy + vecteurs USearch).

### D. Orchestration Multi-Agents & Gouvernance Processus
- `list_agents` : liste les agents enregistrés (configuration, skills, providers).
- `register_agent` / `update_agent` : enregistre ou modifie un profil d'agent.
- `suggest_agent` : suggère le meilleur agent selon le type de tâche et les compétences requises.
- `create_task` : crée une tâche dans `orchestrator.db` (en attente).
- `dispatch_task` : **crée, assigne et spawne réellement le worker CLI** de l'agent retenu.
- `update_task` : met à jour l'état, la description ou le résultat d'une tâche.
- `get_next_task` : récupère la prochaine tâche éligible selon les dépendances.
- `list_tasks` : liste les tâches avec filtres de statut (`pending`, `running`, `completed`, `failed`).
- `delete_task` : supprime une tâche.
- `list_prompt_templates` / `set_prompt_template` : templates de rôles d'agents.
- `list_worktrees` / `worktree_cleanup` : isolation git des tâches et nettoyage des branches.
- `reconcile_tasks` : réconcilie l'état des tâches avec les PID Windows actifs et libère les verrous orphelins.
- `reap_ghosts` : purge les processus zombies orphelins et requalifie les tâches mortes en échec.

### E. Modèles IA & Routage NVIDIA NIM
- `available_models` : sonde live des modèles gratuits/locaux (Ollama, OpenRouter `:free`, NIM ×2).
- `nim_domains` : domaines routés (modèle primaire + fallbacks automatiques).
- `nim_models` : modèles servis par NVIDIA NIM (`GET /models`).
- `nim_chat` / `nim_chat_model` : chat direct routé par domaine ou par ID explicite.
- `nim_embed` : embeddings 2048D via `nemotron-3-embed-1b`.

### F. Mémoire Technique Unifiée & Télémétrie Beacon
- `project_init` : initialise l'espace mémoire d'un projet.
- `memory_write` / `memory_read` : écriture et lecture par clé dans le KV store persistant.
- `memory_search` / `memory_list` : recherche par mot-clé, tags ou type d'entité.
- `memory_update` : modification d'une mémoire existante.
- `memory_stats` : statistiques d'occupation de la mémoire.
- `beacon_ingest` : ingestion incrémentale des résumés Beacon (scope workspace, secrets masqués, dry-run par défaut).

### G. Système de Fichiers Borné (`fs_*`)
- 18 outils filesystem natifs (`fs_read_file`, `fs_read_multiple_files`, `fs_write_file`, `fs_edit_file`, `fs_list_directory`, `fs_directory_tree`, `fs_delete`, `fs_move`, `fs_get_info`, `fs_create_directory`, etc.) régis par la politique stricte `.mcp-access` et l'allowlist `EVERYTHING_MCP_ROOTS`.

---

## 3. Intégration Télémétrie Beacon & Second Cerveau Obsidian

### A. Surveillance & Télémétrie Beacon
- Beacon capture en continu les événements opérationnels des agents (commandes exécutées, anomalies, blocages d'outils).
- Ingestion dans Hephaistos2-Kit : `beacon_ingest` lit le journal d'activité par offset sans charger de fichiers complets, masque automatiquement les secrets (`sk-`, `nvapi-`, tokens) et consigne les synthèses dans la mémoire du projet.
- Profil d'accès : `beacon_ingest` est strictement refusé aux profils MCP `external` et restreint au scope du workspace actif.

### B. Second Cerveau Obsidian (`Promgramation-teste`)
- **Soul & Profil** : `00_Agent/USER.md` (quota strict 1 500 chars) et `00_Agent/MEMORY.md` (quota strict 2 500 chars). Si le quota est dépassé, élaguer et synthétiser impérativement.
- **Skills Vivantes & Auto-Correction** : playbooks procéduraux dans `01_Skills/[nom].md` incluant la section `## Errores Conocidos y Corrección (Aprendidos en Ejecución)`. L'agent a l'obligation de les auto-améliorer lors de bugs résolus.
- **Consultation Rapide (< 80 tokens)** : utiliser `obsidian_triage` ou `obsidian_peek` face à des doutes techniques au lieu de relire des bases entières.
- **Sauvegarde Autonome Obligatoire** : à la fin de chaque tâche technique non triviale, appeler systématiquement l'outil MCP `obsidian_session_save` pour acter le jalon dans `03_Sessions/`.

---

## 4. Règles d'Or de Vélocité et Économie de Tokens

1. **Recherche de Fichiers** :
   - **OBLIGATOIRE** : `everything_search` (instantané <50 ms sur ~6,4M d'entrées).
   - **INTERDICTION FORMELLE** : scans récursifs lents (`Get-ChildItem -Recurse`, `dir /s`, `find`).
2. **Recherche de Contenu** :
   - `content_search` (BM25 Tantivy) ou `hybrid_search`.
3. **Délégation d'Agents** :
   - Toujours passer par l'orchestrateur Hephaistos2-Kit via `dispatch_task`.
   - **INTERDICTION FORMELLE** : spawner des workers sauvages en arrière-plan hors orchestrateur.
4. **Pas d'Attente Passive** :
   - Surveillance réactive via `list_tasks` et notifications WebSocket (:7477).
   - **INTERDICTION FORMELLE** : `Start-Sleep` ou `sleep` passif.

---

## 5. Maintenance Réactive & Commandes Rapides

```powershell
# 1. Vérifier la santé du serveur REST et du gate d'ingestion
curl http://127.0.0.1:8792/health

# 2. Vérifier le démon NTFS SYSTEM
schtasks /query /tn hphe-indexd

# 3. Purger les tâches et workers fantômes (reconcile_tasks + reap_ghosts)
pwsh -File tools/reap-and-reconcile.ps1

# 4. Configuration portable collaborateur (setup-collab)
setup-collab\configurer-devin-agents.cmd
```

---

## 6. Politique Git Stricte (Double Remote Private)

- **Remotes Autorisés Exclusivement** :
  1. `origin` : Organisation projet provisoire (`https://github.com/projet-temporaire/...`)
  2. `personal` : Dépôt personnel de Boss (`https://github.com/lascard-m/...`)
- **Statut Obligatoire** : Tous les dépôts doivent impérativement demeurer en statut **PRIVATE**.
- **Audit de Sécurité** : Vérification systématique de l'absence de tokens (`nvapi-`, `sk-`, `ghp_`, etc.) avant tout commit.

---

## 7. Matrice des Commandes Slash & Templates Canoniques (`/chat-id` et `/jointes`)

Chaque agent (Antigravity, Devin, OpenCode, Kilo, Hermes) DOIT reproduire ces templates exacts en réponse aux commandes slash.

### A. Commande `/chat-id` (Lecture Seule)

**Commandes d'exécution par agent** :
- **Antigravity (AGY)** : `node .agent/agent-bridge/chat-id.js --agent agy --via hub`
- **Devin (`devin-cli` / `devin-cascade`)** : `node .agent/agent-bridge/chat-id.js --agent devin --via acp`
- **OpenCode (`opencode`)** : `node .agent/agent-bridge/chat-id.js --agent opencode --via acp`
- **Kilo / Hermes** : `node .agent/agent-bridge/chat-id.js --agent <kilo|hermes> --via <acp|cli>`

**Template de réponse obligatoire** :
```text
sessionId  : <sessionId>
providerId : <providerId>
transport  : <transport>
title      : <titreSession>
messages   : <count> — créée le <dateISO>
workspace  : <cheminWorkspace>
```
```json
{
  "agent": "<nomAgent>",
  "providerId": "<providerId>",
  "transport": "<transport>",
  "sessionId": "<sessionId>",
  "title": "<titreSession>",
  "userMessageCount": <count>,
  "createdAt": "<dateISO>",
  "workspace": "<cheminWorkspace>"
}
```

### B. Commande `/jointes <sessionId>` (Protocole Binôme)

**Exécution** :
`node .agent/agent-bridge/binome.js --as <monAgent> --via <monTransport> --self <monSessionId> --peer <peerAgent> --peer-via <peerTransport> --to <peerSessionId> --session binome join`

**Template si pairage établi (`established: true`)** :
```text
Binôme : <monAgent> ⇄ <peerAgent>
Status : Pairage établi (established: true)
PairId : <pairId>
Local  : <monAgent> (<monSessionId>) via <monTransport>
Pair   : <peerAgent> (<peerSessionId>) via <peerTransport>
```
```json
{
  "established": true,
  "pairId": "<pairId>",
  "session": "binome",
  "me": { "agent": "<monAgent>", "providerId": "<monProviderId>", "transport": "<monTransport>", "sessionId": "<monSessionId>" },
  "peer": { "agent": "<peerAgent>", "providerId": "<peerProviderId>", "transport": "<peerTransport>", "sessionId": "<peerSessionId>" }
}
```

**Template si en attente d'ACK réciproque** :
```text
Binôme : <monAgent> ➔ <peerAgent>
Status : Requête join envoyée — en attente d'ACK réciproque
PairId : <pairId>
Local  : <monAgent> (<monSessionId>) via <monTransport>
Pair   : <peerAgent> (<peerSessionId>) via <peerTransport>

Commande de retour à exécuter côté pair :
node .agent/agent-bridge/binome.js --as <peerAgent> --via <peerTransport> --self <peerSessionId> --peer <monAgent> --peer-via <monTransport> --to <monSessionId> --session binome join
```

---

## 8. Gouvernance Multi-Agents : Rôles Stricts et Passage par l'Orchestrateur

1. **Hiérarchie et Séparation des Rôles** :
   - **Architecte / Orchestrateur Principal** : Antigravity ou Devin. Seul l'agent principal a la responsabilité d'architecturer, de découper le travail, de créer et de distribuer les tâches via `dispatch_task` ou `binome.js`.
   - **Sous-Agents Exécutants** : OpenCode, Kilo, Hermes, Mistral-Vibe. Ce sont des **workers exécutants spécialisés** (codage unitaire, exploration lecture seule, tests, revue). Ce n'est **PAS leur rôle d'orchestrer** ni d'assigner des tâches à d'autres agents.
2. **Déclaration Obligatoire via l'Orchestrateur MCP** :
   - Si un sous-agent doit exceptionnellement déclarer une sous-tâche, signaler un livrable ou clore une tâche assignée, il doit **STRICTEMENT** passer par les outils officiels de l'orchestrateur MCP (`create_task`, `update_task` avec statut `completed`/`failed` et description du livrable) ou par le canal de communication binôme / `comms.jsonl`.
   - **INTERDICTION FORMELLE** :
     - Accès SQL direct ou requêtes manuelles sur les bases SQLite (`orchestrator.db`, etc.).
     - Lancement de processus sauvages en arrière-plan sans passer par l'orchestrateur.
     - Écrasement des tours de parole (respect impératif de la file d'attente FIFO `message-queue.js`).

---

## 9. Répertoire Obligatoire « Rapport de dysfonctionnement et correction » & Priorité Cloud

1. **Traçabilité Systématique des Dysfonctionnements et Corrections** :
   - Tout dysfonctionnement de l'orchestrateur, livrable factice, panne de worker, contournement de gate ou correctif appliqué aux rules, skills, scripts ou crates Rust DOIT être systématiquement documenté en Markdown (`.md`, strictement sans emoji) dans le répertoire dédié :
     `<workspace>\Rapport de dysfonctionnement et correction\`
   - Un agent dédié (Bleubite recruté par l'orchestrateur, assisté des workers Cloud) est chargé de transcrire chaque incident et sa résolution dans ce répertoire et de tenir à jour `INDEX-RAPPORTS.md`.
   - Tous les collaborateurs (Cash, Luna, Bleubites, workers Cloud) doivent être avisés et appliquer cette règle.
2. **Rôle Strict de l'Orchestrateur et Priorité aux Modèles Cloud** :
   - L'orchestrateur principal (Tango) ne code jamais lui-même les tâches des workers : il vérifie les livrables et dispatche.
   - Afin de ne pas saturer les collaborateurs ACP, l'orchestrateur dispatche au maximum vers les workers Cloud en CLI via `dispatch_task` :
     - Position 0 : `nim1` (`nvidia-nim`)
     - Position 1 : `nim2` (`nvidia-nim2`)
     - Position 2 : `ollama-cloud` (`ollama-cloud`)



---

## 10. Roster de workspace — SWAT de base (persistance des fenêtres agents)

Les conversations/fenêtres d'agents ouvertes dans un workspace sont déclarées dans le manifeste local **`.agent/workspace-roster.json`** (miroir canonique : `memory_read/write key=team/roster projectId=<workspace>` via hphe-mcp). SWAT de base type : 2 agents Devin + Cerberos (optionnel) + 3 Bleubites `hephaistos-chats`.

Outil : `node .agent/agent-bridge/workspace-roster.js status|restore|ping [--write] [--only id1,id2]`

- `status` : état live — sessions ACP via bridge/Redux (fallback disque) + sessions Bleubites persistées dans `.agent/chats/sessions.json`. **Une entrée persistée n'est pas une fenêtre ouverte.**
- `restore` : envoie `open_chat` via le bridge `ws://127.0.0.1:7477` pour chaque entrée `open-or-reveal` → l'extension appelle `ChatPanel.open`/`openById` (révèle le panneau existant, sinon le crée — jamais de doublon). Entrées `existing-only` : vérification de présence uniquement.
- `ping` : PING/PONG par transport — `acp-inject.js --wait turn` pour `hephaistos`/`cerberos` (exiger `delivered` + `stopReason: end_turn` + reply `PONG`), `wake_acp_agent` pour `devin-cli` (focus onglet existant ou ouverture unique, pas de texte de réponse attendu). **Ping rapide préféré** : 3 `acp-inject` en parallèle (sorties `/tmp/ping-<id>.json`) plutôt que le sweep séquentiel. **Observabilité** : le message user est flushé + `thoughtChunk` émis avant le tour → réception visible d'emblée ; surveiller `sessions.json`/`comms.jsonl`, jamais de shell en attente. **Inviolable** : provider/modèle/fenêtre = choix utilisateur — aucune migration ni changement sans demande explicite. Détail des pannes : skill `bleubite-dispatch`.
- `--write` persiste `verification.lastPing` + `results` dans le manifeste.
- Règles absolues : couple exact `providerId/sessionId`, vérification du workspace, entrée absente = `missing` jamais devinée, **jamais de conversation de remplacement**.
