#!/usr/bin/env bash
# install-hermes-context-menu.sh
# Ajoute "Ouvrir avec Hermès" au menu contextuel Windows (clic droit sur dossiers + fichiers)
# Usage: bash install-hermes-context-menu.sh [--remove] [--path <chemin_vers_hermes>]
#
# Fonctionne sur Windows avec Git Bash / MSYS.
# Nécessite l'exécution en administrateur pour modifier le registre.

set -e

HERMES_EXE=""
REMOVE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --remove)
            REMOVE=true
            shift
            ;;
        --path)
            HERMES_EXE="$2"
            shift 2
            ;;
        *)
            echo "Usage: $0 [--remove] [--path <chemin_vers_hermes>]"
            echo "  --remove   : Supprime l'entrée du menu contextuel"
            echo "  --path     : Chemin vers l'exécutable Hermès (optionnel)"
            exit 1
            ;;
    esac
done

# Détecter automatiquement le chemin vers Hermès si non spécifié
if [ -z "$HERMES_EXE" ]; then
    if [ -n "$HERMES_HOME" ]; then
        HERMES_EXE="$HERMES_HOME/hermes-agent/bin/hermes"
    elif [ -d "/<USERPROFILE>/AppData/Local/hermes/hermes-agent" ]; then
        HERMES_EXE="/<USERPROFILE>/AppData/Local/hermes/hermes-agent/bin/hermes"
    elif command -v hermes &>/dev/null; then
        HERMES_EXE="$(command -v hermes)"
    else
        echo "ERREUR: HERMES_EXE non spécifié et non détecté automatiquement."
        echo "Utilisez --path pour spécifier le chemin vers l'exécutable Hermès."
        exit 1
    fi
    if [ ! -x "$HERMES_EXE" ]; then
        echo "ERREUR: Exécutable non trouvé ou non exécutable: $HERMES_EXE"
        exit 1
    fi
fi

# Convertir le chemin en format Windows natif pour le registre
HERMES_WIN_PATH=$(cygpath -w "$HERMES_EXE" 2>/dev/null || echo "$HERMES_EXE" | sed 's|^/c/|C:/|; s|^/|/|')

echo "Chemin Hermès: $HERMES_WIN_PATH"

if [ "$REMOVE" = true ]; then
    echo "Suppression de l'entrée 'Ouvrir avec Hermès' du registre..."
    reg delete "HKCU\Software\Classes\Directory\shell\OpenWithHermes" /f 2>/dev/null && echo "  Dossier: supprimé"
    reg delete "HKCU\Software\Classes\Directory\Background\shell\OpenWithHermes" /f 2>/dev/null && echo "  Arrière-plan dossier: supprimé"
    reg delete "HKCU\Software\Classes\*\shell\OpenWithHermes" /f 2>/dev/null && echo "  Fichier: supprimé"
    echo "Terminé."
    exit 0
fi

echo "Installation de l'entrée 'Ouvrir avec Hermès' dans le registre..."

# -------------------------------------------------------
# 1. MENU CONTEXTE DOSSIER (clic droit sur un dossier)
# -------------------------------------------------------
echo "  + Menu contextuel: Dossier"
reg add "HKCU\Software\Classes\Directory\shell\OpenWithHermes" /ve /t REG_SZ /d "Ouvrir avec Hermès" /f 2>/dev/null
reg add "HKCU\Software\Classes\Directory\shell\OpenWithHermes" /v "Icon" /t REG_SZ /d "\"$HERMES_WIN_PATH\",0" /f 2>/dev/null
# --in "%1" : change dans le dossier avant de démarrer
reg add "HKCU\Software\Classes\Directory\shell\OpenWithHermes\command" /ve /t REG_SZ /d "\"$HERMES_WIN_PATH\" --in \"%1\"" /f 2>/dev/null

# -------------------------------------------------------
# 2. MENU CONTEXTE ARRIÈRE-PLAN DOSSIER (clic droit sur espace vide dans l'explorateur)
# -------------------------------------------------------
echo "  + Menu contextuel: Arrière-plan dossier"
reg add "HKCU\Software\Classes\Directory\Background\shell\OpenWithHermes" /ve /t REG_SZ /d "Ouvrir avec Hermès ici" /f 2>/dev/null
# %V = chemin du dossier où le clic droit a eu lieu (arrière-plan)
reg add "HKCU\Software\Classes\Directory\Background\shell\OpenWithHermes\command" /ve /t REG_SZ /d "\"$HERMES_WIN_PATH\" --in \"%V\"" /f 2>/dev/null

# -------------------------------------------------------
# 3. MENU CONTEXTE FICHIER (clic droit sur un fichier)
# -------------------------------------------------------
echo "  + Menu contextuel: Fichier"
reg add "HKCU\Software\Classes\*\shell\OpenWithHermes" /ve /t REG_SZ /d "Ouvrir avec Hermès" /f 2>/dev/null
# Ouvre Hermes dans le répertoire du fichier
reg add "HKCU\Software\Classes\*\shell\OpenWithHermes\command" /ve /t REG_SZ /d "\"$HERMES_WIN_PATH\" --in \"%1\"" /f 2>/dev/null

echo ""
echo "✅ Menu contextuel 'Ouvrir avec Hermès' ajouté avec succès."
echo ""
echo "  Clic droit sur un dossier → Ouvrir avec Hermès"
echo "  Clic droit sur l'arrière-plan d'un dossier → Ouvrir avec Hermès ici"
echo "  Clic droit sur un fichier → Ouvrir avec Hermès"
echo ""
echo "Redémarrez l'Explorateur Windows (ou reconnectez le bureau) pour voir les changements."
echo ""
echo "Pour supprimer: bash install-hermes-context-menu.sh --remove"
