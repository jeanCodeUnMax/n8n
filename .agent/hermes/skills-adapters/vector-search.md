# Adaptateur Recherche Vectorielle — Hephaistos2-Kit

> Recherche via le serveur unifié `Hephaistos-everything-search` (hphe-mcp) : contenu BM25 (Tantivy), vecteurs hphe-vec (usearch HNSW 2048D, NIM), index NTFS ($MFT).
>
> ⚠️ v1 (Qdrant `mcp_qdrant_search`, Zvec `mcp_zvec_semantic_search`, pont REST `:8001`/`:8002`) est **archivée** — `_archive/agent-rag/`. Ne jamais appeler `qdrant.*` ni `zvec.*`.

---

## Routage automatique — Quel outil utiliser ?

| Besoin | Outil hphe-mcp | Index |
|--------|----------------|-------|
| Fichier par nom/chemin, n'importe où sur le disque | `everything_search` | NTFS $MFT (instantané) |
| Code, symbole, texte exact | `content_search` | `hphe-content` (BM25) |
| Sens/concept (requête en langage naturel) | `semantic_search` | `hphe-vec` (2048D) |
| Mixte exact + sémantique | `hybrid_search` | fusion des deux |
| Vecteur pré-calculé (appel brut) | `vec_search` | `hphe-vec` |
| Souvenirs/décisions (mémoire agent) | `memory_search` | KV agentmemory |

**Pas de dimension à gérer côté agent** : `content_search`, `semantic_search` et `hybrid_search` prennent du **texte brut** — l'embedding NIM 2048D (`nvidia/nemotron-3-embed-1b`) est fait en interne par le serveur. Seul `vec_search` exige un vecteur pré-calculé → le générer via `nim_embed` si nécessaire.

---

## Recherche de contenu du workspace

```
Outil : content_search
Params : query (texte), limit (défaut raisonnable), filters éventuels
```

**Exemple :**
```
content_search(query="authentification JWT middleware", limit=10)
→ extraits indexés du workspace actif, avec chemins + scores
```

## Recherche sémantique / hybride

```
semantic_search(query="comment est gérée l'authentification ?", limit=10)
hybrid_search(query="JWT refresh token rotation", limit=10)
```

- `semantic_search` : purement vectoriel (concepts proches, pas besoin des mots exacts).
- `hybrid_search` : fusion BM25 + vecteur — le meilleur défaut pour « trouve-moi où X est implémenté ».

## Localisation de fichiers (NTFS)

```
everything_search(query="orchestrator", limit=20)
everything_count(query="*.rs")
everything_index_stats()
```

L'index NTFS ($MFT lu par `hphe-indexd`, USN live) couvre **tout le disque**, pas seulement le workspace.

---

## Embeddings manuels (cas rare)

```
nim_embed(input="texte à encoder", input_type="query")   → vecteur 2048D
vec_search(vector=<2048D>, limit=10)                      → appel brut
vec_stats()                                              → santé de l'index
```

- `input_type: "query"` pour chercher, `"passage"` pour indexer.
- Clé : `NVIDIA_API_KEY` (env User) — jamais dans le code ni les `.env` distribués.

---

## Bonnes pratiques

1. **Texte brut d'abord** — `hybrid_search` couvre 90 % des besoins ; `vec_search` seulement pour du vectoriel manuel.
2. **`everything_search` pour les noms**, `content_search`/`hybrid_search` pour le contenu — ne pas confondre index fichiers et index contenu.
3. **Limiter les résultats** — `limit=10..20` ; plus = plus de tokens.
4. **Requêtes fréquentes** — les persister via `memory_write` (tag `preference`/`frequent-query`) plutôt que re-chercher.
5. **Recherche mémoire** — souvenirs/décisions passées → `memory_search`, pas l'index code.

---

## Dépannage

### Aucun résultat
1. L'index du workspace est-il à jour ? → relancer `ingest-workspace.ps1` (ou `hephaistos_update`).
2. `everything_search` trouve le fichier mais `content_search` non → contenu pas encore indexé.
3. Élargir la requête (moins de mots-clés, synonymes) ou passer de `content_search` à `semantic_search`.

### Résultats non pertinents
1. Passer de `semantic_search` à `hybrid_search`/`content_search` (ancrage lexical).
2. Réduire `limit`, préciser le contexte (chemin, langage) dans la requête.

### Embedding NIM indisponible
1. Vérifier `NVIDIA_API_KEY` (env User).
2. `semantic_search` échoue → fallback `content_search` (BM25, sans embedding) ou `sqlite-node` `memory`/`graph` (KG).
