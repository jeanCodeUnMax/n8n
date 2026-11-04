# REGISTRE INFRASTRUCTURE — source de vérité
Dernière vérification : 2026-10-13. Mettre à jour à chaque changement d'agent/provider/MCP.

## Habilitation orchestration

**Seuls `devin` (IDE) et `agy` (Antigravity, CLI + IDE) sont habilités** à utiliser la chaîne de providers, l'orchestrateur et les outils `dispatch_*`/`update_task`/`register_agent`. Les autres agents sont des **workers** : ils reçoivent des tâches, n'en créent pas, ne dispatch pas (anti-récursion).

## Chaîne de providers — dynamique, pilotée par le Monitor

L'ordre réel = `provider_prefs` dans `orchestrator.db` (position + enabled), modifiable par drag & drop dans l'extension Monitor. Ordre courant (2026-10-13) :

| Pos | Provider | État | Clé / transport |
|---|---|---|---|
| 0 | `antigravity-subscription` | ✅ | `agy` — abonnement |
| 1 | `mistral-vibe` | ⛔ off (HTTP 402, budget mort) | `vibe` |
| 2 | `nvidia-nim` (**NIM1**) | ✅ | **`NVIDIA_API_KEY` — protocole direct**, worker `nim1` |
| 3 | `nvidia-nim2` (**NIM2**) | ✅ | **`NVIDIA_API_KEY_2` — protocole direct**, worker `nim2` |
| 4 | `ollama-cloud` | ⚠️ quota mensuel | `hermes` scopé `--provider ollama-cloud` |
| 5 | `kilo-free` | ✅ | `kilo` — renfort free |
| 6 | `hermes-free` | ✅ | `hermes` — renfort free (nous) |
| 7 | `openrouter-free` | ✅ | supplément 1000 req/j |
| 8-10 | `kilocode` / `hermes` / `ollama` | ⛔ off | dernier recours / réservé utilisateur |

**NIM ≠ transport** : `nvidia-nim`/`nvidia-nim2` = protocole OpenAI-compat direct vers `integrate.api.nvidia.com`, clés reliées directement (`NVIDIA_API_KEY` / `NVIDIA_API_KEY_2`). Les workers `nim1`/`nim2` = `.agent/scripts/nim-worker.mjs` (POST direct, `--account 1|2`). **Kilo et hermes ne portent JAMAIS NIM en primaire** — ils sont renforts free (3e/4e recours), NIM seulement pour ajouter de la capacité sans saturer les clés.

## Sélection agent + modèle — 3 paramètres (hphe-mcp `pick_agent`/`pick_model`)

1. **Chaîne de providers** : l'agent retenu est celui dont le premier provider activé est le plus haut dans `provider_prefs` (skill match requis d'abord, `*` en fallback). `priority` = tiebreak.
2. **Ping** : `model_health` (latence + échec récent, alimentée par `ping-models.mjs`) exclut les morts et préfère les rapides.
3. **Spécificité** : `model_prefs` de l'agent (sous-chaîne du modèle).

**Registre modèles** : `.agent/model-registry/<supplier>.md` — régénéré à chaque ping, section `## Notes` préservée pour annoter morts/lents (ex. `nemotron-3-ultra-550b` = très lent, ne répond presque jamais → réserver `deep_analysis`).

## Agents exécutants (enregistrés dans l'orchestrateur)

| Agent | Provider principal | Transport | Priority | Quota |
|---|---|---|---|---|
| `agy` | `antigravity-subscription` | `agy --print` | 10 | Abonnement — **toujours dispo** |
| `nim1` | `nvidia-nim` | **direct** `nim-worker --account 1` | 20 | `NVIDIA_API_KEY` — ~80 modèles |
| `nim2` | `nvidia-nim2` | **direct** `nim-worker --account 2` | 30 | `NVIDIA_API_KEY_2` — même catalogue |
| `ollama-cloud` | `ollama-cloud` | `hermes --provider ollama-cloud` | 40 | Forfait — 1 connexion à la fois |
| `kilo` | `kilo-free` | `kilo run -m {model}` | 80 | free + NIM dernier recours |
| `hermes` | `hermes-free` | `hermes -z --provider {p}` | 90 | free + NIM dernier recours |
| `devin` | `devin-subscription` | — (agent IDE principal) | — | — |
| `vibe` | `mistral-vibe` | `vibe -p` | off | ⛔ HTTP 402 budget épuisé |

