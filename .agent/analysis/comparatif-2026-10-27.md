# Comparatif — article « Second Brain Guide » vs architecture Hephaistos2-Kit

> Task #735 (ANALYSE COMPARATIVE), 2026-10-27. Source :
> `.agent/analysis/article-2026-10-21-second-brain-guide.md` (Brucky, pattern
> Karpathy raw/wiki/CLAUDE.md + linter `brain.py` + hooks + vault unique + hot.md).
> Référentiel interne : `.agent/ARCHITECTURE.md`, `.agent/rules/global_rules.md`,
> `.agent/` (knowledge/, memory/, comms.jsonl, skills `vault-ingest` /
> `antigravity-obsidian` / `obsidian`), vault `F:\Promgramation-teste`.
> Voir aussi `audit-securite-2026-10-27.md` (task #737, angle sécu du même article).

---

## 1. Table de correspondance article ↔ hephaistos2

| Élément article | Équivalent hephaistos2 | Statut |
|---|---|---|
| `raw/` — sources read-only | Ingestion via `content_ingest`/`beacon_ingest` dans l'index Tantivy + vec ; le vault `F:\Promgramation-teste` fait office de dépôt de notes. Pas de dossier `raw/` dédié ni de read-only | ~Partiel (ingestion oui, read-only non) |
| `wiki/` — pages markdown maintenues par le LLM | Vault Obsidian `F:\Promgramation-teste` (00_Agent/Memoires, 03_Sessions, 01_Skills) + `.agent/knowledge/` (ADR, docs) | ✅ Supérieur (multi-hôtes, partagé) |
| `CLAUDE.md` — règles projet | `AGENTS.md` + `.agent/rules/global_rules.md` + `.devin/rules/` + `SOUL.md`/`USER.md` | ✅ |
| `hot.md` — ~12 lignes de contexte récent injecté au démarrage | `00_Agent/MEMORY.md` (mémoire bornée, quota 2500 chars auto-élagué) + checkpoints `03_Sessions` (`obsidian_session_last`) + kv `runtime-cache.db` (TTL 1h) | ~Partiel (contenu oui, **injection auto non**) |
| `index.md` — index manuel des pages | `00 Index Mémoire.md` (357 o, squelettique) ; le vrai index = Tantivy BM25 + usearch 2048D + KG | ✅ Autre paradigme (recherche > liens) |
| `ingest` (source → 10-15 pages) | Skill `vault-ingest` (protocole taggage/extraction pépites) + `hephaistos_update` + boucle auto `hphe-rest` (900 s) | ✅ Supérieur (auto-ingest sans LLM) |
| `query` (question → réponse citée) | `obsidian_triage` (<100 tok) / `obsidian_peek` (<80 tok) + `content_search`/`hybrid_search`/`semantic_search` + `session_recall` | ✅ Supérieur (coût contexte moindre) |
| `lint` (orphelins, contradictions, stale) | `pepites_lint` spécifié (validation taxonomie) — **mais `pepites-mcp.mjs`/`pepite-ingest.mjs` absents du disque** (reste `C:\vault-pepites-watch.log` vide). Pas de vérification de cohérence entre notes | ❌ Spec sans implémentation vivante |
| Manifest sha256 → NEW/CHANGED/DELETED | État incrémental natif hphe (`.ragignore`, USN journal MFT, content-index) | ✅ Équivalent côté index |
| **Quote-check** (citation verbatim dans raw) | **Aucun équivalent** | ❌ |
| `deny Edit(raw/**)` par config | `fs_*` `allowed_roots` = allowlist par racine (plus dur en surface, moins granulaire : pas de deny par sous-chemin) | ~Différent |
| Hooks SessionStart / PostToolUse | `security-watch.cjs` (fs.watch + tail comms.jsonl, **observateur passif**) ; `task-watch.cjs` (événements WS orchestrateur). Pas de hook injectant du contexte ni de feedback lint au modèle | ❌ Canal existe, câblage non |
| `/ingest` humain + commit git post-ingest | `vault-ingest` manuel ; vault `F:\Promgramation-teste` non versionné git constaté | ~Partiel |
| `claude -p "/ingest"` en cron | `hphe-rest` auto-ingest 900 s (déjà non-LLM) + tâches planifiées Windows (`hphe-taskwatch`, `hphe-indexd`) | ✅ Supérieur |
| Subagent par source (bulk, modèle cheap) | `dispatch_task` + worktrees + bleubites + providers NIM/free | ✅ Supérieur |
| UN vault pour tous les projets | `F:\Promgramation-teste` partagé Devin↔AGY↔Hermes + `HPHE_MEMORY_ROOT` unique + KG partagé | ✅ Déjà fait (« best idea » validée) |
| « Obsidian is the IDE, LLM the programmer » | Vault Obsidian + pont `antigravity-obsidian` (`obsidian.js` CLI / outils MCP) | ✅ |

## 2. Ce que l'article apporte que nous n'avons PAS

1. **Linter déterministe de cohérence** (`brain.py`, 95 lignes, stdlib, zéro LLM) :
   frontmatter obligatoire, `[[liens]]` résolus, orphelins, TODO restants, pages
   périmées. Notre `pepites_lint` n'est qu'une spec — le package `vault-pepites`
   n'existe plus sur disque (recherche Everything : 0 fichier, seul un log vide).
   Nous n'avons **aucune vérification déterministe** de la santé du vault.
2. **Quote-check verbatim** : chaque citation `> "texte" — raw/x.md` est vérifiée
   mot pour mot dans la source. C'est LA défense anti-hallucination de l'article
   (a attrapé « Bush invented hypertext in 1941 »). Aucun mécanisme équivalent
   chez nous — une pépite ou un digest Beacon faux se propage sans contrôle.
3. **`hot.md` injecté par hook SessionStart** : le contexte récent arrive *avant*
   le premier prompt, survit au clear. Notre `MEMORY.md` borné existe mais
   repose sur la discipline de l'agent (lire au démarrage) — suggestion, pas
   enforcement. Aucun hook ne l'injecte.
4. **Deny rules par chemin dans la config** (« keys, not prompts ») : `raw/`
   read-only *par configuration*. Nos `fs_*` n'ont que des `allowed_roots`
   (allowlist par racine) — une fois `F:\` autorisé, rien n'empêche d'écrire
   dans un sous-dossier « raw ». Pas de négation granulaire.
5. **PostToolUse lint → feedback dans le même tour** : après chaque écriture
   wiki, le linter tourne et l'erreur revient au modèle immédiatement.
   `security-watch.cjs` observe mais ne renvoie rien à l'agent.
6. **Séparation raw/wiki explicite** : notre vault mélange sources et synthèses
   dans les mêmes dossiers ; la frontière « le modèle écrit ici, jamais là »
   n'est pas tracée.

## 3. Ce que nous avons au-delà du pattern

- **Retrieval multi-canal** : BM25 (Tantivy) + vecteurs 2048D + KG (~225k
  entités) + index NTFS global (6,4M entrées, USN live). L'article ne s'appuie
  que sur des `[[liens]]` et un index manuel — bien plus fragile à l'échelle.
- **Économie de contexte mesurée** : `obsidian_triage`/`peek` bornés à
  <100/<80 tokens — supérieur à « lire index.md puis les pages ».
- **Orchestration réelle** : 22 agents, `dispatch_task`, worktrees isolés,
  registre de providers, bleubites. L'article sous-traite à des subagents ad hoc.
- **Bus temps réel inter-agents** : `comms.jsonl`, sqlite-node `cache` (TTL),
  ws-bridge :7477. L'article n'a qu'un seul agent.
- **Capture passive** : Beacon → distillation en digests — l'ingest de l'article
  est manuel/à la demande.
- **Boucle fermée** : `/reflect` → `memory_write` + ADR `knowledge/decisions/`
  → ré-indexé. L'article n'a pas de lifecycle (l'auteur le reconnaît).
- **Auto-ingestion non-LLM** : `hphe-rest` ingère toutes les 900 s sans tokens ;
  l'article consomme un tour de modèle par cron.
- **Mémoire bornée auto-élaguée** (quota 2500 chars) vs `MEMORY.md` Claude Code
  limité à 200 lignes — même concept, nôtre est explicite sur le quota.
- **Surveillance sécu** : `security-watch.cjs` (heuristiques secrets/XSS/exec)
  — l'article s'arrête aux deny rules.
- **Multi-hôte** : Hermes laptop via MCP-over-SSH, même serveur canonique.

## 4. Faisabilité des apports candidats dans notre stack

| Apport | Faisabilité | Commentaire |
|---|---|---|
| **`hphe-lint` déterministe** (frontmatter, liens `[[ ]]`, orphelins, TODO, stale) | **Élevée** | Python/Node stdlib, ~150 lignes. Lit via `fs_read_file`/`fs_list_directory` sur `F:\` (si dans `allowed_roots` — à vérifier) ou en local. Point d'entrée naturel : étape 5 de `vault-ingest` (déjà prévue mais sans binaire). |
| **Quote-check verbatim** | **Élevée** | Même script : regex `^>\s*"(.+?)"\s*[—–-]+\s*(\S+)` + normalisation espaces. Exige la convention de citation dans le protocole `vault-ingest` (à ajouter : chaque pépite cite sa source verbatim). |
| **Manifest sha256 (staleness)** | **Élevée** | `.agent/analysis/.brain/manifest.json` ou `hphe` : l'USN journal donne déjà CHANGED/DELETED pour l'index — le manifest n'est utile que pour lier note→source. Trivial. |
| **`hot.md` injecté au démarrage** | **Moyenne** | Devin supporte des hooks utilisateur, mais le format/événement SessionStart n'est pas documenté ici. Alternatives robustes : (a) règle `global_rules.md` déjà en place — étendre avec « lire `MEMORY.md` + `session last` au démarrage » (prompt, pas enforcement) ; (b) `hphe-taskwatch`/bootstrap injectant via `comms.jsonl` un rappel en début de session ; (c) si hook dispo, injecter `MEMORY.md` + `hphe-lint status`. |
| **Deny granulaire `raw/`** | **Moyenne** | `fs_*` n'offre que `allowed_roots` (allowlist). Options : (a) ACL NTFS read-only sur `F:\...\raw\` — mur dur, indépendant de l'agent, **recommandé** ; (b) sortir `raw/` des racines écriture. Audit #737 signale la même limite : deny ≠ script Python contournant — ACL reste la seule réponse dure. |
| **PostToolUse lint immédiat** | **Moyenne** | Dépend du support hooks Devin (à confirmer). Fallback : `pepites_lint` dans le protocole `vault-ingest` (déjà spécifié, à implémenter) + `security-watch` pourrait pousser un event dans `comms.jsonl` lu par l'agent. |
| **Versionner le vault (git)** | **Élevée** | `git init` sur `F:\Promgramation-teste` + commit post-ingest. Attention taille : `.gitignore` agressif requis (zips, node_modules, médias). |
| **Lint périodique (cron)** | **Élevée** | Tâche planifiée Windows type `hphe-taskwatch` appelant `hphe-lint --report-only` → écrit dans `comms.jsonl` ou kv `maintenance:last_report` (pattern existant de `memory-maintenance.ps1`). |

### Recommandations priorisées

1. **P0 — `hphe-lint` + quote-check** : c'est le seul vrai trou structurel. Le
   package `vault-pepites` référencé par la skill `vault-ingest` a disparu du
   disque — réécrire un linter unique (~150 lignes) couvrant taxonomie +
   liens + citations + staleness, rangé dans `.agent/scripts/` (hors portée
   d'écriture agent, cf. audit #737).
2. **P1 — convention de citation** dans `vault-ingest` : chaque pépite porte
   `> "verbatim" — [[source]]`. Débloque le quote-check à coût quasi nul.
3. **P1 — ACL read-only sur un dossier `raw/`** du vault : seule séparation
   enforcement réaliste dans notre stack (audit #737 : les deny rules seules
   ne suffisent pas).
4. **P2 — injection `hot` au démarrage** : formaliser `MEMORY.md` + rapport
   `hphe-lint status` dans le bootstrap de session (hook si supporté, sinon
   règle + taskwatch).
5. **P2 — git sur le vault** : diff/revert post-ingest, coût faible.

### Ce qui ne sert à rien de reprendre

- L'index `wiki/index.md` manuel et les `[[liens]]` comme seul moteur de
  recherche : notre Tantivy+usearch+KG fait mieux, et les liens restent un
  bonus de lint (orphelins), pas une nécessité de navigation.
- Le cron `claude -p` : `hphe-rest` ingère déjà sans tokens.
- « Un seul vault » : déjà la norme ici.

---

*Fin de l'analyse comparative — task #735.*
