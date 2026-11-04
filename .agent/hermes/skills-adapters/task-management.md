# Adaptateur Gestion des tâches — Hephaistos2-Kit

> Les tâches vivent dans `orchestrator.db` (HPHE_ORCH_DB) et se manipulent **uniquement** via les outils orchestrateur de `hphe-mcp` — jamais de SQL direct.
>
> ⚠️ v1 : le pattern « entités `task-*` + relations dans le KG via `mcp_Memory_*` » est **mort** — les tâches ne sont plus des nœuds du graphe, ce sont des lignes de la base orchestrateur.

---

## Outils (hphe-mcp)

| Outil | Usage |
|-------|-------|
| `create_task` | Créer une tâche (sans notification — planification brute) |
| `dispatch_task` | Créer + assigner + **spawner le CLI** de l'agent (effet de bord réel) |
| `list_tasks` / `get_next_task` | Inventaire / prochaine tâche en attente |
| `update_task` | Statut (`pending`/`in_progress`/`completed`/`failed`) + résultat — **clôture obligatoire** |
| `delete_task` | Suppression |
| `suggest_agent` | Quel agent pour un `task_type` |
| `list_agents` / `register_agent` / `update_agent` | Roster |
| `list_worktrees` / `worktree_cleanup` | Isolation git des tâches parallèles |

### Planifier une tâche complexe

1. Décomposer en sous-tâches (blocs indépendants).
2. `create_task` pour les jalons / `dispatch_task` pour les sous-tâches exécutables (`task_type` ∈ `code|debug|review|docs|test|explore`).
3. Dépendances : ordonner via les dispatches successifs (une tâche terminée débloque la suivante) — l'orchestrateur ne gère pas de DAG automatique.

### Suivre l'avancement

- `list_tasks` → état global ; `get_next_task` → file.
- **L'agent exécutant DOIT appeler `update_task(id, status, result)`** — sinon la tâche reste pendante et le monitor ne la voit jamais finie.
- Livrable = fichier sur disque (jamais stdout seul) — vérifier `git status`/`git diff --stat` après dispatch.

### Récupérer le contexte d'une tâche passée

- `list_tasks` (historique) + `memory_search` (notes `task-<slug>` écrites par les agents).

---

## Bonnes pratiques

1. **`dispatch_task` > `create_task`** quand le travail doit démarrer : `create_task` ne réveille personne.
2. **`full_prompt` inline** : brief complet dans `context` (+ `files` scopés strictement) — l'agent CLI ne voit pas ta conversation.
3. **`suggest_agent` en cas de doute** ; `agent_name` pour forcer (`agy` par défaut, `kilo-nim1`, `ollama-cloud` — voir `.agent/REGISTRY.md`).
4. **Modèles** : `provider_prefs` (monitor) + `available_models` (probe live) — ne jamais coder un modèle en dur.
5. **Worktrees** pour les tâches parallèles touchant du code (`worktree: true`) ; nettoyer avec `worktree_cleanup`.
6. **Anti-récursion** : jamais d'instruction « appelle l'orchestrateur » ou « lance un CLI agent » dans le brief d'un agent.

---

## Template de dispatch

```
dispatch_task(
  title="task-<slug>: <verbe> <objet>",
  task_type="code|debug|review|docs|test|explore",
  context="<brief complet autonome : objectif, contraintes, livrable attendu>",
  files=["<chemins absolus scopés>"],
  workspace="<racine>",
  agent_name="<optionnel>"
)
```
