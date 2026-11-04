# ComfyUI dans l'extension hephaistos-chats — comment c'est cablé

## 1. La webview workspace (webview/workspace.tsx)

Le panneau React Flow a un etat `pageView` ('flow' | 'comfyui' | 'n8n') avec
la barre d'outils (Flux / ComfyUI / n8n / reload). L'affichage ComfyUI est
une iframe sur l'app web locale :

```tsx
{(pageView === 'comfyui' || toolLoaded.comfyui) && (
    <iframe key={"comfyui-" + toolReload.comfyui}
            className={"tool-page" + (pageView !== 'comfyui' ? " tool-page-hidden" : "")}
            src="http://127.0.0.1:8188" />
)}
```

Deux mecanismes cles :
- `toolLoaded` : l'iframe reste montee (cachee en CSS) une fois ouverte —
  sinon la session ComfyUI serait perdue a chaque bascule de page.
- `toolReload` : incrementer la key force le remontage de l'iframe.
  Corrige : ca ne se produit que sur transition down -> up, plus a chaque
  ping positif (la session de l'outil est preservee).

## 2. Le cycle de vie du service (src/extension.ts)

Clic sur ComfyUI -> `switchPage` envoie `ensure_service` -> `ensureService` :

1. Map `serviceStarts` : un seul demarrage en vol par service — les clics
   pendant le boot partagent la meme promesse, plus de doublons.
2. `portUp('http://127.0.0.1:8188')` : deja up ? retour immediat —
   connexion a l'instance existante.
3. `processAlive('ComfyUI')` : processus vivant mais port pas pret ?
   on attend, pas de respawn.
4. Sinon `spawnDetached('run_nvidia_gpu.bat')` + `waitPort` (60 x 2 s).

Le resultat repart au panneau via `service_state` -> point d'etat sur le
bouton (checking / up / down).

Le bouton reload ne tue plus le service : il remonte l'iframe et envoie
`ensure_service` — l'ancien code faisait `restart_service` (kill + respawn
a chaque clic, d'ou les instances qui s'empilaient).

## 3. L'onglet dedie (src/comfyuiPanel.ts)

`hephaistosChats.openComfyUI` ouvre un webview panel autonome avec
`ComfyUIPanel.current.reveal()` — jamais de doublon d'onglet.

## En resume

Pas de tunnel ni de protocole special : une iframe sur 127.0.0.1:8188, un
ensure idempotent qui verifie port + processus avant de lancer, et des
panneaux reutilises au lieu d'etre recrees.
