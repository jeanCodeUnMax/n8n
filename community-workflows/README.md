# Base de workflows communautaires n8n

État au 31 octobre 2026 : 4 workflows JSON copiés et indexés. Chaque JSON conserve les nodes, connexions et paramètres fournis par la source. Le contenu n'a pas été exécuté ni audité de manière exhaustive.

- [Index JSON](index.json)
- [Collection Zie619](https://github.com/Zie619/n8n-workflows) : licence MIT déclarée pour la collection, texte conservé dans [sources/Zie619-LICENSE](sources/Zie619-LICENSE). Des éléments peuvent provenir d'autres auteurs ; vérifier leurs conditions propres avant redistribution ou usage commercial.
- [Collection murataslan1](https://github.com/murataslan1/n8n-workflow-collection) : annonce plus de 4 300 workflows ; pas encore importés.
- [Collection creativeunbound](https://github.com/creativeunbound/n8n-workflow-collection) : collecte depuis n8n et GitHub ; licence et droits par source à vérifier avant copie.
- [Bibliothèque officielle n8n](https://n8n.io/workflows/) : rechercher et télécharger des modèles ; conditions propres à vérifier.

Les chiffres des sources sont déclaratifs, non cumulables et non vérifiés individuellement. Cette base est un premier lot, pas un recensement exhaustif. Consulter index.json pour les chemins, types de nodes et sources.

## Utilisation
Dans n8n, créer un workflow puis importer le fichier JSON. Renseigner ses propres identifiants et adapter les paramètres. Les références aux identifiants existants dans les exports ne fournissent pas les secrets. Avant activation, examiner les nodes Code, commandes, URL, webhooks et permissions ; tester dans une instance isolée. Compatibilité avec votre version n8n non vérifiée.
