> **OBSOLETE (v1)** — ce document décrit l architecture Python/Node pré-unification (Qdrant, Zvec, MCP séparés, Everything.exe). Conservé pour historique/rollback. Référence actuelle : `.agent/ARCHITECTURE.md` + `docs/hephaistos-engine/`.

# ADR-001: Architecture du Système Multi-Agents Cascade

## Statut

ACCEPTED (v2.0 - 2026-04-06)

## Date

2024-01-01 (création) | 2026-04-06 (mise à jour)

## Contexte

Nous avons besoin d'un système capable d'orchestrer des tâches complexes de développement logiciel en utilisant des agents IA spécialisés. Le système doit être évolutif, résilient et capable d'apprendre de ses interactions.

## Décision

Nous avons décidé d'implémenter une architecture multi-agents basée sur le protocole MCP (Model Context Protocol) avec les caractéristiques suivantes:

1. **Agents Spécialisés**: Chaque agent a une responsabilité unique et bien définie
2. **Orchestration Centralisée**: Un agent orchestrator coordonne les autres agents
3. **Mémoire Unifiée**: Un système de mémoire partagé entre tous les agents
4. **Communication Événementielle**: Les agents communiquent via un bus d'événements

---

## Architecture (v2.0)

### Composants Principaux

#### 1. Agents

- **Orchestrator**: Coordination et distribution des tâches
- **Architect**: Conception et architecture logicielle
- **Coder**: Implémentation du code
- **Reviewer**: Assurance qualité et revue
- **Research**: Recherche et veille technologique
- **Memory**: Gestion de la mémoire et des connaissances

#### 2. Infrastructure MCP

- **Router**: Acheminement des requêtes
- **Cache**: Stockage temporaire des données (2 copies optimisées)
- **Memory**: Base de connaissances persistante
- **Pipelines**: Traitement par lots des données

#### 3. Stockage Unifié (v2.0)

| Composant         | Données                      | Statut             |
| ----------------- | ---------------------------- | ------------------ |
| **Cache Runtime** | 2 copies (MCP + Système)     | ✅ Optimisé (-33%) |
| **Memory MCP**    | 82 entités, 131 obs, 584 rel | ✅ Opérationnel    |
| **Graph Memory**  | 530 edges                    | ✅ Complémentaire  |
| **Qdrant**        | 1536D, 5 collections         | ✅ Catégorique     |
| **Zvec**          | 384D, 6 indexs               | ✅ Sémantique      |

---

### Flux de Travail

1. Une requête utilisateur arrive via l'interface
2. L'orchestrator analyse et décompose la tâche
3. Les agents appropriés sont assignés aux sous-tâches
4. Les agents collaborent via le bus d'événements
5. Les résultats sont consolidés et retournés

---

## Conséquences

### Positives

- **Spécialisation**: Chaque agent excelle dans son domaine
- **Scalabilité**: Facile d'ajouter de nouveaux agents
- **Résilience**: Un agent en panne n'affecte pas tout le système
- **Apprentissage**: La mémoire partagée permet l'amélioration continue
- **Performance**: Cache optimisé (2 copies), recherche hybride (Qdrant/Zvec)

### Négatives

- **Complexité**: Architecture plus complexe qu'un système monolithique
- **Latence**: La communication entre agents ajoute de la latence
- **Débogage**: Plus difficile de tracer les problèmes à travers plusieurs agents

### Risques

- **Performance**: Risque de goulot d'étranglement dans l'orchestrator
- **Consistance**: Difficile de maintenir la cohérence des données
- **Sécurité**: Plus de surfaces d'attaque avec plusieurs composants

---

## Alternatives Considérées

### 1. Architecture Monolithique

- **Avantages**: Plus simple à implémenter et déboguer
- **Inconvénients**: Moins évolutif, point de défaillance unique

### 2. Microservices sans Agents

- **Avantages**: Découplage clair
- **Inconvénients**: Pas d'intelligence intégrée

### 3. Architecture Pair-à-Pair

- **Avantages**: Pas de point de défaillance unique
- **Inconvénients**: Complexité de coordination élevée

---

## Implémentation

### Technologies Choisies

- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express
- **Protocole**: WebSocket pour la communication temps réel
- **Stockage**: Multi-bases pour optimiser chaque cas d'usage

### Roadmap

1. **Phase 1**: Implémentation de l'orchestrator et de 2 agents (coder, reviewer) ✅
2. **Phase 2**: Ajout des agents architect et memory ✅
3. **Phase 3**: Intégration complète et optimisation ✅

---

## Mesures de Succès (v2.0)

| Métrique           | Cible    | Actuel          | Statut |
| ------------------ | -------- | --------------- | ------ |
| **Latence**        | < 500ms  | < 100ms (cache) | ✅     |
| **Disponibilité**  | 99.9%    | 99.9%           | ✅     |
| **Qualité RAG**    | > 95%    | 100/100         | ✅     |
| **Cache optimisé** | 2 copies | 2 copies        | ✅     |

---

## Documents de Référence

| Document                        | Description                        |
| ------------------------------- | ---------------------------------- |
| `ARCHITECTURE-ANALYSIS.md`      | Architecture complète multi-bases  |
| `RAG-AUDIT-REPORT.md`           | Audit système RAG (Score: 100/100) |
| `CACHE-RUNTIME-UNIFICATION.md`  | Optimisation caches runtime        |
| `GRAPH-MEMORY-CLARIFICATION.md` | Rôles graph-memory vs memory_mcp   |
| `memory-policy.md`              | Politiques de gestion              |

---

## Références Externes

- [MCP Specification](https://modelcontextprotocol.io/)
- [Multi-Agent Systems Pattern](https://patterns.dev/posts/multi-agent-patterns)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
