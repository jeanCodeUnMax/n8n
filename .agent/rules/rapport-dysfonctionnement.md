# Regle Obligatoire : Rapport de Dysfonctionnement et Correction

Tout dysfonctionnement, blocage, echec de worker, anomalie d'orchestration, bug MCP/extension ou correction structurelle appliquee dans le depot `hephaistos2-kit` DOIT obligatoirement faire l'objet d'un rapport detaille en Markdown dans le repertoire dedie :

`c:\Program Files\Projet-complet\hephaistos2-kit\Rapport de dysfonctionnement et correction\`

## Exigences de redaction
1. **Format :** Fichier Markdown (`.md`) horodate ou numerote (ex: `01-dysfonctionnement-nim-worker-templates.md`, `INDEX-RAPPORTS.md`), strictement SANS EMOJI.
2. **Contenu obligatoire de chaque rapport :**
   - **Identifiant et Date** (Taches concernees `#id`, composant impacte, agent detecteur et agent correcteur).
   - **Symptome et Dysfonctionnement observe** (logs, erreurs, livrables factices, timeouts, contournements de gates).
   - **Analyse de la Cause Racine (Root Cause)** (fichier, ligne, table SQLite, processus memoire).
   - **Correction appliquee** (diff, migration SQL, modification de code Rust/JS, mise a jour de rule/skill).
   - **Verification et Prevention** (tests executes, garde-fous ajoutes pour empecher toute recidive).
3. **Diffusion et Responsabilite :**
   - L'orchestrateur (Tango) confie la transcription et la tenue a jour de ce repertoire a un agent dedie (Bleubite ou worker Cloud sous controle) et verifie chaque rapport.
   - Tous les collaborateurs (Cash, Luna, Bleubites, workers Cloud) sont tenus de documenter ou signaler leurs corrections pour transcription immediate dans ce repertoire.
4. **Repartition de charge :**
   - L'orchestrateur ne redige pas lui-meme le code des taches workers et priorise systematiquement les workers Cloud (`nim1`, `nim2`, `ollama-cloud`) via `dispatch_task` avant de solliciter les collaborateurs ACP.
