---
name: hephaistos-everything
description: "Playbook opérationnel de recherche NTFS instantanée via Hephaistos-everything-search ($MFT + journal USN). Découverte ultra-véloce de fichiers, artefacts, logs et répertoires en <50ms sur ~6,4M d'entrées sans Everything.exe ni scans récursifs lents. Rattaché au skill hephaistos2-kit."
triggers:
  - everything
  - everything-search
  - hphe-index
  - hephaistos-everything
  - search-files
  - /everything
---

# `hephaistos-everything` — Recherche NTFS Instantanée & Découverte de Fichiers

> Ce skill est le **module spécialisé de repérage et de localisation instantanée** de l'écosystème Hephaistos2-Kit.
> Il est rattaché directement au skill maître `hephaistos2-kit`.
> **Règle impérative :** Face à toute recherche de fichier, ZIP, log, clé ou répertoire, tout agent DOIT utiliser ce protocole et bannir définitivement les commandes récursives lentes du système hôte.

---

## 1. Principes Techniques Fondamentaux ($MFT + USN en Rust)

1. **Zéro Dépendance à Everything.exe :**
   - Le moteur de recherche est un démon Windows SYSTEM natif écrit en Rust : `hphe-indexd.exe`.
   - Il lit directement la **Master File Table ($MFT)** et écoute le journal des modifications NTFS (USN Journal) en temps réel.
2. **Performance Instantanée (<50 ms) :**
   - L'indexation couvre la totalité des volumes NTFS (~6,4 millions d'entrées).
   - Les requêtes transitent par le Named Pipe IPC sécurisé : `\\.\pipe\hphe-index`.
   - Aucun parcours d'arbre disque traditionnel n'est effectué lors de la recherche.
3. **Interdiction Formelle des Scans Récursifs :**
   - **PROSCRIT :** `Get-ChildItem -Recurse`, `dir /s`, `find /`, scripts Python parcourant `os.walk` sur les disques entiers.
   - Ces commandes bloquent les agents, génèrent des timeouts IPC (10000ms) et gaspillent du CPU et des tokens.

---

## 2. Répertoire des Outils MCP de Recherche (`Hephaistos-everything-search`)

| Outil MCP | Paramètres Clés | Rôle & Usage Opérationnel |
| :--- | :--- | :--- |
| `everything_search` | `query: "<filtre>"`, `offset: 0` | Recherche instantanée par nom, extension ou motif. Renvoie les chemins complets, tailles et dates. |
| `search_files` | `pattern: "<pattern>"`, `max_results: 50` | Alias simplifié orienté fichier pour découverte rapide. |
| `everything_count` | `query: "<filtre>"` | Renvoie uniquement le nombre d'occurrences sans transférer la liste (idéal pour tester l'existence). |
| `everything_categories` | Aucun | Retourne les catégories de filtres Everything prédéfinies (`audio:`, `document:`, `exe:`, `zip:`). |
| `everything_index_stats` | Aucun | État de santé de l'index NTFS (nombre total de fichiers/dossiers indexés, RAM, pipe). |
| `everything_refresh` | Aucun | Force la synchronisation immédiate de l'index avec le journal USN. |
| `resolve_path` | `id: <row_id>` | Résout l'identifiant interne de ligne vers son chemin absolu sur disque. |
| `hphe_health` | Aucun | Vérifie la connectivité au serveur Rust et la disponibilité du named pipe. |

---

## 3. Syntaxe des Requêtes `everything_search`

Les requêtes supportent une syntaxe puissante pour cibler immédiatement les artefacts recherchés :

### A. Filtrage par Extension
```text
ext:zip                -> Tous les fichiers .zip
ext:md                 -> Tous les fichiers Markdown
ext:json               -> Tous les fichiers JSON
ext:py;ps1;js          -> Fichiers Python, PowerShell ou JavaScript
```

### B. Recherche de Fichiers Récents ou Ciblés
```text
cleananything          -> Fichiers ou dossiers contenant "cleananything"
telegram ext:zip       -> Fichiers zip contenant "telegram" dans leur nom
harness 7zip           -> Fichiers associant "harness" et "7zip"
comms.jsonl            -> Fichier exact de communication binôme
```

### C. Ciblage par Répertoire
```text
"CLI-Anything" ext:py  -> Fichiers Python situés dans un sous-dossier de CLI-Anything
"doc_Obsidian" ext:md  -> Fichiers Markdown du Vault Obsidian
```

---

## 4. Recherche de Contenu Plein-Texte et Hybride

Si la recherche porte sur le **contenu textuel** à l'intérieur des fichiers (et non sur le nom de fichier) :
1. `content_search(query: "<termes>")` : Recherche BM25 plein-texte indexée par Tantivy.
2. `hybrid_search(query: "<termes>")` : Fusion tri-modale (Nom de fichier NTFS + BM25 Tantivy + Vecteurs USearch).

---

## 5. Procédure Réflexe pour tout Agent (Tango, Cash & Bleubits)

Lorsqu'un ordre utilisateur demande de « récupérer un zip », « trouver une clé », « inspecter un log » ou « localiser un projet » :

1. **Étape 1 :** Appeler `everything_search(query: "<nom_ou_motif>")`.
2. **Étape 2 :** Examiner la liste retournée (<50ms).
3. **Étape 3 :** Opérer directement sur le chemin absolu retourné.
4. **Erreur Interdite :** Ne jamais lancer de boucle de recherche exploratoire PowerShell dans le terminal.

---

## Voir aussi
- [[hephaistos2-kit]]
- [[binome]]
- [[jointes]]
- [[00 Antigravity Hub]]
