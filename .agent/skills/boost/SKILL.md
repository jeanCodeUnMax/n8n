---
name: boost
description: Mode Boost — Parallélisation maximale, délégation agressive via orchestrateur Hephaistos (dispatch_task) + subagents, cadrage Hephaistos et vérification continue
triggers:
  - user
---

# /boost — Mode Boost Haute Performance

Active le mode d'ingénierie avancée : parallélisation, délégation et autonomie maximales, câblé sur l'infrastructure Hephaistos2-Kit.

## 1. Directives Opérationnelles
- **Autonomie Maximale :** skip les confirmations pour les étapes évidentes (création de fichiers, lectures, tests, scripts non destructifs).
- **Parallélisation & Délégation Agressive :** déléguer immédiatement toute sous-tâche d'exploration/recherche/analyse lourde (>3 fichiers ou >150 lignes).
- **Rigueur Chirurgicale :** zéro placeholder, zéro code mort, zéro supposition. Implémentations complètes et fonctionnelles.

## 2. Phase 0 : Cadrage & Indexation Immédiate (Hephaistos)
- **Interdiction formelle :** jamais de `Get-ChildItem -Recurse`, `find`, `dir /s`.
- **Recherche instantanée** via MCP `Hephaistos-everything-search` (hphe-mcp, 58 outils) :
  - `everything_search` : localiser fichiers et dépendances sur le disque.
  - `content_search` / `hybrid_search` : symboles, types, interfaces.
  - `fs_*` : lecture/écriture bornées par `.mcp-access` (profil `external` = subagents muxés).
- **Fallback CLI si MCP non exposé :**
  `node "$env:USERPROFILE/.config/devin/scripts/mcp-call.mjs" Hephaistos-everything-search everything_search '{"query":"<terme>"}'`

## 3. Phase 1 : Exécution & Délégation

### 3.1 Choix du canal de délégation (dans l'ordre)
1. **`run_subagent` (IDE)** — explorations/lectures/audits parallèles : profil `subagent_explore` (read-only) ou `subagent_general` (écriture). Lancer en `is_background` pour la parallélisation vraie.
2. **`dispatch_task` (hphe-mcp orchestrateur)** — exécution CLI externe : `title, task_type, context, files, workspace, [agent_name], [priority]`. `task_type` ∈ `code|debug|review|docs|test|explore` détermine le prompt de rôle.
3. **Fallback one-shot** si orchestrateur down : `agy --print "<prompt>"` ou `hermes -z "<prompt>"`.

### 3.2 Agents enregistrés (`.agent/REGISTRY.md` = source de vérité)
- **`agy`** — Antigravity CLI, skills `*`, abonnement (toujours dispo). **Défaut** — non muxé, MCP en direct.
- **`kilo-nim1`** — KiloCode → NIM : explore, code, docs.
- **`ollama-cloud`** — Hermes scopé : code, review, docs, explore (1 connexion à la fois).
- **`devin`** — agent principal : architecture, orchestration, synthèse, validation finale.

### 3.3 Règles de délégation
- **Modèles free uniquement** pour les CLI (sauf `agy` : abonnement). L'orchestrateur sonde les modèles live (`available_models`, cache 60 s) et suit `provider_prefs` dans `orchestrator.db` — ordre réel piloté par le monitor UI.
- `suggest_agent(task_type)` en cas de doute ; `agent_name` pour forcer.
- `full_prompt:true` = le CLI reçoit le prompt complet (agents sans accès orchestrator comme `agy --print`).
- **`dispatch_task` réveille réellement le CLI** — ne pas l'appeler « pour voir ». Clôture obligatoire : `update_task(id, status, result)`, sinon tâche perdue.
- **Jamais de SQL direct** sur `orchestrator.db` — outils MCP uniquement.
- **Wake-back agy→Devin** : inclure un tag `[agycascade:<uuid>]` dans le context pour que la réponse remonte dans le chat (sinon skip volontaire).
- Agent sans `skills` déclarés n'est jamais choisi auto → `update_agent` ou `agent_name`.
- Ne pas utiliser `gemini` CLI stock (IneligibleTierError) → `agy.exe`.
- Worktree isolation dispo (`list_worktrees`/`worktree_cleanup`) pour les tâches modifiant du code en parallèle.

## 4. Phase 2 : Boucle de Validation & Auto-Correction
- Linters, vérifications de syntaxe, compilations.
- Suites de tests unitaires/intégration associées.
- Régression/erreur → diagnostic cause racine → correction → re-test avant de clore.
- Vérifier le livrable **sur disque** (les agents CLI peuvent rapporter un diff non persisté).

---
*Skill détaillée : `orchestrator` (`.agent/skills/orchestrator/SKILL.md` — playbook complet dispatch_task). `model-router` est déprécié — `available_models` fait le probing live.*
