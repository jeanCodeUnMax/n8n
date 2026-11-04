---
name: "cli-anything-edge"
description: >-
  Command-line interface for Microsoft Edge — live tab control over CDP, full headless browsing on a sandbox profile, plus favorites, history, sessions, workspaces and internal msedge.exe tooling. Designed for AI agents and power users who need to drive Edge without the GUI.
---

# cli-anything-edge

Agent-native harness for Microsoft Edge. Two channels:

- **CDP** (`ws://localhost:9222`): live tabs — list/close/suspend/activate/navigate/eval/open. Requires Edge launched with `--remote-debugging-port` (see `launch`).
- **Headless**: dedicated sandbox profile (`%LOCALAPPDATA%\Temp\edge-rea-profile`) with full CDP — DOM, JS eval, screenshots, PDF, MHTML, cookies — never touching the real profile.
- **On-disk profile** (`%LOCALAPPDATA%\Microsoft\Edge\User Data`): favorites, history, sessions, workspaces — readable while Edge is running.

## Installation

This CLI is installed as part of the cli-anything-edge package:

```bash
pip install cli-anything-edge
# or, from the local source tree:
pip install -e "C:\Program Files\servers\cli-anything-edge"
```

**Prerequisites:**
- Python 3.10+
- `requests` and `websocket-client` (declared dependencies)
- Microsoft Edge installed (`msedge.exe` under `C:\Program Files (x86)\Microsoft\Edge\Application\` or `C:\Program Files\Microsoft\Edge\Application\`)

## Usage

### Basic Commands

```bash
# Show help
cli-anything-edge --help

# Check CDP status, profile dir and msedge.exe location
cli-anything-edge status

# (Re)launch Edge with the CDP debug port enabled
cli-anything-edge launch

# JSON output for agent consumption
cli-anything-edge --json tabs list
```

> **Chromium 136+ restriction:** `--remote-debugging-port` is ignored when Edge
> uses its *default* user-data dir. `launch` works only because the harness
> passes `--remote-allow-origins=*` — if CDP stays inaccessible on your build,
> use the `headless` group instead: it runs on the sandbox profile, where the
> debug port is fully honored.

## Command Groups

### Status & Launch

| Command | Description |
|---------|-------------|
| `status` | Show CDP reachability, user-data dir, msedge.exe path |
| `launch [--port 9222] [--no-restore]` | Launch/relaunch Edge with `--remote-debugging-port` (+ `--restore-last-session` unless `--no-restore`) |

### Tabs (live CDP, requires `launch` first)

| Command | Description |
|---------|-------------|
| `tabs list` | List open page tabs (id, title, url, window) |
| `tabs close --id ID [--id ID2] [--domain D] [--dupes]` | Close tabs by id; `--domain` also closes every tab whose URL contains the domain, `--dupes` also closes duplicate-URL tabs |
| `tabs suspend --id ID [--id ID2] [--all-inactive]` | Freeze tabs via `Page.setWebLifecycleState` (frees RAM) |
| `tabs activate --id ID` | Bring a tab to the foreground |
| `tabs navigate --id ID --url URL` | Navigate an existing tab |
| `tabs eval --id ID --expr EXPR` | Evaluate a JS expression in a tab (`Runtime.evaluate`) |
| `tabs open --url URL` | Open a new tab |

### Favorites

| Command | Description |
|---------|-------------|
| `favorites list [--profile Default] [--filter Q]` | List bookmarks (bookmark bar, other, synced), optional substring filter |
| `favorites search QUERY [--profile Default]` | Search bookmarks by name/URL substring |

### History

| Command | Description |
|---------|-------------|
| `history search QUERY [--profile Default] [--limit 50]` | Search history (works on a temp copy of the History DB, safe while Edge runs) |

### Sessions

| Command | Description |
|---------|-------------|
| `sessions list [--profile Default]` | List session files (SNSS) with size and mtime |
| `sessions urls [--profile Default]` | Best-effort extraction of URLs stored in session files |

### Workspaces, Profiles, Switches

| Command | Description |
|---------|-------------|
| `workspaces` | Edge workspaces (read from Local State) |
| `profiles` | List profile dirs (Default / Profile N) with display names |
| `switches` | String-scan of msedge.exe: hidden `--flags` and `edge://`/`chrome://` pages |

### Headless (sandbox profile, full CDP)

Runs Edge `--headless` on `%LOCALAPPDATA%\Temp\edge-rea-profile`. Completely isolated from the real profile; reuses a live scratch instance when present.

| Command | Description |
|---------|-------------|
| `headless dom URL [--timeout 30]` | Full `outerHTML` of a page after load |
| `headless eval URL EXPR [--timeout 30]` | Evaluate JS in the page (awaitPromise enabled) |
| `headless shot URL --out FILE [--width 1280] [--height 800] [--full]` | PNG screenshot (`--full` captures beyond viewport) |
| `headless pdf URL --out FILE [--landscape]` | Print page to PDF (background graphics on) |
| `headless mhtml URL --out FILE` | Save page as MHTML archive |
| `headless cookies URL` | Cookies of the page after load (`Network.getCookies`) |
| `headless kill` | Kill zombie headless processes bound to the sandbox profile |

### Tool (internal msedge.exe switches)

| Command | Description |
|---------|-------------|
| `tool pack-extension DIR [--key PEM]` | Build `<dir>.crx` from an extension folder (`--pack-extension`; generates `<dir>.pem` if no key given) |
| `tool run [ARGS...] [--real-profile]` | Passthrough to msedge.exe on the sandbox profile; defaults to `--version` |
| `tool update-check` | Run `--trigger-external-update-check` |
| `tool import-passwords CSV [--real-profile]` | Run `--import-passwords=<csv>` (experimental) |
| `tool install-webapp URL` | Run `--install-webapp=<url>` (experimental) |
| `tool launch-preset kiosk\|app\|incognito\|silent [URL]` | Convenience launches on the sandbox profile |

### Ext (extension bridge on the REAL profile)

Requires the `CLI-Anything Edge Bridge` extension loaded unpacked from
`<install>\extension` (fixed id `ogaogecdmjapebebnohlhfajgfjajllh`) and the
registered native host `com.devin.edge_bridge`. Works while Edge is running —
the ONLY channel that can create real colored tab groups and read page content.

| Command | Description |
|---------|-------------|
| `ext ping` | Check the bridge is alive (extension connected) |
| `ext tabs` | List every tab of the real profile (id, window, title, url, pinned, groupId) |
| `ext groups` | List existing tab groups |
| `ext find Q [--content]` | Search titles+URLs; `--content` also scans page innerText |
| `ext group --ids N.. --name X --color blue` | Create a named colored group from tab ids |
| `ext group-auto [--rules FILE]` | Auto-sort tabs into Videos/Guides/Tutos/Actus/Social/Dev/Achats/Mail per window |
| `ext ungroup` | Remove all grouping |
| `ext close --ids N.. \| --domain D` | Close tabs by id or domain match |
| `ext dedupe` | Close duplicate-URL tabs (keeps first) |
| `ext history Q [--max N]` | Search real browsing history |
| `ext bookmarks Q` | Search real bookmarks |

## Examples

### Live tab management

```bash
# Relaunch Edge with CDP, then list tabs
cli-anything-edge launch
cli-anything-edge --json tabs list

# Close every tab on a domain + duplicates
cli-anything-edge tabs close --id ABCDEF1234 --domain twitter.com --dupes

# Run JS in a live tab
cli-anything-edge tabs eval --id ABCDEF1234 --expr "document.title"
```

### Headless capture

```bash
# Full DOM and a screenshot of a page — zero impact on the real profile
cli-anything-edge headless dom https://example.com
cli-anything-edge headless shot https://example.com --out page.png --full
cli-anything-edge headless pdf https://example.com --out page.pdf
cli-anything-edge headless mhtml https://example.com --out page.mhtml
```

### Profile data

```bash
cli-anything-edge favorites list --filter github
cli-anything-edge history search "docs.python" --limit 20
cli-anything-edge sessions urls
cli-anything-edge switches
```

### Internal tools

```bash
# Pack an unpacked extension into .crx
cli-anything-edge tool pack-extension F:\exts\my-ext --key F:\keys\my.pem

# Kiosk window on the sandbox profile
cli-anything-edge tool launch-preset kiosk https://dashboard.local

# Raw passthrough (sandboxed)
cli-anything-edge tool run --show-paint-rects about:blank
```

## Output Formats

All commands accept `--json` for structured output. Without it, lists print one
item per line and dicts print as-is. On `headless`/`tool` failure the CLI prints
`{"ok": false, "error": "..."}` and returns exit code 1.

## Security

- **`--real-profile` is dangerous.** `tool run` and `tool import-passwords`
  normally inject `--user-data-dir=%LOCALAPPDATA%\Temp\edge-rea-profile`.
  With `--real-profile` no user-data-dir is injected — the command touches your
  **real Edge profile**. Use with extreme caution.
- `tabs` commands exit non-zero with `CDP inaccessible — lance d'abord : cli-anything-edge launch` when no debug port is reachable.
- `headless kill` only targets processes whose command line contains `edge-rea-profile` — the real browser is never killed.

## For AI Agents

When using this CLI programmatically:

1. **Always use `--json`** for parseable output
2. **Check return codes** — 0 for success, 1 on `headless`/`tool` errors and when CDP is unreachable
3. **Parse stderr** for the `CDP inaccessible` message on `tabs` failures
4. **Prefer `headless` over `launch`+`tabs`** for one-shot scraping/capture — it needs no live browser and never touches the real profile
5. **Never pass `--real-profile`** unless the task explicitly requires modifying the real Edge profile

## Version

0.1.0
