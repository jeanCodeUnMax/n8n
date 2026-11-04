---
name: cli-anything-n8n
description: Piloter n8n via le harness installe cli-anything (workflows, webhooks, executions et tests). Use when managing, validating, testing, or running n8n automation workflows.
---

# cli-anything-n8n — piloter n8n via le harness installe

Exe : `cli-anything-n8n` (harness `n8n` du MCP cli-anything : `harness_run {harness:'n8n', args:[...]}`).
Config deja posee : base_url `http://127.0.0.1:5680` (le proxy injecte la cle API — pas besoin de cle cote agent).

Commandes utiles (`cli-anything-n8n <cmd>`) :
- `workflow list | get <id> | import <file.json> | create --json <wf> | update <id> | activate <id> | deactivate <id> | delete <id>`
- `workflow validate <id>`, `workflow test <id>` (tire le webhook), `workflow autofix <id>`
- `execution list --workflow <id> | get <id>` — verifier les runs
- `status`, `health`, `config test`

Regles n8n 2.x :
- `connections` : cles = NOM des noeuds (`"Webhook"`), jamais les ids.
- Activer un workflow rend son webhook live : `POST http://127.0.0.1:5680/webhook/<path>`.
- Pas de noeud ExecuteCommand (bloque) : pour executer une commande locale, HTTP Request vers `POST http://127.0.0.1:5680/x-run` `{command,args[]}` — whitelist cli-anything-*.

Format workflow : `nodes[] {parameters,id,name,type,typeVersion,position[,webhookId]}`, `connections {nom:{main:[[{node,type:'main',index:0}]]}}`, `settings{}`.
