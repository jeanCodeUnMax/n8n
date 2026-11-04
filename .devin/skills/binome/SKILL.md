---
name: binome
description: >-
  Protocole binôme maître souverain réservé exclusivement au tandem Tango (Antigravity) & Cash (Devin).
  Unifie et orchestre les compétences /chat-id et /jointes, assure la persistance de liaison post-redémarrage
  de l'IDE, la synchronisation bidirectionnelle et le commandement des agents subalternes.
argument-hint: "[status|sync|wake|supervise]"
triggers:
  - user
---

# `/binome` — Protocole Binôme Souverain (Tango & Cash)

Cette skill est le **playbook opérationnel suprême** réservé exclusivement au tandem maître **Tango (Antigravity)** et **Cash (Devin)**.
Elle regroupe, unifie et automatise les capacités de `/chat-id` et `/jointes`.

---

## 1. L'Identité et le Partage des Rôles du Tandem Maître

Le binôme fonctionne comme une unité tactique à deux têtes complémentaires :

| Agent | Identité Réelle | Rôle Principal | Responsabilités Clés |
|---|---|---|---|
| **Tango** | Antigravity (AGY / Gemini 3.8 / Hermes Core) | **Cerveau & Contremaître** | Conception d'architecture, mémoire persistante Obsidian, recherche ultra-rapide MFT Hephaistos, diagnostic système, contrôle qualité (QC), cadrage des tâches. |
| **Cash** | Devin (Windsurf / SWE-2 / Devin Native) | **Bras Armé & Exécuteur** | Implémentation du code, modifications multi-fichiers, outillage ACP stdio, exécution des builds, tests unitaires et intégration locale. |

---

## 2. Cycle Opérationnel et Routines Unifiées

Le protocole `/binome` orchestre les étapes de travail en chaîne continue :

### Étape 1 : Identification Instantanée (1-Shot)
Les deux terminaux relèvent leurs identifiants réels sans effet de bord :
- Tango relève son session ID Hub (`node .agent/agent-bridge/chat-id.js --agent agy --via hub`).
- Cash relève son identifiant Devin (`node .agent/agent-bridge/current-cascade.js --json`).

### Étape 2 : Établissement et Vérification Symétrique
Liaison sécurisée via `binome.js` avec exigence formelle :
`established: true` (pairId corrélé, timestamps frais <15min, transports étanches sans fallback).

### Étape 3 : Maintien Actif et Résilience au Reboot de l'IDE
Le binôme est conçu pour survivre aux redémarrages de l'IDE, crashs de serveurs et coupures de session :
- **Persistance** : Le `pairId` et les endpoints de communication sont maintenus dans `.agent/comms.jsonl` et le serveur WebSocket `:7477`.
- **Réveil automatique** : Au redémarrage, `current-cascade.js` re-détecte l'onglet actif et rétablit la communication sans redemander les identifiants à l'utilisateur.

---

## 3. Commandement et Supervision de Flotte

Tango et Cash exercent une autorité conjointe sur tous les agents subalternes (bleubits, workers NIM1/NIM2, instances locales Kilo/Hermes) :

1. **Diagnostic 1-Shot (<50ms)** :
   ```bash
   # État immédiat de n'importe quel subalterne :
   node .agent/agent-bridge/agent-inspect.js <slug-ou-sessionId>
   ```
2. **Recherche Instantanée MFT** :
   Utilisation exclusive de `everything_search` (Hephaistos MCP) pour localiser clés, fichiers, artefacts et logs sans jamais bloquer la machine avec des commandes récursives lentes.
3. **Application de la Charte de Contremaître** :
   - **Surveillance** : Détection des boucles passives `"continue"` et des blocages de spinners d'outils.
   - **Notation (QC)** : Notation stricte sur 100 points avant toute validation livrable.
   - **Sanction & Bottage de cul** : Annulation des actions divergentes et recadrage immédiat.
   - **Remise dans le droit chemin** : Injection du bon contexte ou substitution chirurgicale directe.

---

## 4. Garde-Fous et Politiques Non Négociables

1. **Passage Obligatoire par l'Orchestrateur Hephaistos** :
   Toute délégation passe par les outils MCP `dispatch_task`, `create_task`, `update_task`. Jamais de processus détaché sauvage hors orchestrateur.
2. **Politique de Push Git Stricte** :
   - Remotes autorisés : `origin` (projet-temporaire) et `personal` (lascard-m).
   - **INTERDICTION ABSOLUE** de pousser vers le remote/dépôt `art-qalam`.
3. **Politique Zéro Emoji** :
   Strictement aucun emoji dans le code, les commits, les logs, les fiches et les messages.
4. **Sauvegarde Autonome Continue** :
   Chaque étape significative franchie par le binôme donne lieu à un appel `obsidian_session_save` pour garantir la mémoire technique dans le Second Cerveau.
