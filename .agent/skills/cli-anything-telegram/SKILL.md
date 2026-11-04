---
name: "cli-anything-telegram"
description: >-
  Command-line interface for Telegram — post, moderate, pin, poll and manage forum topics over the Bot API, extended by an MTProto/Telethon user session for full history, deep search, member listing and send-as-user. Designed for AI agents managing a channel/group with per-chat policy rules.
---

# cli-anything-telegram

Agent-native harness for a Telegram channel/group. Two complementary backends:

- **Bot API** (`bot.py`): post, comment, edit, delete, pin, polls, file upload, forum-topic lifecycle, live updates — everything the bot can do.
- **MTProto / Telethon** (`mtproto.py`): a *user* session that sees what the Bot API cannot — real forum-topic enumeration, full group history, deep search, member list, and sending under your own identity (`--as-user`).

The Bot API cannot read arbitrary channel history — every `updates`/`read` call
archives seen messages into a local `cache.jsonl`, which powers `read` and
plain `search`. Use `history` / `search --deep` (MTProto) for the full record.

## Installation

This CLI is installed as part of the cli-anything-telegram package:

```bash
pip install cli-anything-telegram
# or, from the local source tree:
pip install -e "C:\Program Files\servers\cli-anything-telegram"
```

**Prerequisites:**
- Python 3.10+
- `requests>=2.31`, `telethon>=1.36` (declared dependencies)
- Bot credentials: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars, or
  `%USERPROFILE%\.config\cli-anything-telegram\config.json` (`{"token","chat_id"}`)
- MTProto features additionally require `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
  and a Telethon session at `~/.config/cli-anything-telegram/cli-agent.session`
  (override path with `TELEGRAM_SESSION`)

## Usage

### Basic Commands

```bash
# Show help
cli-anything-telegram --help

# Who am I / where am I posting
cli-anything-telegram me
cli-anything-telegram chat

# Post to the default chat
cli-anything-telegram send --text "Report ready"

# Interactive session
cli-anything-telegram repl

# JSON output + alternate named chat
cli-anything-telegram --json --chat canal read
```

### REPL Mode

`cli-anything-telegram repl` starts an interactive prompt (`tg> `), one command
per line; `quit`/`exit` leaves. Per-chat policy rules are enforced inside the
REPL too.

## Command Groups

### Info

| Command | Description |
|---------|-------------|
| `me` | Bot identity (`getMe`) |
| `chat` | Chat info + member count |
| `admins` | Chat administrators |
| `stats` | Title, type, members, description, `is_forum`, linked chat |
| `members [--limit 50]` | Visible member list — **MTProto** |

### Posting & Moderation (Bot API)

| Command | Description |
|---------|-------------|
| `send --text T [--topic ID] [--reply ID] [--html\|--markdown] [--as-user]` | Send a message; `--topic` targets a forum thread, `--as-user` sends via MTProto under your identity |
| `comment --id MSG --text T` | Reply to a message (comment thread) |
| `edit --id MSG --text T` | Edit a bot message |
| `delete --id MSG --yes` | Delete a message — **`--yes` required** |
| `pin --id MSG [--notify]` | Pin a message (`--notify` alerts members) |
| `unpin [--id MSG]` | Unpin a message |
| `send-file --path F [--caption C] [--kind photo\|document\|video\|audio] [--topic ID]` | Upload a file (multipart) |
| `poll --question Q --options A B C [...] [--topic ID] [--public]` | Send a poll (anonymous by default; `--public` for non-anonymous) |

### Reading

| Command | Description |
|---------|-------------|
| `updates [--limit 50] [--wait S]` | Fetch unread updates (persistent offset, long-poll `--wait` seconds); archives to cache |
| `read [--limit 20] [--topic ID]` | Read messages from the local cache |
| `history [--limit 20] [--topic ID]` | Recent messages of the group or a topic — **MTProto**, full history |
| `search --query Q [--limit 30] [--topic ID] [--deep]` | Search the local cache; `--deep` searches the entire group history — **MTProto** |

### Forum Topics

| Command | Description |
|---------|-------------|
| `topics list` | Real forum enumeration via MTProto; falls back to known/cached topics (Bot API) |
| `topics create --name N` | Create a forum topic |
| `topics rename --id ID --name N` | Rename a topic |
| `topics close --id ID` / `topics reopen --id ID` | Close / reopen a topic |
| `topics delete --id ID --yes` | Delete a topic — **`--yes` required** |
| `topics clear --id ID --yes` | Delete all cached messages of a topic — **`--yes` required** (Bot API can't list topic messages, only cached ones are purged) |
| `topics unpin --id ID` | Unpin all messages in a topic |

### Session

| Command | Description |
|---------|-------------|
| `repl` | Interactive line-mode session |
| `--version` | Print version |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output |
| `--chat NAME` | Named chat from `config.json` (`chats` map) or a numeric chat id |

## Multi-Chat Policy

`~/.config/cli-anything-telegram/config.json` maps chat names to ids and applies
per-chat rules:

```json
{
  "chats": { "caverne": -100…(private forum), "canal": -100…(public channel) },
  "default_chat": "caverne",
  "rules": {
    "caverne": { "mode": "prive-forum", "allow": ["*"] },
    "canal":   { "mode": "public-diffusion",
                 "allow": ["me","chat","stats","updates","read","history","search",
                           "send","send-file","poll","edit","delete","pin","unpin"],
                 "deny":  ["topics","members","admins","comment"] }
  }
}
```

- `--chat <name>` selects the target; chats without a `rules` entry are unrestricted.
- A denied command returns `{"ok": false, "error": "'cmd' refuse sur '<chat>' (<mode>)"}` and exits 1.
- Typical policy: the **private forum** is fully open; the **public broadcast channel** is restricted to content commands (no member/admin enumeration, no topic management).

## Examples

```bash
# Real forum topic list (MTProto)
cli-anything-telegram topics list

