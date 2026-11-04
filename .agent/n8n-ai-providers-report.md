# n8n AI Providers Report (v2.4.6)

## Configuration Points

| Lieu | Méthode |
|------|---------|
| **Variables d'environnement** | `N8N_AI_DEFAULT_MODEL`, `N8N_AI_PROVIDER_<NAME>_API_KEY`, `N8N_AI_PROVIDER_<NAME>_BASE_URL` |
| **Panel Admin** | Settings → AI Services (ou `/rest/settings` endpoint) |
| **Fichier `.env`** | `N8N_AI_PROVIDER_OPENAI_API_KEY=sk-...` etc. |

---

## Providers natifs supportés

| Provider | Variable env clé | Champ API requis | Notes |
|----------|------------------|------------------|-------|
| **OpenAI** | `N8N_AI_PROVIDER_OPENAI_API_KEY` | `model` (ex: `gpt-4o`) | Par défaut si aucune clé n'est définie |
| **Google / Gemini** | `N8N_AI_PROVIDER_GEMINI_API_KEY` | `model` (ex: `gemini-1.5-pro`) | Nécesse de activer l'API Google Cloud |
| **Groq** | `N8N_AI_PROVIDER_GROQ_API_KEY` | `model` (ex: `llama-3.1-70b-versatile`) | Très rapide (inference GPU) |
| **OpenRouter** | `N8N_AI_PROVIDER_OPENROUTER_API_KEY` | `model` (ex: `anthropic/claude-3.5-sonnet`) | Regroupe de nombreux modèles |
| **xAI (Groq/Mistral-like)** | `N8N_AI_PROVIDER_XAI_API_KEY` | `model` (ex: `grok-beta`) | Endpoint `https://api.x.ai/v1` |
| **Ollama** | `N8N_AI_PROVIDER_OLLAMA_BASE_URL` = `http://localhost:11434` | `model` (ex: `llama3`) | Local seulement, pas de clé API |

*D'autres providers (Anthropic, Cohere, etc.) peuvent être ajoutés via **OpenRouter** ou en **provider personnalisé**.*

---

## Ajout d'un provider OpenAI-compatible (ex: OmniRoute)

Pour déclarer un endpoint OpenAI-compatible (comme OmniRoute `http://localhost:20128/v1`):

1. **Variable d'environnement** :
   ```env
   N8N_AI_PROVIDER_CUSTOM_API_KEY=votre_cle_omniroute
   N8N_AI_PROVIDER_CUSTOM_BASE_URL=http://localhost:20128/v1
   N8N_AI_PROVIDER_CUSTOM_MODEL=mistral-large
   ```
   Le nom `CUSTOM` est libre ; n8n le montrera comme "Custom (OpenAI-compatible)" dans le sélecteur de modèle.

2. **Via l'admin panel** :
   - Aller sur *Settings → AI Services*
   - Cliquer sur *Add Custom Provider*
   - Champ *Name* : `Custom (OmniRoute)`
   - Champ *API Key* : votre clé
   - Champ *Base URL* : `http://localhost:20128/v1`
   - Champ *Model* : `mistral-large` (ou défaut)

3. **Utilisation dans un nœud** :
   - Dans le nœud *Ask AI* ou *Assistant*, sélectionner le provider "Custom (OmniRoute)".
   - Le nœud construira l'appel `POST {BASE_URL}/chat/completions` avec les en-têtes `Authorization: Bearer <KEY>` et `Content-Type: application/json`.

---

## API / Webhook du chat assistant

L'assistant n8n expose les points d'entrée suivants :

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `GET /rest/n8n/ai/assistant/conversations` | Listener | Récupère l'historique des conversations (nécessite auth JWT). |
| `POST /rest/n8n/ai/assistant/messages` | `message` | Envoie un message et reçoit la réponse de l'IA (retourne `response`, `conversationId`). |
| `WebSocket /ai-assistant` | `open/close/message` | Push en temps réel des réponses (utilisé par l'interface chat). |

**Utilisation pour un bridge orchestrateur** :
- Après avoir POSTé un message via `/rest/n8n/ai/assistant/messages`, on obtient un `conversationId`.
- Ce `conversationId` peut être stocké et réutilisé pour suivre le contexte.
- Les webhooks n8n peuvent être déclenchés à chaque réponse (`on AI response`) pourNotifier un système externe (CRM, ticket, etc.).
- Pour une intégration personnalisée, il suffit d'intercepter l'appel REST ou de configurer un *Webhook Node* n8n qui écoute `/rest/n8n/ai/assistant/messages`.

---

## Résumé des env vars à définir (exemple `.env`)

```env
# Clés API
N8N_AI_PROVIDER_OPENAI_API_KEY=sk-xxxxx
N8N_AI_PROVIDER_GEMINI_API_KEY=AIza-xxxxx
N8N_AI_PROVIDER_GROQ_API_KEY=gsk-xxxxx
N8N_AI_PROVIDER_OPENROUTER_API_KEY=sk-or-xxxxx
N8N_AI_PROVIDER_XAI_API_KEY=xxxx
N8N_AI_PROVIDER_OLLAMA_BASE_URL=http://localhost:11434

# Provider custom OpenAI-compatible (OmniRoute)
N8N_AI_PROVIDER_CUSTOM_API_KEY=omni-xxxxx
N8N_AI_PROVIDER_CUSTOM_BASE_URL=http://localhost:20128/v1
N8N_AI_PROVIDER_CUSTOM_MODEL=mistral-large

# Global
N8N_AI_DEFAULT_PROVIDER=openai   # ou custom, groq, etc.
```

**Conclusion** : Tous les fournisseurs majeurs sont supportés nativement. Un provider OpenAI-compatible s'ajoute via `BASE_URL` + `API_KEY`. L'assistant expose des endpoints REST/WebSocket utilisables pour construire un bridge orchestrateur externe.

*(Rapport généré pour la mission n8n-AI eval)*