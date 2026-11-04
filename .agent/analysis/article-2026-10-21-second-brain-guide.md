# SOURCE — Article analysé par le SWAT

- Auteur : Brucky (@danikkk_wqs)
- Publié : 21 oct. 2026 (X Article, 177K vues)
- URL : https://x.com/danikkk_wqs/status/2113001913662734619
- Titre : « The Second Brain Guide: How to Stop Re-Explaining Yourself to Claude (Full Build) »

---

## Résumé complet de l'article (extrait fidèle du contenu récupéré)

### Idée centrale (pattern Karpathy, avril 2026)

Le pattern « second brain » inverse le RAG : au lieu que le modèle redécouvre
la connaissance à chaque question, il **construit et maintient un wiki de pages
markdown liées** entre l'utilisateur et ses sources.

Formule : « Obsidian is the IDE, the LLM is the programmer, the wiki is the codebase. »

Trois couches :
- `raw/` : les sources. Le modèle lit, n'édite jamais.
- `wiki/` : les pages que le modèle écrit et maintient.
- `CLAUDE.md` : les règles (conventions et workflows).

Trois opérations : **ingest** (une source → intégrée dans 10-15 pages),
**query** (question → réponse, bonnes réponses re-fichées en pages),
**lint** (contradictions, claims périmés, orphelins).

Publié comme « idea file » volontairement : partager l'idée vaut plus que
partager du code, car chaque agent le construit pour ses besoins.

### Step 1 — Build en 10 minutes

```bash
mkdir -p brain/{raw,wiki,output,.brain}
cd brain && git init
claude
```

Pas besoin du plugin Local REST API / MCP Obsidian — seulement pour parler à
un Obsidian qui tourne. Le modèle écrit `CLAUDE.md` en interviewant l'utilisateur.

Prompts types fournis : ingest (« Read it, write a page for each major concept,
link it, flag contradictions »), query (« Read wiki/index.md first, open only
needed pages, cite page names »), lint (« report only, fix nothing »).

