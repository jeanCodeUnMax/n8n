---
name: jointes
description: >-
  Use when the user requests /jointes to pair Antigravity with an explicitly
  selected agent session using the Hephaistos binome protocol.
---

# Antigravity Binome Join

Follow `docs/protocole-binome/README.md` in the Hephaistos2-Kit workspace.

1. Identify AGY's exact session ID with
   `node .agent/agent-bridge/chat-id.js --agent agy --via hub`.
2. Resolve the requested peer and transport. Require an exact peer session ID;
   ask the user to choose when the agent, transport, or session is ambiguous.
3. Send one targeted request using AGY's real identity:
   `node .agent/agent-bridge/binome.js --as agy --via hub --self <agySessionId> --peer <agent> --peer-via <transport> --to <peerSessionId> --session binome join`
4. Do not claim a pair until the real peer sends a fresh reciprocal ACK and the
   verifier reports `established: true` with matching pair ID, session, IDs,
   transports, providers, and timestamps.

Never simulate another agent, route to an inferred/latest session, create a
replacement conversation, or use `agy-hub.js discover`. Do not reveal CSRF
tokens or other credentials.
