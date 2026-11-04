---
name: "cli-anything-notes"
description: >-
  Command-line interface for Notepad++ notes — reads open tabs and volatile backups straight from disk (session.xml + backup/), classifies them (secret/json-cfg/code/log/doc) and sorts them into a vault or a secure quarantine dir. Designed for AI agents that harvest unsaved notes without touching the editor.
---

# cli-anything-notes

Agent-native Notepad++ notes harness. Notepad++ exposes no API — everything lives on disk:

- `%APPDATA%\Notepad++\session.xml` → open tabs (real file paths + unsaved `new N` tabs)
- `%APPDATA%\Notepad++\backup\` → periodic snapshots of unsaved tabs, named `<name>@<YYYY-MM-DD_HHMMSS>`

Every note gets a heuristic classification (priority order):
`secret` (API keys, tokens, passwords, private keys) → `json-cfg` (MCP/settings JSON) → `code` (shell/python/js snippets) → `log` (stack traces, command output) → `doc` (prose, lists). Triage **copies** notes — nothing is ever deleted — and `secret`-classed notes can be routed to a separate secure directory.

## Installation

This CLI is installed as part of the cli-anything-notes package:

```bash
pip install cli-anything-notes
# or, from the local source tree:
pip install -e "C:\Program Files\servers\cli-anything-notes"
```

**Prerequisites:**
- Python 3.10+
- No dependencies (stdlib only)
- Notepad++ installed — only needed by `open`; `tabs`/`backups`/`snapshot` work on disk data alone

## Usage

### Basic Commands

```bash
# Show help
cli-anything-notes --help

# List open tabs (files + volatile notes)
cli-anything-notes tabs

# Inventory unsaved backup notes
cli-anything-notes backups list

# Interactive session
cli-anything-notes repl

# JSON output for agent consumption
cli-anything-notes --json backups list
```

### REPL Mode

`cli-anything-notes repl` starts an interactive prompt (`notes> `) that accepts
any command line, one per line; `quit`/`exit` leaves the session. `--json` given
at launch applies to every command in the session.

## Command Groups

### Tabs

| Command | Description |
|---------|-------------|
| `tabs` | Open tabs from session.xml: name, path, `is_file`, backup path, lang, view |

### Backups

| Command | Description |
|---------|-------------|
| `backups list` | Inventory of volatile notes: name, saved_at, bytes, preview, class (`kind`) |
| `backups read --name N` | Full content of the first note whose name contains `N` |
| `backups tidy --dir D [--secret-dir S] [--dry-run]` | Classify each backup and **copy** it to `<dir>/<kind>/<name>.md` (with a small frontmatter header); `secret`-classed notes go to `<secret-dir>/secret/` when `--secret-dir` is given. **Writes by default** — pass `--dry-run` to preview the plan without acting |

### Snapshot

| Command | Description |
|---------|-------------|
| `snapshot --dir D` | Timestamped full archive (`snapshot-YYYY-MM-DD_HHMMSS/`) of the whole backup dir + session.xml |

### Open

| Command | Description |
|---------|-------------|
| `open --file F [--line N]` | Reopen a file in Notepad++ (`-n<N>` jumps to a line), fire-and-forget |

### Session

| Command | Description |
|---------|-------------|
| `repl` | Interactive line-mode session |
| `--version` | Print version |

## Examples

### Harvest volatile notes into a vault

```bash
# See what's open right now
cli-anything-notes tabs

# Inventory backups with their detected class
cli-anything-notes --json backups list

# Read one note
cli-anything-notes backups read --name "api-migration"

# Preview the triage plan — nothing is written
cli-anything-notes backups tidy --dir F:\vault\inbox --secret-dir F:\vault\coffre --dry-run

# Actually sort: secrets quarantined to the vault's coffre
cli-anything-notes backups tidy --dir F:\vault\inbox --secret-dir F:\vault\coffre
```

### Safety net before a cleanup

```bash
# Full timestamped archive first
cli-anything-notes snapshot --dir F:\vault\snapshots

# Then reopen a recovered note in the editor
cli-anything-notes open --file F:\vault\inbox\doc\my-note.md --line 12
```

## Output Formats

- **Human-readable** (default): lists print one item per line, dicts as `key: value` lines
- **Machine-readable** (`--json`): structured JSON
- Errors: `{"ok": false, "error": "..."}` on stdout with `--json`, `error: ...` on stderr otherwise; exit code 1

## Security

- `tidy` **copies** backups and never deletes the originals in `%APPDATA%\Notepad++\backup\`.
- Notes classified `secret` should land in a restricted directory — always pass `--secret-dir` when tidying into a shared/vaulted location.
- `snapshot` duplicates session.xml, which may contain paths of sensitive open files.

## For AI Agents

When using this CLI programmatically:

1. **Always use `--json`** for parseable output
2. **Check return codes** — 0 for success, 1 on errors (`--name`/`--dir` missing, no match, session.xml absent)
3. **Always run `tidy --dry-run` first** — without the flag the command writes `.md` files immediately
4. **Match `backups read --name` loosely** — it is a case-insensitive substring match on the backup name (the part before `@timestamp`)
5. **Run `snapshot` before any bulk tidy** for a full recovery point

## Version

0.1.0
