# Référence API Cascade

## Authentification

Toutes les requêtes API nécessitent un token JWT dans l'en-tête:

```text
Authorization: Bearer <jwt_token>
```

## Endpoints

### MCP Router

#### POST /router/request

Exécute une requête vers un serveur MCP spécifique.

#### Corps de la requête

```json
{
  "target": "memory|cache|orchestrator",
  "action": "get|set|delete|search",
  "data": {},
  "priority": "critical|high|normal|low",
  "timeout": 5000
}
```

#### Réponse

```json
{
  "success": true,
  "data": {},
  "metadata": {
    "execution_time": 150,
    "cache_hit": false
  }
}
```

#### GET /router/status

Vérifie le statut de tous les serveurs MCP.

#### Réponse (suite)

```json
{
  "servers": {
    "cache": {
      "status": "healthy",
      "response_time": 5,
      "uptime": 86400
    },
    "memory": {
      "status": "healthy",
      "response_time": 12,
      "uptime": 86400
    }
  },
  "overall_status": "healthy"
}
```

### Memory API

#### POST /memory/store

Stocke une information dans la mémoire.

#### Corps de la requête (suite)

```json
{
  "key": "user:123:preferences",
  "value": {
    "theme": "dark",
    "language": "fr"
  },
  "type": "declarative|procedural|episodic|semantic",
  "metadata": {
    "source": "user_input",
    "confidence": 0.9
  }
}
```

#### POST /memory/search

Recherche dans la mémoire.

#### Corps de la requête (suite 2)

```json
{
  "query": "configuration utilisateur",
  "type": "semantic|keyword|hybrid",
  "limit": 10,
  "threshold": 0.7,
  "filters": {
    "date_range": "last_30_days",
    "source": "user"
  }
}
```

#### GET /memory/stats

Statistiques d'utilisation de la mémoire.

#### Réponse (suite 2)

```json
{
  "total_entries": 10000,
  "storage_used": "2.5GB",
  "cache_hit_rate": 0.85,
  "avg_response_time": 45,
  "top_entities": [
    {"type": "user", "count": 5000},
    {"type": "project", "count": 3000}
  ]
}
```

### Agents API

#### POST /agents/{agent_name}/execute

Exécute une tâche sur un agent spécifique.

#### Corps de la requête (suite 3)

```json
{
  "task": "design_new_feature",
  "parameters": {
    "feature": "user_authentication",
    "requirements": ["oauth2", "jwt", "2fa"]
  },
  "priority": "high",
  "timeout": 300000
}
```

#### GET /agents/{agent_name}/status

Statut d'un agent.

#### Réponse (suite 3)

```json
{
  "status": "busy|idle|error",
  "current_tasks": 2,
  "queue_size": 5,
  "performance": {
    "tasks_completed": 150,
    "avg_execution_time": 45000,
    "success_rate": 0.95
  }
}
```

#### GET /agents/list

Liste tous les agents disponibles.

#### Réponse (suite 4)

```json
{
  "agents": [
    {
      "name": "orchestrator",
      "status": "idle",
      "capabilities": ["coordination", "task_distribution"],
      "version": "1.0.0"
    }
  ]
}
```

### Workflows API

#### POST /workflows/{workflow_name}/start

Démarre un workflow.

#### Corps de la requête (suite 4)

```json
{
  "input": {
    "feature_name": "user_dashboard",
    "priority": "high"
  },
  "options": {
    "auto_approve": false,
    "notifications": true
  }
}
```

#### GET /workflows/{workflow_id}/status

Statut d'un workflow.

#### Réponse (suite 5)

```json
{
  "id": "wf_123",
  "status": "running|completed|failed",
  "current_stage": "implementation",
  "progress": 0.6,
  "stages": [
    {"name": "design", "status": "completed"},
    {"name": "implementation", "status": "running"}
  ]
}
```

## WebSocket Events

### Connexion

```text
ws://localhost:3003/ws
```

### Événements

#### task.assigned

Un agent reçoit une nouvelle tâche.

```json
{
  "event": "task.assigned",
  "data": {
    "task_id": "task_123",
    "agent": "coder",
    "task": "implement_feature"
  }
}
```

#### task.completed

Un agent termine une tâche.

```json
{
  "event": "task.completed",
  "data": {
    "task_id": "task_123",
    "agent": "coder",
    "result": "success",
    "duration": 120000
  }
}
```

#### agent.status

Changement de statut d'un agent.

```json
{
  "event": "agent.status",
  "data": {
    "agent": "reviewer",
    "status": "busy",
    "current_tasks": 3
  }
}
```

## Erreurs

### Format d'erreur

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Paramètres de requête invalides",
    "details": {
      "field": "threshold",
      "value": "invalid"
    },
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Codes d'erreur

- `INVALID_REQUEST`: Requête mal formée
- `UNAUTHORIZED`: Non authentifié
- `FORBIDDEN`: Permissions insuffisantes
- `NOT_FOUND`: Ressource introuvable
- `TIMEOUT`: Délai d'attente dépassé
- `AGENT_ERROR`: Erreur interne de l'agent
- `MEMORY_ERROR`: Erreur de la mémoire
- `RATE_LIMITED`: Trop de requêtes

## Rate Limiting

- **Utilisateurs authentifiés**: 1000 requêtes/heure
- **Agents**: 10000 requêtes/heure
- **Endpoints critiques**: 100 requêtes/minute

## SDKs

### JavaScript/TypeScript

```bash
npm install @cascade/sdk
```

### Python

```bash
pip install cascade-sdk
```

### Go

```bash
go get github.com/cascade/sdk-go
```
