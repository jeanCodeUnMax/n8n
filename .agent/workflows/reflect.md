---
description: Réflexion de fin de session/phase. Distille les apprentissages (dont les traces Beacon de tous les agents) dans la mémoire unifiée et la knowledge base. Ferme la boucle d'apprentissage.
---

# /reflect - Réflexion et Consolidation des Apprentissages

$ARGUMENTS

---

## Purpose

Ce workflow implémente les couches **Reflection** et **Intention** de l'architecture conscience (`.agent/consciousness/`). En fin de session ou après une phase majeure, il transforme l'expérience — y compris les traces des AUTRES agents capturées par Beacon — en connaissances durables, réutilisables par tous les agents.

**Déclencheurs** :
- `/reflect` explicite
- Fin de session ou de phase majeure (déploiement, migration, debug complexe résolu)
- Après correction de l'utilisateur sur un point structurel

---

## Behavior

### 1. COLLECTE — Ce qui s'est passé (toutes sources)

- `beacon.summarize_activity` / `beacon.search_activity` : digests des sessions récentes de TOUS les agents (Devin, agy, kilo, hermes, Claude…) — erreurs récurrentes, fichiers touchés, commandes
- `memory_search` avec `source=beacon` + tags de la session : ce que Beacon a déjà distillé
- **Rapport de maintenance** : `maintenance:last_report` dans `runtime-cache.db` (kv) — orphelins purgés, entités quasi-dupliquées à merger, collections vectorielles obsolètes → la base elle-même remonte ses problèmes
- La session courante : corrections de l'utilisateur, impasses, solutions trouvées

### 2. ANALYSE — Qu'a-t-on appris ?

Pour chaque apprentissage candidat :
- Est-ce un **pattern** (réutilisable) ou un **one-shot** (à ignorer) ?
- Erreur résolue → documenter la cause racine + le fix
- Correction utilisateur → c'est une règle, pas une exception
- Si plusieurs agents ont buté sur le même problème (digests Beacon) → priorité haute

### 2b. DÉTECTION DE CONTRADICTION — la correction sémantique

Avant d'écrire un nouvel apprentissage, vérifier s'il **contredit** une mémoire existante :

- `memory_search` sur le sujet → une observation existe qui dit le contraire ?
- Le rapport `maintenance:last_report` signale des quasi-doublons à merger ?
- Si oui → **ne pas supprimer**, **superseder** :
  1. Écrire la nouvelle version (`memory_write` / `memory_update`)
  2. Préfixer le contenu de l'ancienne entrée : `[SUPERSEDED YYYY-MM-DD] remplacé par <nouvelle> — raison : <pourquoi>` (le KV n'a pas de relations typées : la piste auditable vit dans le corps de l'entrée)
- Les entrées `[SUPERSEDED]` restent lisibles (piste auditable) mais tout agent qui en lit une DOIT ignorer son contenu et prendre la version courante.
- **Corrections utilisateur = signal de vérité absolu** : si l'utilisateur a corrigé l'agent, la mémoire contradictoire est superseded immédiatement.

### 3. PERSISTANCE — Double écriture obligatoire

| Destination | Quoi | Quand |
|---|---|---|
| **Mémoire unifiée** (`memory_write`, hphe-mcp) | Entrée `learning` / `pattern` + observations | TOUJOURS |
| **`.agent/knowledge/decisions/NNN-titre.md`** | ADR complet (Statut/Contexte/Décision/Conséquences) | Décision structurelle |
| **`.agent/knowledge/`** (autres dossiers) | Mise à jour doc existante devenue obsolète | Si écart constaté |
| **Intentions** | Entité `intention` : prochaine action identifiée mais non faite | Si travail restant |

Format ADR : suivre `knowledge/decisions/001-architecture-cascade.md` (numéro séquentiel, statut, date).

### 4. VÉRIFICATION DE FERMETURE

- L'ADR écrit dans `knowledge/` sera indexé au prochain `start-workspace` (auto-ingest indexe `.agent/knowledge/`)
- L'entité memory est recherchable immédiatement par tous les agents
- La session `/reflect` elle-même est capturée par Beacon → digest → réinjectée
- → **La boucle est fermée** : capture → distillation → réflexion → persistance → indexation → retrieval

---

## Anti-patterns

- ❌ Réfléchir sans consulter Beacon : tu n'apprends que de TA session, pas des autres agents
- ❌ Écrire un ADR sans `memory_write` : le fichier n'est cherchable qu'au prochain ingest
- ❌ Écrire dans memory sans ADR pour une décision structurelle : pas de piste auditable
- ❌ Session terminée sans `/reflect` après un debug complexe : l'apprentissage est perdu
