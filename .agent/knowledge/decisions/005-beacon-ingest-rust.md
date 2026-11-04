# ADR-005: Ingestion Beacon vers mémoire HPHE en Rust

## Statut

IMPLÉMENTÉ DANS LA SOURCE — décision utilisateur « source seulement »; runtime non déployé et ingestion désactivée.

## Contexte

L’ancien `beacon_ingest.py` dépendait du pipeline Python/Qdrant/Zvec archivé. `BeaconCollector` écrit le journal JSONL, mais le MCP Beacon n’expose pas d’écriture de mémoire approuvée. Le flag `.agent/scripts/ingestion.config.json::beacon.enabled` est désactivé et le journal observé n’a pas été modifié depuis le 2026-10-10.

## Décision

1. Ajouter le parsing/filtrage/digest Beacon dans `hphe-kit::beacon` et exposer `hphe-mcp beacon_ingest`.
2. Filtrer les événements au workspace explicite; traiter le JSONL par offset, uniquement sur lignes complètes; reprendre les lots incomplets avec des clés de mémoire stables et un état de progression. L’état runtime est `.agent/scripts/.beacon-offset-state.json`; au premier passage, l’offset de `.beacon-offset.json` est importé sans modifier ce fichier suivi par Git.
3. Masquer les valeurs de secrets courants, omettre les commandes brutes et ne pas conserver l’ID de session en clair dans le digest.
4. Écrire les digests par le store mémoire HPHE existant. Les écritures du store sont protégées par un verrou fichier interprocessus (`fs4`) en plus du mutex local.
5. Le tool est en lecture seule par défaut (`dryRun: true`). `beacon-sync.ps1` appelle le binaire Rust et respecte `beacon.enabled`; par décision utilisateur, le dépôt reste en mode source seulement, sans déploiement ni activation. Toute évolution runtime exige une nouvelle autorisation. Le journal des offsets est protégé par un verrou fichier, et les écritures mémoire sont sérialisées avec `fs4` entre processus.
6. Ne pas réactiver l’ancien pipeline Python et ne pas prétendre que la mémoire Beacon approuvée est écrite par le MCP Beacon.

## Conséquences

- La distillation ne requiert ni réseau, ni clé modèle, ni embedding NIM.
- Un log Beacon absent, périmé ou sans événements du workspace produit un rapport sans écriture.
- `beacon_ingest` est ajouté au registre MCP; le total documenté devient 58 outils.
- La capture de la session courante dépend toujours du collecteur Beacon. Le port Rust ne peut pas ingérer des événements qui n’ont pas été capturés.
- Le binaire installé dans `<INSTALL_ROOT>\extension\server\` n’est pas modifié par les tests source; il faut le déployer avant toute activation.

## Vérification

- Tests unitaires Rust : parsing JSONL complet/partiel, lignes malformées, périmètre workspace, redaction, idempotence, reprise de lots, dry-run et écriture dans le store mémoire.
- Test d’intégration MCP : le tool doit être publié avec `workspace`/`projectId` requis et `dryRun` vrai par défaut.
- La configuration `beacon.enabled` reste `false` jusqu’à l’étape distincte d’activation.

## Références

- Runbook : `docs/protocole-binome/README.md` § Beacon et mémoire durable
- Code : `hphe/crates/hphe-kit/src/beacon.rs`, `hphe/crates/hphe-kit/src/memory.rs`
- Tool MCP : `hphe/crates/hphe-mcp/src/tools/kit.rs`
- Wrapper : `.agent/scripts/beacon-sync.ps1`
