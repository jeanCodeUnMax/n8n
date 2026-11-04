const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');

/**
 * Tools Engine for Obsidian for Antigravity
 * Clean, dynamic tool management:
 * - ZERO default / hardcoded tools.
 * - Dynamic installation from GitHub repositories (auto-detects MCP, Skill, or CLI).
 * - Custom tool creation from UI or AI.
 * - Tool execution and lifecycle management (list, run, uninstall).
 * - Bi-directional mirror in Obsidian Vault (04_Outils/).
 */

function getGlobalToolsDir() {
  const dir = path.join(os.homedir(), '.gemini', 'tools');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
  return dir;
}

function getGlobalConfigDir() {
  return path.join(os.homedir(), '.gemini', 'config');
}

function getToolsRegistryPath() {
  return path.join(getGlobalConfigDir(), 'tools.json');
}

function loadToolsRegistry() {
  const regPath = getToolsRegistryPath();
  if (fs.existsSync(regPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      if (Array.isArray(data.tools)) return data;
    } catch (e) {}
  }
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    tools: []
  };
}

function saveToolsRegistry(registry) {
  registry.lastUpdated = new Date().toISOString();
  try {
    const configDir = getGlobalConfigDir();
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(getToolsRegistryPath(), JSON.stringify(registry, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Ensure 04_Outils structure in Obsidian Vault
 */
function ensureToolsVaultStructure(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return;
  const toolsDir = path.join(vaultPath, '04_Outils');
  if (!fs.existsSync(toolsDir)) {
    try { fs.mkdirSync(toolsDir, { recursive: true }); } catch (e) {}
  }

  const idxPath = path.join(toolsDir, '00 Index des Outils.md');
  const reg = loadToolsRegistry();
  const toolsList = (reg.tools || []).map(t => {
    return `- [[${t.name}]] — **${(t.type || 'tool').toUpperCase()}** (${t.status || 'active'}): ${t.description || 'Sans description'}`;
  }).join('\n');

  const content = [
    '---',
    'title: "Index des Outils IA"',
    'type: tools-index',
    `last_updated: ${new Date().toISOString().split('T')[0]}`,
    '---',
    '',
    '# Catalogue d\'Outils IA (Tools & MCP Hub)',
    '',
    '> [!NOTE] **Gestion Dynamique des Outils**',
    '> L\'IA n\'a pas d\'outils fixes par défaut. Les outils sont installés au fur et à mesure que l\'utilisateur ou l\'IA les ajoute (depuis GitHub ou depuis l\'interface).',
    '',
    '## Outils Installés',
    toolsList || '*Aucun outil installé pour le moment. Vous pouvez installer des outils depuis GitHub ou les créer depuis le panneau latéral ou le chat.*',
    '',
    '## Comment Ajouter de Nouveaux Outils',
    '- **Depuis un dépôt GitHub :** transmettez le lien du dépôt à l\'IA ou utilisez `/obsidian tool install <url>`.',
    '- **Depuis le Panneau Latéral :** allez dans l\'onglet **Outils** et saisissez l\'URL du dépôt ou les données de la commande.',
    '- **Autonome par l\'IA :** l\'IA peut invoquer `tool_install` directement quand vous lui donnez un dépôt.',
    '',
    '---',
    '*Synchronisé avec Antigravity & Obsidian Second Brain.*'
  ].join('\n');

  try {
    fs.writeFileSync(idxPath, content, 'utf8');
  } catch (e) {}
}

/**
 * Install a Tool from a GitHub Repository
 */
async function installFromGithub(repoUrl, options = {}, vaultPath = null) {
  if (!repoUrl || !repoUrl.trim()) {
    throw new Error('Vous devez fournir l\'URL du dépôt GitHub.');
  }

  let cleanUrl = repoUrl.trim();
  // Support shorthand "owner/repo"
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleanUrl)) {
    cleanUrl = `https://github.com/${cleanUrl}.git`;
  }
  if (!cleanUrl.endsWith('.git') && cleanUrl.startsWith('https://github.com')) {
    cleanUrl = cleanUrl + '.git';
  }

  // Derive tool name
  const repoNameMatch = cleanUrl.match(/\/([^/]+?)(?:\.git)?$/);
  let toolName = (options.name || (repoNameMatch ? repoNameMatch[1] : 'custom-tool')).toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  const toolsBaseDir = getGlobalToolsDir();
  const targetDir = path.join(toolsBaseDir, toolName);

  // If already exists, pull
  if (fs.existsSync(targetDir)) {
    try {
      execSync('git pull', { cwd: targetDir, timeout: 20000, stdio: 'ignore' });
    } catch (e) {}
  } else {
    // Clone repo
    try {
      execSync(`git clone --depth 1 "${cleanUrl}" "${targetDir}"`, {
        timeout: 60000,
        stdio: 'ignore'
      });
    } catch (cloneErr) {
      throw new Error(`Erreur lors du clonage du dépôt (${cleanUrl}) : ${cloneErr.message || cloneErr}`);
    }
  }

  // Detect tool architecture
  let toolType = 'cli';
  let entrypoint = '';
  let command = '';
  let mcpRegistered = false;
  let skillInstalled = false;
  let description = options.description || `Outil installé depuis ${cleanUrl}`;

  const pkgJsonPath = path.join(targetDir, 'package.json');
  const skillMdPath = path.join(targetDir, 'SKILL.md');
  const pyProject = path.join(targetDir, 'pyproject.toml');
  const reqTxt = path.join(targetDir, 'requirements.txt');
  const serverPy = path.join(targetDir, 'server.py');

  // Case 1: Antigravity Skill in repo
  if (fs.existsSync(skillMdPath)) {
    toolType = 'skill';
    skillInstalled = true;
    const destSkillDir = path.join(getGlobalConfigDir(), 'skills', toolName);
    try {
      if (!fs.existsSync(destSkillDir)) fs.mkdirSync(destSkillDir, { recursive: true });
      fs.copyFileSync(skillMdPath, path.join(destSkillDir, 'SKILL.md'));
      const scriptsSrc = path.join(targetDir, 'scripts');
      if (fs.existsSync(scriptsSrc)) {
        const destScripts = path.join(destSkillDir, 'scripts');
        if (!fs.existsSync(destScripts)) fs.mkdirSync(destScripts, { recursive: true });
        for (const sf of fs.readdirSync(scriptsSrc)) {
          fs.copyFileSync(path.join(scriptsSrc, sf), path.join(destScripts, sf));
        }
      }
    } catch (e) {}
  }

  // Case 2: Node.js project (MCP or CLI)
  if (fs.existsSync(pkgJsonPath)) {
    let pkg = {};
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.description) description = pkg.description;
    } catch (e) {}

    // Run npm install if node_modules is missing
    const nodeModulesDir = path.join(targetDir, 'node_modules');
    if (!fs.existsSync(nodeModulesDir)) {
      try {
        execSync('npm install --omit=dev --no-audit --no-fund', {
          cwd: targetDir,
          timeout: 90000,
          stdio: 'ignore'
        });
      } catch (npmErr) {}
    }

    let binEntry = '';
    if (pkg.bin) {
      binEntry = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
    }
    entrypoint = binEntry || pkg.main || 'index.js';
    const absEntry = path.join(targetDir, entrypoint);

    const isMcp = (pkg.dependencies && pkg.dependencies['@modelcontextprotocol/sdk']) ||
                  (pkg.keywords && pkg.keywords.includes('mcp')) ||
                  toolName.includes('mcp') ||
                  (pkg.name && pkg.name.includes('mcp'));

    if (isMcp) {
      toolType = 'mcp';
      mcpRegistered = registerMcpServer(toolName, {
        command: 'node',
        args: [absEntry.replace(/\\/g, '/')],
        env: options.env || {}
      });
    } else {
      command = `node "${absEntry}"`;
    }
  } else if (fs.existsSync(serverPy) || fs.existsSync(pyProject) || fs.existsSync(reqTxt)) {
    // Case 3: Python project
    if (fs.existsSync(reqTxt)) {
      try {
        execSync('pip install -r requirements.txt', { cwd: targetDir, timeout: 90000, stdio: 'ignore' });
      } catch (e) {}
    }

    const absPyEntry = path.join(targetDir, fs.existsSync(serverPy) ? 'server.py' : 'main.py');
    const isMcp = toolName.includes('mcp') || (fs.existsSync(serverPy));

    if (isMcp) {
      toolType = 'mcp';
      mcpRegistered = registerMcpServer(toolName, {
        command: 'python',
        args: [absPyEntry.replace(/\\/g, '/')],
        env: options.env || {}
      });
    } else {
      toolType = 'python-cli';
      command = `python "${absPyEntry}"`;
    }
  }

  // Update tools.json registry
  const reg = loadToolsRegistry();
  const existingIdx = reg.tools.findIndex(t => t.id === toolName);
  const toolRecord = {
    id: toolName,
    name: toolName,
    type: toolType,
    repoUrl: cleanUrl,
    dir: targetDir,
    entrypoint,
    command,
    description,
    status: 'active',
    mcpRegistered,
    skillInstalled,
    installedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    reg.tools[existingIdx] = toolRecord;
  } else {
    reg.tools.push(toolRecord);
  }
  saveToolsRegistry(reg);

  // Write Obsidian Note in 04_Outils/<toolName>.md
  if (vaultPath && fs.existsSync(vaultPath)) {
    ensureToolsVaultStructure(vaultPath);
    const notePath = path.join(vaultPath, '04_Outils', `${toolName}.md`);
    const noteContent = [
      '---',
      `title: "Tool: ${toolName}"`,
      `type: ai-tool`,
      `category: ${toolType}`,
      `repo: "${cleanUrl}"`,
      `installed_at: ${new Date().toISOString().split('T')[0]}`,
      `mcp_active: ${mcpRegistered}`,
      '---',
      '',
      `# Tool: ${toolName}`,
      '',
      `> [!NOTE] **Description**`,
      `> ${description}`,
      '',
      '## Spécifications Techniques',
      `- **Dépôt d'origine** : [${cleanUrl}](${cleanUrl})`,
      `- **Type d'outil** : \`${toolType.toUpperCase()}\``,
      `- **Chemin local** : \`${targetDir}\``,
      mcpRegistered ? `- **Serveur MCP** : intégré dans \`mcp_config.json\` d'Antigravity.` : '',
      command ? `- **Commande d'exécution** : \`${command}\`` : '',
      skillInstalled ? `- **Skill Antigravity** : synchronisée dans \`~/.gemini/config/skills/${toolName}/\`` : '',
      '',
      '## Mode d\'Utilisation pour l\'IA',
      mcpRegistered
        ? 'Le serveur MCP a été enregistré pour Antigravity. Ses fonctions sont disponibles dans `<mcp_servers>`.'
        : `Exécutable via \`tool_run(toolName="${toolName}", args=...)\` ou CLI : \`node obsidian.js tool run ${toolName}\`.`,
      '',
      '---',
      `*Lié à [[00 Index des Outils]] et [[00 Antigravity Hub]].*`
    ].filter(Boolean).join('\n');

    try {
      fs.writeFileSync(notePath, noteContent, 'utf8');
      ensureToolsVaultStructure(vaultPath);
    } catch (e) {}
  }

  return {
    status: 'ok',
    name: toolName,
    type: toolType,
    dir: targetDir,
    mcpRegistered,
    skillInstalled,
    description,
    message: `Outil "${toolName}" installé correctement depuis GitHub (${toolType.toUpperCase()}).`
  };
}

