# n8n AI Providers Report (v2.45.5)

> Régénéré le 2026-10-29 après upgrade 2.4.6 → 2.45.5. Changement majeur vs l'ancien rapport : le schéma `N8N_AI_PROVIDER_<NAME>_API_KEY` **n'existe pas** dans cette version. Les providers AI se configurent via le système de **Credentials** n8n (UI ou API), pas par variables d'environnement.

## Configuration Points

| Lieu | Méthode |
|------|---------|
| **Credentials n8n** | Chaque provider AI a un type de credential (clé API + base URL optionnelle), attaché à l'agent/conversation |
| **Chat Hub settings** | Settings → Chat (module `chat-hub`), agents persistés en base (`chat_hub_agents.provider/model/credentialId`) |
| **Env vars Instance AI** | `N8N_INSTANCE_AI_MODEL`, `N8N_INSTANCE_AI_EVAL_MODEL`, `N8N_INSTANCE_AI_EVAL_TIMING`, `N8N_INSTANCE_AI_SANDBOX_PROVIDER` |
| **Env vars générales** | `N8N_AI_ENABLED`, `N8N_AI_ANTHROPIC_KEY`, `N8N_AI_ALLOW_SENDING_PARAMETER_VALUES`, `N8N_AI_TIMEOUT_MAX` |

---

## Providers natifs supportés (module chat-hub, 2.45.5)

| Provider | Type | Clé API | Notes |
|----------|------|---------|-------|
| **OpenAI** | `openai` | Credential OpenAI | Base URL personnalisable → endpoint OpenAI-compatible |
| **Anthropic** | `anthropic` | Credential Anthropic | |
| **Google / Gemini** | `google` | Credential Google (PaLM/Gemini) | |
| **Groq** | `groq` | Credential Groq | Inférence rapide |
| **Ollama** | `ollama` | Credential Ollama (base URL) | Local, `http://localhost:11434` |
| **OpenRouter** | `openRouter` | Credential OpenRouter | Agrégateur multi-modèles |
| **DeepSeek** | `deepSeek` | Credential DeepSeek | |
| **Cohere** | `cohere` | Credential Cohere | |
| **Mistral** | `mistral` | Credential Mistral | |
| **Azure OpenAI** | `azureOpenAi` | Credential Azure OpenAI | |
| **Vercel AI Gateway** | `vercel` | Credential Vercel | |
| **Agent custom (workflow)** | `custom-agent` | — | Expose un workflow n8n comme provider |
| **n8n** | `n8n` | — | Provider interne |

*xAI (grok) n'apparaît plus dans la liste des providers 2.45.5 ; utiliser OpenRouter si nécessaire.*

---

## Provider OpenAI-compatible (ex: OmniRoute)

Deux voies en 2.45.5 :

1. **Credential OpenAI avec Base URL custom** : créer un credential OpenAI, renseigner `Base URL = http://localhost:20128/v1` + clé OmniRoute → utilisable dans Chat Hub et les nœuds AI.
2. **OpenRouter** : regrouper OmniRoute derrière un endpoint OpenRouter-compatible.
3. **Agent custom** : workflow n8n wrappant l'appel `POST {BASE_URL}/chat/completions`.

---

## API REST du Chat Hub (module `chat-hub`)

Endpoints vérifiés dans le contrôleur 2.45.5 (base `/rest/chat`) :

| Endpoint | Usage |
|----------|-------|
| `POST /conversations/send` | Envoyer un message (création session implicite) |
| `GET /conversations` | Lister les conversations |
| `GET /conversations/:sessionId` | Détail d'une session |
| `POST /conversations/:sessionId/messages/:messageId/edit` | Éditer un message |
| `POST /conversations/:sessionId/messages/:messageId/regenerate` | Régénérer la réponse |
| `POST /conversations/:sessionId/messages/:messageId/stop` | Stopper une génération en cours |
| `POST /conversations/:sessionId/reconnect` | Reprendre un stream |
| `POST /conversations/manual/:workflowId/send` | Envoyer à un agent workflow custom |
| `GET /models` | Lister les modèles dispo par provider |
| `GET|POST /agents`, `GET|PUT|DELETE /agents/:agentId` | CRUD agents Chat Hub |
| `GET|POST /tools`, `GET|PUT|DELETE /tools/:toolId` | CRUD outils d'agent |
| `GET|POST /agents/:agentId/files` | Fichiers de connaissance d'un agent |

Auth : session/JWT n8n standard (ou `x-n8n-api-key` via le proxy `.agent/scripts/n8n-auth-proxy.mjs`).

---

## Résumé des env vars utiles (`.env`)

```env
# Instance AI (assistant intégré)
N8N_INSTANCE_AI_MODEL=<model-id>
N8N_INSTANCE_AI_EVAL_MODEL=<model-id>
N8N_INSTANCE_AI_SANDBOX_PROVIDER=<provider>

# Général
N8N_AI_ENABLED=true
N8N_AI_ANTHROPIC_KEY=sk-ant-xxxxx   # clé fallback historique
N8N_AI_TIMEOUT_MAX=<ms>
N8N_AI_ALLOW_SENDING_PARAMETER_VALUES=true
```

Les clés des autres providers vivent en base (table `credentials`, chiffrées via `N8N_ENCRYPTION_KEY` / `~/.n8n/config`), pas en env.

---

## Incidents de migration 2.4.6 → 2.45.5 (résolus)

- `CreateAgentHistoryTable1784000000011` : table `agents` écrasée par un schéma étranger (vide) → renommée `agents_foreign_orphan`, schéma n8n recréé manuellement.
- `AddAgentQueueMessageReferences1790605116208` : index `IDX_agents_projectId` orphelin sur la table renommée → drop + recréé sur `agents`.
- 29 migrations rejouées avec succès après correction ; backup pré-upgrade dans `~/.n8n-backup-20261029/`.

**Conclusion** : en 2.45.5, la configuration AI est centrée Credentials + Chat Hub (agents persistés, outils, fichiers). Les endpoints `/rest/chat/*` permettent un bridge orchestrateur externe équivalent à l'ancien `/rest/n8n/ai/assistant/*`.

*(Rapport régénéré pour la mission n8n-AI eval — v2.45.5)*
