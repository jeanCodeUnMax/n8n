const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Vault Detector for Obsidian
 * Automatically detects Obsidian vaults across Windows, macOS, and Linux
 * without requiring any user tokens or manual input.
 */

function getObsidianConfigCandidates() {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [path.join(appData, 'obsidian', 'obsidian.json')];
  } else if (platform === 'darwin') {
    return [
      path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
    ];
  } else {
    // Linux / Ubuntu: Native XDG, Flatpak, and Snap locations
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return [
      path.join(xdgConfig, 'obsidian', 'obsidian.json'),
      path.join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', 'obsidian.json'),
      path.join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian', 'obsidian.json'),
    ];
  }
}

function getObsidianConfigPath() {
  const candidates = getObsidianConfigCandidates();
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function getDocumentsDir() {
  const home = os.homedir();
  const docs = path.join(home, 'Documents');
  if (fs.existsSync(docs)) return docs;
  const docsEs = path.join(home, 'Documentos');
  if (fs.existsSync(docsEs)) return docsEs;
  return docs;
}

function getFallbackVaultPaths() {
  const home = os.homedir();
  const platform = process.platform;
  const docsDir = getDocumentsDir();
  const candidates = [
    path.join(docsDir, 'Obsidian Vault'),
    path.join(home, 'Documents', 'Obsidian Vault'),
    path.join(home, 'Documentos', 'Obsidian Vault'),
    path.join(home, 'Obsidian Vault'),
  ];
  if (platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents'));
  }
  return candidates;
}

function detectVaults() {
  const configCandidates = getObsidianConfigCandidates();
  const results = {
    configFound: false,
    configPath: configCandidates[0],
    vaults: [],
    activeVault: null,
  };

  const vaultsList = [];
  const seenPaths = new Set();

  for (const configPath of configCandidates) {
    if (!fs.existsSync(configPath)) continue;
    results.configFound = true;
    results.configPath = configPath;

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const data = JSON.parse(raw);

      if (data && data.vaults && typeof data.vaults === 'object') {
        for (const [id, info] of Object.entries(data.vaults)) {
          if (!info || !info.path) continue;

          const vaultPath = path.normalize(info.path);
          if (seenPaths.has(vaultPath)) continue;
          seenPaths.add(vaultPath);

          const exists = fs.existsSync(vaultPath);
          const vaultName = path.basename(vaultPath);

          const vaultItem = {
            id,
            name: vaultName,
            path: vaultPath,
            open: !!info.open,
            ts: info.ts || 0,
            exists,
          };

          if (exists) {
            vaultsList.push(vaultItem);
          }
        }
      }
    } catch (err) {
      results.error = err.message;
    }
  }

  // Fallback: If no vaults detected via obsidian.json, inspect common OS directories
  if (vaultsList.length === 0) {
    const fallbacks = getFallbackVaultPaths();
    for (const fbPath of fallbacks) {
      if (fs.existsSync(fbPath)) {
        const norm = path.normalize(fbPath);
        if (!seenPaths.has(norm)) {
          seenPaths.add(norm);
          vaultsList.push({
            id: 'fallback_' + path.basename(norm).toLowerCase().replace(/\s+/g, '_'),
            name: path.basename(norm),
            path: norm,
            open: true,
            ts: Date.now(),
            exists: true,
          });
        }
      }
    }
  }

  // Sort: active/open first, then by timestamp descending
  vaultsList.sort((a, b) => {
    if (a.open && !b.open) return -1;
    if (!a.open && b.open) return 1;
    return (b.ts || 0) - (a.ts || 0);
  });

  results.vaults = vaultsList;
  if (vaultsList.length > 0) {
    results.activeVault = vaultsList.find(v => v.open) || vaultsList[0];
  }

  return results;
}

function getActiveOrConfiguredVault(configuredPath) {
  // 1. Explicit configured path argument
  if (configuredPath && typeof configuredPath === 'string' && configuredPath.trim() !== '') {
    const cleanPath = path.normalize(configuredPath.trim());
    if (fs.existsSync(cleanPath)) {
      return {
        id: 'custom',
        name: path.basename(cleanPath),
        path: cleanPath,
        open: true,
        exists: true,
        source: 'configured',
      };
    }
  }

  // 2. Environment variable OBSIDIAN_VAULT_PATH
  if (process.env.OBSIDIAN_VAULT_PATH && fs.existsSync(process.env.OBSIDIAN_VAULT_PATH)) {
    const envPath = path.normalize(process.env.OBSIDIAN_VAULT_PATH.trim());
    return {
      id: 'env',
      name: path.basename(envPath),
      path: envPath,
      open: true,
      exists: true,
      source: 'env',
    };
  }

  // 3. Global config ~/.gemini/config/antigravity-obsidian.json
  const home = os.homedir();
  const bridgeConfigPath = path.join(home, '.gemini', 'config', 'antigravity-obsidian.json');
  if (fs.existsSync(bridgeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(bridgeConfigPath, 'utf8'));
      if (cfg && cfg.vaultPath && fs.existsSync(cfg.vaultPath)) {
        const cfgPath = path.normalize(cfg.vaultPath.trim());
        return {
          id: 'bridge_config',
          name: cfg.vaultName || path.basename(cfgPath),
          path: cfgPath,
          open: true,
          exists: true,
          source: 'bridge-config',
        };
      }
    } catch (e) {}
  }

  // 4. Auto-detect from Obsidian Desktop installation (obsidian.json)
  const detection = detectVaults();
  if (detection.activeVault && detection.activeVault.exists) {
    return {
      ...detection.activeVault,
      source: 'auto-detected',
    };
  }

  // 5. Check OS common fallback folders
  const fallbacks = getFallbackVaultPaths();
  for (const fbPath of fallbacks) {
    if (fs.existsSync(fbPath)) {
      const norm = path.normalize(fbPath);
      return {
        id: 'fallback_' + path.basename(norm).toLowerCase().replace(/\s+/g, '_'),
        name: path.basename(norm),
        path: norm,
        open: true,
        exists: true,
        source: 'os-fallback',
      };
    }
  }

  return null;
}