Règles de nommage : un fichier = un sujet ; nom de fichier = contenu ;
lowercase-hyphens. Un projet = dossier Inputs/Process/Outputs/Feedback +
son propre CLAUDE.md (ce que c'est, le but unique, ce que « done » veut dire).

### Step 2 — Repos prêts à l'emploi (vérifiés sur GitHub)

- claude-obsidian (AgriciDaniel) : 15.0k stars, MIT, commandes /wiki-ingest etc.
- obsidian-second-brain (eugeniughelbur) : 4.8k stars, 48 commandes multi-agents.
- obsidian-skills (kepano) : 49.8k stars, formats natifs Obsidian.
- second-brain-starter (coleam00) : 795 stars, skill d'interview → plan 9 phases.

### Step 3 — UN cerveau pour tous les projets

« The best idea in the whole stack » : ne pas faire un second brain par projet ;
pointer chaque projet vers le **même vault**. Bloc CLAUDE.md par projet :

```
## Wiki Knowledge Base
Path: ~/path/to/vault
When you need context not already in this project:
1. Read wiki/hot.md first (recent context cache)
2. If not enough, read wiki/index.md
3. If you need domain details, read the relevant domain sub-index
4. Only then drill into specific wiki pages
Do NOT read the wiki for general coding questions.
```

`hot.md` = douzaine de lignes : travail en cours, derniers changements,
questions ouvertes. Ne PAS importer le gros index via @index.md (les imports
se chargent au lancement et coûtent autant que le fichier collé).

### Step 4 — Test suite déterministe (le point faible corrigé)

« The model writes the wiki, and the same model checks it. » → sortir la
vérification du modèle. Script `brain.py` (95 lignes, stdlib only, zéro LLM) :

- chaque page a `title`, `sources`, `updated` en frontmatter
- chaque source listée existe
- chaque `[[link]]` résout
- pas d'orphelins, pas de TODO restant
- raw modifié après ingest → pages périmées listées (manifest sha256)
- **chaque citation existe mot pour mot dans le raw cité** (`> "text" — raw/x.md`)

Test réel : 7 problèmes détectés en millisecondes, zéro tokens, dont une
fausse affirmation plausible (« Bush invented hypertext in 1941 ») qu'un
review par LLM aurait laissée passer.

Le manifest rend l'ingest incrémental : `brain.py status` = NEW/CHANGED/DELETED
→ coût proportionnel au changement, pas à la taille du vault.

### Step 5 — Câblage dans Claude Code (enforcement, pas suggestion)

`.claude/settings.json` :

```json
{
  "permissions": { "deny": ["Edit(/raw/**)", "Read(./.env)"] },
  "hooks": {
    "SessionStart": [{"matcher":"startup|resume|clear|compact","hooks":[...session-start.sh]}],
    "PostToolUse": [{"matcher":"Edit|Write","hooks":[...post-wiki-edit.sh]}]
  }
}
```

Faits clés : `Edit(/raw/**)` est relatif à la racine projet ; les règles path
ne s'appliquent qu'à Edit/Read. raw/ devient read-only **par configuration,
pas par prompt** (« keys, not prompts » — CLAUDE.md est du contexte, pas de
l'enforcement). Limite : les deny rules ne couvrent pas un script Python qui
ouvre les fichiers lui-même → sandbox pour un mur dur.

Hook PostToolUse : après chaque edit sous wiki/, `brain.py lint` tourne ;
exit 2 ne peut pas annuler l'edit mais le texte d'erreur revient au modèle
dans le même tour → auto-correction immédiate.

Hook SessionStart : injecte `wiki/hot.md` + `brain.py status` (pending ingest)
dans le contexte avant le premier prompt ; survit à /clear.

Skill `/ingest` avec `disable-model-invocation: true` (déclenchement humain
pour quelque chose qui réécrit des fichiers). Commit git après chaque ingest
→ le diff montre ce que le modèle a changé ; revert = une commande.

### Step 6 — Autopilot

`claude -p "/ingest"` en cron/CI (non-interactif, exit non-zero sur échec).
Attention `--bare` : ne charge ni hooks ni skills ni CLAUDE.md. Pour 40 sources
d'un coup : un subagent par source sur modèle moins cher (les subagents ne
renvoient qu'un résumé), puis un vérificateur dans un contexte frais avec une
seule question : « does every statement follow from this source? ».

Web clippings : 3 défenses = deny sur raw/, quote check, git diff.

### Où ça casse (honnêteté de l'auteur)

- Dead zone : <50-100 sources, le wiki ne vaut qu'un bon moteur de recherche.
- Bad sources spread : une source fausse touche 10-15 pages → manifest +
  quote check + diff existent pour ça.
- Scale : limite ~50-100k tokens de contenu compilé dans une fenêtre
  (critique émise par un vendeur concurrent — à peser).
- Pas de lifecycle : pas de signal de fraîcheur d'une page ; lint doit être
  déclenché volontairement.
- Le linter vérifie structure et citations, pas la vérité.
- Auto-memory Claude Code : seulement 200 lignes / 25KB de MEMORY.md →
  garder le hot cache court.

### Ce que le mois 3 donne

Semaine 1 : 5 pages, petit graphe. Passé le seuil de densité, les recherches
retournent des connexions non créées à la main. Mois 6 : chaque session
reprend où la précédente s'est arrêtée — avantage structurel.

### Annexe — brain.py (95 lignes, stdlib)

Commandes : `status` | `done <raw> <wiki...>` | `lint` | `index`.
Manifest sha256 `.brain/manifest.json`. Regex de citation :
`^>\s*"(.+?)"\s*[—–-]+\s*(raw/\S+)` → vérifie la citation normalisée (espaces)
dans le raw. Vérifie frontmatter, sources existantes, liens [[ ]] résolus,
inbound links (orphelins), TODO, raw modifiés → pages stale.