**Désactivés** : `kilo-nim1` (design erroné — kilo ne doit pas porter NIM), `kilo-free`, `vibe`.

**Clôture obligatoire** : toute tâche dispatchée doit se terminer par `update_task(task_id, status, result)` — l'orchestrateur auto-marque `completed` à la sortie du process, quitter sans `result` = tâche perdue (cf. #308). Devin vérifie le livrable sur disque.

**Routage ACP/cascade (extension 0.0.58)** :
- Retour vers Devin Local ACP : `wake_devin` exige `providerId === 'devin-cli'` et l’ID `acp/*` exact; restauration du même onglet puis `explainAndFixProblem`.
- Inventaire ACP tiers : `acp-list` exige le `providerId/sessionId` exact, provider activé et workspace concordant.
- Devin vers un ACP tiers : `wake_acp_agent` injecte via `agent-bridge/acp-inject.js` — client ACP stdio vers le processus provider (`initialize` → `session/load`/`session/resume` → `session/prompt`) sur l’ID exact, sans `session/new` ni focus. Providers mappés : `opencode`, `antigravity-acp`, `mistral-vibe`, `hermes`, `kilo`. Non mappé/indisponible = `skipped`; échec = `failed`. Jamais `devin.sendChatActionMessage` pour un tiers (payload sans cible → risque d’injection dans Devin).
- Session classique Cascade `uuid` : `setCascadeId` + `sendCascadeInput` uniquement avec l’UUID vérifié.
- Sans session connue, provider désactivé ou focus non confirmé : `skipped`/`wake-noroute`; aucun toast, presse-papiers, nouvel onglet ni fallback vers un chat actif.

## Providers — rôles (détail)

| Provider | État | Modèles notables | Usage |
|---|---|---|---|
| `nvidia-nim` (NIM1) | ✅ | ~80 modèles : nemotron-3-embed-1b (2048D embeddings), super-120b, lightning-30b… | Protocole direct `NVIDIA_API_KEY` — embeddings + `nim_chat` + worker `nim1` |
| `nvidia-nim2` (NIM2) | ✅ | même catalogue | Protocole direct `NVIDIA_API_KEY_2` — worker `nim2` + `nim_* account:2`, fallback auto sur 429 |
| `ollama-cloud` | ⚠️ quota mensuel (épuisé au relevé 10-05) | gpt-oss:120b-cloud, nemotron-3-ultra:cloud, gemma4:31b-cloud | Via daemon local `:11434`, suffixe `:cloud` |
| `kilo-free` | ✅ | modèles `:free` gateway Kilo | Renfort agentique free (agent `kilo`) |
| `hermes-free` / `nous` | ✅ | laguna-xs/s-2.1, step-*, ling-* `:free` | Renfort agentique free (agent `hermes`) |
| `openrouter-free` | ✅ ~24 `:free` | Supplément — 1000 req/jour |
| `huggingface` | ✅ clé `HF_TOKEN` | API directe + supplier `hf`. **ACP désactivé** : fenêtre 131k < prompt opencode |

**Hors service :**

| Provider | État | Raison |
|---|---|---|
| `mistral-vibe` | ⛔ | HTTP 402 budget épuisé (2026-10-13) — provider + agent off |
| `ollama` local (:11434) | ✅ UP | ⚠️ **réservé à l'utilisateur** — jamais pour l'automatisation |
| llama.cpp | ⚠️ aucun GGUF | inutilisable sans télécharger un modèle |
| `gemini` CLI (api-key) | ✅ opérationnel | `GEMINI_API_KEY` + `selectedType:"gemini-api-key"` — ≠ `agy` (CANON) |
| `kilocode` (paid) | ⛔ off | dernier recours payant |

**Hors service :**

| Provider | État | Raison |
|---|---|---|
| `ollama` local (:11434) | ✅ UP | ⚠️ **réservé à l'utilisateur** — jamais pour l'automatisation |
| llama.cpp | ⚠️ aucun GGUF | inutilisable sans télécharger un modèle |
| `gemini` CLI (api-key) | ✅ opérationnel | `GEMINI_API_KEY` + `selectedType:"gemini-api-key"` — ≠ `agy` (CANON) |

## Orchestrateur (intégré à `hphe-mcp`, serveur `Hephaistos-everything-search`)

