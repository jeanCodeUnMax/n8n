# Regle : suspicion d'injection malicieuse sur anomalies d'encodage

- Toute problematique de caractere invisible, de probleme ASCII ou d'encodage UTF-8 detectee dans un fichier (diagnostics IDE, parse error inexplicable, affichage corrompu) doit etre consideree EN PREMIER LIEU avec suspicion comme une injection malicieuse.
- La preuve d'innocence doit etre faite AVANT TOUTE CHOSE, avant de conclure a un faux positif, une corruption benigne ou un bug de l'outil. Ne jamais traiter comme incident trivial sans verification.
- Protocole de preuve minimal (sur le fichier incrimine) :
  1. Enumerer chaque codepoint : verifier que seuls les caracteres attendus sont presents (ex: ASCII imprimable 32-126 + tab/CR/LF pour un .ps1).
  2. Rechercher les caracteres bidi (U+202A..U+202E, U+2066..U+2069), zero-width (U+200B..U+200D, U+2060, U+FEFF), controle (ESC, NUL, BEL) et homoglyphes non-ASCII.
  3. Sous Windows, lister les flux ADS du fichier (`Get-Item -Stream *`) : un seul `:$DATA` attendu.
  4. Scanner les patterns dangereux : IEX/Invoke-Expression, base64, download cradles (WebClient, DownloadString), URLs, ecritures registre, persistance (schtasks, services, startup), desactivation de defenses.
  5. Detecter les anomalies structurelles : lignes anormalement longues, segments minifies, donnees appendices apres le contenu nominal.
  6. Comparer au baseline de confiance (`git diff` / `git show HEAD:`) : toute modification non expliquee est suspecte.
  7. Valider avec le parseur officiel du langage (ex: `[System.Management.Automation.Language.Parser]::ParseFile` pour PowerShell).
- Rendre compte du verdict avec les elements de preuve (ce qui a ete teste, ce qui a ete trouve). N'annoncer "faux positif" qu'apres execution du protocole, pas sur la base d'une simple lecture visuelle.