/**
 * Ensures a valid vault exists for any user.
 * If no vault is configured or detected, it automatically creates one in the user's
 * Documents folder and registers it with Obsidian so everything works out of the box.
 */
function ensureOrCreateDefaultVault(configuredPath) {
  const existing = getActiveOrConfiguredVault(configuredPath);
  if (existing && existing.exists) {
    return existing;
  }

  // Fallback: Create default Obsidian Vault in Documents (or localized Documentos)
  const documentsDir = getDocumentsDir();
  let defaultVaultPath = path.join(documentsDir, 'Obsidian Vault');

  try {
    if (!fs.existsSync(defaultVaultPath)) {
      fs.mkdirSync(defaultVaultPath, { recursive: true });
    }
  } catch (e) {
    defaultVaultPath = path.join(os.homedir(), 'Obsidian Vault');
    try {
      if (!fs.existsSync(defaultVaultPath)) {
        fs.mkdirSync(defaultVaultPath, { recursive: true });
      }
    } catch (e2) {}
  }

  try {
    const obsConfDir = path.join(defaultVaultPath, '.obsidian');
    if (!fs.existsSync(obsConfDir)) {
      fs.mkdirSync(obsConfDir, { recursive: true });
    }

    // Ensure Hermes folder architecture
    const hermesDirs = ['00_Agent', path.join('00_Agent', 'Memoires'), '01_Skills', '02_Projets', '03_Sessions', path.join('03_Sessions', 'Trajectories')];
    for (const sub of hermesDirs) {
      const p = path.join(defaultVaultPath, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }

    // Clean legacy Antigravity folder if present
    const legacyDir = path.join(defaultVaultPath, 'Antigravity');
    if (fs.existsSync(legacyDir)) {
      try { fs.rmSync(legacyDir, { recursive: true, force: true }); } catch (e) {}
    }

    // Attempt to register in Obsidian's config if it exists or create it
    const configPath = getObsidianConfigPath();
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let configData = { vaults: {} };
    if (fs.existsSync(configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(configPath, 'utf8')) || { vaults: {} };
      } catch (e) {}
    }

    const vaultId = 'ag_' + Date.now().toString(36);
    configData.vaults = configData.vaults || {};
    configData.vaults[vaultId] = {
      path: defaultVaultPath,
      ts: Date.now(),
      open: true,
    };

    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    // Also ensure bridge config file has this vaultPath
    const home = os.homedir();
    const bridgeConfigFile = path.join(home, '.gemini', 'config', 'antigravity-obsidian.json');
    if (!fs.existsSync(bridgeConfigFile)) {
      const bDir = path.dirname(bridgeConfigFile);
      if (!fs.existsSync(bDir)) fs.mkdirSync(bDir, { recursive: true });
      fs.writeFileSync(bridgeConfigFile, JSON.stringify({
        vaultPath: defaultVaultPath,
        vaultName: 'Obsidian Vault',
        active: true,
        proactiveLookup: true,
        autoSave: true,
        language: 'auto',
      }, null, 2), 'utf8');
    }

    return {
      id: vaultId,
      name: 'Obsidian Vault',
      path: defaultVaultPath,
      open: true,
      exists: true,
      source: 'auto-created',
    };
  } catch (err) {
    return {
      id: 'default',
      name: 'Obsidian Vault',
      path: defaultVaultPath,
      open: true,
      exists: fs.existsSync(defaultVaultPath),
      source: 'auto-created',
    };
  }
}

function isObsidianAppInstalled() {
  const platform = process.platform;
  const home = os.homedir();

  // 1. Config file exists from a real Obsidian installation
  const configCandidates = getObsidianConfigCandidates();
  for (const c of configCandidates) {
    if (fs.existsSync(c)) return true;
  }

  // 2. Platform specific executable checks
  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    if (
      fs.existsSync(path.join(localAppData, 'Obsidian', 'Obsidian.exe')) ||
      fs.existsSync(path.join(localAppData, 'Programs', 'Obsidian', 'Obsidian.exe')) ||
      fs.existsSync(path.join(progFiles, 'Obsidian', 'Obsidian.exe')) ||
      fs.existsSync(path.join(progFilesX86, 'Obsidian', 'Obsidian.exe'))
    ) {
      return true;
    }
  } else if (platform === 'darwin') {
    if (
      fs.existsSync('/Applications/Obsidian.app') ||
      fs.existsSync(path.join(home, 'Applications', 'Obsidian.app'))
    ) {
      return true;
    }
  } else {
    // Linux
    const linuxPaths = [
      '/usr/bin/obsidian',
      '/usr/local/bin/obsidian',
      '/snap/bin/obsidian',
      path.join(home, '.local', 'bin', 'obsidian'),
      '/var/lib/flatpak/app/md.obsidian.Obsidian',
    ];
    for (const lp of linuxPaths) {
      if (fs.existsSync(lp)) return true;
    }
  }

  return false;
}

module.exports = {
  getObsidianConfigPath,
  detectVaults,
  getActiveOrConfiguredVault,
  ensureOrCreateDefaultVault,
  isObsidianAppInstalled,
};
