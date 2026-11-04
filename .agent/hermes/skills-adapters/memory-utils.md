# Adaptateur Mémoire — Hephaistos2-Kit Unified Memory System

> Mémoire unifiée via `Hephaistos-everything-search` (hphe-mcp) : KV agentmemory (JSON par projet sous `${HPHE_MEMORY_ROOT}/<projectId>/`) + Knowledge Graph (`memory_mcp.db` / `graph-memory.db`, lecture via `sqlite-node`).
>
> ⚠️ v1 (`mcp_Memory_*` : `create_entities`, `add_observations`, `create_relations`, `read_graph`…) est **absorbée** — ces outils n'existent plus. Utiliser `memory_*` (KV) et `sqlite-node` (KG).

---

## Mémoire — Opérations courantes

### 1. Rechercher le contexte existant (AVANT toute tâche)

```
Outil : memory_search (hphe-mcp)
```

**Procédure :**
1. Identifier les mots-clés de la tâche
2. `memory_search(query="mot-clé1 mot-clé2")`
3. Si le contexte existe → réutiliser sans re-explorer ; sinon → créer ce qui manque

**Complément KG (read-only) :** `sqlite-node` → alias `memory` (entités/observations/relations typées, `memory_mcp.db`) et `graph` (edges, `graph-memory.db`).

---

### 2. Enregistrer une décision (APRÈS toute décision importante)

```
Outil : memory_write (hphe-mcp)
```

**Procédure :**
1. Synthétiser la décision en une phrase claire
2. `memory_write(key="decision-<slug>", content="...", tags=["architecture","decision"])`
3. Décision structurelle → **aussi** un ADR fichier : `.agent/knowledge/decisions/NNN-titre.md` (double écriture : fichier auditable + KV cherchable ; le fichier est réindexé par auto-ingest)

**Exemple :**
```
memory_write(
  key="decision-auth-v2",
  content="JWT avec refresh tokens, expiration 15min/7jours, localStorage + httpOnly cookie",
  tags=["architecture", "security", "decision"]
)
```

---

### 3. Mettre à jour / corriger (supersede)

- `memory_update(key, content, tags)` : mise à jour d'une entrée existante.
- **Correction utilisateur = vérité absolue** : ne jamais supprimer l'ancienne version — préfixer son contenu `[SUPERSEDED YYYY-MM-DD] remplacé par <nouvelle> — raison` (le KV n'a pas de relations typées : la piste auditable vit dans le corps de l'entrée).

---

### 4. Lister / auditer

- `memory_list()` : inventaire des entrées du projet courant.
- `memory_stats()` : taille/compteurs.
- KG complet : `sqlite-node` requêtes SQL sur `memory`/`graph` (analyse, consolidation — lourd en tokens, préférer `memory_search` ciblé).

---

### 5. Supprimer

Pas d'outil de suppression KV côté agent — le nettoyage passe par `memory-maintenance.ps1` (au `start-workspace` : purge caches expirés, relations orphelines, WAL checkpoint, rapport dans `maintenance:last_report`). Pour invalider une entrée : supersede (§3).

---

## Procédures par contexte

### Début de session
```
1. memory_search(query="preferences")   → préférences utilisateur connues
2. memory_search(query="workspace projet") → workspaces/projets connus
3. memory_search(query="frequent")      → requêtes récurrentes
```

### Pendant une tâche
```
1. Étape importante → memory_write(key="task-<slug>-step-N", content=..., tags=["progress"])
2. Décision intermédiaire → memory_write(key="decision-<slug>", ..., tags=["decision"])
```

### Fin de session
```
1. Leçons → memory_write(key="lesson-<slug>", content=..., tags=["lesson","correction"])
2. ADR structurel → .agent/knowledge/decisions/NNN-titre.md
3. Intentions non réalisées → memory_write(key="intention-<slug>", ..., tags=["intention"])
```

---

## Tags recommandés

| Tag | Quand l'utiliser |
|-----|------------------|
| `architecture` | Décisions structurelles, choix d'implémentation |
| `security` | Sécurité, auth, secrets |
| `decision` | Décisions importantes (ADR) |
| `pattern` | Patterns d'implémentation récurrents |
| `preference` | Préférences utilisateur découvertes |
| `lesson` | Leçons apprises, corrections de bugs |
| `intention` | Travail identifié mais non fait |
| `project` / `workspace` | Métadonnées de projet/workspace |

**Règle :** tout tag personnalisé doit être documenté dans le contenu de l'entrée.

---

## Bonnes pratiques

1. **Toujours taguer** — sans tags, pas de recherche efficace.
2. **Descriptions précises** — « modifié » ne sert à rien.
3. **Mettre à jour plutôt que dupliquer** — `memory_update` sur l'existant.
4. **Noms cohérents** — `project-<slug>`, `decision-<slug>`, `lesson-<slug>`.
5. **KG = read-mostly** — les écritures KG passent par le pipeline d'ingestion (`mirror_kg` : 1 entité + 1 relation par document). Pour enrichir le KG : écrire dans `.agent/knowledge/` ou `.agent/memory/` — indexé au prochain ingest.
