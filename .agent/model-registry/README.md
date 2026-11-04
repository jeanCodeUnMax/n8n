# Model Registry — registre des modèles annoté

Ce répertoire est le **registre opérationnel des modèles**, alimenté par
`.agent/scripts/ping-models.mjs` (pings d'inférence réels → `model_health` dans
`orchestrator.db`) et lu par `pick_model` pour éviter les morts et préférer les
rapides. Chaque fichier `<supplier>.md` est régénéré à chaque run ; la section
`## Notes` en fin de fichier est préservée — c'est là qu'on annote les modèles.

## Sélection — rappel (3 paramètres, dans l'ordre)

1. **Chaîne de providers** — `provider_prefs` (monitor, drag & drop) ordonne.
2. **Ping** — `model_health` : dispo + latence récente (ce registre).
3. **Spécificité** — `model_prefs` de l'agent (sous-chaîne sur l'ID modèle).

## Convention des notes

Dans `<supplier>.md`, section `## Notes` : une ligne par modèle à retenir —

```
- `nvidia/nemotron-3-ultra-550b-a55b` : LENT / quasi jamais de réponse utile → réserver deep_analysis, jamais pour l'agentique
- `nvidia/nemotron-3.5-lightning-30b-a3b` : raisonneur — réponse peut atterrir dans reasoning_content ; ~45s ; fallback géré par nim-worker
```

État = dernier ping réel. `OK` = répond, `KO` = mort/indispo à ce relevé.
Un KO n'est pas forcément définitif (quota, transient) — re-pinguer avant de
bannir. Un KO confirmé plusieurs relevés → note explicite.
