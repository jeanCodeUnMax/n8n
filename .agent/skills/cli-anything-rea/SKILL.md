---
name: "cli-anything-rea"
description: >-
  Command-line interface for reverse engineering — engine-free static scan (strings, hidden flags/URLs, PE headers) plus a wrapper around the `rea` CLI (Ghidra 12.1.4) for analyze/decompile/search. Designed for AI agents that need binary triage with clean JSON errors.
---

# cli-anything-rea

Agent-native reverse-engineering harness. Two layers:

- **Engine-free static scan** — strings (ASCII + UTF-16LE), hidden command/flag/URL extraction, PE headers, Edge binary inventory. Works on any file, no disassembler needed.
- **`rea` wrapper** — passes through to the `rea` CLI for real analysis (Ghidra-backed): `analyze`, `function`, `decompile`, `search`, `doctor`, `capabilities`, plus a raw `run` passthrough.

The harness auto-injects `GHIDRA_INSTALL_DIR` and `JAVA_HOME` into `rea` calls when absent (defaults: `C:\Program Files\servers\ghidra_12.1.4_PUBLIC`, `C:\Program Files\servers\jdk-21`) and prepends the JDK `bin` to `PATH`.

## Installation

This CLI is installed as part of the cli-anything-rea package:

```bash
pip install cli-anything-rea
# or, from the local source tree:
pip install -e "C:\Program Files\servers\cli-anything-rea"
```

**Prerequisites:**
- Python 3.10+
- `pefile` (declared dependency — required by `pe`)
- `rea` CLI in `PATH` (only for `run`/`commands`/`doctor`/`capabilities`/`analyze`/`function`/`decompile`/`search`)
- Ghidra + JDK for engine-backed commands (auto-configured if installed at the default locations above)

## Usage

### Basic Commands

```bash
# Show help
cli-anything-rea --help

# Engine-free triage of a binary
cli-anything-rea scan C:\Windows\System32\kernel32.dll
cli-anything-rea strings mytool.exe --minlen 10

# Engine-backed analysis (requires rea + Ghidra)
cli-anything-rea analyze target.exe
cli-anything-rea decompile target.exe 0x140001000
```

## Command Groups

### Engine-free static scan

| Command | Description |
|---------|-------------|
| `strings FILE [--minlen 8] [--limit 300]` | Extract ASCII + UTF-16LE strings with counts |
| `scan FILE` | Hidden commands/flags/URLs/version-strings of a binary |
| `pe FILE` | PE header: machine, sections (name/vsize/entropy), imported DLLs+functions, exports |
| `edge-scan` | Inventory of Edge binaries (Application dir + versioned dir) with per-binary hidden flags/commands |

### `rea` wrapper (engine required for native analysis)

| Command | Description |
|---------|-------------|
| `run [ARGS...]` | Passthrough to `rea` (defaults to `--help`) |
| `commands` | List `rea` subcommands (parsed from `rea --help`) |
| `doctor` | Run `rea doctor --json` (environment health check, timeout 600s) |
| `capabilities` | Run `rea capabilities --json` (available engines/features) |
| `analyze FILE [EXTRA...]` | `rea analyze FILE --format json` + extra args (timeout 1800s) |
| `function FILE ADDRESS [EXTRA...]` | `rea function FILE <addr\|name> --format json` |
| `decompile FILE ADDRESS [EXTRA...]` | `rea decompile FILE <addr\|name> --format json` |
| `search FILE PATTERN [--kind strings\|procedures] [--regex]` | `rea search FILE PATTERN --format json`; `--regex` switches to `--mode regex` |

## Examples

### Triage without any engine

```bash
# What's hidden in a binary?
cli-anything-rea scan msedge.exe
# -> {"flags": ["--pack-extension", ...], "urls": [...], "commands": [...], "version_strings": [...]}

# PE structure
cli-anything-rea pe target.dll

# All Edge binaries + their hidden switches
cli-anything-rea edge-scan
```

### Engine-backed analysis

```bash
# Check the environment first
cli-anything-rea doctor
cli-anything-rea capabilities

# Full analysis, function dump, decompile
cli-anything-rea analyze target.exe
cli-anything-rea function target.exe main
cli-anything-rea decompile target.exe 0x140001234

# Search procedures by regex
cli-anything-rea search target.exe "crypto.*" --kind procedures --regex

# Raw passthrough for anything else rea supports
cli-anything-rea run analyze target.exe --deep
```

## Output Formats

Structured results are printed as JSON (dicts/lists are always serialized;
`--json` is accepted globally for consistency). `rea` subprocess output is
parsed as JSON when possible, otherwise wrapped as
`{"ok": bool, "returncode": N, "data": {"stdout": ..., "stderr": ...}}`.

On error the CLI prints `{"ok": false, "error": "..."}` and exits with code 1
(missing file, `pefile` absent, `rea` not in PATH, subprocess timeout).

## For AI Agents

When using this CLI programmatically:

1. **Always use `--json`** — output is already JSON-shaped, but the flag is harmless and keeps call sites uniform
2. **Check return codes** — 0 for success, 1 for clean JSON errors
3. **Start with `scan`/`strings`/`pe`** — they never need Ghidra and are instant; reserve `analyze`/`decompile` for confirmed targets (up to 30 min timeout)
4. **Run `doctor` once** before relying on engine-backed commands to verify `rea`, Ghidra and the JDK are wired up
5. **Inspect the `ok` field** inside `rea` passthrough results — exit 0 still wraps `rea`'s own returncode

## Version

0.1.0
