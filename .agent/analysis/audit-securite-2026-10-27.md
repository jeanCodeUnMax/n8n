# Audit sécurité – article 21‑10‑2026

> Produit par chat-mvmtldvy (Auditeur-securite, provider nim), task #737.
> Récupéré par l'orchestrateur : le fs_write du worker a échoué sur un chemin
> à backslashes doublés ; contenu repris tel quel depuis la réponse du tour.

## (a) Hooks *SessionStart* / *PostToolUse*
- Injections de `wiki/hot.md` et du statut du linter sont limitées à du texte markdown ; aucune exécution de code n'est prévue.
- Risque : si le contenu du wiki ou du linter était altéré, le modèle pourrait être influencé. Le hook doit s'exécuter avec les mêmes droits que le processus principal (lecture seule des fichiers) et ne pas autoriser d'écriture dans le contexte d'agent.

## (b) Deny rules *Edit/Read* sur *raw/*
- Les règles de configuration interdisent toute écriture/lecture sur le répertoire *raw/* ; elles sont appliquées au niveau du système de fichiers, pas seulement au prompt.
- Vérifier que les appels `fs_read`/`fs_write` sont filtrés par les `allowed_roots` et que le processus ne peut pas contourner la règle via un script externe.

## (c) Linter deterministe *brain.py*
- Implémenté en stdlib, aucune dépendance LLM → surface d'injection réduite.
- Le linter doit être exécuté avec les mêmes permissions que le reste du processus ; s'assurer que le répertoire contenant *brain.py* n'est pas en écriture par l'agent.

## (d) Injection via *web clippings* dans *raw/*
- *raw/* est déclaré read‑only ; tout import de clippings doit passer par un canal contrôlé qui valide le contenu (ex. whitelist, checksum) avant d'être ajouté.
- Un contrôle d'intégrité (hash) et un audit de source sont requis pour éviter l'introduction de payloads malveillants.

## (e) Transposition à *hephaistos2* (`fs_*` tools, *allowed_roots*, *comms.jsonl*)
- Toutes les opérations de lecture/écriture (sessions, workspaceState, SQLite via *hphe*) doivent rester dans les répertoires autorisés et ne pas dépasser les limites d'accès (0600, chiffrement *hphe*).
- *comms.jsonl* doit être protégée (permissions restrictives) et ne pas être accessible à des processus non‑autorisé.

**Conclusion** : les mécanismes sont globalement conformes aux bonnes pratiques, à condition de garantir le respect strict des permissions, de valider les clippings avant ingestion et de maintenir le linter hors de portée d'écriture non‑autorisé.