Outils : `create_task` `update_task` `get_next_task` `register_agent` `update_agent` `list_agents` `list_tasks` `delete_task` **`dispatch_task`** `suggest_agent` `available_models` `set_prompt_template` `list_prompt_templates` `list_worktrees` `worktree_cleanup` `reconcile_tasks`

- `dispatch_task(title, task_type, context, files, workspace)` : choisit l'agent par skill → sonde les modèles free live (cache 60 s) → rend le prompt du rôle → crée+assigne+**spawne le CLI** (effet de bord réel).
- L'ex-serveur Node `mcp/servers/orchestrator-server` est absorbé dans hphe-mcp (`orchestrator.db`, env `HPHE_ORCH_DB`).
- Rôles de prompt seedés : `code` `debug` `review` `docs` `test` `explore` (placeholders `{{task}} {{context}} {{files}} {{model}}`).
- Config agent JSON : `{skills:[], providers:[], command:"…{message} {model} {provider} {workspace}…", model_prefs:[], full_prompt:true/false}`.

## MCP actifs (Devin)

**8 directs** (2026-10-13) : `Hephaistos-everything-search` (source hphe-mcp — 58 outils : fs_*, memory_*, beacon_ingest, orchestrateur, nim_*, index/contenu/vec; runtime installé à 57, non déployé par décision utilisateur), `sqlite-node`, `beacon`, `kaggle`, `colab-mcp`, `google-drive`, `opencli-mcp`, `puppeteer`. Les anciens agentmemory/qdrant/zvec/orchestrator/model-discovery/nim-router ont été absorbés par `hphe-mcp` (poste = `extension/server/hphe-mcp.exe`).

**`mcp-mux` = pipeline des sous-agents CLI/ACP** (kilo, opencode, hermes, gemini-cli) — sauf **Antigravity (agy) qui est démuxé** : ses MCP sont en direct dans `~/.gemini/config/mcp_config.json` + `~/.gemini/antigravity-ide/mcp_config.json` (hphe-mcp, sqlite-node, beacon, google-drive, opencli-mcp, puppeteer, kaggle, colab-mcp + datacloud + obsidian). Le mux sert hphe-mcp aux sub-agents avec `EVERYTHING_MCP_AGENT=external` (profil `.mcp-access` lecture bornée, pas d'écriture).

- `agy.exe` : `%LOCALAPPDATA%\agy\bin` est dans le **PATH utilisateur** (persistant). Un shell déjà ouvert conserve l'ancien PATH → rouvrir un shell, ou `export PATH="$PATH:$LOCALAPPDATA/agy/bin"` (bash) / `$env:Path += ";$env:LOCALAPPDATA\agy\bin"` (PowerShell). Ne jamais créer d'alias ou de shim.
- ACP : `devin.acp.preferredAgent = antigravity-acp` (agy = second agent par défaut dans Devin).

## Règles d'usage

0. « **Sous-agents** » = les CLI agents externes (`agy`, `kilo`, `hermes`) délégués via `orchestrator.dispatch_task` / `acp-dispatch.mjs` / appel direct — distincts des *sub-agents* internes à l'IDE.
1. Toute délégation → `orchestrator.dispatch_task`, jamais de prompt CLI à la main.
2. `suggest_agent` en cas de doute sur le bon agent.
3. Modèle précis souhaité → `model_prefs` de l'agent via `update_agent`.
4. Nouveau rôle récurrent → `set_prompt_template` au lieu de réécrire le prompt.
5. Gemini CLI (`gemini-api-key`) ≠ `agy` (Antigravity) — deux canaux distincts, jamais interchangeables.
6. **Ordre des providers = `provider_prefs` dans `orchestrator.db`**, piloté par l'extension monitor — table ci-dessus indicative ; l'ordre réel runtime = l'UI. Dérogation uniquement sur demande explicite.

## Problèmes connus

- ~~Collecteur Beacon non supervisé~~ → **RÉSOLU** : service Windows `BeaconCollector` (démarrage automatique), survit au logout.
- llama.cpp sans modèle — inutilisé.
- Orchestrateur présent dans Devin direct ET mcp-mux : **volontaire**, même DB partagée (WAL). Ne pas "corriger".
- HF en ACP : désactivé (fenêtre 131k < prompt opencode ~128k).
