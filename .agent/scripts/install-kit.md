# Revision des kits d'installation et configuration — Hephaistos 2.1

Date : 2026-10-19 · Tache #545 · Auteur : Cash (whip-principle)

## Couverture de l'architecture 2.1 par les kits

| Composant 2.1 | Chemin d'injection | Couvert |
|---|---|---|
| Gates Rust FR-01..FR-09 | Binaire `hphe-mcp.exe` canonique (`servers/extension/server/`) + migrations `ensure_schema()` additives auto au `with_db` | Oui |
| CLI `hphe-orch` | `hphe-orch.exe` deploye canonique ; workspace member `hphe/Cargo.toml` | Oui |
| nim-worker durci (#521) | `.agent/scripts/nim-worker.mjs` — propage par `sync-agent-layer.ps1` | Oui |
| Watchdog reactif | auto-start supervise par `orchestrator-monitor` 0.0.60 + scaffold `.agent/` via `project_init` (`.vscode/tasks.json` RETIRE en 2.1) | Oui |
| Regle rapport-dysfonctionnement | `.agent/rules/` (sync layer) + template embarque `hphe-kit/templates/` (project_init) | Oui |
| Dossier `Rapport de dysfonctionnement et correction/` | `project_init` + check `init-project.ps1` | Oui |
| Bridge ws :7477 + fallback ACP `state.vscdb` | `devin-hub.js` (sync layer), FR-10 | Oui |
| Persistances paires (FR-09) | `comms.js`/`binome.js` (sync layer) + table `pairs` auto | Oui |
| Extension orchestrator-monitor | VSIX 0.0.60 (`extensions/orchestrator-monitor/`), installe via `install-extension-hub.ps1 --force` | Oui |
| Extension hephaistos-kit-search | VSIX 1.0.5+ (`extensions/search-ext/`), installation sur validation Boss uniquement | Oui |

## Defauts corriges dans cette revision

1. **Fuite d'etat runtime dans `sync-agent-layer.ps1`** : `comms.jsonl`, `ws-bridge.token`, `watch-state.json`, `binome-manifest.json`, `reactive-orchestrator-watchdog.jsonl`, repertoires `queue/` et `deliverables/` etaient copies dans les workspaces cibles (donnees runtime + artefacts d'autres projets). Ajoutes aux SkipFiles/SkipDirs.
2. **Versions attendues perimees** : `install-extension-hub.ps1` et `init-project.ps1` exigeaient `orchestrator-monitor >= 0.0.58` — mises a jour vers `0.0.60` (auto-start watchdog, status bar, fallback agyHub process).
3. **`init-project.ps1` aveugle a la couche 2.1** : aucune verification du watchdog, de la regle rapports ni du dossier dedie — bloc de verification ajoute (OK/WARN avec rappel `hphe-mcp --tool project_init`).
4. **`project_init` limite a la memoire** : etendu (#533) pour scaffold idempotent du workspace complet (watchdog, regle, dossier rapports) — templates embarques dans `hphe-kit/templates/` donc fonctionnels hors repo source.
5. **`.vscode/` retire de l'injection (2.1)** : le watchdog demarre via l'auto-start `orchestrator-monitor` (plus besoin de tache `folderOpen`) ; `project_init` ne cree plus `.vscode/tasks.json`, `sync-agent-layer.ps1` ne copie plus `.vscode/` — la boucle d'ingestion vit dans `hphe-rest` (:8792), le bridge dans l'extension.

## Hors perimetre des kits (par design)

- `orchestrator.db` canonique : `HPHE_ORCH_DB` / `servers/hephaistos2-kit/data/` — jamais copiee, migrations additives idempotentes.
- Secrets : `.env`, `*.token`, `comms.jsonl`, `logs/` exclus du sync ET du git.
- VSIX : packages conserves non installes jusqu'a validation (regle Boss).

## Points de vigilance connus

- Process `hphe-mcp.exe` stale apres deploy : les nouvelles gates n'agissent qu'au recyclage des sessions MCP (rapport 05).
- `hphe-orch` requiert `HPHE_ORCH_DB` si la DB n'est pas au chemin canonique.
- Watchdog : `pwsh` requis dans le PATH (fallback `PWSH_PATH` cote extension).
