# Checklist de vérification post‑installation (collaborateur)

> **Workspace** : le dossier où tu as cloné le dépôt (`<repo>` — n'importe quel chemin, les scripts détectent leur position).  
> Toutes les vérifications se font depuis ce répertoire. `<install>` = `%ProgramFiles%\servers\hephaistos2-kit` par défaut, ou ta valeur `-InstallRoot`/`HPHE_INSTALL`.

---

## 1️⃣ Prérequis
- [ ] Système d’exploitation Windows avec système de fichiers **NTFS**  
- [ ] **PowerShell 7** (`pwsh --version` ≥ 7.0) installé et accessible depuis le PATH  
- [ ] **Git** (`git --version`)  
- [ ] **Cargo** installé (`cargo --version`)  
- [ ] **Node.js** (≥ 18)  
- [ ] Dépôt cloné **avec ses sous-modules** : `git clone --recurse-submodules <url>` ou `git submodule update --init --recursive` dans `<repo>`  
- [ ] Accès en lecture/écriture au dossier `<repo>`  
- [ ] *(optionnel)* Variables `NVIDIA_API_KEY` / `NVIDIA_API_KEY_2` — nécessaires uniquement pour les workers `nim1`/`nim2`

---

## 2️⃣ Étapes attendues du script `install.ps1`
- [ ] Sous-modules initialisés (`hphe/`, `extension/`, `extensions/orchestrator-monitor/` non vides)  
- [ ] `npm install` effectué dans `.agent/agent-bridge/` (module `ws` présent)  
- [ ] Le script se lance sans erreur (`.\install.ps1` → code de sortie `0`)  
- [ ] Compilation **cargo** réussie → binaires placés dans `<install>/extension/server/`  
- [ ] Création du fichier de données `<install>/data/orchestrator.db` (SQLite)  
- [ ] Génération du seed `seed-orchestrator.mjs` (liste des agents + `provider_prefs`)  
- [ ] Mise à jour du fichier `mcp_config.json` de Devin  
- [ ] `hphe-rest` enregistré en démarrage automatique (`.cmd` dans le dossier Startup — **pas un service Windows**)  
- [ ] Création de la tâche planifiée **hphe‑indexd** avec l’option `-Elevated`  
- [ ] Installation des extensions VSIX :  
  - `hephaistos-kit-search.vsix`  
  - `orchestrator-monitor.vsix` (v0.0.58+, inclut `agent-bridge` -> `binome.js` / `devin-hub.js` / `acp-inject.js`)

---

## 3️⃣ Vérification du moteur (engine)
- [ ] **Health check** : `curl -s http://localhost:8792/health` retourne `{"status":"ok"}` ou `{"status":"healthy"}` (code HTTP 200)  
- [ ] **Tâche planifiée** : `schtasks /Query /TN "hphe-indexd"` montre l’état **En cours** et l’option **Exécuter avec les plus hauts privilèges** cochée  
- [ ] **MCP dans l’IDE** : l’extension *orchestrator‑monitor* affiche un indicateur **vert** (MCP connecté)  

---

## 4️⃣ Vérification de l’orchestrateur
- [ ] Via le MCP, la commande `agents list` renvoie la liste complète des agents définis dans `seed-orchestrator.mjs`  
- [ ] La préférence de fournisseur (`provider_prefs`) apparaît dans le bon ordre tel que spécifié dans le seed  
- [ ] Aucune erreur MCP n’est remontée dans la console de l’IDE  

---

## 5️⃣ Vérification du binôme Devin ⇄ ACP/CLI
- [ ] Extension `hephaistos.orchestrator-monitor` en version >= 0.0.58 installée et rechargée pour `acp-list`/`wake_acp_agent` (injection ACP stdio)  
- [ ] Dans Devin, lancer `/jointes <agent>` et choisir un transport explicite si l’agent en propose plusieurs  
- [ ] Vérifier une requête/ACK **frais** dans `.agent/comms.jsonl` : même `pairId/session`, IDs exacts, transports/providers inversés; `established=true`; pas de fallback vers active/latest  
- [ ] ACP : session présente dans `devin-hub.js acp-list <providerId>`, activée et du workspace courant; CLI Kilo/Hermes : ID retourné par `agent-adapters.js sessions <agent>` et workspace vérifié  
- [ ] Vérifier le **bridge WebSocket** en loopback sur le port **7477** : `Test-NetConnection 127.0.0.1 -Port 7477` (ne pas ouvrir le port au réseau)  
- [ ] Vers Devin : ne cibler que son ID explicite `acp/devin-cli/...` ou UUID confirmé; session inconnue/non focalisable = `skipped`, sans nouvelle fenêtre, toast ou presse-papiers  
- [ ] Référence technique complète : `docs/protocole-binome/README.md`  

---

## 6️⃣ Troubleshooting court
| Symptôme | Vérification rapide | Action corrective |
|----------|---------------------|-------------------|
| `curl :8792/health` échoue | `hphe-rest` pas démarré (c’est un `.cmd` en boucle dans le dossier Startup, **pas un service**) | Relancer `<install>\extension\server\hphe-rest.cmd` puis vérifier `<install>\data\hphe-rest.log` |
| Tâche hphe‑indexd absente ou non élevée | Schtasks mal créé | Ré‑exécuter `.\install.ps1 -Elevated` en tant qu’administrateur |
| MCP rouge dans l’IDE | Extension orchestrator‑monitor non chargée | Recharger l’extension (`Ctrl+Shift+P → Reload Window`) ou ré‑installer le VSIX |
| `binome.js` : "ws module introuvable" | `npm install` pas fait dans `.agent/agent-bridge/` | `cd .agent\agent-bridge && npm install` |
| Binôme ne rejoint pas le canal | Port 7477 bloqué ou bridge non démarré | Vérifier l’extension Antigravity, l’ID de session AGY ciblé et le bridge loopback 127.0.0.1:7477; ne pas ouvrir de port pare-feu |
| Erreur SQLite au démarrage | `<install>/data/orchestrator.db` corrompu ou permissions insuffisantes | Supprimer le fichier (il sera recréé) ou attribuer les droits `ICACLS data\orchestrator.db /grant "%USERNAME%:(OI)(CI)F"` |

---

> **Fin de la checklist** – cochez chaque case après validation.  
> Toute anomalie persistante doit être remontée au référent technique avec les logs pertinents (`<install>\data\*.log` et `.agent/comms.jsonl`).