/**
 * Create a Custom Tool (CLI or command)
 */
function createTool(toolData, vaultPath = null) {
  if (!toolData || !toolData.name) {
    throw new Error('Vous devez indiquer un nom pour l\'outil.');
  }

  const toolName = toolData.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const command = toolData.command || '';
  const description = toolData.description || 'Outil personnalisé configuré par l\'utilisateur.';
  const toolType = toolData.type || 'cli';

  const reg = loadToolsRegistry();
  const existingIdx = reg.tools.findIndex(t => t.id === toolName);
  const toolRecord = {
    id: toolName,
    name: toolData.name,
    type: toolType,
    command,
    description,
    status: 'active',
    installedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    reg.tools[existingIdx] = toolRecord;
  } else {
    reg.tools.push(toolRecord);
  }
  saveToolsRegistry(reg);

  if (vaultPath && fs.existsSync(vaultPath)) {
    ensureToolsVaultStructure(vaultPath);
    const notePath = path.join(vaultPath, '04_Outils', `${toolName}.md`);
    const noteContent = [
      '---',
      `title: "Tool: ${toolName}"`,
      `type: ai-tool`,
      `category: ${toolType}`,
      `installed_at: ${new Date().toISOString().split('T')[0]}`,
      '---',
      '',
      `# Tool: ${toolData.name}`,
      '',
      `> [!NOTE] **Description**`,
      `> ${description}`,
      '',
      '## Spécifications',
      `- **Type** : \`${toolType.toUpperCase()}\``,
      command ? `- **Commande** : \`${command}\`` : '',
      '',
      '## Mode d\'Utilisation',
      `Exécutable via \`tool_run(toolName="${toolName}", args=...)\` ou CLI : \`node obsidian.js tool run ${toolName}\`.`,
      '',
      '---',
      `*Lié à [[00 Index des Outils]] et [[00 Antigravity Hub]].*`
    ].filter(Boolean).join('\n');

    try {
      fs.writeFileSync(notePath, noteContent, 'utf8');
      ensureToolsVaultStructure(vaultPath);
    } catch (e) {}
  }

  return {
    status: 'ok',
    name: toolName,
    tool: toolRecord,
    message: `Outil "${toolName}" créé correctement.`
  };
}