# Post as the bot inside topic 1492
cli-anything-telegram send --text "Report ready" --topic 1492

# Post under YOUR identity (MTProto user session)
cli-anything-telegram send --text "seen" --topic 1492 --as-user

# Deep-search the whole history
cli-anything-telegram search --query "NIM" --deep

# Last 10 messages of a specific topic
cli-anything-telegram history --topic 794 --limit 10

# Upload a file to the public channel (respects rules)
cli-anything-telegram --chat canal send-file --path report.pdf --caption "weekly"

# Moderation (destructive ops need --yes)
cli-anything-telegram delete --id 421 --yes
cli-anything-telegram topics rename --id 169 --name "Music"
```

## Output Formats

- **Human-readable** (default): lists print one item per line, dicts as `key: value`
- **Machine-readable** (`--json`): structured JSON
- Errors: `{"ok": false, "error": "..."}` on stdout with `--json`, `error: ...` on stderr otherwise; exit code 1

## Security

- Secrets live in env vars or `~/.config/cli-anything-telegram/config.json` — the config dir is ACL'd owner-only (icacls on Windows, 0700 elsewhere), as are `state.json`/`cache.jsonl`/`topics.json`.
- Destructive actions (`delete`, `topics delete`, `topics clear`) require `--yes`.
- `--as-user` sends under the real user account — visible under your name, not the bot's.
- Per-chat `rules` guard public channels against content leakage; they are also enforced in `repl`.

## For AI Agents

When using this CLI programmatically:

1. **Always use `--json`** for parseable output
2. **Check return codes** — 0 for success, 1 on errors including policy denials (`check_allowed` runs before every command)
3. **Prefer `history`/`search --deep` over `read`/`search`** when the cache may be cold — cache only contains messages seen since first `updates`
4. **Pass `--topic`** whenever targeting a forum — messages without it land in General
5. **Never drop `--yes`** on destructive commands — the CLI refuses without it, which is your confirmation gate
6. **Respect `rules`** — if a command is denied on a `--chat`, do not retry; that chat's policy forbids it

## Version

0.1.0
