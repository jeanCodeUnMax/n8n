# ADR-004: `/jointes <agent>` comme entrée sûre du binôme Devin–ACP/CLI

## Statut

ACCEPTED — 2026-10-15

## Contexte

Le handshake Devin ⇄ AGY et le routage IDE existaient déjà; l’extension du protocole aux agents ACP/CLI doit préserver le garde-fou anti-fenêtre. Le test réel du 2026-10-14 a révélé un faux `pair établi` basé sur un handshake historique. Le correctif du 2026-10-15 ajoute request/ACK corrélés; l’extension multi-agent distingue maintenant les sessions ACP Devin des sessions CLI reprises.

## Décision

1. Exposer la procédure par la compétence Devin project-local `/jointes <agent>` dans `.devin/skills/jointes/SKILL.md` et une règle de sûreté dans `.devin/rules/jointes.md`.
2. Supporter trois transports explicites : AGY hub, session ACP Devin et session CLI Kilo/Hermes reprise par ID. Les autres providers ACP ne sont ciblables que si une session active apparaît dans l’état ACP; un agent API one-shot ne devient pas joinable par son seul nom.
3. Exiger une requête/ACK frais corrélés par `pairId/session`, IDs exacts, transports/providers inversés et fraîcheur maximale de 15 minutes. Ignorer les handshakes legacy; `hint` seul ne prouve rien.
4. Pour ACP, vérifier provider activé, `sessionId/providerId` exacts et workspace; restaurer l’onglet existant, revérifier le focus puis injecter. Cible inconnue/non focalisable = `skipped`. Pour le retour vers Devin, rester sur une session `devin-cli` connue. Pour CLI, reprendre uniquement l’ID vérifié dans le workspace, sans shell interpolé.
5. Maintenir la documentation technique canonique dans `docs/protocole-binome/README.md`; garder les autres documents comme renvois/checklists, sans recopier la procédure complète.
6. Enregistrer la mémoire durable dans HPHE `memory_write`. Beacon reste passif : le collecteur capture l’activité, mais l’outil Beacon n’a pas d’écriture et le pipeline d’ingestion reste désactivé.

## Conséquences

- `/jointes <agent>` résout les provider IDs ACP configurés, les sessions CLI Kilo/Hermes et le hub AGY sans confondre ces transports.
- Les deux copies source `binome.js` / `comms.js` utilisent request/ACK `pairId/session/transport/providerId` frais; `send` refuse tout fallback vers une session active/latest.
- Le join réel Devin ⇄ AGY du 2026-10-15 a confirmé l’ACK corrélé sans nouvelle fenêtre Devin ni `wake_devin` supplémentaire.
- Les workers API HES `nim1`/`nim2` restent distincts des providers ACP Devin `nim`/`nim2`; aucune session absente n’est simulée.
- Le garde-fou anti-fenêtre ACP vérifie provider activé, workspace, session et focus; les providers tiers sans send provider-spécifique échouent fermé (`skipped`) au lieu d’injecter dans Devin. Les ACP multi-agents nécessitent le bundle extension 0.0.57.
- Validation : tests bridge/binôme 21/21, routage 20/20 et smoke test bridge/native SQLite 2/2. Le VSIX 0.0.57 est installé; le port 7477 et `acp-list` répondent, et un pair AGY frais a été vérifié. L’essai Kilo CLI antérieur n’a pas reçu d’ACK, donc aucune paire Kilo n’est annoncée.
- La configuration ajoutée est project-local et versionnée; aucune préférence globale Devin ni configuration MCP n’est modifiée.

## Références

- Procédure : `docs/protocole-binome/README.md`
- Skill : `.devin/skills/jointes/SKILL.md`
- Règle Devin : `.devin/rules/jointes.md`
- Règles communes : `.agent/rules/global_rules.md`