/**
 * Register MCP Server in ~/.gemini/config/mcp_config.json
 */
function registerMcpServer(name, serverConfig) {
  const mcpConfigFile = path.join(getGlobalConfigDir(), 'mcp_config.json');
  let config = { mcpServers: {} };
  if (fs.existsSync(mcpConfigFile)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf8'));
    } catch (e) {}
  }
  if (!config.mcpServers) config.mcpServers = {};

  config.mcpServers[name] = {
    command: serverConfig.command || 'node',
    args: serverConfig.args || [],
    env: serverConfig.env || {}
  };

  try {
    fs.writeFileSync(mcpConfigFile, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Deregister MCP Server from mcp_config.json
 */
function deregisterMcpServer(name) {
  const mcpConfigFile = path.join(getGlobalConfigDir(), 'mcp_config.json');
  if (fs.existsSync(mcpConfigFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf8'));
      if (config.mcpServers && config.mcpServers[name]) {
        delete config.mcpServers[name];
        fs.writeFileSync(mcpConfigFile, JSON.stringify(config, null, 2), 'utf8');
        return true;
      }
    } catch (e) {}
  }
  return false;
}

/**
 * List all tools
 */
function listTools(vaultPath = null) {
  const reg = loadToolsRegistry();
  return {
    total: (reg.tools || []).length,
    tools: reg.tools || []
  };
}

/**
 * Run an installed tool
 */
async function runTool(toolName, args = [], options = {}) {
  const reg = loadToolsRegistry();
  const tool = (reg.tools || []).find(t => t.id === toolName || t.name.toLowerCase() === toolName.toLowerCase());

  if (!tool) {
    throw new Error(`Outil "${toolName}" introuvable dans le registre des tools.`);
  }

  if (tool.command) {
    const fullCmd = `${tool.command} ${Array.isArray(args) ? args.join(' ') : args}`;
    return new Promise((resolve, reject) => {
      exec(fullCmd, { cwd: tool.dir || process.cwd(), timeout: 30000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || stdout || err.message));
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  }

  throw new Error(`L'outil "${toolName}" n'a pas de commande exécutable configurée.`);
}

/**
 * Uninstall a Tool
 */
function uninstallTool(toolName, vaultPath = null) {
  const reg = loadToolsRegistry();
  const idx = (reg.tools || []).findIndex(t => t.id === toolName || t.name.toLowerCase() === toolName.toLowerCase());
  if (idx < 0) {
    throw new Error(`Outil "${toolName}" introuvable.`);
  }

  const tool = reg.tools[idx];

  // Remove directory
  if (tool.dir && fs.existsSync(tool.dir)) {
    try {
      fs.rmSync(tool.dir, { recursive: true, force: true });
    } catch (e) {}
  }

  // Deregister MCP
  if (tool.mcpRegistered) {
    deregisterMcpServer(tool.id);
  }

  // Remove Skill
  if (tool.skillInstalled) {
    const sDir = path.join(getGlobalConfigDir(), 'skills', tool.id);
    if (fs.existsSync(sDir)) {
      try { fs.rmSync(sDir, { recursive: true, force: true }); } catch (e) {}
    }
  }

  // Remove Obsidian Note
  if (vaultPath && fs.existsSync(vaultPath)) {
    const nPath = path.join(vaultPath, '04_Outils', `${tool.id}.md`);
    if (fs.existsSync(nPath)) {
      try { fs.unlinkSync(nPath); } catch (e) {}
    }
    ensureToolsVaultStructure(vaultPath);
  }

  reg.tools.splice(idx, 1);
  saveToolsRegistry(reg);

  return { status: 'ok', message: `Outil "${toolName}" désinstallé correctement.` };
}

module.exports = {
  installFromGithub,
  createTool,
  listTools,
  runTool,
  uninstallTool,
  ensureToolsVaultStructure,
  loadToolsRegistry
};
