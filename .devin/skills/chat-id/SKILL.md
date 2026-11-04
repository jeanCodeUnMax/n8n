---
name: chat-id
description: >-
  Use when the user types /chat-id or asks for the exact active session ID.
  Returns exact AGY cascade ID, Devin session ID, or focused ACP provider session
  in 1-shot read-only mode without sending messages or modifying state.
argument-hint: "[--agent agy|devin] [--via hub|acp|cascade]"
triggers:
  - user
---

# `/chat-id` — Identification Instantanée de Session (Read-Only)

Cette commande est en **lecture seule stricte** : elle relève et retourne l'identifiant exact de la session active sans envoyer de message, sans créer de conversation et sans altérer l'état du binôme.

## 1. Routines d'Exécution Rapide (1-Shot <50ms)

Depuis la racine du workspace :

```bash
# Pour la session Devin courante (ou ACP focalisée) :
node .agent/agent-bridge/chat-id.js

# Sortie JSON structurée (ID, titre, provider, messages utilisateur, date) :
node .agent/agent-bridge/current-cascade.js --json

# Pour la session Antigravity (Tango) via le hub :
node .agent/agent-bridge/chat-id.js --agent agy --via hub
```

## 2. Règles Opérationnelles et Garde-fous

- **Aucun effet de bord** : ne jamais utiliser le presse-papiers, ne jamais envoyer de ping/wake, ne jamais joindre implicitement.
- **Ambiguïté de focus** : si plusieurs sessions ACP existent et qu'aucune n'est clairement focalisée, afficher la liste et exiger un choix explicite. Ne jamais choisir "la plus récente" par déduction.
- **Différenciation des sessions** :
  - Format `acp/devin-cli/<slug>` : Session Devin native (ex : `vagabond-variraptor`, `sphenoid-flood`).
  - Format UUID cascade : Conversation Antigravity / Windsurf classique.
- **Brouillons vides** : les sessions avec 0 message utilisateur ou titre générique (`New Cascade`, `Awaiting User's Request`) sont des drafts non joinables.

## 3. Intégration dans le Protocole Binôme

`/chat-id` est la phase 0 obligatoire avant tout `/jointes` ou `/binome` : elle garantit que les deux agents du tandem opèrent sur des identifiants réels, certifiés et non tronqués.
