---
name: cli-anything-cerberos
description: CLI harness + ACP bridge pour le laptop Herald OS (chien de garde CerberOS) — status SSH, exec distant, délégation de tâches à Hermes (hermes -z) et provider ACP stdio enregistrable dans Devin. Utiliser pour piloter le laptop, vérifier ses services (blocky, watchdog, wayvnc) ou lui confier des tâches en langage naturel.
---

# CLI-Anything Cerberos (Herald OS)

Pont agent-natif vers le laptop **Herald OS** (`herald-slave` (alias `~/.ssh/config`),
user `hermes`). Ce host est le chien de garde du réseau : DNS bloqueur de
pubs (blocky), watchdog Freebox, VNC headless, Hermes v0.22+ installé.

## Quand l'utiliser

- Vérifier l'état du laptop (uptime, services, mémoire, disque) → `status`
- Exécuter une commande shell sur le laptop → `exec`
- **Déléguer une tâche à l'agent Hermes du laptop** → `ask "<prompt>"`
  (il exécute localement : systemctl, journalctl, podman, audits…)
- Servir de provider ACP dans Devin → `acp` (spawn stdio bridge)

## Commandes

```bash
cli-anything-cerberos ping                      # reachability + hermes --version
cli-anything-cerberos status --json             # services surveillés + uptime
cli-anything-cerberos exec "systemctl status blocky" --json
cli-anything-cerberos ask "audite les timers systemd et rapporte" \
    -m poolside/laguna-s-2.1:free --provider nous
cli-anything-cerberos acp                       # pont ACP (spawn par Devin)
cli-anything-cerberos                           # REPL stateful
```

Tous les flags globaux : `--json`, `--host`, `--key`.

## Bonnes pratiques agent

- `ask` par défaut lance `hermes -z --yolo` : l'agent distant exécute
  sans confirmation — garder les prompts explicites et bornés.
- `exec` passe par `base64 | bash` : les quotes/accents traversent sans casse.
- `acp` doit rester silencieux sur stdout : tout stderr distant part dans
  `~/.cerberos-acp.log` — diagnostiquer un échec de handshake là.
- SSH est key-only (clé dédiée), : si `ping` échoue, vérifier
  l'alias `herald-slave` dans `~/.ssh/config`, pas les credentials.

## Enregistrement Devin ACP

Le provider `cerberos` est déclaré dans `%APPDATA%\devin\User\acp\registry.json`
avec `cmd = node.exe` + `bin/cerberos-acp.js` (même forme que nim/ollama).
Vérification : `connectorRegistryCache` dans `state.vscdb` doit lister
`cerberos` après redémarrage de Devin.
