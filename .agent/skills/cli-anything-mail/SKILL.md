---
name: "cli-anything-mail"
description: >-
  Command-line interface for email — read, search, send and organize mail across Microsoft Graph (outlook.com/live/hotmail/M365), Gmail (REST API or IMAP/SMTP) and any standard IMAP/SMTP provider. Designed for AI agents that need structured mailbox access without a mail client.
---

# cli-anything-mail

Agent-native mail harness with three pluggable backends, selected per account by
the `type` field of `accounts.json`:

| Backend | `type` | Providers | Auth |
|---------|--------|-----------|------|
| Microsoft Graph | `graph` | outlook.com, live.fr, hotmail, M365 | OAuth2 device-code (msal public client) |
| IMAP/SMTP | `imap` | Gmail (app-password or XOAUTH2) and any standard provider | App-password, or OAuth2 refresh-token |
| Gmail REST | `gmail` | Gmail when IMAP is disabled | Same Google OAuth refresh token as `imap` |

Configuration lives in `%USERPROFILE%\.config\cli-anything-mail\` (override with
`MAIL_CONFIG_DIR`): `accounts.json` holds account metadata (client_id, hosts,
email — no secrets); OAuth token caches and app-passwords live in `tokens\`,
which is ACL'd owner-only on first creation.

## Installation

This CLI is installed as part of the cli-anything-mail package:

```bash
pip install cli-anything-mail
# or, from the local source tree:
pip install -e "C:\Program Files\servers\cli-anything-mail"
```

**Prerequisites:**
- Python 3.10+
- `requests>=2.31`, `msal>=1.28,<2` (declared dependencies)
- An `accounts.json` (copy `accounts.example.json`) with at least one account

## Usage

### Basic Commands

```bash
# Show help
cli-anything-mail --help

# List configured accounts + auth status
cli-anything-mail accounts

# List recent inbox messages
cli-anything-mail inbox --account live --top 10 --unread

# Interactive session
cli-anything-mail repl

# JSON output for agent consumption
cli-anything-mail --json accounts
```

### REPL Mode

`cli-anything-mail repl` starts an interactive prompt (`mail> `), one command
per line; `quit`/`exit` leaves. `--json` given at launch applies to every
command in the session.

## Command Groups

### Accounts & Auth

| Command | Description |
|---------|-------------|
| `accounts` | List configured accounts: name, backend type, email, credential-present flag |
| `auth ACCOUNT [--password P] [--code-url U]` | Authenticate an account — `graph`: device-code flow (prints URL + code); `imap`/`gmail`: store app-password (`--password`, or masked prompt) / run OAuth consent, `--code-url` pastes the post-consent redirect URL |

### Reading

| Command | Description |
|---------|-------------|
| `folders --account A` | List mail folders/labels |
| `inbox --account A [--folder inbox] [--top 20] [--unread]` | List recent messages (`--unread` filters to unread) |
| `read --account A --id ID [--folder INBOX]` | Read one message (folder flag ignored by `graph`) |
| `search --account A --query Q [--top 20] [--folder INBOX]` | Search messages |

### Sending

| Command | Description |
|---------|-------------|
| `send --account A --to x@y [--to z@w] --subject S [--body T \| --body-file F] [--cc ...] [--html]` | Send a message; `--to`/`--cc` are repeatable, `--html` sends the body as HTML |

### Organization

| Command | Description |
|---------|-------------|
| `move --account A --id ID --folder F [--source INBOX]` | Move a message to a folder (`--source` used by `imap`/`gmail`) |
| `delete --account A --id ID [--folder INBOX]` | Delete a message |
| `mark --account A --id ID [--unread] [--folder INBOX]` | Mark read (default) or unread (`--unread`) |

### Session

| Command | Description |
|---------|-------------|
| `repl` | Interactive line-mode session |
| `--version` | Print version |

## Examples

### Account setup

```bash
# See which accounts exist and whether credentials are stored
cli-anything-mail accounts

# Microsoft account: device-code flow (prints URL + user code)
cli-anything-mail auth live

# Gmail app-password
cli-anything-mail auth gmail --password "xxxx xxxx xxxx xxxx"

# Gmail OAuth: run auth, then paste the redirect URL back
cli-anything-mail auth gmail
cli-anything-mail auth gmail --code-url "http://localhost/...?code=..."
```

### Daily operations

```bash
# Unread inbox overview
cli-anything-mail --json inbox --account live --unread --top 20

# Read and search
cli-anything-mail read --account live --id "AAQkADE..."
cli-anything-mail search --account gmail --query "invoice" --top 10

# Send
cli-anything-mail send --account live --to a@b.fr --subject "Status" --body "All green"
cli-anything-mail send --account gmail --to a@b.fr --to c@d.fr --subject "Report" \
    --body-file report.html --html

# Organize
cli-anything-mail move --account live --id "AAQkADE..." --folder archive
cli-anything-mail mark --account live --id "AAQkADE..." --unread
cli-anything-mail delete --account live --id "AAQkADE..."
```

## Output Formats

- **Human-readable** (default): lists print one item per line (`k=v | k=v`), dicts as `key: value`
- **Machine-readable** (`--json`): structured JSON
- Errors: `{"ok": false, "error": "..."}` on stdout with `--json`, `error: ...` on stderr otherwise; exit code 1

## Security

- No secrets in `accounts.json` — only metadata (`client_id`, hosts, email). Use `password_ref: "env:VAR"` to point at environment variables.
- OAuth tokens and app-passwords are stored in `tokens\`, ACL'd owner-only.
- Sent mail appears server-side in Sent Items like any client send.

## For AI Agents

When using this CLI programmatically:

1. **Always use `--json`** for parseable output
2. **Check return codes** — 0 for success, 1 on errors (unknown account, missing credentials, backend failures)
3. **Run `accounts` first** — the `token` flag tells you whether each account is already authenticated
4. **Message `--id` values are backend-specific** — opaque Graph ids vs IMAP UIDs; always take them from a prior `inbox`/`search` call on the same account
5. **`auth` is interactive** — device-code and OAuth flows require a human to complete consent; never block on it unattended

## Version

0.1.0
