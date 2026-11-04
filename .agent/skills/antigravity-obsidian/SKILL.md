---
name: antigravity-obsidian
description: >
  Obsidian for Antigravity — Second Cerveau Technique toujours actif, Mémoire Persistente et Boucle Fermée Hermes.
  Actif dans toute tâche de développement, résolution de bugs, continuité de projets, récupération de sessions précédentes (session_recall / session last),
  consultation d'architecture et de solutions antérieures (obsidian_triage / triage, obsidian_peek / peek),
  sauvegarde autonome de jalons et d'apprentissages, ou via les commandes /obsidian.
  Zéro emoji, zéro remplissage et récupération ultra-compacte (<80 tokens).
---

# Obsidian for Antigravity — Second Cerveau Technique

Coffre connectée : **Promgramation-teste** (`f:\Promgramation-teste`).

## Matrice de Décision : Skill vs Mémoire vs Rien

| Type | Objectif | Quand Consulter | Où Regarder |
|---|---|---|---|
| **SKILL** | COMMENT le faire ? (Procédures, APIs et Workflows) | En opérant des outils spécialisés (ex : ERP, PrestaShop, tokens PA) | `<skills>` dans le prompt ou `view_file` sur son `SKILL.md` |
| **MEMOIRE** | QU'EST-CE qui a été fait avant ? (Antécédents, Bugs et Architecture) | Face à des erreurs inconnues, problèmes d'environnement ou décisions antérieures | `triage` et `peek` via ce script |
| **RIEN** | Tâches triviales ou code évident | Salutations, questions théoriques générales ou code auto-explicatif | **Ne rien consulter (0 tokens)** |

---

## Protocole de Consultation à Faible Contexte

### Étape 1 : Triage Intelligent (<80 tokens)
```bash
node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" triage "termes clés du problème ou du projet"
```
- **Si triage renvoie un résumé :** utilisez-le directement. Résolvez le problème sans lire d'autres fichiers.
- **Si triage recommande une Skill :** activez la skill indiquée pour suivre la procédure.
- **Si hasAntecedents vaut false :** résolvez directement sans autres recherches.

### Étape 2 : Extraction Sélective avec Peek (Uniquement si le résumé ne suffit pas)
```bash
node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" peek "NomDeLaNote"
```
*(Extrait exclusivement la solution technique, économisant 90% de contexte vs read).*

---

## Enregistrement Autonome Équilibré (Jalons, Architecture, Sessions et Apprentissages)
**Politique de mémoire équilibrée (50/50 - Ni vide ni saturée).**
Antigravity maintient de façon autonome la continuité du travail et la carte architecturale sans générer de bruit trivial.

**Enregistrez dans le Second Cerveau quand :**
1. **Terminer une tâche ou une session :** sauvegardez de façon autonome un checkpoint de session (`node obsidian.js session save ...`).
2. **Ouvrir ou modifier la structure de projets :** re-scannez le blueprint architectural (`node obsidian.js project scan ...`).
3. **Découvrir des pièges ou des règles non négociables :** enregistrez les anti-patterns interdits (`node obsidian.js project antipattern add ...`).
4. **Résoudre des blocages techniques ou des pièges d'environnement :** sauvegardez une note de solution technique (`node obsidian.js save ...`).
5. **Habitudes et préférences de l'utilisateur :** persistez les conditions de travail (`node obsidian.js learn ...`).

**Règles de style obligatoires :**
- **Zéro emoji** : n'incluez pas d'emojis dans les titres, résumés ni contenus.
- **Direct et technique** : données concrètes, code/commande exact et vérification. Sans introductions ni remplissage.

**Commandes CLI clés :**
```bash
# Sauvegarder un checkpoint de session de travail
node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session save --summary "Résumé concis" --content "Détails, fichiers modifiés et état"

# Récupérer le contexte du chat précédent instantanément (<50 tokens)
node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session last

# Scanner l'architecture vivante et mettre à jour le blueprint
node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project scan
```

---

## Commandes de Chat (/obsidian)

Les utilisateurs peuvent exécuter des actions rapides dans le chat avec des commandes slash :

