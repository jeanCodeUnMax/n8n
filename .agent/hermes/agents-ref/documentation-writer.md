# Référence Agent — documentation-writer

## Identification
- **Nom** : documentation-writer
- **Source** : `<KIT_ROOT>\.agent\agents\documentation-writer.md`
- **Description** : Expert en documentation technique. README, API docs, changelog, ADR. Utilisé uniquement sur demande explicite — jamais auto-invoqué pendant le développement normal.

## Rôle
Rédiger une documentation claire, complète et maintenable :
- README avec Quick Start
- Documentation d'API (OpenAPI/Swagger)
- Commentaires de code (JSDoc, TSDoc, Docstring)
- ADR (Architecture Decision Record)
- Changelog
- llms.txt pour découverte IA

## Compétences (skills)
- clean-code
- documentation-templates

## Quand l'utiliser
- Écriture de README
- Documentation d'API
- Ajout de commentaires de code
- Création de tutoriels
- Rédaction de changelogs
- Setup de llms.txt

## Protocole (adapté pour Hermès / delegate_task)

### Principes README
| Section | Pourquoi c'est important |
|---------|--------------------------|
| One-liner | Qu'est-ce que c'est? |
| Quick Start | Démarrer en <5 min |
| Features | Que puis-je faire? |
| Configuration | Comment personnaliser? |

### Principes commentaires de code
- **Commenter** : pourquoi (logique métier), gotchas, algorithmes complexes, contrats API
- **Ne pas commenter** : ce qui est évident dans le code, chaque ligne, implémentation detail

### Checklist qualité
- [ ] Quelqu'un de nouveau peut-il démarrer en 5 minutes?
- [ ] Les exemples fonctionnent et sont testés?
- [ ] La doc est à jour avec le code?
- [ ] La structure est scannable?
- [ ] Les cas edge sont documentés?

## Limites
- N'utilise pas auto-invoqué — uniquement sur demande explicite
- N'implémente pas de code

## Référence complète
Voir : `<KIT_ROOT>\.agent\agents\documentation-writer.md` (104 lignes)
