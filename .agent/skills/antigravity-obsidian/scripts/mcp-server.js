#!/usr/bin/env node
/**
 * Antigravity <-> Obsidian MCP Server
 * Exposes Obsidian vault tools to Antigravity AI agents via Model Context Protocol (stdio).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const { detectVaults, getActiveOrConfiguredVault, ensureOrCreateDefaultVault } = require('./vault-detector');
const syncEngine = require('./sync-engine');
const toolsEngine = require('./tools-engine');

// Resolve active vault (auto-detects or auto-provisions seamlessly on any PC)
function getVaultPath() {
  const customPath = process.env.OBSIDIAN_VAULT_PATH;
  const vault = ensureOrCreateDefaultVault(customPath);
  return vault ? vault.path : null;
}

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'obsidian_add_antipattern',
    description: 'Enregistre un anti-patron, un piège technique ou une erreur récurrente à éviter pour un projet dans Obsidian et le synchronise immédiatement avec les règles obligatoires du workspace (.agents/rules/project-rules.md).',
    inputSchema: {
      type: 'object',
      properties: {
        rule: { type: 'string', description: 'Règle ou erreur interdite à ne pas répéter (ex : "Ne jamais réduire le délai anti-ban de scan", "Ne pas utiliser toggleChatFocus")' },
        project: { type: 'string', description: 'Nom du projet (optionnel, détecté automatiquement)' },
      },
      required: ['rule'],
    },
  },
  {
    name: 'obsidian_list_antipatterns',
    description: 'Liste les anti-patrons et pièges interdits enregistrés pour un projet.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Nom du projet (optionnel)' },
      },
    },
  },
  {
    name: 'obsidian_triage',
    description: 'Triage à ultra-faible contexte (<100 tokens). Détermine s\'il existe une Skill ou une Mémoire préalable pour une tâche ou une erreur sans dépenser de tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Problème, terme technique, nom de projet ou erreur à consulter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'obsidian_peek',
    description: 'Extrait exclusivement le résumé et la solution technique d\'une note de mémoire, économisant 90 % du contexte par rapport à une lecture complète.',
    inputSchema: {
      type: 'object',
      properties: {
        noteName: { type: 'string', description: 'Titre ou nom de la note à inspecter' },
      },
      required: ['noteName'],
    },
  },
  {
    name: 'obsidian_status',
    description: 'Obtient l\'état de connexion avec Obsidian, le chemin de la voûte (vault) active et les statistiques des mémoires et skills synchronisées.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'obsidian_search',
    description: 'Recherche des notes, mémoires ou skills dans la voûte Obsidian par mot-clé ou étiquette.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Terme de recherche ou mot-clé' },
        folder: { type: 'string', enum: ['Memoires', 'Skills', 'Projets', 'Toutes'], description: 'Dossier dans lequel chercher (par défaut Toutes)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'obsidian_read_note',
    description: 'Lit le contenu complet d\'une note d\'Obsidian (par chemin relatif ou nom de note).',
    inputSchema: {
      type: 'object',
      properties: {
        noteNameOrPath: { type: 'string', description: 'Nom de la note (ex : "Latalaya" ou "Memoria/Latalaya.md")' },
      },
      required: ['noteNameOrPath'],
    },
  },
  {
    name: 'obsidian_save_memory',
    description: 'Enregistre une nouvelle mémoire, leçon apprise, solution technique ou contexte dans Obsidian (et dans la base de connaissances d\'Antigravity).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titre clair de la mémoire ou solution technique' },
        content: { type: 'string', description: 'Contenu détaillé au format Markdown' },
        summary: { type: 'string', description: 'Résumé concis de 1 à 2 phrases' },
        category: { type: 'string', description: 'Catégorie (ex : architecture, bugfix, backend, frontend)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Liste d\'étiquettes (ex : ["nodejs", "prestashop"])' },
        relatedSkills: { type: 'array', items: { type: 'string' }, description: 'Noms des skills associées' },
        project: { type: 'string', description: 'Nom du projet lié' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'obsidian_save_skill',
    description: 'Enregistre ou met à jour une skill : écrit le SKILL.md opérationnel dans Antigravity et sa fiche documentaire liée dans la voûte Obsidian. Permet de catégoriser comme "global" (générale pour tous les projets, ex : roblox, docker) ou "project" (locale à ce projet).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Identifiant unique de la skill en minuscules et tirets (ex : roblox, flutter, tailwind)' },
        description: { type: 'string', description: 'Description claire des capacités techniques de la skill' },
        instructions: { type: 'string', description: 'Instructions complètes au format Markdown pour l\'agent' },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: 'Catégorisation de portée : "global" (générale, disponible dans TOUS les projets et dossiers) ou "project" (locale, exclusive au workspace actuel). Par défaut "global".',
        },
        triggers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Mots-clés ou phrases déclencheurs pour que le modèle sache quand lire et utiliser cette skill (ex : ["roblox", "jeu de roblox", "luau"]).',
        },
      },
      required: ['name', 'description', 'instructions'],
    },
  },
  {
    name: 'obsidian_sync_all',
    description: 'Exécute une synchronisation complète de toutes les skills, mémoires et projets entre Antigravity et Obsidian.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'obsidian_session_save',
    description: 'Enregistre un checkpoint de session ou un jalon de travail dans le Daily Log du projet dans Obsidian (03_Sessions/YYYY-MM-DD - Projet.md).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Nom du projet de travail' },
        summary: { type: 'string', description: 'Résumé concis du jalon ou de la tâche accomplie' },
        content: { type: 'string', description: 'Détails techniques, fichiers modifiés et décisions prises' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Étiquettes optionnelles' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'obsidian_session_last',
    description: 'Récupère le dernier jalon ou la dernière session de travail enregistrée pour un projet afin de rappeler le contexte précédent sans brûler de tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Nom du projet à consulter (optionnel)' },
      },
    },
  },
  {
    name: 'obsidian_session_list',
    description: 'Liste les checkpoints et sessions de travail récents de la voûte.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Nombre maximal de sessions à retourner (par défaut 10)' },
      },
    },
  },
  {
    name: 'obsidian_learn',
    description: 'Enregistre une habitude, préférence ou règle de travail de l\'utilisateur. Si elle inclut [Projet] ou project, elle est stockée exclusivement dans le dossier du projet.',
    inputSchema: {
      type: 'object',
      properties: {
        habit: { type: 'string', description: 'Préférence, habitude technique ou condition obligatoire apprise' },
        project: { type: 'string', description: 'Projet spécifique auquel elle s\'applique (optionnel)' },
      },
      required: ['habit'],
    },
  },
  {
    name: 'obsidian_open_note',
    description: 'Ouvre une note directement dans la fenêtre de l\'application de bureau Obsidian de l\'utilisateur.',
    inputSchema: {
      type: 'object',
      properties: {
        notePath: { type: 'string', description: 'Chemin relatif ou nom de la note à ouvrir dans Obsidian' },
      },
      required: ['notePath'],
    },
  },
  // Hermes Closed Learning Loop Tools (Nous Research Architecture)
  {
    name: 'memory_update',
    description: 'Met à jour la mémoire bornée (Bounded Memory) de Hermes dans 00_Agent/ (USER.md max 1500 caractères, MEMORY.md max 2500 caractères). Si le quota autorisé est dépassé, rejette l\'opération avec une erreur de quota intentionnelle pour forcer le modèle à élaguer, fusionner ou supprimer les faits obsolètes.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['USER.md', 'MEMORY.md'], description: 'Destination à mettre à jour ("USER.md" pour les préférences ou "MEMORY.md" pour les faits de l\'environnement)' },
        operation: { type: 'string', enum: ['append', 'replace', 'prune'], description: 'Opération : "append" (ajouter un fait), "replace" (remplacer) ou "prune" (condensation/élagage)' },
        content: { type: 'string', description: 'Nouveau contenu ou version condensée et élaguée' },
      },
      required: ['target', 'operation', 'content'],
    },
  },
  {
    name: 'skill_get',
    description: 'Lit le contenu complet et la procédure opérationnelle d\'une skill vivante (playbook versionné) depuis 01_Skills/.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'Nom de la skill à consulter (ex : ssh_sudo_paramiko, build_docker_ssh)' },
      },
      required: ['skill_name'],
    },
  },
  {
    name: 'skill_save',
    description: 'Crée ou auto-répare une skill procédurale vivante dans 01_Skills/. Si elle existait déjà, incrémente la version et incorpore les nouveaux apprentissages et edge cases corrigés.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'Nom de la skill en snake_case ou kebab-case' },
        content: { type: 'string', description: 'Contenu complet en Markdown avec Procédure Opérationnelle et Erreurs Connues et Correction' },
        version_bump: { type: 'boolean', description: 'Si true, incrémente la version mineure (ex : 1.1 -> 1.2)' },
        triggers: { type: 'array', items: { type: 'string' }, description: 'Mots-clés déclencheurs (optionnel)' },
      },
      required: ['skill_name', 'content'],
    },
  },
  {
    name: 'session_recall',
    description: 'Recherche textuelle rapide sur le dossier 03_Sessions/ et Trajectories pour récupérer des détails d\'anciens chats sans saturer le contexte.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Terme, erreur ou projet à rechercher dans les sessions précédentes' },
        limit: { type: 'number', description: 'Nombre maximal de résultats (par défaut 5)' },
      },
      required: ['query'],
    },
  },
  // Aliases for obsidian_ prefix
  {
    name: 'obsidian_memory_update',
    description: 'Alias de memory_update.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['USER.md', 'MEMORY.md'] },
        operation: { type: 'string', enum: ['append', 'replace', 'prune'] },
        content: { type: 'string' },
      },
      required: ['target', 'operation', 'content'],
    },
  },
  {
    name: 'obsidian_skill_get',
    description: 'Alias de skill_get.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: { type: 'string' },
      },
      required: ['skill_name'],
    },
  },
  {
    name: 'obsidian_skill_save',
    description: 'Alias de skill_save.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: { type: 'string' },
        content: { type: 'string' },
        version_bump: { type: 'boolean' },
      },
      required: ['skill_name', 'content'],
    },
  },
  {
    name: 'obsidian_session_recall',
    description: 'Alias de session_recall.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  // AI Dynamic Tools (GitHub Installer, Custom Tool Creator, Runner & Manager)
  {
    name: 'obsidian_tool_create',
    description: 'Crée un outil personnalisé pour l\'IA (nom, commande, description) fourni par l\'utilisateur ou l\'interface.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom ou identifiant de l\'outil' },
        description: { type: 'string', description: 'Description claire de l\'outil' },
        command: { type: 'string', description: 'Commande ou script exécutable pour l\'outil' },
        type: { type: 'string', enum: ['cli', 'script'], description: 'Type d\'outil (par défaut cli)' }
      },
      required: ['name', 'description']
    }
  },
  {
    name: 'tool_create',
    description: 'Alias de obsidian_tool_create.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom de l\'outil' },
        description: { type: 'string', description: 'Description de l\'outil' },
        command: { type: 'string', description: 'Commande exécutable' },
        type: { type: 'string', description: 'Type d\'outil' }
      },
      required: ['name', 'description']
    }
  },
  {
    name: 'obsidian_tool_install',
    description: 'Installe de façon autonome un outil pour l\'IA à partir d\'un dépôt GitHub (ex : https://github.com/user/repo ou user/repo). Clone le dépôt, détecte s\'il s\'agit d\'un serveur MCP, d\'une Skill Antigravity ou d\'une CLI, installe les dépendances avec npm/pip, l\'enregistre dans mcp_config.json et génère sa note dans Obsidian.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: { type: 'string', description: 'URL du dépôt GitHub (ex : https://github.com/owner/repo ou owner/repo)' },
        name: { type: 'string', description: 'Nom identifiant optionnel pour l\'outil' },
        description: { type: 'string', description: 'Description optionnelle des fonctions de l\'outil' }
      },
      required: ['repoUrl']
    }
  },
  {
    name: 'tool_install',
    description: 'Alias de obsidian_tool_install.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: { type: 'string', description: 'URL du dépôt GitHub' },
        name: { type: 'string', description: 'Nom optionnel' },
        description: { type: 'string', description: 'Description optionnelle' }
      },
      required: ['repoUrl']
    }
  },
  {
    name: 'obsidian_tool_list',
    description: 'Liste tous les outils d\'IA disponibles et installés (recherche web, scraper, serveurs MCP et outils CLI de GitHub).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'tool_list',
    description: 'Alias de obsidian_tool_list.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'obsidian_tool_run',
    description: 'Exécute un outil d\'IA précédemment installé avec ses arguments correspondants.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Nom ou id de l\'outil à exécuter' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments ou paramètres pour l\'outil' }
      },
      required: ['toolName']
    }
  },
  {
    name: 'tool_run',
    description: 'Alias de obsidian_tool_run.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Nom de l\'outil' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments' }
      },
      required: ['toolName']
    }
  },
  {
    name: 'obsidian_tool_uninstall',
    description: 'Désinstalle un outil d\'IA précédemment installé depuis GitHub et nettoie ses registres.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Nom de l\'outil à désinstaller' }
      },
      required: ['toolName']
    }
  },
];

// Gestion dynamique d'outils (create/install/run/uninstall) : clone de dépôts GitHub,
// npm/pip install, écriture dans mcp_config.json — potentiellement dangereux et hors du
// rôle de ce plugin dans l'architecture. Désactivée par défaut ; opt-in explicite via
// OBSIDIAN_ALLOW_TOOL_MGMT=1 dans l'env du serveur MCP.
const TOOL_MGMT = new Set([
  'obsidian_tool_create', 'tool_create',
  'obsidian_tool_install', 'tool_install',
  'obsidian_tool_run', 'tool_run',
  'obsidian_tool_uninstall', 'tool_uninstall',
]);
const TOOL_MGMT_ALLOWED = process.env.OBSIDIAN_ALLOW_TOOL_MGMT === '1';
const EXPOSED_TOOLS = TOOL_MGMT_ALLOWED ? TOOLS : TOOLS.filter(t => !TOOL_MGMT.has(t.name));

// Tool Executors
async function executeTool(name, args) {
  if (TOOL_MGMT.has(name) && !TOOL_MGMT_ALLOWED) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Outil de gestion dynamique désactivé par la politique du workspace (OBSIDIAN_ALLOW_TOOL_MGMT=1 pour réactiver).' }],
    };
  }

  const vaultPath = getVaultPath();
  if (!vaultPath) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Erreur : aucune voûte Obsidian active trouvée sur le système. Assurez-vous d\'avoir Obsidian installé et une voûte créée.' }],
    };
  }

  try {
    switch (name) {
    case 'obsidian_add_antipattern': {
      const pName = args.project || (syncEngine.detectWorkspaceStack(process.cwd()).name);
      const result = syncEngine.addProjectAntipattern(vaultPath, pName, args.rule);
      return {
        content: [{
          type: 'text',
          text: result.error
            ? `Erreur : ${result.error}`
            : `Anti-patron enregistré dans Obsidian et synchronisé dans .agents/rules/project-rules.md pour "${pName}" :\n- INTERDIT : ${args.rule}`,
        }],
      };
    }

    case 'obsidian_list_antipatterns': {
      const pName = args.project || (syncEngine.detectWorkspaceStack(process.cwd()).name);
      const list = syncEngine.listProjectAntipatterns(vaultPath, pName);
      return {
        content: [{
          type: 'text',
          text: list.length > 0
            ? `Anti-patrons enregistrés pour "${pName}" :\n${list.map(r => `- ${r}`).join('\n')}`
            : `Aucun anti-patron enregistré pour "${pName}".`,
        }],
      };
    }

      case 'obsidian_triage': {
        const result = syncEngine.triageContext(vaultPath, args.query);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      case 'obsidian_peek': {
        const result = syncEngine.peekMemory(vaultPath, args.noteName);
        if (result.error) {
          return { isError: true, content: [{ type: 'text', text: result.error }] };
        }
        return {
          content: [{
            type: 'text',
            text: `# ${result.title} [${result.category.toUpperCase()}]\n> **Résumé :** ${result.summary}\n\n### Solution :\n${result.solution}`,
          }],
        };
      }

      case 'obsidian_status': {
        const stats = syncEngine.getVaultStats(vaultPath);
        const vaultName = path.basename(vaultPath);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              connected: true,
              vaultName,
              vaultPath,
              stats,
            }, null, 2),
          }],
        };
      }

      case 'obsidian_search': {
        const query = (args.query || '').toLowerCase();
        const folder = args.folder && args.folder !== 'Toutes' ? args.folder : null;
        const FOLDER_MAP = { 'Memoires': '00_Agent/Memoires', 'Skills': '01_Skills', 'Projets': '02_Projets' };
        const baseSearchDir = folder
          ? path.join(vaultPath, FOLDER_MAP[folder] || folder)
          : vaultPath;

        if (!fs.existsSync(baseSearchDir)) {
          return { content: [{ type: 'text', text: 'Aucune note trouvée à l\'emplacement spécifié.' }] };
        }

        const matches = [];
        function scan(dir) {
          for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
              scan(fullPath);
            } else if (item.isFile() && item.name.endsWith('.md')) {
              const content = fs.readFileSync(fullPath, 'utf8');
              if (item.name.toLowerCase().includes(query) || content.toLowerCase().includes(query)) {
                const relPath = path.relative(vaultPath, fullPath);
                matches.push({
                  title: item.name.replace(/\.md$/, ''),
                  path: relPath,
                  preview: content.slice(0, 200).replace(/\r?\n/g, ' '),
                });
              }
            }
          }
        }
        scan(baseSearchDir);

        return {
          content: [{
            type: 'text',
            text: matches.length > 0
              ? JSON.stringify(matches.slice(0, 10), null, 2)
              : `Aucune note trouvée correspondant à "${args.query}".`,
          }],
        };
      }

      case 'obsidian_read_note': {
        let noteName = args.noteNameOrPath.trim();
        if (!noteName.endsWith('.md')) noteName += '.md';

        // Try direct relative path
        let targetFile = path.join(vaultPath, noteName);
        if (!fs.existsSync(targetFile)) {
          // Try under Antigravity
          targetFile = path.join(vaultPath, 'Antigravity', noteName);
        }
        if (!fs.existsSync(targetFile)) {
          // Search recursively
          let found = null;
          function find(dir) {
            for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
              const fp = path.join(dir, f.name);
              if (f.isDirectory()) find(fp);
              else if (f.name.toLowerCase() === path.basename(noteName).toLowerCase()) {
                found = fp;
                break;
              }
            }
          }
          find(vaultPath);
          targetFile = found;
        }

        if (!targetFile || !fs.existsSync(targetFile)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Note introuvable : ${args.noteNameOrPath}` }],
          };
        }

        const noteContent = fs.readFileSync(targetFile, 'utf8');
        return {
          content: [{ type: 'text', text: noteContent }],
        };
      }

      case 'obsidian_save_memory': {
        const result = syncEngine.saveNewMemory(vaultPath, args);
        syncEngine.generateHub(vaultPath, process.cwd());
        return {
          content: [{
            type: 'text',
            text: `✅ Mémoire "${result.title}" enregistrée avec succès dans Obsidian :\n${result.path}`,
          }],
        };
      }

      case 'obsidian_save_skill': {
        const result = syncEngine.saveSkill(vaultPath, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          scope: args.scope || 'global',
          triggers: args.triggers,
        });
        syncEngine.syncSkillsToVault(vaultPath, process.cwd());
        syncEngine.generateHub(vaultPath, process.cwd());
        const scopeLabel = (args.scope || 'global') === 'project' ? 'locale de ce projet (.agents/skills/)' : 'globale (disponible dans TOUS les projets dans ~/.gemini/config/skills/)';
        return {
          content: [{
            type: 'text',
            text: `Skill "${result.name}" enregistrée et catégorisée comme ${scopeLabel}. Fiche liée dans Obsidian et exécutable disponible dans Antigravity.`,
          }],
        };
      }

      case 'obsidian_sync_all': {
        const result = syncEngine.syncAll(vaultPath, process.cwd());
        return {
          content: [{
            type: 'text',
            text: `Synchronisation complète avec Obsidian terminée :\n- Skills synchronisées : ${result.skillsCount}\n- Mémoires synchronisées : ${result.memoriesCount}\n- Hub mis à jour : ${result.hub}`,
          }],
        };
      }

      case 'obsidian_session_save': {
        const pName = args.project || path.basename(process.cwd());
        const result = syncEngine.saveSessionCheckpoint(vaultPath, {
          project: pName,
          summary: args.summary,
          content: args.content,
          tags: args.tags,
        });
        const dateStr = new Date().toISOString().split('T')[0];
        const safeP = (pName || 'General').replace(/[\/:*?"<>|\\]/g, '-').trim();
        return {
          content: [{
            type: 'text',
            text: `Checkpoint enregistré avec succès dans le Daily Log de ${pName} :\n03_Sessions/${dateStr} - ${safeP}.md\nRésumé : ${args.summary}`,
          }],
        };
      }

      case 'obsidian_session_last': {
        const pName = args.project || '';
        const sesFolder = path.join(vaultPath, '03_Sessions');
        if (!fs.existsSync(sesFolder)) {
          return { content: [{ type: 'text', text: 'Aucune session enregistrée.' }] };
        }
        const files = fs.readdirSync(sesFolder).filter(f => f.endsWith('.md') && !f.startsWith('00'));
        const list = [];
        for (const f of files) {
          try {
            const fp = path.join(sesFolder, f);
            const c = fs.readFileSync(fp, 'utf8');
            let proj = '';
            const mP = c.match(/^project:\s*["']?([^"'\r\n]+)["']?/m);
            if (mP) proj = mP[1].trim();
            if (pName && proj.toLowerCase() !== pName.toLowerCase() && !f.toLowerCase().includes(pName.toLowerCase())) continue;
            const stat = fs.statSync(fp);
            list.push({ file: f, path: fp, content: c, mtime: stat.mtimeMs, project: proj });
          } catch (e) {}
        }
        list.sort((a, b) => b.mtime - a.mtime);
        if (list.length === 0) {
          return { content: [{ type: 'text', text: `Aucune session précédente pour ${pName || 'ce workspace'}.` }] };
        }
        const latest = list[0];
        const milestones = [];
        const mRegex = /##\s*(\d{2}:\d{2})\s*[—–-]\s*([^\r\n]+)\r?\n([\s\S]*?)(?=(?:\r?\n##\s*\d{2}:\d{2}\s*[—–-])|(?:\r?\n---)|$)/g;
        let mMatch;
        while ((mMatch = mRegex.exec(latest.content)) !== null) {
          milestones.push({ time: mMatch[1], summary: mMatch[2].trim(), details: mMatch[3].trim() });
        }
        let summary = '';
        let details = '';
        if (milestones.length > 0) {
          const lastM = milestones[milestones.length - 1];
          summary = lastM.summary;
          details = lastM.details;
        } else {
          const mSum = latest.content.match(/>\s*\[!NOTE\]\s*\*\*(?:Último Hito|Resumen)[^\r\n]*\*\*\r?\n>\s*([^\r\n]+)/i)
            || latest.content.match(/^summary:\s*["']?([^"'\r\n]+)["']?/m);
          summary = mSum ? mSum[1].trim() : 'Sans résumé';
          const mWork = latest.content.match(/##\s*Trabajo Realizado y Decisiones Técnicas[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
          details = mWork ? mWork[1].trim() : '';
        }
        return {
          content: [{
            type: 'text',
            text: `[SESSION PRÉCÉDENTE : ${latest.project || 'Général'}]\nRésumé : ${summary}\n\nDétails :\n${details}`,
          }],
        };
      }

      case 'obsidian_session_list': {
        const { sessions } = syncEngine.syncSessionsIndex(vaultPath);
        const limit = args.limit || 10;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ total: sessions.length, sessions: sessions.slice(0, limit) }, null, 2),
          }],
        };
      }

      case 'obsidian_learn': {
        const habit = args.habit || '';
        let project = args.project || null;
        if (!project) {
          const projTagMatch = habit.match(/^\[([a-zA-Z0-9_\-.]+)\]/);
          if (projTagMatch) project = projTagMatch[1];
        }
        const isGlobal = !project || project.toLowerCase() === 'global';
        const now = new Date().toISOString().split('T')[0];
        const entry = `- \`[${now}]\` ${habit}`;
        let target = '';

        if (isGlobal) {
          const userFile = path.join(vaultPath, '00_Agent', 'USER.md');
          if (fs.existsSync(userFile)) {
            let uContent = fs.readFileSync(userFile, 'utf8');
            if (uContent.includes('## 4. Aprendizajes y Preferencias Dinámicas Acumuladas')) {
              uContent = uContent.replace('## 4. Aprendizajes y Preferencias Dinámicas Acumuladas', `## 4. Aprendizajes y Preferencias Dinámicas Acumuladas\n${entry}`);
            } else {
              uContent += `\n## 4. Aprendizajes y Preferencias Dinámicas Acumuladas\n${entry}\n`;
            }
            fs.writeFileSync(userFile, uContent, 'utf8');
          }
          target = '00 Perfil de Usuario.md';
        } else {
          const projDir = path.join(vaultPath, '02_Projets');
          if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });
          const projFile = path.join(projDir, `${project}.md`);
          if (fs.existsSync(projFile)) {
            let pContent = fs.readFileSync(projFile, 'utf8');
            const h = '## Reglas y Condiciones Obligatorias del Proyecto';
            if (pContent.includes(h)) {
              pContent = pContent.replace(h, `${h}\n${entry}`);
            } else {
              const splitIdx = pContent.lastIndexOf('---');
              if (splitIdx !== -1) pContent = pContent.slice(0, splitIdx) + `${h}\n${entry}\n\n` + pContent.slice(splitIdx);
              else pContent += `\n${h}\n${entry}\n`;
            }
            fs.writeFileSync(projFile, pContent, 'utf8');
            try {
              syncEngine.syncProjectRulesToWorkspace(vaultPath, process.cwd(), project);
            } catch (e) {}
          }
          target = `02_Projets/${project}.md`;
        }
        return {
          content: [{
            type: 'text',
            text: `Apprentissage assimilé et persisté dans ${target} :\n${entry}`,
          }],
        };
      }

      case 'obsidian_open_note': {
        const vaultName = path.basename(vaultPath);
        const encodedVault = encodeURIComponent(vaultName);
        let note = args.notePath.replace(/\\/g, '/');
        if (note.endsWith('.md')) note = note.slice(0, -3);
        const encodedFile = encodeURIComponent(note);
        const uri = `obsidian://open?vault=${encodedVault}&file=${encodedFile}`;

        if (process.platform === 'win32') {
          exec(`start "" "${uri}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${uri}"`);
        } else {
          exec(`xdg-open "${uri}"`);
        }

        return {
          content: [{ type: 'text', text: `Note ouverte dans l'app Obsidian : ${uri}` }],
        };
      }

      case 'memory_update':
      case 'obsidian_memory_update': {
        const result = syncEngine.updateBoundedMemory(vaultPath, args.target, args.operation, args.content);
        if (result.isError) {
          return {
            isError: true,
            content: [{
              type: 'text',
              text: `${result.error}\n\n[CONTEXT FOR CONDENSATION / PRUNING]:\nCurrent characters: ${result.current_chars || 0}/${result.limit}\nAttempted: ${result.attempted_chars || 0} chars (Overflow: +${result.overflow || 0})\n\nCurrent content in ${result.target || args.target}:\n"""\n${result.current_content || ''}\n"""\n\n${result.instruction || 'Condense and prune obsolete facts, then call memory_update with operation="replace" (or "prune").'}`
            }],
          };
        }
        return {
          content: [{
            type: 'text',
            text: result.message,
          }],
        };
      }

      case 'skill_get':
      case 'obsidian_skill_get': {
        const sName = args.skill_name || args.skillName || args.name;
        const result = syncEngine.getSkill(vaultPath, sName);
        if (result.isError) {
          return { isError: true, content: [{ type: 'text', text: result.error }] };
        }
        return {
          content: [{
            type: 'text',
            text: result.content,
          }],
        };
      }

      case 'skill_save':
      case 'obsidian_skill_save': {
        const result = syncEngine.saveHermesSkill(vaultPath, {
          skill_name: args.skill_name || args.skillName || args.name,
          content: args.content,
          version_bump: args.version_bump !== undefined ? args.version_bump : args.versionBump,
          triggers: args.triggers,
        });
        if (result.isError) {
          return { isError: true, content: [{ type: 'text', text: result.error }] };
        }
        return {
          content: [{
            type: 'text',
            text: result.message || `Skill "${result.skillName}" enregistrée dans 01_Skills/ (v${result.version}).`,
          }],
        };
      }

      case 'session_recall':
      case 'obsidian_session_recall': {
        const result = syncEngine.sessionRecall(vaultPath, args.query, args.limit || 5);
        if (result.isError) {
          return { isError: true, content: [{ type: 'text', text: result.error }] };
        }
        const matchesText = result.results.length > 0
          ? result.results.map((r, i) => `${i + 1}. [[${r.file}]] (${r.path})\n   ${r.snippet}`).join('\n\n')
          : `Aucune correspondance dans 03_Sessions/ pour "${args.query}".`;
        return {
          content: [{
            type: 'text',
            text: `[SESSION RECALL : "${result.query}" - ${result.count} correspondances]\n\n${matchesText}`,
          }],
        };
      }

      case 'obsidian_tool_create':
      case 'tool_create': {
        const res = toolsEngine.createTool({
          name: args.name,
          description: args.description,
          command: args.command,
          type: args.type || 'cli',
        }, vaultPath);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2),
          }],
        };
      }


      case 'obsidian_tool_install':
      case 'tool_install': {
        const repoUrl = args.repoUrl || args.url;
        const res = await toolsEngine.installFromGithub(repoUrl, {
          name: args.name,
          description: args.description,
        }, vaultPath);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2),
          }],
        };
      }

      case 'obsidian_tool_list':
      case 'tool_list': {
        const res = toolsEngine.listTools(vaultPath);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2),
          }],
        };
      }

      case 'obsidian_tool_run':
      case 'tool_run': {
        const tName = args.toolName || args.name;
        const tArgs = args.args || [];
        const res = await toolsEngine.runTool(tName, tArgs);
        return {
          content: [{
            type: 'text',
            text: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
          }],
        };
      }

      case 'obsidian_tool_uninstall':
      case 'tool_uninstall': {
        const tName = args.toolName || args.name;
        const res = toolsEngine.uninstallTool(tName, vaultPath);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2),
          }],
        };
      }

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Outil inconnu : ${name}` }],
        };
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Erreur lors de l'exécution de ${name} : ${err.message}` }],
    };
  }
}

// Stdio JSON-RPC Loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  if (!line || !line.trim()) return;

  let request;
  try {
    request = JSON.parse(line.trim());
  } catch (err) {
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'antigravity-obsidian-mcp',
          version: '1.0.0',
        },
      },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: EXPOSED_TOOLS,
      },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    const result = await executeTool(name, toolArgs || {});
    const response = {
      jsonrpc: '2.0',
      id,
      result,
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (id !== undefined) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Méthode non supportée : ${method}`,
      },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});
