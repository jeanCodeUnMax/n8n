'use strict';
/**
 * local-paths.js — chemins propres à la machine, JAMAIS commités.
 *
 * `.agent/agent-bridge/local-paths.json` est gitignoré : il contient les
 * chemins absolus de ce poste (binaires, vault, racines de projets). Le repo
 * ne transporte que les clés ; chaque machine fournit ses valeurs.
 *
 * Clés utilisées :
 *   nodeExe          ex. "C:\\nvm4w\\nodejs\\node.exe"
 *   kitRoot          ex. "C:\\Program Files\\Projet-complet"
 *   cliAnythingRoot  ex. "F:\\Promgramation-teste\\CLI-Anything"
 *   serversRoot      ex. "C:\\Program Files\\servers"
 *   obsidianVault    ex. "F:\\doc_Obsidian\\Doc"
 *   cerberosAcpBin   ex. "<cliAnythingRoot>\\cerberos\\agent-harness\\bin\\cerberos-acp.js"
 *   cerberosD2r2Bin  ex. "<cliAnythingRoot>\\cerberos\\agent-harness\\bin\\d2r2-acp.js"
 */
const fs = require('fs');
const path = require('path');

let cache;
function localPath(key) {
    if (cache === undefined) {
        try { cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-paths.json'), 'utf8')); }
        catch { cache = null; }
    }
    return cache ? (cache[key] || null) : null;
}

module.exports = { localPath };
