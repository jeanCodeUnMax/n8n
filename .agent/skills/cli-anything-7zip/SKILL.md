---
name: cli-anything-7zip
description: >
  Command-line interface for 7-Zip — create, update, rename, delete, list, test, extract, convert, compare and hash archives through the real 7z backend, with a persistent working-set session for agent-driven 'zip these files' workflows. Activar cuando el usuario solicite tareas relacionadas con: 7zip, 7z, zip, zipper, dezipper, dézipper, archive, compresser, compression, extraire archive, cli-anything-7zip.
---

# cli-anything-7zip

Agent-native, stateful CLI for **7-Zip** (`7z.exe`). The real backend does all compression — this harness adds structured commands, `--json` output, a REPL, and a persistent **working-set session** (selected files + target archive + default options) so agents can zip "the documents selected in the IDE".

## Install

```bash
# hard dependency — the real binary
winget install 7zip.7zip        # Windows
sudo apt install p7zip-full     # Linux

pip install -e 7zip/agent-harness
cli-anything-7zip doctor        # probe backend
```

Backend resolution: `--exe` → `SEVENZIP_EXE` → `PATH` (`7z`/`7za`/`7zr`) → `%ProgramFiles%\7-Zip\7z.exe`.

## Usage

```bash
cli-anything-7zip                     # interactive REPL (default)
cli-anything-7zip --help
cli-anything-7zip --json <command>    # machine-readable output
cli-anything-7zip --dry-run <cmd>     # don't persist session changes
```

### Command groups

**Top level** — `extract`, `cat`, `hash`, `formats`, `version`, `doctor`, `benchmark`, `raw` (verbatim 7z pass-through)

**`session`** — `new`, `status`, `add`, `remove`, `clear`, `set`, `unset`, `use`, `list`, `undo`, `redo`, `save`, `path`

**`archive`** — `create`, `add`, `update`, `delete`, `rename`, `test`, `list`, `info`, `stats`, `compare`, `convert`

## Examples

### Zip selected documents (session workflow)

```bash
cli-anything-7zip session new --archive deliverables.zip
cli-anything-7zip session add report.pdf notes.md src/
cli-anything-7zip session set level 9
cli-anything-7zip archive create            # zips the whole selection
cli-anything-7zip archive test
```

### One-shot create with options

```bash
cli-anything-7zip archive create -a backup.7z -t 7z -mx9 -mhe -p s3cret docs/ secrets.txt
cli-anything-7zip archive create -a chunks.zip -v 10m bigfile.iso
cli-anything-7zip archive create -a setup.exe --sfx installer/
```

### Mutate inside an existing archive

```bash
cli-anything-7zip archive rename -a docs.zip draft.md final.md
cli-anything-7zip archive delete -a docs.zip "*.tmp" old/
cli-anything-7zip archive update -a docs.zip report.pdf   # freshen newer copy
```

### Inspect, extract, hash

```bash
cli-anything-7zip --json archive list -a docs.zip     # parsed entries
cli-anything-7zip --json archive stats -a docs.zip    # sizes, ratio
cli-anything-7zip --json archive compare -a a.zip -a b.zip
cli-anything-7zip extract docs.zip -o out/            # full paths
cli-anything-7zip extract docs.zip --flat -o flat/    # 7z e
cli-anything-7zip cat docs.zip readme.md              # member to stdout
cli-anything-7zip hash -m SHA256 file.iso dir/
cli-anything-7zip archive convert -a old.zip new.7z -t 7z
cli-anything-7zip raw -v1m a split.7z bigdir/         # escape hatch
```

## For AI Agents

- **Always pass `--json`** for parseable output; errors come back as `{"error": ..., "code": N, "code_name": ...}` on stdout with non-zero exit.
- **Session is file-backed** at `%USERPROFILE%\.cli-anything\sevenzip\sessions\current.json` (env: `SEVENZIP_SESSION`, `SEVENZIP_HOME`). One-shot mutations auto-save; `--dry-run` suppresses persistence. `session undo/redo` rolls the selection.
- **Directory structure**: inputs are rebased on their common ancestor so the archive keeps relative paths (same as 7zFM). Absolute inputs are fine.
- **Passwords**: `--password` or `SEVENZIP_PASSWORD` — never persisted, masked as `-p***` in logs. `-mhe/--encrypt-headers` hides file lists (7z only).
- **Writable formats** (`-t`): `7z zip tar gzip bzip2 xz wim`. Everything else in `formats` output is read-only.
- **Exit codes mirror 7z**: 0 ok, 1 warning (non-fatal, flagged in JSON), 2 fatal, 7 bad CLI, 8 OOM, 255 user break.
- **Introspect before mutating**: `doctor`, `archive info`, `archive list`.
- **`raw`** forwards unknown switches when the structured surface lacks them.
- **Via MCP** : `harness_run("7zip", ["archive","create","-a","x.zip","src/"], json_output=True)` sur le serveur `cli-anything`.

## Version

1.0.0 — 41/41 tests verts, harness `7zip/agent-harness` du repo CLI-Anything.