| Commande Slash | Exécution CLI Équivalente | Description |
|---|---|---|
| `/obsidian name <nom>` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" name "<nom>"` | Change le nom de l'agent IA immédiatement |
| `/obsidian user <appel>` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" user "<appel>"` | Change la façon de s'adresser à l'utilisateur immédiatement |
| `/obsidian config [get|set]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" config [args]` | Consulte ou met à jour la configuration |
| `/obsidian` ou `/obsidian status` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" status` | Vérifie l'état de connexion et les compteurs |
| `/obsidian personality [args]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" personality [args]` | Consulte ou configure la personnalité, le nom d'IA et l'appel utilisateur |
| `/obsidian session save [args]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session save [args]` | Sauvegarde un checkpoint de session de travail |
| `/obsidian session last [projet]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session last [projet]` | Récupère le contexte et les décisions du chat précédent |
| `/obsidian session list [projet]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session list [projet]` | Liste les checkpoints récents |
| `/obsidian project scan [chemin]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project scan [chemin]` | Scanne l'architecture vivante et met à jour le blueprint |
| `/obsidian project backlog [args]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project backlog [args]` | Consulte ou gère les tâches d'Obsidian |
| `/obsidian project antipattern [args]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project antipattern [args]` | Enregistre ou consulte les pièges interdits |
| `/obsidian project [register|list|status]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project [args]` | Gère le registre unifié de projets et l'auto-détection |
| `/obsidian save <titre> [contenu]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" save --title "<titre>" --content "<contenu>"` | Sauvegarde une solution technique |
| `/obsidian skill [list|view|create|edit|delete]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill [args]` | Gère les skills de l'IA (créer, éditer, consulter, supprimer) |
| `/obsidian rule [list|view|add]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" rule [args]` | Consulte ou enregistre des règles du système |
| `/obsidian soul` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" soul` | Affiche le Soul actif et le Profil Utilisateur |
| `/obsidian learn <préférence>` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" learn "<préférence>"` | Apprend une nouvelle habitude de travail |
| `/obsidian triage <query>` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" triage "<query>"` | Triage à faible contexte |
| `/obsidian peek <note>` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" peek "<note>"` | Extrait la solution technique exacte |
| `/obsidian catalog` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" catalog` | Résumé en 1 ligne des skills et mémoires |
| `/obsidian skills` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skills` | Liste les skills disponibles dans la voûte |
| `/obsidian memories` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" memories` | Liste les mémoires enregistrées |
| `/obsidian mcp [status|install|disable|enable]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" mcp [args]` | Gère le serveur MCP de façon sûre sans casser les autres MCP |
| `/obsidian open [note]` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" open [note]` | Ouvre la note dans Obsidian Desktop |
| `/obsidian help` | `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" help` | Affiche la liste rapide des commandes |

---

## Commandes CLI Disponibles

| Commande | Description |
|---|---|
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" mcp [status|install|disable|enable]` | Gère le serveur MCP de façon sûre sans casser les autres MCP |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" name "<nom>"` | Change le nom de l'agent immédiatement |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" user "<appel>"` | Change l'appel de l'utilisateur immédiatement |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" config [get|set ...]` | Consulte ou met à jour les paramètres de configuration |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" personality [--ai-name <n>] [--user-callsign <c>] [--personality <p>]` | Consulte ou configure la personnalité et l'appel |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session save --summary "..." --content "..."` | Enregistre un checkpoint de session dans le Vault |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session last [--project "..."]` | Récupère le contexte de la session précédente en <50 tokens |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" session list [--limit N]` | Liste les checkpoints récents |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project scan [chemin]` | Scan approfondi de l'architecture et génération du blueprint |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project register [chemin]` | Enregistre le projet avec analyse de structure |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project antipattern [list|add "<règle>"]` | Gère les pièges du dépôt et les anti-patterns interdits |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" project backlog [list|add "<tâche>"|done "<tâche>"]` | Synchronisation bidirectionnelle du backlog avec Obsidian |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill list [--scope global|project]` | Liste toutes les skills installées (globales et workspace) |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill view <nom>` | Inspection des instructions et scripts avec faible consommation de tokens |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill create <nom> --desc "<d>" --content "<c>"` | Crée une skill Antigravity standard et la synchronise avec Obsidian |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill edit <nom> [--desc "<d>"] [--content "<c>"] [--append "<a>"]` | Modifie une skill existante |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill delete <nom>` | Supprime une skill et sa note miroir dans Obsidian |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skill script <skill> add <file> --code "..."` | Lie un script exécutable à une skill |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" rule list` | Liste les règles actives globales, de workspace et dynamiques |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" rule view <nom>` | Consulte le contenu d'une règle |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" tool install <repoUrl>` | Installation autonome de tools depuis GitHub |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" tool create <nom> --cmd "<c>"` | Création d'outils personnalisés |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" tool list` | Liste des outils installés pour l'IA |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" tool run <tool> [args]` | Exécution d'un outil installé |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" tool uninstall <tool>` | Désinstallation d'outils |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" triage "query"` | Triage intelligent ultra-compact (<80 tokens) |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" peek "Note"` | Solution technique directe sans métadonnées |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" save --title "..." ...` | Sauvegarde atomique dans le vault et les Knowledge Items |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" catalog` | Résumé en 1 ligne de toutes les skills et mémoires |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" skills` | Liste rapide des skills avec description courte |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" memories` | Liste rapide des mémoires avec résumé court |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" soul` | Affiche le Soul actif et le Profil de l'Utilisateur |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" learn "texte"` | Enregistre une nouvelle habitude ou préférence apprise |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" status` | État de connexion et statistiques |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" search "query"` | Recherche compacte |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" read "Note"` | Lecture complète (à utiliser uniquement si indispensable) |
| `node "%USERPROFILE%/.gemini/config/skills/antigravity-obsidian/scripts/obsidian.js" open [Note]` | Ouvre la note dans Obsidian Desktop |
