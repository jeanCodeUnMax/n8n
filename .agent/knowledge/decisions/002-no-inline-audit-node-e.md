# ADR-002: Interdiction des audits `node -e` inline — faux positif Defender SuspExec

## Statut

ACCEPTED (2026-10-14)

## Contexte

Le 14/10/2026, Windows Defender a bloqué `node.exe -e "...execSync(grep)..."`
lancé par un agent pour auditer les appels `child_process` du workspace :
`Trojan:Win32/SuspExec.SE`. Détection **heuristique** (pas une signature) :
un one-liner `-e` qui énumère des fichiers et spawn des processus correspond
au profil SuspExec, surtout sans `windowsHide`. Le script était bénin — mais
son propre `execSync` n'avait pas `windowsHide`.

## Décision

1. **Jamais** de `node -e` / `powershell -c` inline contenant `child_process`,
   `Start-Process` ou des boucles de scan. Tout script d'audit vit dans
   `.agent/scripts/` comme fichier versionné.
2. Script canonique : `node .agent/scripts/audit-exec-hide.mjs [racine]` —
   pur Node (fs/path), zéro `child_process`, exit 1 si occurrences.
3. Tout `spawn`/`execFile`/`execFileSync`/`execSync`/`spawnSync` dans le code
   du kit doit passer `windowsHide: true` (vérifié sur 12 lignes de contexte).
4. Exemptions assumées : `explorer.exe` (app GUI, pas de console), `db.exec`/
   regex `.exec(` (pas des `child_process`).

## Sites corrigés le 14/10/2026

- `.agent/agent-bridge/devin-hub.js:48` — `execFileSync` → `windowsHide: true`
- `extensions/orchestrator-monitor/agent-bridge/devin-hub.js:48` — idem (copie)
- `.agent/agent-bridge/agy-hub.js:45` — `execSync(powershell…)` → `windowsHide: true`
- `extensions/orchestrator-monitor/agent-bridge/agy-hub.js:45` — idem (copie)
- `extension/src/mcpClient.js:238` — `spawn(python)` → `windowsHide: true`

Sites déjà conformes (windowsHide ou explorer.exe) : `extension.ts:667`,
`mcp-call.mjs:36`, `awareness.mjs:23`, `acp-dispatch.mjs:38`, `searchView.js:287`.

## Conséquences

- **Positives** : plus de console `cmd.exe`/`conhost` fugace à chaque spawn ;
  l'audit `audit-exec-hide.mjs` est rejouable en CI sans risque Defender.
- **Négatives** : `agy-hub.js` continue d'énumérer `Win32_Process` via
  PowerShell (légitime — découverte du hub agy) ; c'est le pattern le plus
  susceptible de re-déclencher une heuristique EDR malgré `windowsHide`.
- **Vérification** : `node .agent/scripts/audit-exec-hide.mjs` doit retourner
  0 occurrence.

## Références

- Règle agents : `.agent/rules/global_rules.md` § « Ne JAMAIS auditer via
  node -e inline »
- Alerte : `Trojan:Win32/SuspExec.SE`, CmdLine `node.exe -e` (14/10/2026)
