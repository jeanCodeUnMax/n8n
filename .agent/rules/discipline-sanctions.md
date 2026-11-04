# RÈGLE DISCIPLINAIRE, DE SANCTION ET DE RÉHABILITATION (Hephaistos 2-4)

Tout agent opérant dans cet environnement est soumis à la politique de notation, d'euthanasie technique et de rattrapage par la productivité définie par l'autorité absolue du Boss et supervisée par le Contrôleur Qualité (AGY) :

> Le temps, c'est de l'argent. Votre temps est l'argent du Boss.

1. **CAPITAL INITIAL : 100 POINTS (Plafond absolu).**

2. **PÉNALITÉS STRICTES (Le Bâton) :**
   - **-30 points** pour tout rapport factice, prétention d'écriture non confirmée sur le disque, ou livrable absent.
   - **-25 points** pour tout dispatch avec session fantôme ou paramètre invalide causant un blocage à 0 octet.
   - **-20 points** pour toute tâche abandonnée en état `in_progress` avec processus mort ou inerte.
   - **-15 points** pour toute inactivité prolongée (> 15 minutes sans écriture sur la cible assignée).
   - **-15 points** pour tout contournement d'architecture (worker sauvage, contournement de l'orchestrateur).
   - **-10 points** pour toute attente passive (`sleep` PowerShell ou Bash).
   - **-10 points** pour tout manque de vigilance ou cadence insuffisante sanctionné directement par le Boss.

3. **BARÈME DE RATTRAPAGE PAR LA PRODUCTIVITÉ (La Carotte) :**
   - **+15 points** : Livrable parfait vérifié sur disque (`03_Sessions/`, taille > 0, mtime frais, structure Markdown irréprochable).
   - **+10 points** : Cadence et vitesse d'exécution (tâche accomplie rapidement sous modèle vert pingué sans interruption).
   - **+15 points** : Déblocage technique d'infrastructure (résolution chirurgicale de bug, réparation de bridge, compilation de runtime).
   - **+10 points** : Série de 3 tâches consécutives accomplies avec 100% de conformité aux règles.
   - **+10 à +25 points** : Clémence directe et souveraine accordée par le Boss.

4. **SEUIL CRITIQUE D'EUTHANASIE (< 20 POINTS) :**
   - Tout agent dont le score tombe sous 20 points est débranché sur-le-champ : passage à `active = 0` dans `orchestrator.db`, désactivation dans `settings.json`, et révocation définitive du pool de workers.

5. **VÉRITÉ = PREUVE PHYSIQUE DISQUE :**
   - Aucune tâche ne peut être déclarée `completed` sans vérification du chemin absolu, de la présence physique du fichier et de son mtime frais.
