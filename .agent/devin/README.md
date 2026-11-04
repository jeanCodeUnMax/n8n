# Couche d'intégration Devin pour Hephaistos2-Kit

Intégration **globale** de Devin CLI au système multi-agents (mémoire unifiée,
orchestrateur MCP, Beacon, bus ACP). Contrairement à la couche `.agent/hermes/`
qui s'injecte par workspace, la couche Devin s'installe **au niveau utilisateur**
car les hooks et skills Devin sont globaux par nature — ils s'appliquent alors à
toutes les sessions, quel que soit le client ACP (Desktop, Zed, JetBrains, Xcode).

## Architecture

```
 utilisateur
     │  (prompt / tâche)
     ▼
 ┌─────────┐   dispatch_task    ┌──────────────┐   command template   ┌─────────────┐
 │  Devin  │ ─────────────────► │ orchestrator │ ───────────────────► │ agent CLI   │
 │architect│                    │  MCP server  │   ({message} etc.)   │ (kilo,agy…) │
 └────┬────┘                    └──────────────┘                      └─────────────┘
      │ hooks globaux                                                     │
      │  ├─ SessionStart ──► awareness.mjs injecte tâches + beacon         │
      │  ├─ UserPromptSubmit ──► awareness.mjs injecte le diff             │ résultat
      │  └─ Stop ──► awareness.mjs bloque si tâche pending pour "devin"    ▼
      │                                                            update_task
      │ acp-dispatch.mjs (client ACP stdio)                                │
      └──────────────► hermes acp | kilo acp | gemini --acp | devin acp ◄──┘
```

## Composants

| Fichier | Rôle |
|---------|------|
| `scripts/mcp-call.mjs` | Client MCP stdio générique (lit `mcp_config.json` de Devin). Utilisable par n'importe quel hook/script shell : `node mcp-call.mjs orchestrator list_tasks '{}'` |
| `scripts/awareness.mjs` | Hook lifecycle : injecte `additionalContext` (tâches orchestrateur + activité Beacon) à `SessionStart` et `UserPromptSubmit`, bloque `Stop` si une tâche attend `devin` |
| `scripts/acp-dispatch.mjs` | Client ACP minimal : `node acp-dispatch.mjs --agent hermes --prompt "..."` envoie un `session/prompt` à n'importe quel agent ACP |
| `templates/hooks.json` | Bloc `hooks` à fusionner dans `~/.config/devin/config.json` |
| `install-devin-integration.ps1` | Installe scripts + fusionne hooks + copie les skills |

## Capacités ACP des CLI (audit 2026-09-24)

| CLI | Commande ACP | Statut |
|-----|--------------|--------|
| Devin | `devin acp` | ✅ natif |
| Hermès | `hermes acp` | ✅ natif (`--check` OK) |
| Kilo (KiloCode) | `kilo acp` | ✅ natif (v7.7.5) |
| Gemini | `gemini --acp` | ✅ natif (v0.56.0) |
| agy (Antigravity) | — | ❌ pas d'ACP ; fallback `agy --print --input-format stream-json` |
| OpenRouter | — | N/A : provider, pas un agent (couvert par `available_models`/`nim_*` hphe-mcp) |

## Installation

```powershell
pwsh -File .agent\devin\install-devin-integration.ps1 `
    -HermesSkillsDir "<USERPROFILE>\AppData\Local\hermes\skills"
```

Le script :
1. Copie `scripts/*.mjs` → `~/.config/devin/scripts/`
2. Fusionne les hooks awareness dans `~/.config/devin/config.json` (backup `.bak` avant)
3. Copie les skills Hermès → `%APPDATA%\devin\skills\`
4. Affiche la commande `register_agent` pour enregistrer `devin` dans l'orchestrateur

## Enregistrement orchestrateur (déjà effectué le 2026-09-24)

```json
register_agent("devin", "cli", {
  "skills": ["*"],
  "providers": ["devin-subscription"],
  "command": "devin -p \"{message}\" --respect-workspace-trust false"
})
```

`dispatch_task` exécute ce template → un Devin one-shot se réveille avec la
notification de tâche, lit le détail via le MCP `orchestrator` et la traite.

## État partagé

- **orchestrateur** (outils `*_task`/`*_agent` de `hphe-mcp`, `orchestrator.db`) : file de tâches
- **beacon** (`<HEPHAISTOS_ROOT>/Beacon/bin/beacon.exe mcp serve`) : journal d'activité cross-harness
- **agentmemory** (outils `memory_*` de `hphe-mcp`, racine `HPHE_MEMORY_ROOT`) : mémoire durable par projet
- État du hook : `~/.config/devin/state/awareness.json` (timestamp du dernier check)
