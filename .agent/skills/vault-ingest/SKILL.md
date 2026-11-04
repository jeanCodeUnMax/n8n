---
name: vault-ingest
title: "Skill: vault-ingest"
type: antigravity-skill
description: "Protocole d'ingestion et d'exploitation des pépites du vault cerveau-AI : taxonomie contrôlée, taggage inline des sections, linting, extraction en notes atomiques Pépites/, exploitation des 12 outils MCP vault-pepites et synergie Hephaistos."
scope: global
tags:
  - antigravity/skill
  - antigravity/skill/global
  - mcp
  - pepites
  - ingestion
updated: 2026-10-20
---

# Vault-ingest — Ingestion et exploitation des pépites du vault

> Protocole opérationnel pour l'ingestion, le taggage, le linting, l'extraction et l'exploitation des pépites de connaissances dans le coffre Obsidian.

## 1. Vocabulaire et Taxonomie Contrôlée

Consulter `00_Meta/taxonomy.md` avant de taguer :
- Les champs `langage`, `archetype` et `source_type` n'acceptent que les valeurs autorisées.
- Les champs `theme` sont en kebab-case singulier.
- Ne jamais inventer de termes hors référentiel.

## 2. Procédure d'Ingestion pas-à-pas

1. **Front-matter de source :**
   Appliquer `00_Meta/template_source.md` sur la note importée (`type: source`, `source_kind`, `source_url`, `ingested: YYYY-MM-DD`, `ingested_by: "<agent>"`).

2. **Scanning des pépites :**
   Identifier les sections à haute valeur : blocs de code fonctionnels, patterns, solutions à des blocages ardus, nuances d'API, règles d'architecture.

3. **Taggage inline :**
   Insérer la tâche de métadonnées sous la section :
   ```markdown
   - [ ] [pepite] <résumé direct en une phrase> (theme:: <theme>) (langage:: <lang|na>) (concept:: <notion>) (sujet:: <chapitre>) (archetype:: <arch>) (objectif:: <pourquoi>) (source:: [[<note-source>]]) #pepite
   ```
   - `theme` et `objectif` sont obligatoires.
   - Si bloc de code : `langage` correspond au langage du bloc.

4. **Indexation du document :**
   Remplir `langages:`, `concepts:`, `sujets:`, `archetypes:` dans le front-matter avec l'union des valeurs trouvées, passer `status: tagged`.

5. **Linting de conformité :**
   ```bash
   node packages/vault-pepites/pepite-ingest.mjs --lint="<chemin_note>"
   ```

6. **Extraction atomique :**
   ```bash
   node packages/vault-pepites/pepite-ingest.mjs --extract="<chemin_note>"
   ```
   Génère les fiches atomiques dans `Pépites/<theme>-<slug>.md` et annote les sections d'origine avec `(extrait:: YYYY-MM-DD)`.

## 3. Les 12 Outils MCP de `vault-pepites`

Le serveur stdio `pepites-mcp.mjs` fournit 12 outils utilisables directement par les agents :
- `pepites_search` : Recherche sémantique ciblée dans les sections candidates.
- `pepites_tag` : Modification ou ajout de champs inline `(clé:: valeur)`.
- `pepites_themes` : Vue d'ensemble des thèmes actifs.
- `pepites_snapshot` : Matérialisation de snapshots Markdown dans `Tags/`.
- `pepites_list` : Parcours paginé des fiches atomiques.
- `pepites_doc` : Extraction du corps textuel d'une fiche.
- `pepites_stats` : Indicateurs de complétude et métriques du coffre.
- `pepites_scan` : Détection automatique des candidats à l'extraction.
- `pepites_lint` : Validation des métadonnées selon `00_Meta/taxonomy.md`.
- `pepites_ingest` : Automatisation complète ingestion + découpage.
- `pepites_canvas` : Visualisation graphique des liens au format Canvas.
- `pepites_base` : Export tabulaire au format Obsidian Bases.

---
*Connexions du graphe :* [[00 Antigravity Hub]] | [[00 Index des Skills]] | [[04_Tools/vault-pepites]]
