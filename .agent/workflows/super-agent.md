---
description: Interroge les chats IA web (ChatGPT, Gemini, Grok, sites custom) ou Devin via le CLI super-agent et le Chrome-robot partagé.
---

# `/super-agent <cible|commande> [args]`

Pilote le CLI `super-agent` (pont CDP vers le Chrome-robot :9223). Arguments : `$ARGUMENTS`.

1. Résoudre le binaire : `./.venv/Scripts/super-agent` si le workspace contient `pyproject.toml` avec `name = "super-agent-cli"`, sinon remonter les parents, sinon `super-agent` si le venv est activé, sinon la variable `SUPER_AGENT_CLI` (chemin du venv super-agent-cli de l'utilisateur).
2. Premier argument = cible de chat (`chatgpt`, `gemini`, `grok`, `arenaai`, `devin`, site custom) → `ask` ; sinon commande de gestion (`status`, `sites`, `robot`, `add`, `open`, `serve`, `devin`).
3. Le runbook complet est la skill `/super-agent` (`~/.antigravity/skills/super-agent/SKILL.md` en global, ou `.devin/skills/super-agent/` dans le projet) : mapping des commandes, timeouts 30-120 s, `--keep-chat`, `--json`, séquence de sécurité avant un `ask`.
4. Retourne la réponse brute de l'agent au user sans reformulation. `serve` toujours en background. Ne jamais tuer un `ask` en cours.
