# ADR-003: Localisation de la source de vérité du kit

## Statut

ACCEPTED — 2026-10-14

## Décision

La source de vérité active du starter kit est **la racine du clone `hephaistos2-kit`** (v2) — `<KIT_ROOT>`, auto-détectée par `install.ps1`/`$PSScriptRoot`, emplacement libre sur la machine de l'utilisateur.

- Toute correction des scripts `.agent/` (ingest-workspace.ps1, start-workspace.ps1, auto-ingest.ps1, etc.) se fait **dans ce répertoire**, puis se propage aux projets injectés via `.agent/scripts/sync-agent-layer.ps1`.
- Le kit v1 (`Hephaistos-Kit`, arbre sans sous-modules) est **obsolète** — ne plus y écrire.
- `<INSTALL_ROOT>` = **runtime/install** (binaires hphe-mcp.exe, hphe-rest.exe, hphe-indexd.exe, `data/content-index`, `ingest-roots.txt`) — pas la source des scripts `.agent/`. Défaut : `%ProgramFiles%\servers\hephaistos2-kit`, surcharge `-InstallRoot`/`HPHE_INSTALL`.

## Contexte

Trois emplacements portant des noms proches coexistent et se confondent facilement :

| Emplacement | Rôle |
|---|---|
| `<KIT_ROOT>` (clone) | Source de vérité `.agent/` (v2) |
| `<INSTALL_ROOT>` | Install runtime (binaires + index Tantivy + état) |
| kit v1 (chemin libre) | DEPRECATED |

Un patch appliqué au mauvais endroit est soit ignoré (v1 morte), soit non propagé (runtime ≠ source).
