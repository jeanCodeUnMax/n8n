#!/usr/bin/env python3
"""
test_hermès_injection.py — Vérifie que la couche d'intégration Hermès fonctionne.

Ce script crée un projet de test, lance l'injection, et vérifie les résultats.
Ne modifie pas le projet réel Hephaistos2-Kit.
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path

# Chemins
HERPHESTOS_KIT = Path(r"<KIT_PARENT>\Hephaistos2-Kit")
HERMES_INIT = HERPHESTOS_KIT / ".agent" / "hermes" / "hermes-init.ps1"
TEST_PROJECT = Path(r"<KIT_PARENT>\test-hermès-injection")

def run_powershell(script, args=None):
    """Exécute un script PowerShell et retourne la sortie."""
    cmd = ["pwsh", "-File", str(script)]
    if args:
        cmd.extend(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, encoding='utf-8', errors='replace')
    return result.stdout, result.stderr, result.returncode

def main():
    print("=" * 60)
    print("TEST D'INTÉGRATION HERMÈS — Hephaistos2-Kit")
    print("=" * 60)
    
    # 1. Nettoyer le projet de test s'il existe
    print(f"\n[0/7] Nettoyage du projet de test...")
    if TEST_PROJECT.exists():
        shutil.rmtree(TEST_PROJECT)
        print(f"  ✓ Supprimé: {TEST_PROJECT}")
    
    # 2. Créer un projet de test vide
    print(f"\n[1/7] Création du projet de test...")
    TEST_PROJECT.mkdir(parents=True, exist_ok=True)
    print(f"  ✓ Créé: {TEST_PROJECT}")
    
    # 3. Vérifier que le script d'injection existe
    print(f"\n[2/7] Vérification du script d'injection...")
    if not HERPHESTOS_KIT.exists():
        print(f"  ✗ Hephaistos2-Kit introuvable: {HERPHESTOS_KIT}")
        return 1
    if not HERPHESTOS_KIT.joinpath(".agent/hermes/hermes-init.ps1").exists():
        print(f"  ✗ Script d'injection introuvable")
        return 1
    print(f"  ✓ Script trouvé: {HERMES_INIT}")
    
    # 4. Lancer l'injection
    print(f"\n[3/7] Lancement de l'injection...")
    stdout, stderr, rc = run_powershell(
        HERMES_INIT,
        ["-ProjectPath", str(TEST_PROJECT), "-ProjectId", "test-hermès-injection", "-DbRoot", "<HEPHAISTOS_DATA>"]
    )
    print(f"  Sortie:\n{stdout}")
    if stderr:
        print(f"  Erreurs:\n{stderr}")
    if rc != 0:
        print(f"  ✗ Script retourné {rc}")
        return rc
    print(f"  ✓ Injection terminée (exit={rc})")
    
    # 5. Vérifier .env
    print(f"\n[4/7] Vérification de .env...")
    env_file = TEST_PROJECT / ".env"
    if not env_file.exists():
        print(f"  ✗ .env non créé")
        return 1
    content = env_file.read_text()
    if "AGENT_DB_ROOT=<HEPHAISTOS_DATA>" in content and "PROJECT_ID=test-hermès-injection" in content:
        print(f"  ✓ .env correct:")
        for line in content.strip().split("\n"):
            print(f"    {line}")
    else:
        print(f"  ✗ .env incorrect:")
        print(f"    {content}")
        return 1
    
    # 6. Vérifier AGENTS.md
    print(f"\n[5/7] Vérification de AGENTS.md...")
    agents_file = TEST_PROJECT / "AGENTS.md"
    if not agents_file.exists():
        print(f"  ✗ AGENTS.md non créé")
        return 1
    content = agents_file.read_text()
    if "CONNEXION AUX MCP UNIFIÉS" in content and "Memory" in content:
        print(f"  ✓ AGENTS.md créé ({len(content)} chars)")
        print(f"    Contient: MCP unifiés, mémoire unifiée, règles projet")
    else:
        print(f"  ✗ AGENTS.md incomplet")
        return 1
    
    # 7. Vérifier la structure .agent/hermes/
    print(f"\n[6/7] Vérification de la structure Hermès...")
    hermes_dir = TEST_PROJECT / ".agent" / "hermes"
    if not hermes_dir.exists():
        print(f"  ✗ .agent/hermes/ non créé")
        return 1
    
    expected = {
        "templates/AGENTS.md": "Template AGENTS.md",
        "templates/SOUL.hermes.md": "Template SOUL.hermes.md",
        "README.md": "Documentation",
        "hermes-init.ps1": "Script d'injection",
    }
    
    for rel_path, description in expected.items():
        full_path = hermes_dir / rel_path
        if full_path.exists():
            print(f"  ✓ {rel_path} ({description})")
        else:
            print(f"  ✗ {rel_path} MISSING")
            return 1
    
    # 8. Vérifier memory-database/
    print(f"\n[7/7] Vérification de memory-database/...")
    memory_db = TEST_PROJECT / "memory-database"
    if not memory_db.exists():
        print(f"  ✗ memory-database/ non créé")
        return 1
    
    subdirs = [d for d in memory_db.iterdir() if d.is_dir()]
    print(f"  ✓ memory-database/ créé avec {len(subdirs)} sous-dossiers:")
    for d in subdirs:
        print(f"    - {d.name}/")
    
    # Vérifier la junction
    try:
        import ctypes
        # Sur Windows, vérifier si c'est une junction
        if memory_db.exists():
            attributes = ctypes.windll.kernel32.GetFileAttributesW(str(memory_db))
            if attributes & 0x400:  # FILE_ATTRIBUTE_REPARSE_POINT
                print(f"  ✓ Junction détectée vers: {memory_db}")
    except Exception:
        # Alternative: vérifier avec ls -la
        pass
    
    # Résumé
    print(f"\n{'='*60}")
    print("TEST TERMINÉ — TOUS LES CHECKS PASSÉS")
    print(f"{'='*60}")
    print(f"\nRésultat:")
    print(f"  ✓ Projet de test créé: {TEST_PROJECT}")
    print(f"  ✓ Injection Hermès exécutée avec succès")
    print(f"  ✓ Tous les fichiers vérifiés")
    print(f"\nLe projet de test reste disponible pour inspection:")
    print(f"  {TEST_PROJECT}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
