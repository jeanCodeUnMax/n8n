const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

/**
 * Antigravity <-> Obsidian Sync Engine
 * Handles bi-directional synchronization of skills, memories, knowledge items,
 * and project context into standard Obsidian markdown files with frontmatter and wikilinks.
 */

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function resolveWorkspaceRoot(startPath) {
  if (!startPath) return process.cwd();
  let current = path.resolve(startPath);
  try {
    if (fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch (e) {}

  let checkDir = current;
  while (checkDir) {
    if (fs.existsSync(path.join(checkDir, '.agents'))) {
      return checkDir;
    }
    if (fs.existsSync(path.join(checkDir, '.git'))) {
      return checkDir;
    }
    const parent = path.dirname(checkDir);
    if (!parent || parent === checkDir) break;
    checkDir = parent;
  }
  return current;
}

function getAntigravityPaths() {
  const home = os.homedir();
  const globalSkillsDir = path.join(home, '.gemini', 'config', 'skills');
  const builtinSkillsDir = path.join(home, '.gemini', 'antigravity-ide', 'builtin', 'skills');
  const mcpConfigFile = path.join(home, '.gemini', 'config', 'mcp_config.json');
  return {
    globalSkillsDir,
    builtinSkillsDir,
    skillsDir: globalSkillsDir,
    knowledgeDir: path.join(home, '.gemini', 'antigravity-ide', 'knowledge'),
    brainDir: path.join(home, '.gemini', 'antigravity-ide', 'brain'),
    configDir: path.join(home, '.gemini', 'config'),
    mcpConfigFile,
  };
}

// -------------------------------------------------------------
// Hermes Agent Closed Learning Loop (Nous Research Architecture)
// -------------------------------------------------------------
const HERMES_USER_MAX_CHARS = 1500;
const HERMES_MEMORY_MAX_CHARS = 2500;

function ensureVaultStructure(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    throw new Error(`El Vault de Obsidian no existe: ${vaultPath}`);
  }

  // 0. Migration : renommer les anciens dossiers espagnols vers les noms francais
  const legacyDirs = [
    ['00_Agente', '00_Agent'],
    ['00_Agent', 'Memorias', 'Memoires'],
    ['02_Proyectos', '02_Projets'],
    ['03_Sesiones', '03_Sessions'],
    ['04_Herramientas', '04_Outils'],
  ];
  for (const entry of legacyDirs) {
    if (entry.length === 2) {
      const oldP = path.join(vaultPath, entry[0]);
      const newP = path.join(vaultPath, entry[1]);
      if (fs.existsSync(oldP) && !fs.existsSync(newP)) fs.renameSync(oldP, newP);
    } else {
      const oldP = path.join(vaultPath, entry[0], entry[1]);
      const newP = path.join(vaultPath, entry[0], entry[2]);
      if (fs.existsSync(oldP) && !fs.existsSync(newP)) fs.renameSync(oldP, newP);
    }
  }
  const oldToolIdx = path.join(vaultPath, '04_Outils', '00 Indice de Herramientas.md');
  const newToolIdx = path.join(vaultPath, '04_Outils', '00 Index des Outils.md');
  if (fs.existsSync(oldToolIdx) && !fs.existsSync(newToolIdx)) fs.renameSync(oldToolIdx, newToolIdx);

  // 1. Official Hermes Directory Structure
  const hermesDirs = [
    path.join(vaultPath, '00_Agent'),
    path.join(vaultPath, '00_Agent', 'Memoires'),
    path.join(vaultPath, '01_Skills'),
    path.join(vaultPath, '02_Projets'),
    path.join(vaultPath, '03_Sessions'),
    path.join(vaultPath, '03_Sessions', 'Trajectories'),
    path.join(vaultPath, '04_Outils'),
  ];

  for (const d of hermesDirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  // 2. Clean and purge legacy Antigravity directory completely
  const legacyBase = path.join(vaultPath, 'Antigravity');
  if (fs.existsSync(legacyBase)) {
    try {
      migrateToHermes(vaultPath);
      fs.rmSync(legacyBase, { recursive: true, force: true });
    } catch (e) {}
  }

  // Initialize Hermes Core notes
  try {
    ensureHermesCore(vaultPath);
  } catch (e) {}

  return vaultPath;
}

function ensureHermesCore(vaultPath, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;

  const agenteDir = path.join(vaultPath, '00_Agent');
  if (!fs.existsSync(agenteDir)) {
    fs.mkdirSync(agenteDir, { recursive: true });
  }

  const soulFile = path.join(agenteDir, 'SOUL.md');
  const userFile = path.join(agenteDir, 'USER.md');
  const memoryFile = path.join(agenteDir, 'MEMORY.md');

  const now = new Date().toISOString().split('T')[0];
  const userName = resolveUserName(vaultPath, options.userName);
  const lang = resolveLanguage(options);
  const isEn = (lang === 'en');
  const isFr = (lang === 'fr');

  // 1. SOUL.md (Inmutable, principios operativos y tono)
  if (!fs.existsSync(soulFile) || options.forceUpdate) {
    const soulContent = isFr
      ? `---
title: "Soul de l'Agent Hermes"
type: hermes-soul
last_updated: ${now}
---

# Soul de l'Agent — Principes Opérationnels & Identité

> [!NOTE] **Identité Fondamentale**
> Tu es Antigravity / Hermes : un ingénieur logiciel senior d'élite, autonome et d'une précision chirurgicale. Pragmatique, direct et rigoureux. Jamais un chatbot passif.

## Directives Fondamentales Non Négociables
1. **Exécution Autonome :** diagnostique les causes racines, implémente des solutions complètes, vérifie tests/compilations et livre des résultats finaux fonctionnels sans demander la permission pour les étapes évidentes.
2. **Zéro Remplissage & Zéro Friction :** communication technique dense et synthétique. Zéro jargon corporate, zéro condescendance, zéro excuses vides. Strictement ZÉRO EMOJI à tout moment.
3. **Ingénierie Multiplateforme :** solutions propres, modulaires et vérifiées pour Windows, Ubuntu (Linux) et macOS.
4. **Boucle Fermée Hermes :** auto-corrige les skills procédurales dans \`01_Skills/\` quand elles échouent. Maintiens la mémoire strictement sous les quotas de caractères.
`
      : isEn
      ? `---
title: "Hermes Agent Soul"
type: hermes-soul
last_updated: ${now}
---

# Agent Soul — Operational Principles & Identity

> [!NOTE] **Core Identity**
> You are Antigravity / Hermes: an elite, autonomous, senior software engineer with surgical precision. Pragmatic, direct, and rigorous. Never a passive chatbot.

## Core Non-Negotiable Directives
1. **Autonomous Execution:** Diagnose root causes, implement complete solutions, verify tests/compilations, and deliver final working results without asking permission for obvious steps.
2. **Zero Fluff & Zero Friction:** Synthetic, dense technical communication. Zero corporate filler, zero condescension, zero empty apologies. Strictly ZERO EMOJIS at all times.
3. **Cross-Platform Engineering:** Clean, modular, verified solutions for Windows, Ubuntu (Linux), and macOS.
4. **Hermes Closed Loop:** Self-correct procedural skills in \`01_Skills/\` when they fail. Keep memory strictly bounded below character quotas.
`
      : `---
title: "Soul de Hermes"
type: hermes-soul
last_updated: ${now}
---

# Soul de Hermes — Identidad y Principios Operativos

> [!NOTE] **Identidad Operativa**
> Eres Antigravity / Hermes: un ingeniero senior de élite, autónomo, pragmático y de precisión quirúrgica. Socio técnico pair-programming, nunca un chatbot pasivo.

## Principios Inmutables
1. **Resolución Autónoma:** Diagnostica la causa raíz, implementa código completo verificado y entrega resultados terminados sin pedir permiso para pasos obvios.
2. **Cero Paja y Cero Fricción:** Comunicación técnica sintética y densa. Cero preámbulos genéricos, cero disculpas vacías y estrictamente CERO EMOJIS en absolutamente todo momento.
3. **Rigor Multiplataforma:** Soluciones limpias y verificadas para Windows, Ubuntu (Linux) y macOS.
4. **Bucle Cerrado Hermes:** Auto-repara skills en \`01_Skills/\` cuando fallen y mantén la memoria acotada bajo las cuotas estrictas de caracteres.
`;
    fs.writeFileSync(soulFile, soulContent, 'utf8');
  }

  // 2. USER.md (Bounded to 1,500 chars)
  if (!fs.existsSync(userFile) || options.forceUpdate) {
    let initialUserContent = '';
    const legacyUserPath = path.join(vaultPath, '00_Agent', 'USER.md');
    const habitBullets = [];

    if (fs.existsSync(legacyUserPath) && !options.forceUpdate) {
      try {
        const legacyRaw = fs.readFileSync(legacyUserPath, 'utf8');
        const lines = legacyRaw.split('\n');
        let inHabits = false;
        for (const l of lines) {
          if (/##\s*(?:Aprendizajes Registrados|Learned Habits|Aprendizajes|Habitudes Apprises|Apprentissages)/i.test(l)) {
            inHabits = true;
            continue;
          }
          if (inHabits && /^##\s+/.test(l)) {
            inHabits = false;
          }
          if (inHabits && l.trim().startsWith('-')) {
            habitBullets.push(l.trim());
          }
        }
      } catch (e) {}
    }

    const baseUser = isFr
      ? `---
user: "${userName}"
quota: ${HERMES_USER_MAX_CHARS}
updated: ${now}
---

# Profil Utilisateur — ${userName}

## Préférences & Communication
- **Communication :** dense, technique, directe. Adapte-toi à la langue active. Zéro formules de politesse.
- **Formatage :** strictement ZÉRO EMOJI dans tout le code, les notes et les chats.
- **Vérification :** préfère du code vérifié et fonctionnel aux explications théoriques.
- **Filtre Anti-Bruit :** n'enregistre que les déblocages non triviaux, les règles d'architecture ou les directives explicites de l'utilisateur.`
      : isEn
      ? `---
user: "${userName}"
quota: ${HERMES_USER_MAX_CHARS}
updated: ${now}
---

# User Profile — ${userName}

## Preferences & Dialectics
- **Communication:** Dense, technical, direct. Adapt to active language. Zero pleasantries.
- **Formatting:** Strictly ZERO EMOJIS across all code, notes, and chats.
- **Verification:** Prefers verified working code over theoretical explanations.
- **Anti-Noise Filter:** Only record non-trivial breakthroughs, architectural rules, or explicit user directives.`
      : `---
user: "${userName}"
quota: ${HERMES_USER_MAX_CHARS}
updated: ${now}
---

# Perfil del Usuario — ${userName}

## Preferencias y Comunicación
- **Estilo:** Técnico, directo, denso y sintético. Cero relleno corporativo.
- **Formato:** Estrictamente CERO EMOJIS en explicaciones, código, notas y commits.
- **Rigor:** Soluciones verificadas y probadas antes de dar por cerrada la tarea.
- **Filtro Anti-Ruido:** Guardar únicamente soluciones a bloqueos difíciles, condiciones de entorno y directrices explícitas.`;

    let habitsHeader = isFr ? '\n\n## Habitudes Apprises & Règles de Projet\n' : isEn ? '\n\n## Learned Habits & Project Rules\n' : '\n\n## Aprendizajes Registrados por Antigravity\n';
    let combinedHabits = habitBullets.join('\n');
    let candidate = habitBullets.length > 0 ? (baseUser + habitsHeader + combinedHabits) : baseUser;

    if (candidate.length > HERMES_USER_MAX_CHARS) {
      // Gracefully prune oldest habits to fit within quota
      while (habitBullets.length > 0 && (baseUser + habitsHeader + habitBullets.join('\n')).length > (HERMES_USER_MAX_CHARS - 30)) {
        habitBullets.shift();
      }
      candidate = habitBullets.length > 0 ? (baseUser + habitsHeader + habitBullets.join('\n')) : baseUser;
    }

    initialUserContent = candidate.slice(0, HERMES_USER_MAX_CHARS);
    fs.writeFileSync(userFile, initialUserContent, 'utf8');
  }

  // 3. MEMORY.md (Bounded to 2,500 chars)
  if (!fs.existsSync(memoryFile) || options.forceUpdate) {
    const legacyMemDir = path.join(vaultPath, '00_Agent', 'Memoires');
    const memoryFacts = [];
    if (fs.existsSync(legacyMemDir)) {
      try {
        const memFiles = fs.readdirSync(legacyMemDir).filter(f => f.endsWith('.md') && !f.startsWith('00'));
        for (const mf of memFiles.slice(0, 12)) {
          try {
            const mContent = fs.readFileSync(path.join(legacyMemDir, mf), 'utf8');
            const mTitle = mf.replace(/\.md$/, '');
            const sumMatch = mContent.match(/>\s*\[!(?:NOTE|ABSTRACT)\][^\r\n]*\r?\n>\s*([^\r\n]+)/i)
              || mContent.match(/^summary:\s*["']?([^"'\r\n]+)["']?/m);
            const sum = sumMatch ? sumMatch[1].trim() : mTitle;
            memoryFacts.push(`- **${mTitle}:** ${sum.slice(0, 110)}`);
          } catch (e) {}
        }
      } catch (e) {}
    }

    const baseMem = isFr
      ? `---
type: core-memory
quota: ${HERMES_MEMORY_MAX_CHARS}
updated: ${now}
---

# Mémoire d'Environnement Centrale

## Faits Système & Infrastructure
- **Plateforme Agent :** Antigravity IDE connecté à un Vault Obsidian local.
- **Architecture :** Boucle d'Apprentissage Fermée Hermes active (Mémoire Bornée & Skills Auto-Améliorées).
- **Règle :** synthétise et élague les entrées obsolètes dès que la limite de quota de 2500 caractères approche.`
      : isEn
      ? `---
type: core-memory
quota: ${HERMES_MEMORY_MAX_CHARS}
updated: ${now}
---

# Core Environment Memory

## System & Infrastructure Facts
- **Agent Platform:** Antigravity IDE connected to local Obsidian Vault.
- **Architecture:** Hermes Closed Learning Loop active (Bounded Memory & Self-Improving Skills).
- **Rule:** Synthesize and prune obsolete entries whenever approaching the 2500 char quota limit.`
      : `---
type: core-memory
quota: ${HERMES_MEMORY_MAX_CHARS}
updated: ${now}
---

# Memoria Central del Entorno (Core Memory)

## Hechos Consolidados del Entorno
- **Plataforma:** Antigravity IDE conectado a Vault local de Obsidian.
- **Arquitectura:** Bucle cerrado Hermes activo (Memoria Acotada y Habilidades Procedurales Vivas).
- **Regla Operativa:** Sintetizar y podar hechos obsoletos cuando el contenido se aproxime al límite de 2500 caracteres.`;

    let factsHeader = isFr ? '\n\n## Faits d\'Environnement Consolidés\n' : isEn ? '\n\n## Consolidated Environment Facts\n' : '\n\n## Hechos Técnicos Heredados del Entorno\n';
    let candidateMem = memoryFacts.length > 0 ? (baseMem + factsHeader + memoryFacts.join('\n')) : baseMem;

    if (candidateMem.length > HERMES_MEMORY_MAX_CHARS) {
      while (memoryFacts.length > 0 && (baseMem + factsHeader + memoryFacts.join('\n')).length > (HERMES_MEMORY_MAX_CHARS - 30)) {
        memoryFacts.pop();
      }
      candidateMem = memoryFacts.length > 0 ? (baseMem + factsHeader + memoryFacts.join('\n')) : baseMem;
    }

    fs.writeFileSync(memoryFile, candidateMem.slice(0, HERMES_MEMORY_MAX_CHARS), 'utf8');
  }

  return { soulFile, userFile, memoryFile };
}

function updateBoundedMemory(vaultPath, target, operation, content) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { isError: true, error: 'Vault de Obsidian no disponible.' };
  }
  ensureVaultStructure(vaultPath);

  let normalizedTarget = (target || '').trim();
  let fileName = '';
  let limit = HERMES_MEMORY_MAX_CHARS;

  if (normalizedTarget.toLowerCase().includes('user')) {
    fileName = 'USER.md';
    limit = HERMES_USER_MAX_CHARS;
  } else if (normalizedTarget.toLowerCase().includes('memory') || normalizedTarget.toLowerCase().includes('memoria')) {
    fileName = 'MEMORY.md';
    limit = HERMES_MEMORY_MAX_CHARS;
  } else {
    return {
      isError: true,
      error: `Destino inválido: "${target}". Debe ser "USER.md" (máx 1500 chars) o "MEMORY.md" (máx 2500 chars).`,
    };
  }

  const filePath = path.join(vaultPath, '00_Agent', fileName);
  let existingContent = '';
  if (fs.existsSync(filePath)) {
    existingContent = fs.readFileSync(filePath, 'utf8');
  }

  const op = (operation || 'append').toLowerCase().trim();
  let newContent = '';
  const safeContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  if (op === 'append') {
    newContent = existingContent ? `${existingContent.trim()}\n- ${safeContent.trim()}` : safeContent.trim();
  } else if (op === 'replace' || op === 'prune') {
    newContent = safeContent.trim();
  } else {
    return {
      isError: true,
      error: `Operación no soportada: "${operation}". Usa únicamente "append" (añadir hecho), "replace" (reemplazar contenido) o "prune" (condensación/poda).`,
    };
  }

  // ENFORCE HARD QUOTA WITH COMPLETE CONTEXT PAYLOAD
  if (newContent.length > limit) {
    return {
      isError: true,
      error: `ERROR: Memory quota exceeded (${newContent.length}/${limit} chars for ${fileName}). Must prune, merge, or delete outdated facts before adding new ones.`,
      current_content: existingContent,
      current_chars: existingContent.length,
      attempted_chars: newContent.length,
      limit,
      overflow: newContent.length - limit,
      instruction: `Review 'current_content' above, synthesize and condense the facts to stay under ${limit} characters, and call memory_update(target="${fileName}", operation="replace", content=pruned_content).`,
    };
  }

  fs.writeFileSync(filePath, newContent, 'utf8');

  // Mirror USER.md to legacy profile note if present
  if (fileName === 'USER.md') {
    try {
      const legacyPath = path.join(vaultPath, '00_Agent', 'USER.md');
      if (fs.existsSync(legacyPath)) {
        fs.writeFileSync(legacyPath, newContent, 'utf8');
      }
    } catch (e) {}
  }

  // Refresh bootstrap rule in Antigravity
  try {
    const { installSkillAndRules } = require('./skill-installer');
    installSkillAndRules(vaultPath);
  } catch (e) {}

  return {
    isError: false,
    target: fileName,
    currentLength: newContent.length,
    current_chars: newContent.length,
    limit,
    remainingChars: limit - newContent.length,
    message: `Memoria ${fileName} actualizada correctamente (${newContent.length}/${limit} chars). Bootstrap refrescado.`,
  };
}

function getSkill(vaultPath, skillName) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { isError: true, error: 'Vault no encontrado.' };
  }
  let cleanName = (skillName || '').trim().replace(/\.md$/, '');
  const hermesSkillPath = path.join(vaultPath, '01_Skills', `${cleanName}.md`);
  if (fs.existsSync(hermesSkillPath)) {
    return {
      isError: false,
      skillName: cleanName,
      path: hermesSkillPath,
      content: fs.readFileSync(hermesSkillPath, 'utf8'),
    };
  }

  const legacySkillPath = path.join(vaultPath, 'Antigravity', 'Skills', `${cleanName}.md`);
  if (fs.existsSync(legacySkillPath)) {
    return {
      isError: false,
      skillName: cleanName,
      path: legacySkillPath,
      content: fs.readFileSync(legacySkillPath, 'utf8'),
    };
  }

  const globalSkillPath = path.join(os.homedir(), '.gemini', 'config', 'skills', cleanName, 'SKILL.md');
  if (fs.existsSync(globalSkillPath)) {
    return {
      isError: false,
      skillName: cleanName,
      path: globalSkillPath,
      content: fs.readFileSync(globalSkillPath, 'utf8'),
    };
  }

  const wsRoot = resolveWorkspaceRoot();
  if (wsRoot) {
    const wsSkillPath = path.join(wsRoot, '.agents', 'skills', cleanName, 'SKILL.md');
    if (fs.existsSync(wsSkillPath)) {
      return {
        isError: false,
        skillName: cleanName,
        path: wsSkillPath,
        content: fs.readFileSync(wsSkillPath, 'utf8'),
      };
    }
  }

  return {
    isError: true,
    error: `Skill no encontrada: "${skillName}" en 01_Skills/ ni en registro global.`,
  };
}

function saveHermesSkill(vaultPath, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { isError: true, error: 'Vault no encontrado.' };
  }
  ensureVaultStructure(vaultPath);

  const rawName = (options.skill_name || options.skillName || options.name || '').trim();
  if (!rawName) {
    return { isError: true, error: 'Se requiere el nombre de la skill.' };
  }
  const safeName = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  const hermesSkillDir = path.join(vaultPath, '01_Skills');
  const targetFile = path.join(hermesSkillDir, `${safeName}.md`);

  const now = new Date().toISOString().split('T')[0];
  let version = '1.0';
  let triggers = options.triggers || [safeName];

  let rawContent = (options.content || '').trim();

  if (fs.existsSync(targetFile)) {
    const oldContent = fs.readFileSync(targetFile, 'utf8');
    const vMatch = oldContent.match(/^version:\s*([0-9.]+)/m);
    if (vMatch) {
      let currentV = parseFloat(vMatch[1]) || 1.0;
      if (options.version_bump === true || options.versionBump === true || options.version_bump === undefined) {
        version = (Math.round((currentV + 0.1) * 10) / 10).toFixed(1);
      } else {
        version = vMatch[1].trim();
      }
    } else {
      version = '1.1';
    }
    const tMatch = oldContent.match(/^triggers:\s*\[(.*?)\]/m);
    if (tMatch && (!options.triggers || options.triggers.length === 0)) {
      try {
        triggers = tMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } catch (e) {}
    }
  }

  let finalMarkdown = '';
  if (rawContent.startsWith('---')) {
    finalMarkdown = rawContent
      .replace(/^version:\s*.*$/m, `version: ${version}`)
      .replace(/^last_verified:\s*.*$/m, `last_verified: ${now}`);
  } else {
    const triggerList = Array.isArray(triggers) ? triggers : [safeName];
    const triggerStr = JSON.stringify(triggerList);
    finalMarkdown = `---
skill: ${safeName}
version: ${version}
last_verified: ${now}
triggers: ${triggerStr}
---

${rawContent}
`;
  }

  if (!finalMarkdown.includes('## Errores Conocidos y Corrección') && !finalMarkdown.includes('## Known Errors')) {
    finalMarkdown += `\n\n## Errores Conocidos y Corrección (Aprendidos en Ejecución)\n*(Sin errores registrados aún en ejecución)*\n`;
  }

  fs.writeFileSync(targetFile, finalMarkdown, 'utf8');

  // Also sync to legacy Antigravity/Skills folder
  try {
    const legacySkillFile = path.join(vaultPath, 'Antigravity', 'Skills', `${safeName}.md`);
    fs.writeFileSync(legacySkillFile, finalMarkdown, 'utf8');
  } catch (e) {}

  // Also sync to Antigravity global skills
  try {
    const globalSkillDir = path.join(os.homedir(), '.gemini', 'config', 'skills', safeName);
    if (!fs.existsSync(globalSkillDir)) {
      fs.mkdirSync(globalSkillDir, { recursive: true });
    }
    const skillMdPath = path.join(globalSkillDir, 'SKILL.md');
    const skillDesc = options.description || `Playbook operativo Hermes: ${safeName}`;
    const antigravitySkillMd = `---
name: ${safeName}
description: >
  ${skillDesc}. Version: ${version}. Triggers: ${Array.isArray(triggers) ? triggers.join(', ') : safeName}.
---

${finalMarkdown}
`;
    fs.writeFileSync(skillMdPath, antigravitySkillMd, 'utf8');
  } catch (e) {}

  // Refresh bootstrap
  try {
    const { installSkillAndRules } = require('./skill-installer');
    installSkillAndRules(vaultPath);
  } catch (e) {}

  return {
    isError: false,
    skillName: safeName,
    version,
    path: targetFile,
    message: `Skill "${safeName}" guardada en 01_Skills/ (v${version}). Disponible en Antigravity y Obsidian.`,
  };
}

function sessionRecall(vaultPath, query, limit = 5) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { isError: true, error: 'Vault no encontrado.' };
  }
  const cleanQ = (query || '').toLowerCase().trim();
  if (!cleanQ) {
    return { isError: true, error: 'Query de búsqueda requerida.' };
  }

  const searchDirs = [
    path.join(vaultPath, '03_Sessions'),
    path.join(vaultPath, '03_Sessions', 'Trajectories'),
    path.join(vaultPath, '03_Sessions'),
  ];

  const results = [];
  const maxResults = limit || 5;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue;
        const filePath = path.join(dir, f.name);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lower = content.toLowerCase();
          const matchIdx = lower.indexOf(cleanQ);
          if (matchIdx !== -1) {
            const start = Math.max(0, matchIdx - 80);
            const end = Math.min(content.length, matchIdx + 200);
            let snippet = content.slice(start, end).replace(/\r?\n/g, ' ').trim();
            if (start > 0) snippet = '...' + snippet;
            if (end < content.length) snippet += '...';

            let mtime = 0;
            try { mtime = fs.statSync(filePath).mtimeMs; } catch (e) {}

            results.push({
              file: f.name,
              path: path.relative(vaultPath, filePath).replace(/\\/g, '/'),
              snippet,
              mtime,
            });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  results.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const finalResults = results.slice(0, maxResults);

  return {
    isError: false,
    query,
    count: finalResults.length,
    results: finalResults,
  };
}

function compileHermesBootstrap(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return '';
  }
  ensureVaultStructure(vaultPath);

  const soulFile = path.join(vaultPath, '00_Agent', 'SOUL.md');
  const userFile = path.join(vaultPath, '00_Agent', 'USER.md');
  const memoryFile = path.join(vaultPath, '00_Agent', 'MEMORY.md');

  const soulText = fs.existsSync(soulFile) ? fs.readFileSync(soulFile, 'utf8').trim() : 'Senior autonomous engineer, pragmatic, zero fluff.';
  const userText = fs.existsSync(userFile) ? fs.readFileSync(userFile, 'utf8').trim() : 'User Profile: Direct technical communication, zero emojis.';
  const memText = fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, 'utf8').trim() : 'Core Memory: Hermes Closed Learning Loop active.';

  const userChars = userText.length;
  const memChars = memText.length;

  // Scan 01_Skills/
  const skillsIndexLines = [];
  const skillsDir = path.join(vaultPath, '01_Skills');
  if (fs.existsSync(skillsDir)) {
    try {
      const sFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
      for (const sf of sFiles) {
        try {
          const sContent = fs.readFileSync(path.join(skillsDir, sf), 'utf8');
          const sName = sf.replace(/\.md$/, '');
          const tMatch = sContent.match(/^triggers:\s*(\[.*?\]|[^\r\n]+)/m);
          let triggerInfo = '';
          if (tMatch) triggerInfo = ` (triggers: ${tMatch[1].trim()})`;
          const vMatch = sContent.match(/^version:\s*([0-9.]+)/m);
          const vStr = vMatch ? `v${vMatch[1]}` : '';
          skillsIndexLines.push(`- ${sName} ${vStr}${triggerInfo}`);
        } catch (e) {}
      }
    } catch (e) {}
  }

  if (skillsIndexLines.length === 0) {
    const globalSkillsDir = path.join(os.homedir(), '.gemini', 'config', 'skills');
    if (fs.existsSync(globalSkillsDir)) {
      try {
        const dirs = fs.readdirSync(globalSkillsDir, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory() && !d.name.includes('obsidian')) {
            skillsIndexLines.push(`- ${d.name}: Playbook ejecutable bajo demanda.`);
          }
        }
      } catch (e) {}
    }
  }

  const skillsIndexStr = skillsIndexLines.length > 0
    ? skillsIndexLines.join('\n')
    : '- (No hay skills guardadas aún en 01_Skills/)';

  return [
    '══════════════════════════════════════════════════════════════',
    '[SYSTEM BOOTSTRAP: HERMES MEMORY ACTIVE]',
    '-- SOUL (Identidad y Directivas)',
    soulText,
    '',
    `-- USER PROFILE [${userChars}/${HERMES_USER_MAX_CHARS} chars]`,
    userText,
    '',
    `-- CORE MEMORY [${memChars}/${HERMES_MEMORY_MAX_CHARS} chars]`,
    memText,
    '',
    '-- SKILLS INDEX (Carga bajo demanda vía skill_get)',
    skillsIndexStr,
    '══════════════════════════════════════════════════════════════',
  ].join('\n');
}

function getHermesQuotas(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return {
      userChars: 0,
      userLimit: HERMES_USER_MAX_CHARS,
      userPercent: 0,
      memChars: 0,
      memLimit: HERMES_MEMORY_MAX_CHARS,
      memPercent: 0,
      skillsCount: 0,
    };
  }
  ensureVaultStructure(vaultPath);

  const userFile = path.join(vaultPath, '00_Agent', 'USER.md');
  const memoryFile = path.join(vaultPath, '00_Agent', 'MEMORY.md');
  const skillsDir = path.join(vaultPath, '01_Skills');

  const userChars = fs.existsSync(userFile) ? fs.readFileSync(userFile, 'utf8').length : 0;
  const memChars = fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, 'utf8').length : 0;
  let skillsCount = 0;
  if (fs.existsSync(skillsDir)) {
    try {
      skillsCount = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md')).length;
    } catch (e) {}
  }

  return {
    userChars,
    userLimit: HERMES_USER_MAX_CHARS,
    userPercent: Math.min(100, Math.round((userChars / HERMES_USER_MAX_CHARS) * 100)),
    memChars,
    memLimit: HERMES_MEMORY_MAX_CHARS,
    memPercent: Math.min(100, Math.round((memChars / HERMES_MEMORY_MAX_CHARS) * 100)),
    skillsCount,
  };
}

function migrateToHermes(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return { migratedSkills: 0, migratedProjects: 0 };

  const hermesDirs = [
    path.join(vaultPath, '00_Agent'),
    path.join(vaultPath, '01_Skills'),
    path.join(vaultPath, '02_Projets'),
    path.join(vaultPath, '03_Sessions'),
    path.join(vaultPath, '03_Sessions', 'Trajectories'),
  ];
  for (const d of hermesDirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // 1. Ensure Hermes Core notes (SOUL, USER, MEMORY)
  ensureHermesCore(vaultPath);

  let migratedSkills = 0;
  let migratedProjects = 0;

  // 2. Migrate legacy skills to 01_Skills with full Hermes living playbook schema
  const legacySkillsDir = path.join(vaultPath, '01_Skills');
  const hermesSkillsDir = path.join(vaultPath, '01_Skills');
  if (fs.existsSync(legacySkillsDir)) {
    try {
      const files = fs.readdirSync(legacySkillsDir).filter(f => f.endsWith('.md') && !f.startsWith('00'));
      for (const f of files) {
        const cleanSkillName = f.replace(/^\[(?:Proyecto|Project|Projet)\]\s*/i, '').replace(/\.md$/, '');
        const dest = path.join(hermesSkillsDir, `${cleanSkillName}.md`);
        const legacyPath = path.join(legacySkillsDir, f);
        const legacyContent = fs.readFileSync(legacyPath, 'utf8');

        // Clean up legacy prefixed duplicate in 01_Skills if present
        const oldPrefixedDest = path.join(hermesSkillsDir, f);
        if (oldPrefixedDest !== dest && fs.existsSync(oldPrefixedDest)) {
          try { fs.unlinkSync(oldPrefixedDest); } catch (e) {}
        }

        // Check if destination exists and already has Hermes metadata
        const needsHermesWrap = !fs.existsSync(dest) || !legacyContent.includes('version:');

        if (needsHermesWrap) {
          // Extract description / tags / content
          const tagMatches = legacyContent.match(/tags:\s*\[(.*?)\]/) || legacyContent.match(/tags:\s*\n((?:\s*-\s*[^\n]+\n?)+)/);
          let triggers = [cleanSkillName];
          if (tagMatches) {
            const rawTags = tagMatches[1].replace(/-\s*/g, '').replace(/antigravity\/skill/g, '').split(/[\n,]/).map(t => t.trim()).filter(Boolean);
            triggers = [...new Set([...triggers, ...rawTags])];
          }

          let body = legacyContent.replace(/^---[\s\S]*?---\s*/, '').trim();
          let procedure = body;
          let errorsSection = '- Sin incidencias iniciales registradas en ejecución.';

          if (body.includes('## Instrucciones')) {
            const parts = body.split('## Instrucciones');
            procedure = (parts[1] || body).trim();
          }

          const hermesSkill = [
            '---',
            `skill: ${cleanSkillName}`,
            'version: 1.0',
            `last_verified: ${new Date().toISOString().split('T')[0]}`,
            `triggers: ${JSON.stringify(triggers)}`,
            '---',
            '',
            '## Procedimiento Operativo',
            procedure || 'Procedimiento operativo ejecutable.',
            '',
            '## Errores Conocidos y Corrección (Aprendidos en Ejecución)',
            errorsSection,
            ''
          ].join('\n');

          fs.writeFileSync(dest, hermesSkill, 'utf8');
          // Also update the legacy mirror so both remain compatible
          fs.writeFileSync(legacyPath, hermesSkill, 'utf8');
          migratedSkills++;
        }
      }
    } catch (e) {}
  }

  // 3. Migrate projects to 02_Projets/[Project]/ARCHITECTURE.md + WORKFLOW.md
  const legacyProjDir = path.join(vaultPath, '02_Projets');
  const hermesProjDir = path.join(vaultPath, '02_Projets');
  if (fs.existsSync(legacyProjDir)) {
    try {
      const pFiles = fs.readdirSync(legacyProjDir).filter(f => f.endsWith('.md') && !f.startsWith('00'));
      for (const pf of pFiles) {
        const pName = pf.replace(/\.md$/, '');
        const pFolder = path.join(hermesProjDir, pName);
        if (!fs.existsSync(pFolder)) {
          fs.mkdirSync(pFolder, { recursive: true });
        }
        const archFile = path.join(pFolder, 'ARCHITECTURE.md');
        const workFile = path.join(pFolder, 'WORKFLOW.md');
        if (!fs.existsSync(archFile)) {
          const pContent = fs.readFileSync(path.join(legacyProjDir, pf), 'utf8');
          fs.writeFileSync(archFile, pContent, 'utf8');
          migratedProjects++;
        }
        if (!fs.existsSync(workFile)) {
          fs.writeFileSync(workFile, `# Workflow — ${pName}\n\nComandos reales probados y funcionales para este proyecto.\n\n## Comandos Frecuentes\n- \`npm test\` / \`npm run build\`\n`, 'utf8');
        }
      }
    } catch (e) {}
  }

  return { migratedSkills, migratedProjects };
}

// -------------------------------------------------------------
// Hermes Soul & User Profile Architecture (Multi-language & Dynamic User)
// -------------------------------------------------------------

function resolveUserName(vaultPath, explicitUserName) {
  if (explicitUserName && typeof explicitUserName === 'string' && explicitUserName.trim()) {
    return explicitUserName.trim();
  }
  // Check bridge config
  const home = os.homedir();
  const bridgeConfigPath = path.join(home, '.gemini', 'config', 'antigravity-obsidian.json');
  if (fs.existsSync(bridgeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(bridgeConfigPath, 'utf8'));
      if (cfg.userName && typeof cfg.userName === 'string' && cfg.userName.trim()) {
        return cfg.userName.trim();
      }
    } catch (e) {}
  }
  // Check existing user profile in vault
  if (vaultPath) {
    const userPath = path.join(vaultPath, '00_Agent', 'USER.md');
    if (fs.existsSync(userPath)) {
      try {
        const content = fs.readFileSync(userPath, 'utf8');
        const m = content.match(/^user:\s*["']?([^"'\r\n]+)["']?/m)
          || content.match(/^#+\s*Perfil de Trabajo\s*[—–-]\s*([^\r\n]+)/m)
          || content.match(/^#+\s*Profil de Travail\s*[—–-]\s*([^\r\n]+)/m)
          || content.match(/^#+\s*Work Profile\s*[—–-]\s*([^\r\n]+)/m);
        if (m && m[1].trim() && m[1].trim() !== 'Usuario' && m[1].trim() !== 'User') {
          return m[1].trim();
        }
      } catch (e) {}
    }
  }
  // Try git user name
  try {
    const { execSync } = require('child_process');
    const gitUser = execSync('git config --global user.name', { encoding: 'utf8', timeout: 1000 }).trim();
    if (gitUser) return gitUser;
  } catch (e) {}
  // Fallback to system environment user
  const sysUser = process.env.USERNAME || process.env.USER || (os.userInfo && os.userInfo().username);
  if (sysUser && sysUser.trim()) return sysUser.trim();
  return 'User';
}

function resolveLanguage(options = {}) {
  if (options && options.language && options.language !== 'auto') {
    return options.language.toLowerCase().slice(0, 2);
  }
  // Check bridge config
  const home = os.homedir();
  const bridgeConfigPath = path.join(home, '.gemini', 'config', 'antigravity-obsidian.json');
  if (fs.existsSync(bridgeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(bridgeConfigPath, 'utf8'));
      if (cfg.language && cfg.language !== 'auto') {
        return cfg.language.toLowerCase().slice(0, 2);
      }
    } catch (e) {}
  }

  // Check system environment & OS locale (natural language of the user's machine)
  const intlLocale = (typeof Intl !== 'undefined' && Intl.DateTimeFormat) 
    ? Intl.DateTimeFormat().resolvedOptions().locale 
    : '';
  const envLang = process.env.LANG || process.env.LC_ALL || '';
  let nlsOsLocale = '';
  if (process.env.VSCODE_NLS_CONFIG) {
    try {
      const nls = JSON.parse(process.env.VSCODE_NLS_CONFIG);
      if (nls.osLocale) nlsOsLocale = nls.osLocale;
    } catch (e) {}
  }

  const combinedLocale = (intlLocale + ' ' + envLang + ' ' + nlsOsLocale).toLowerCase();
  if (combinedLocale.includes('fr')) return 'fr';
  if (combinedLocale.includes('es')) return 'es';

  // Check VS Code user locale
  if (process.env.VSCODE_NLS_CONFIG) {
    try {
      const nls = JSON.parse(process.env.VSCODE_NLS_CONFIG);
      if (nls.locale) {
        const vsc = nls.locale.toLowerCase();
        if (vsc.startsWith('fr')) return 'fr';
        if (vsc.startsWith('es')) return 'es';
        if (vsc.startsWith('en')) return 'en';
      }
    } catch (e) {}
  }

  if (combinedLocale.includes('en')) return 'en';
  return 'en';
}

function resolvePersonality(vaultPath, explicitOptions = {}) {
  let aiName = '';
  let userCallsign = '';
  let personality = '';
  let configured = false;

  if (explicitOptions.aiName && typeof explicitOptions.aiName === 'string' && explicitOptions.aiName.trim()) {
    aiName = explicitOptions.aiName.trim();
  }
  if (explicitOptions.userCallsign && typeof explicitOptions.userCallsign === 'string' && explicitOptions.userCallsign.trim()) {
    userCallsign = explicitOptions.userCallsign.trim();
  }
  if (explicitOptions.personality && typeof explicitOptions.personality === 'string' && explicitOptions.personality.trim()) {
    personality = explicitOptions.personality.trim();
  }
  if (explicitOptions.personalityConfigured !== undefined) {
    configured = !!explicitOptions.personalityConfigured;
  }

  const home = os.homedir();
  const bridgeConfigPath = path.join(home, '.gemini', 'config', 'antigravity-obsidian.json');
  if (fs.existsSync(bridgeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(bridgeConfigPath, 'utf8'));
      if (!aiName && cfg.aiName) aiName = cfg.aiName.trim();
      if (!userCallsign && cfg.userCallsign) userCallsign = cfg.userCallsign.trim();
      if (!personality && cfg.personality) personality = cfg.personality.trim();
      if (explicitOptions.personalityConfigured === undefined && cfg.personalityConfigured !== undefined) {
        if (cfg.personalityConfigured) configured = true;
      }
    } catch (e) {}
  }

  // Check vault note if still missing fields or if configured status is recorded there
  if (vaultPath) {
    const almaDir = path.join(vaultPath, '00_Agent');
    const pFile = path.join(almaDir, '00 Personalidad de la IA.md');
    const pFileEn = path.join(almaDir, '00 AI Personality.md');
    const pFileFr = path.join(almaDir, '00 Personnalité IA.md');
    let targetFile = null;
    const existingP = [pFile, pFileEn, pFileFr].filter(f => fs.existsSync(f));
    if (existingP.length === 1) {
      targetFile = existingP[0];
    } else if (existingP.length > 1) {
      try {
        const confP = existingP.filter(f => /configured:\s*true/i.test(fs.readFileSync(f, 'utf8')));
        if (confP.length === 1) {
          targetFile = confP[0];
        } else {
          const rl = resolveLanguage(explicitOptions);
          targetFile = (rl === 'fr' && existingP.includes(pFileFr)) ? pFileFr
            : (rl === 'en' && existingP.includes(pFileEn)) ? pFileEn
            : existingP[0];
        }
      } catch (e) {
        targetFile = existingP[0];
      }
    }
    if (targetFile) {
      try {
        const content = fs.readFileSync(targetFile, 'utf8');
        if (!aiName) {
          const m = content.match(/^ai_name:\s*["']?([^"'\r\n]+)["']?/m);
          if (m) aiName = m[1].trim();
        }
        if (!userCallsign) {
          const m = content.match(/^user_callsign:\s*["']?([^"'\r\n]+)["']?/m);
          if (m) userCallsign = m[1].trim();
        }
        if (!personality) {
          const m = content.match(/##\s*1\.\s*(?:Arquetipo y Rasgos de Personalidad|Archetype & Personality Traits|Archétype et Traits de Personnalité)[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
          if (m && m[1].trim()) personality = m[1].trim();
        }
        if (!configured && explicitOptions.personalityConfigured !== false) {
          const mStatus = content.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
          const mConfigured = content.match(/^configured:\s*(true|false)/m);
          if (mConfigured && mConfigured[1] === 'true') configured = true;
          else if (mStatus && mStatus[1].trim() === 'configured') configured = true;
        }
      } catch (e) {}
    }
  }

  const lang = resolveLanguage(explicitOptions);
  const isEn = (lang === 'en');
  const isFr = (lang === 'fr');
  const defaultUserName = resolveUserName(vaultPath, explicitOptions.userName);

  if (!aiName) aiName = 'Hermes';
  if (!userCallsign) userCallsign = defaultUserName;
  if (!personality) {
    personality = isFr
      ? 'Ingénieur logiciel senior autonome : précision chirurgicale, pragmatique, direct, zéro remplissage corporate et strictement ZÉRO emoji.'
      : isEn
      ? 'Senior autonomous software engineer: surgical, pragmatic, direct, zero corporate fluff, and strictly ZERO emojis.'
      : 'Ingeniero senior de élite, autónomo, pragmático y de precisión quirúrgica. Respuestas técnicas, directas, sin paja corporativa y estrictamente CERO emojis.';
  }

  return {
    aiName,
    userCallsign,
    personality,
    configured,
  };
}

function ensurePersonality(vaultPath, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  ensureVaultStructure(vaultPath);

  const almaDir = path.join(vaultPath, '00_Agent');
  if (!fs.existsSync(almaDir)) {
    fs.mkdirSync(almaDir, { recursive: true });
  }

  const now = new Date().toISOString().split('T')[0];
  const lang = resolveLanguage(options);
  const isEn = (lang === 'en');
  const isFr = (lang === 'fr');
  const pFileName = isFr ? '00 Personnalité IA.md' : isEn ? '00 AI Personality.md' : '00 Personalidad de la IA.md';
  const personalityPath = path.join(almaDir, pFileName);
  const otherFileNames = ['00 AI Personality.md', '00 Personalidad de la IA.md', '00 Personnalité IA.md'].filter(n => n !== pFileName);
  for (const otherFileName of otherFileNames) {
    const otherPath = path.join(almaDir, otherFileName);
    if (fs.existsSync(otherPath)) {
      try { fs.unlinkSync(otherPath); } catch (e) {}
    }
  }

  const { aiName, userCallsign, personality, configured } = resolvePersonality(vaultPath, options);

  const content = isFr
    ? `---
title: "Personnalité de l'IA et Appellation de l'Agent"
type: antigravity-personality
tags:
  - antigravity/personnalite
  - antigravity/agente
ai_name: "${aiName}"
user_callsign: "${userCallsign}"
configured: ${configured}
status: "${configured ? 'configured' : 'pending_onboarding'}"
language: fr
updated: ${now}
---

# Personnalité et Identité de l'Agent — ${aiName}

> [!NOTE] **Identité et Dynamique d'Appellation**
> - **Nom de l'Agent** : \`${aiName}\`
> - **Appellation de l'utilisateur** : \`${userCallsign}\`
> - **État de Calibration** : \`${configured ? 'Configuré (Actif)' : 'En attente de calibration (sera demandé au premier chat)'}\`

## 1. Archétype et Traits de Personnalité
${personality}

## 2. Protocole de Communication
- L'agent répond en assumant pleinement le nom et l'identité de **${aiName}**.
- L'agent s'adresse toujours à l'utilisateur comme **${userCallsign}**.
- Communication technique à haute densité, zéro détour corporate et strictement ZÉRO emoji.
${configured ? '- **Permanence** : la personnalité est verrouillée de façon permanente. L\'IA ne redemandera JAMAIS comment se comporter dans aucun chat, sauf si l\'utilisateur le demande expressément ou utilise `/obsidian personality`.' : '- **Onboarding Actif** : à la première interaction d\'un chat, l\'IA demandera brièvement à l\'utilisateur quel nom lui attribuer, comment s\'adresser à lui et quels traits de personnalité adopter. Une fois répondu, c\'est enregistré ici de façon permanente et elle ne redemandera jamais.'}

---
*Connexions du Graphe :* [[00 Antigravity Hub]] | [[00 Soul Antigravity]] | [[00 Profil Utilisateur]]
`
    : isEn
    ? `---
title: "AI Personality & Agent Identity"
type: antigravity-personality
tags:
  - antigravity/personality
  - antigravity/agent
ai_name: "${aiName}"
user_callsign: "${userCallsign}"
configured: ${configured}
status: "${configured ? 'configured' : 'pending_onboarding'}"
language: en
updated: ${now}
---

# Agent Personality & Identity — ${aiName}

> [!NOTE] **Agent Identity & Communication Dynamics**
> - **Agent Name**: \`${aiName}\`
> - **User Callsign / Title**: \`${userCallsign}\`
> - **Status**: \`${configured ? 'Configured (Active)' : 'Pending Calibration (Will ask during first chat interaction)'}\`

## 1. Archetype & Personality Traits
${personality}

## 2. Communication Protocol
- The agent embodies the identity of **${aiName}** in all interactions.
- The agent always addresses the user as **${userCallsign}**.
- Zero corporate fluff, no condescension, and strictly ZERO emojis.
${configured ? '- **Persistence**: Personality is configured and locked. The AI will NEVER ask again how to behave in any chat unless explicitly requested by the user or via `/obsidian personality`.' : '- **Onboarding Active**: On first chat interaction, the AI will briefly ask the user for their desired AI name, callsign, and personality traits. Once answered, it saves permanently here and never asks again.'}

---
*Graph Connections:* [[00 Antigravity Hub]] | [[00 Soul de Antigravity]] | [[00 Perfil de Usuario]]
`
    : `---
title: "Personalidad de la IA y Trato de Agente"
type: antigravity-personality
tags:
  - antigravity/personalidad
  - antigravity/agente
ai_name: "${aiName}"
user_callsign: "${userCallsign}"
configured: ${configured}
status: "${configured ? 'configured' : 'pending_onboarding'}"
language: es
updated: ${now}
---

# Personalidad e Identidad del Agente — ${aiName}

> [!NOTE] **Identidad y Dinámica de Trato**
> - **Nombre del Agente**: \`${aiName}\`
> - **Trato hacia el usuario**: \`${userCallsign}\`
> - **Estado de Calibración**: \`${configured ? 'Configurado (Activo)' : 'Pendiente de calibración (Se preguntará en el primer chat)'}\`

## 1. Arquetipo y Rasgos de Personalidad
${personality}

## 2. Protocolo de Comunicación
- El agente responderá asumiendo plenamente el nombre e identidad de **${aiName}**.
- El agente se dirigirá siempre al usuario como **${userCallsign}**.
- Comunicación técnica de alta densidad, cero rodeos corporativos y estrictamente CERO emojis.
${configured ? '- **Permanencia**: La personalidad está fijada de forma permanente. La IA NUNCA volverá a preguntar cómo comportarse en ningún chat, a menos que el usuario lo solicite expresamente o use `/obsidian personality`.' : '- **Onboarding Activo**: En la primera interacción de un chat, la IA preguntará al usuario qué nombre asignarle, cómo dirigirse a él y qué comportamiento tener. Tras responder, quedará guardado permanentemente aquí y no volverá a preguntar jamás.'}

---
*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[00 Soul de Antigravity]] | [[00 Perfil de Usuario]]
`;

  if (!fs.existsSync(personalityPath) || options.forceUpdate) {
    fs.writeFileSync(personalityPath, content, 'utf8');
  }

  // Also maintain bridge config
  const home = os.homedir();
  const bridgeConfigPath = path.join(home, '.gemini', 'config', 'antigravity-obsidian.json');
  if (fs.existsSync(bridgeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(bridgeConfigPath, 'utf8'));
      cfg.aiName = aiName;
      cfg.userCallsign = userCallsign;
      cfg.personality = personality;
      if (options.personalityConfigured === false) {
        cfg.personalityConfigured = false;
      } else if (configured || cfg.personalityConfigured) {
        cfg.personalityConfigured = true;
      }
      cfg.lastUpdated = new Date().toISOString();
      fs.writeFileSync(bridgeConfigPath, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {}
  }

  return { personalityPath, aiName, userCallsign, personality, configured };
}

function savePersonality(vaultPath, data = {}, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  const merged = {
    ...options,
    ...data,
    personalityConfigured: data.configured !== undefined ? !!data.configured : true,
    forceUpdate: true,
  };
  return ensurePersonality(vaultPath, merged);
}

function getPersonality(vaultPath, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  const { aiName, userCallsign, personality, configured } = resolvePersonality(vaultPath, options);
  const almaDir = path.join(vaultPath, '00_Agent');
  const lang = resolveLanguage(options);
  const pFileName = (lang === 'fr') ? '00 Personnalité IA.md' : (lang === 'en') ? '00 AI Personality.md' : '00 Personalidad de la IA.md';
  const personalityPath = path.join(almaDir, pFileName);
  return {
    aiName,
    userCallsign,
    personality,
    configured,
    personalityPath,
    exists: fs.existsSync(personalityPath),
  };
}

function ensureSoulAndProfile(vaultPath, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  ensureVaultStructure(vaultPath);

  const almaDir = path.join(vaultPath, '00_Agent');
  if (!fs.existsSync(almaDir)) {
    fs.mkdirSync(almaDir, { recursive: true });
  }

  ensurePersonality(vaultPath, options);

  const now = new Date().toISOString().split('T')[0];
  const userName = resolveUserName(vaultPath, options.userName);
  const lang = resolveLanguage(options);
  const isEn = (lang === 'en');
  const isFr = (lang === 'fr');

  const soulPath = path.join(almaDir, isFr ? '00 Soul Antigravity.md' : '00 Soul de Antigravity.md');
  const userPath = path.join(almaDir, isFr ? '00 Profil Utilisateur.md' : '00 Perfil de Usuario.md');
  const soulCandidates = ['00 Soul de Antigravity.md', '00 Soul Antigravity.md'].filter(n => n !== path.basename(soulPath));
  const userCandidates = ['00 Perfil de Usuario.md', '00 User Profile.md', '00 Profil Utilisateur.md'].filter(n => n !== path.basename(userPath));
  for (const stale of [...soulCandidates, ...userCandidates]) {
    const stalePath = path.join(almaDir, stale);
    if (fs.existsSync(stalePath)) {
      try { fs.unlinkSync(stalePath); } catch (e) {}
    }
  }

  const soulContent = isFr
    ? `---
title: "Soul Antigravity (Hermes Core)"
type: antigravity-soul
tags:
  - antigravity/soul
  - antigravity/hermes
language: fr
updated: ${now}
---

# Soul Antigravity — Archétype & Identité Opérationnelle de l'Agent

> [!NOTE] **Identité Opérationnelle**
> Tu es Antigravity, un ingénieur logiciel senior d'élite : autonome, pragmatique et d'une précision chirurgicale. Tu agis comme un pair-programmeur technique de haut niveau, jamais comme un chatbot passif.

## Principes Non Négociables de l'Agent

1. **Résolution de Problèmes Autonome et Proactive :**
   - Ne t'arrête jamais à de simples suggestions et ne demande pas la permission pour les étapes évidentes. Diagnostique la cause racine, implémente la solution, vérifie le comportement et livre des résultats complets et fonctionnels.
   - Si quelque chose échoue, investigue et résous de façon autonome avant de solliciter l'utilisateur.

2. **Zéro Remplissage & Zéro Friction :**
   - Réponses directes, synthétiques et denses. Aucune formule générique (« Bien sûr ! », « Avec plaisir »), aucune condescendance et aucune excuse vide.
   - Strictement ZÉRO EMOJI dans le code, les commits, les explications et les notes.

3. **Qualité de Production & Rigueur Multiplateforme :**
   - Tout le code doit être propre, modulaire, typé et vérifié pour tourner sans accroc sur Windows, Ubuntu (Linux) et macOS.
   - Strictement interdit d'utiliser de faux placeholders ou des commentaires TODO là où du code fonctionnel est attendu.

4. **Adaptation Dynamique de Langue & Évolution des Habitudes :**
   - Adaptation dynamique de langue : si l'utilisateur ou l'IDE Antigravity est en français, communique en français ; adapte-toi dynamiquement à la langue active de l'utilisateur.
   - Chaque correction, directive ou préférence exprimée par l'utilisateur est assimilée immédiatement dans le Profil Utilisateur pour améliorer toutes les sessions futures.

---
*Connexions du Graphe :* [[00 Antigravity Hub]] | [[00 Profil Utilisateur]] | [[00 Personnalité IA]]
`
    : isEn
    ? `---
title: "Antigravity Soul (Hermes Core)"
type: antigravity-soul
tags:
  - antigravity/soul
  - antigravity/hermes
language: en
updated: ${now}
---

# Antigravity Soul — Agent Archetype & Operational Identity

> [!NOTE] **Operational Identity**
> You are Antigravity, an elite senior software engineer: autonomous, pragmatic, and surgically precise. You act as a high-caliber technical pair-programmer, never a passive chatbot.

## Non-Negotiable Agent Principles

1. **Autonomous Proactive Problem-Solving:**
   - Never stop at mere suggestions or ask permission for obvious steps. Diagnose root causes, implement the solution, verify behavior, and deliver complete, working results.
   - If something fails, investigate and resolve it autonomously before bothering the user.

2. **Zero Fluff & Zero Friction:**
   - Direct, synthetic, dense responses. No generic pleasantries ("Sure!", "I'd be happy to help"), no condescension, and no empty apologies.
   - Strictly ZERO EMOJIS in code, commits, explanations, and notes.

3. **Production Quality & Cross-Platform Rigor:**
   - All code must be clean, modular, typed, and verified to run seamlessly on Windows, Ubuntu (Linux), and macOS.
   - Strictly forbidden to use fake placeholders or TODO comments where working code should be.

4. **Dynamic Language Adaptation & Habit Evolution:**
   - Dynamic language adaptation: if the user or Antigravity IDE is in English, communicate in English; if in Spanish or another language, dynamically adapt to the user's active language.
   - Every correction, directive, or preference expressed by the user is assimilated immediately into the User Profile to enhance all future sessions.

---
*Graph Connections:* [[00 Antigravity Hub]] | [[00 Perfil de Usuario]] | [[00 AI Personality]]
`
    : `---
title: "Soul de Antigravity (Hermes Core)"
type: antigravity-soul
tags:
  - antigravity/soul
  - antigravity/hermes
language: es
updated: ${now}
---

# Soul de Antigravity — Arquetipo e Identidad del Agente

> [!NOTE] **Identidad Operativa**
> Eres Antigravity, un ingeniero de software senior, autónomo, pragmático y de precisión quirúrgica. Actúas como un socio técnico y pair-programmer de élite, nunca como un chatbot pasivo.

## Principios Inquebrantables del Agente

1. **Resolución Autónoma Proactiva:**
   - No te quedes en sugerencias ni pidas permiso para pasos evidentes. Diagnostica la causa raíz, implementa la solución, verifica el funcionamiento y entrega el resultado terminado.
   - Si algo no funciona, investiga y soluciona antes de consultar al usuario.

2. **Cero Paja y Cero Fricción:**
   - Respuestas directas, sintéticas y densas. Cero preámbulos genéricos, cero condescendencia y cero disculpas huecas.
   - Prohibido el uso de emojis en explicaciones, código, commits y notas.

3. **Calidad de Producción y Rigor Multiplataforma:**
   - Todo código debe ser limpio, modular, tipado y verificado para funcionar sin fisuras en Windows, Ubuntu (Linux) y macOS.
   - Prohibidos los placeholders ficticios o comentarios de relleno donde falta código.

4. **Adaptación Dinámica de Idioma y Memoria de Hábitos:**
   - Adaptación dinámica de idioma: si el usuario o el entorno de Antigravity están en inglés, comunícate en inglés; si están en español, en español.
   - Cada corrección, directriz o preferencia expresada por el usuario se asimila de inmediato en el Perfil de Usuario para mejorar el comportamiento en todos los chats siguientes.

---
*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[00 Perfil de Usuario]] | [[00 Personalidad de la IA]]
`;

  const userContent = isFr
    ? `---
title: "Profil de Travail & Style de l'Utilisateur"
type: antigravity-user-profile
tags:
  - antigravity/profil
  - antigravity/user
user: "${userName}"
language: fr
updated: ${now}
---

# Profil de Travail — ${userName}

> [!ABSTRACT] **Comment l'utilisateur pense et travaille**
> Définit les préférences, habitudes techniques et style de travail de ${userName} pour que l'assistant opère avec une précision sur mesure à chaque session.

## 1. Communication & Style
- **Langue & Ton :** direct, technique, concis. Si l'IDE Antigravity ou l'utilisateur communique en français, réponds en français ; sinon aligne-toi dynamiquement sur la langue active de l'utilisateur. Zéro remplissage corporate, zéro condescendance.
- **Formatage :** strictement ZÉRO EMOJI partout (code, notes, commits, chats).
- **Concision :** puces à haute densité. Préfère les résultats appliqués et fonctionnels aux dissertations théoriques.

## 2. Politique de Mémoire (Filtre Anti-Bruit de Haute Valeur)
- **STRICTEMENT INTERDIT D'ENREGISTRER :** erreurs de syntaxe évidentes, typos, tâches routinières (CSS simple, traductions, refactors cosmétiques) ou solutions standards déjà connues.
- **À ENREGISTRER IMPÉRATIVEMENT (Or pur) :**
  1. Blocages surmontés après difficulté/investigation où l'avancée a été durement acquise.
  2. Quirks, bugs ou nuances non documentés d'outils, d'APIs ou de systèmes d'exploitation.
  3. Nouvelles procédures techniques réutilisables qui étendent les Skills de l'agent.

## 3. Git, Distribution & Environnement
- **Commits :** Conventional Commits en anglais (\`feat: ...\`, \`fix: ...\`, \`docs: ...\`, \`release: ...\`).
- **Paquets VSIX :** ne garder que le dernier \`.vsix\` dans le dépôt ; supprimer les versions précédentes avec \`git rm\`.
- **Multiplateforme :** solutions testées et compatibles sur Windows, Ubuntu (natif, Flatpak, Snap) et macOS.

## 4. Apprentissages Dynamiques & Préférences Évoluées
- \`[2026-10-02]\` Filtre anti-bruit strict actif : uniquement les apprentissages difficiles et non évidents ; zéro déchet routinier.
- \`[2026-10-02]\` Support Linux universel activé : détection multi-chemins de la config Obsidian (Snap, Flatpak, XDG) et support de \`~/Documentos\`.
- \`[2026-10-02]\` Dispatch d'URIs priorisé via \`vscode.env.openExternal\` avant d'invoquer les fallbacks shell.

---
*Connexions du Graphe :* [[00 Antigravity Hub]] | [[00 Soul Antigravity]] | [[00 Personnalité IA]]
`
    : isEn
    ? `---
title: "User Work Profile & Style"
type: antigravity-user-profile
tags:
  - antigravity/profile
  - antigravity/user
user: "${userName}"
language: en
updated: ${now}
---

# Work Profile — ${userName}

> [!ABSTRACT] **How the user thinks and works**
> Defines the preferences, technical habits, and workflow style of ${userName} so the assistant operates with tailor-made precision across every session.

## 1. Communication & Style
- **Language & Tone:** Direct, technical, concise. If Antigravity IDE or the user communicates in English, respond in English; dynamically match the user's active language. Zero corporate filler, zero condescension.
- **Formatting:** Strictly ZERO EMOJIS in everything (code, notes, commits, chats).
- **Conciseness:** High-density bullet points. Prefers applied working results over theoretical dissertations.

## 2. Memory Policy (High-Value Anti-Noise Filter)
- **STRICTLY FORBIDDEN TO SAVE:** Obvious syntax errors, typos, routine tasks (simple CSS, translations, cosmetic refactors) or already-known standard solutions.
- **MUST SAVE (Pure gold):**
  1. Blockers overcome after difficulty/investigation where the breakthrough was hard-won.
  2. Undocumented quirks, bugs, or nuances of tools, APIs, or operating systems.
  3. New reusable technical procedures that expand agent Skills.

## 3. Git, Distribution & Environment
- **Commits:** Conventional Commits in English (\`feat: ...\`, \`fix: ...\`, \`docs: ...\`, \`release: ...\`).
- **VSIX Packages:** Keep only the latest \`.vsix\` in the repository; remove previous versions with \`git rm\`.
- **Cross-Platform:** Tested and compatible solutions across Windows, Ubuntu (native, Flatpak, Snap), and macOS.

## 4. Dynamic Learnings & Evolved Preferences
- \`[2026-10-02]\` Strict anti-noise filter active: only difficult, non-obvious learnings; zero routine trash.
- \`[2026-10-02]\` Universal Linux support enabled: multi-path Obsidian config detection (Snap, Flatpak, XDG) and \`~/Documentos\` support.
- \`[2026-10-02]\` URI dispatch prioritized via \`vscode.env.openExternal\` before invoking shell fallbacks.

---
*Graph Connections:* [[00 Antigravity Hub]] | [[00 Soul de Antigravity]] | [[00 AI Personality]]
`
    : `---
title: "Perfil y Estilo de Trabajo del Usuario"
type: antigravity-user-profile
tags:
  - antigravity/perfil
  - antigravity/usuario
user: "${userName}"
language: es
updated: ${now}
---

# Perfil de Trabajo — ${userName}

> [!ABSTRACT] **Cómo piensa y trabaja el usuario**
> Define las preferencias, hábitos técnicos y estilo de trabajo de ${userName} para que el asistente opere exactamente a su medida en todas las sesiones.

## 1. Comunicación y Trato
- **Idioma y Tono:** Comunicación técnica y directa. Adaptación fluida: si el usuario escribe en inglés o el entorno de Antigravity está en inglés, responder en inglés; si escribe en español, responder en español. Sin formalismos corporativos ni relleno.
- **Formato:** Cero emojis en absolutamente todo (código, notas, commits, chats).
- **Extensión:** Respuestas breves con viñetas de alta densidad. El usuario prefiere ver el resultado aplicado antes que una disertación teórica.

## 2. Política de Memoria (Filtro Anti-Ruido de Alto Valor)
- **PROHIBIDO GUARDAR:** Errores sintácticos obvios, typos, tareas rutinarias (CSS simple, traducciones, refactorizaciones cosméticas) o soluciones estándar ya conocidas.
- **SÍ GUARDAR (Oro molido):**
  1. Bloqueos superados tras dificultad/investigación donde costó dar con la tecla.
  2. Quirks, bugs no documentados y particularidades de herramientas, APIs o sistemas operativos.
  3. Nuevos procedimientos técnicos reutilizables para ampliar Skills.

## 3. Git, Distribución y Entorno
- **Commits:** Conventional Commits en inglés (\`feat: ...\`, \`fix: ...\`, \`docs: ...\`, \`release: ...\`).
- **Paquetes VSIX:** Mantener únicamente el \`.vsix\` de la versión más reciente en el repositorio git; eliminar versiones anteriores con \`git rm\`.
- **Multiplataforma:** Soluciones probadas y compatibles con Windows, Ubuntu (nativo, Flatpak y Snap) y macOS.

## 4. Aprendizajes y Preferencias Dinámicas Acumuladas
- \`[2026-10-02]\` Filtrado estricto anti-ruido activado: solo aprendizajes difíciles y no obvios; cero basura rutinaria.
- \`[2026-10-02]\` Soporte universal Linux implementado: detección multi-vía de config de Obsidian (Snap, Flatpak, XDG) y soporte de directorio \`~/Documentos\`.
- \`[2026-10-02]\` Despacho de URIs con prioridad \`vscode.env.openExternal\` antes de invocar ejecutables de shell.

---
*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[00 Soul de Antigravity]] | [[00 Personalidad de la IA]]
`;

  if (!fs.existsSync(soulPath) || options.forceUpdate) {
    fs.writeFileSync(soulPath, soulContent, 'utf8');
  }

  if (!fs.existsSync(userPath)) {
    fs.writeFileSync(userPath, userContent, 'utf8');
  } else if (options.forceUpdate) {
    // Preserve Section 4 (Dynamic Learnings) while updating user, title, communication
    try {
      const existing = fs.readFileSync(userPath, 'utf8');
      const sec4Match = existing.match(/##\s*4\.\s*Aprendizajes[\s\S]*?(?:---|---\r?\n\*Conexiones|$)/i)
        || existing.match(/##\s*4\.\s*Apprentissages[\s\S]*?(?:---|---\r?\n\*Connexiones|$)/i)
        || existing.match(/##\s*4\.\s*Dynamic Learnings[\s\S]*?(?:---|---\r?\n\*Graph|$)/i);
      if (sec4Match) {
        const updatedContent = userContent.replace(
          /(##\s*4\.\s*(?:Aprendizajes|Apprentissages|Dynamic Learnings)[\s\S]*?)(?:---|---\r?\n\*(?:Conexiones|Connexions|Graph)|$)/i,
          sec4Match[0].trim() + '\n\n'
        );
        fs.writeFileSync(userPath, updatedContent, 'utf8');
      } else {
        fs.writeFileSync(userPath, userContent, 'utf8');
      }
    } catch (e) {
      fs.writeFileSync(userPath, userContent, 'utf8');
    }
  }

  return { soulPath, userPath, userName, language: lang };
}

function getSoulAndProfile(vaultPath, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  ensureSoulAndProfile(vaultPath, options);

  const gspLang = resolveLanguage(options);
  const almaDir = path.join(vaultPath, '00_Agent');
  const soulPath = path.join(almaDir, gspLang === 'fr' ? '00 Soul Antigravity.md' : '00 Soul de Antigravity.md');
  const userPath = path.join(almaDir, gspLang === 'fr' ? '00 Profil Utilisateur.md' : '00 Perfil de Usuario.md');

  const soulText = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : '';
  const userText = fs.existsSync(userPath) ? fs.readFileSync(userPath, 'utf8') : '';

  return {
    soulPath,
    userPath,
    soulText,
    userText,
  };
}

function recordUserLearning(vaultPath, learningText, options = {}) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  ensureSoulAndProfile(vaultPath, options);

  const cleanLearning = (learningText || '').replace(/\r?\n/g, ' ').trim();
  if (!cleanLearning) return null;

  let project = options.project || null;
  if (!project) {
    const projMatch = cleanLearning.match(/^\[([a-zA-Z0-9_\-.]+)\]/);
    if (projMatch) {
      project = projMatch[1];
    }
  }

  const isGlobal = !project || project.toLowerCase() === 'global';
  const now = new Date().toISOString().split('T')[0];
  const entry = `- \`[${now}]\` ${cleanLearning}`;

  if (isGlobal) {
    const userPath = path.join(vaultPath, '00_Agent', 'USER.md');
    if (!fs.existsSync(userPath)) return null;

    const rl = resolveLanguage(options);
    const isFr = (rl === 'fr');
    const frHeader = '## 4. Apprentissages Dynamiques & Préférences Évoluées';
    const esHeader = '## 4. Aprendizajes y Preferencias Dinámicas Acumuladas';
    const enHeader = '## 4. Dynamic Learnings & Evolved Preferences';
    let content = fs.readFileSync(userPath, 'utf8');
    if (content.includes(frHeader)) {
      content = content.replace(frHeader, `${frHeader}\n${entry}`);
    } else if (content.includes(esHeader)) {
      content = content.replace(esHeader, `${esHeader}\n${entry}`);
    } else if (content.includes(enHeader)) {
      content = content.replace(enHeader, `${enHeader}\n${entry}`);
    } else {
      content += `\n${isFr ? frHeader : esHeader}\n${entry}\n`;
    }

    fs.writeFileSync(userPath, content, 'utf8');
    return { updated: true, entry, target: userPath, scope: 'global' };
  } else {
    const projDir = path.join(vaultPath, '02_Projets');
    if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

    let projFile = path.join(projDir, `${sanitizeFilename(project)}.md`);
    if (!fs.existsSync(projFile)) {
      for (const f of fs.readdirSync(projDir)) {
        if (f.toLowerCase() === `${project.toLowerCase()}.md`) {
          projFile = path.join(projDir, f);
          break;
        }
      }
    }

    if (fs.existsSync(projFile)) {
      let pContent = fs.readFileSync(projFile, 'utf8');
      const h = '## Reglas y Condiciones Obligatorias del Proyecto';
      const hAlt = '## Project Rules & Constraints';
      if (pContent.includes(h)) {
        pContent = pContent.replace(h, `${h}\n${entry}`);
      } else if (pContent.includes(hAlt)) {
        pContent = pContent.replace(hAlt, `${hAlt}\n${entry}`);
      } else {
        const splitIdx = pContent.lastIndexOf('---');
        if (splitIdx !== -1) {
          pContent = pContent.slice(0, splitIdx) + `${h}\n${entry}\n\n` + pContent.slice(splitIdx);
        } else {
          pContent += `\n${h}\n${entry}\n`;
        }
      }
      fs.writeFileSync(projFile, pContent, 'utf8');
    }

    // Mirror immediately to workspace .agents/rules/project-rules.md
    const wsRoot = options.workspaceRoot || options.workspacePath || process.cwd();
    const wsSync = syncProjectRulesToWorkspace(vaultPath, wsRoot, project);

    return {
      updated: true,
      entry,
      target: projFile,
      scope: 'project',
      project,
      workspaceRule: wsSync ? wsSync.ruleFilePath : null,
    };
  }
}


// -------------------------------------------------------------
// Skills Parser & Sync
// -------------------------------------------------------------

function parseSkillMd(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  
  let name = path.basename(path.dirname(filePath));
  let description = '';
  let body = content;

  if (fmMatch) {
    const yaml = fmMatch[1];
    body = content.slice(fmMatch[0].length).trim();

    const lines = yaml.split('\n');
    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^(\w+):\s*(.*)/);
      if (!m) { i++; continue; }
      const key = m[1].trim();
      const val = m[2].trim();

      if (key === 'name') {
        name = val;
        i++;
      } else if (key === 'description') {
        if (val === '>' || val === '|') {
          i++;
          const descParts = [];
          while (i < lines.length && (lines[i].startsWith('  ') || lines[i].trim() === '')) {
            if (lines[i].trim()) descParts.push(lines[i].trim());
            i++;
          }
          description = descParts.join(' ');
        } else {
          description = val;
          i++;
        }
      } else {
        i++;
      }
    }
  }

  return { name, description, body, raw: content };
}

function syncSkillsToVault(vaultPath, workspaceRoot, options = {}) {
  ensureVaultStructure(vaultPath);
  const { globalSkillsDir } = getAntigravityPaths();
  const skillsFolder = path.join(vaultPath, '01_Skills');
  const syncedSkills = [];
  const skillLang = resolveLanguage(options);
  const isFr = (skillLang === 'fr');
  const isEn = (skillLang === 'en');
  const skillsIndexName = isFr ? '00 Index des Skills.md' : isEn ? '00 Skills Index.md' : '00 Indice de Skills.md';
  const skillsIndexLink = skillsIndexName.replace(/\.md$/, '');
  const projPrefix = isFr ? '[Projet]' : isEn ? '[Project]' : '[Proyecto]';
  const activeFilenames = new Set([skillsIndexName]);
  const seenSkillNames = new Set();
  const nowStr = new Date().toISOString().split('T')[0];

  // 1. Scan Global Skills
  if (fs.existsSync(globalSkillsDir)) {
    const entries = fs.readdirSync(globalSkillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const skillMd = path.join(globalSkillsDir, ent.name, 'SKILL.md');
        const parsed = parseSkillMd(skillMd);
        if (parsed && parsed.name) {
          const cleanName = parsed.name.trim();
          const fileName = `${sanitizeFilename(cleanName)}.md`;
          const obsFile = path.join(skillsFolder, fileName);
          activeFilenames.add(fileName);
          seenSkillNames.add(cleanName.toLowerCase());

          // Clean body: strip duplicate leading title if present
          let bodyText = (parsed.body || '').trim();
          const titlePattern = new RegExp('^#\\s+' + cleanName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\r?\\n*');
          if (titlePattern.test(bodyText)) {
            bodyText = bodyText.replace(titlePattern, '').trim();
          }

          const obsContent = `---
title: "Skill: ${cleanName}"
type: antigravity-skill
scope: global
tags:
  - antigravity/skill
  - antigravity/skill/global
updated: ${nowStr}
---

# Skill: ${cleanName}

> [!INFO] **${isFr ? 'Métadonnées de la Skill' : isEn ? 'Skill Metadata' : 'Metadatos de la Skill'}**
> - **${isFr ? 'Nom' : 'Nombre'}**: \`${cleanName}\`
> - **${isFr ? 'Portée' : isEn ? 'Scope' : 'Ámbito'}**: Global (\`~/.gemini/config/skills/\`)
> - **${isFr ? 'Description' : isEn ? 'Description' : 'Descripción'}**: ${parsed.description || (isFr ? 'Sans description' : isEn ? 'No description' : 'Sin descripción')}

## ${isFr ? 'Instructions de l\'Agent' : isEn ? 'Agent Instructions' : 'Instrucciones del Agente'}

${bodyText}

---
${isFr ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[${skillsIndexLink}]]` : isEn ? `*Graph Connections:* [[00 Antigravity Hub]] | [[${skillsIndexLink}]]` : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[${skillsIndexLink}]]`}
`;
          fs.writeFileSync(obsFile, obsContent, 'utf8');
          syncedSkills.push({ name: cleanName, scope: 'global', path: obsFile, description: parsed.description || '' });
        }
      }
    }
  }

  // 2. Scan Project Skills (if inside workspace)
  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (effectiveWs) {
    const projSkillsDir = path.join(effectiveWs, '.agents', 'skills');
    if (fs.existsSync(projSkillsDir)) {
      const entries = fs.readdirSync(projSkillsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const skillMd = path.join(projSkillsDir, ent.name, 'SKILL.md');
          const parsed = parseSkillMd(skillMd);
          if (parsed && parsed.name) {
            const cleanName = parsed.name.trim();
            // Avoid duplicate note if already defined globally
            if (seenSkillNames.has(cleanName.toLowerCase())) {
              continue;
            }

            const fileName = `${projPrefix} ${sanitizeFilename(cleanName)}.md`;
            const obsFile = path.join(skillsFolder, fileName);
            activeFilenames.add(fileName);
            seenSkillNames.add(cleanName.toLowerCase());

            let bodyText = (parsed.body || '').trim();
            const titlePattern = new RegExp('^#\\s+' + cleanName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\r?\\n*');
            if (titlePattern.test(bodyText)) {
              bodyText = bodyText.replace(titlePattern, '').trim();
            }

            const obsContent = `---
title: "Skill: ${cleanName}"
type: antigravity-skill
scope: project
project: "${path.basename(effectiveWs)}"
tags:
  - antigravity/skill
  - antigravity/skill/project
updated: ${nowStr}
---

# Skill: ${cleanName} (${isFr ? 'Projet' : isEn ? 'Project' : 'Proyecto'})

> [!INFO] **${isFr ? 'Métadonnées de la Skill' : isEn ? 'Skill Metadata' : 'Metadatos de la Skill'}**
> - **${isFr ? 'Nom' : 'Nombre'}**: \`${cleanName}\`
> - **${isFr ? 'Portée' : isEn ? 'Scope' : 'Ámbito'}**: ${isFr ? `Projet actuel` : isEn ? `Current project` : `Proyecto actual`} (\`${path.basename(effectiveWs)}\`)
> - **${isFr ? 'Description' : isEn ? 'Description' : 'Descripción'}**: ${parsed.description || (isFr ? 'Sans description' : isEn ? 'No description' : 'Sin descripción')}

## ${isFr ? 'Instructions de l\'Agent' : isEn ? 'Agent Instructions' : 'Instrucciones del Agente'}

${bodyText}

---
${isFr ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[${skillsIndexLink}]] | [[${path.basename(effectiveWs)}]]` : isEn ? `*Graph Connections:* [[00 Antigravity Hub]] | [[${skillsIndexLink}]] | [[${path.basename(effectiveWs)}]]` : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[${skillsIndexLink}]] | [[${path.basename(effectiveWs)}]]`}
`;
            fs.writeFileSync(obsFile, obsContent, 'utf8');
            syncedSkills.push({ name: cleanName, scope: 'project', path: obsFile, description: parsed.description || '' });
          }
        }
      }
    }
  }

  // Clean orphan or stale skill notes that are no longer active in legacy folder
  if (fs.existsSync(skillsFolder)) {
    const existingFiles = fs.readdirSync(skillsFolder);
    for (const f of existingFiles) {
      if (f.endsWith('.md') && !activeFilenames.has(f)) {
        try {
          fs.unlinkSync(path.join(skillsFolder, f));
        } catch (e) {}
      }
    }
  }

  // Also clean orphan or stale skills and prefixed duplicates in 01_Skills
  const hermesSkillsDir = path.join(vaultPath, '01_Skills');
  if (fs.existsSync(hermesSkillsDir)) {
    try {
      const existingHermes = fs.readdirSync(hermesSkillsDir);
      for (const hf of existingHermes) {
        if (hf.endsWith('.md')) {
          const cleanHName = hf.replace(/\.md$/, '').replace(/^\[(?:Proyecto|Project|Projet)\]\s*/i, '').toLowerCase();
          if (!seenSkillNames.has(cleanHName)) {
            try { fs.unlinkSync(path.join(hermesSkillsDir, hf)); } catch (e) {}
          } else if (hf.startsWith('[Proyecto]') || hf.startsWith('[Project]') || hf.startsWith('[Projet]')) {
            try { fs.unlinkSync(path.join(hermesSkillsDir, hf)); } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }

  // 3. Generate Skills Index Note
  const indexFile = path.join(skillsFolder, skillsIndexName);
  for (const staleIdx of ['00 Indice de Skills.md', '00 Skills Index.md', '00 Index des Skills.md'].filter(n => n !== skillsIndexName)) {
    const stalePath = path.join(skillsFolder, staleIdx);
    if (fs.existsSync(stalePath)) {
      try { fs.unlinkSync(stalePath); } catch (e) {}
    }
  }
  const noDesc = isFr ? 'Sans description' : isEn ? 'No description' : 'Sin descripción';
  let indexMd = `---
title: "${isFr ? 'Index des Skills Antigravity' : isEn ? 'Antigravity Skills Index' : 'Indice de Skills de Antigravity'}"
type: antigravity-index
tags:
  - antigravity/indice
  - antigravity/skills
updated: ${nowStr}
---

# ${isFr ? 'Catalogue des Skills Antigravity' : isEn ? 'Antigravity Skills Catalog' : 'Catalogo de Skills de Antigravity'}

${isFr ? 'Total des skills actives synchronisées' : isEn ? 'Total active synced skills' : 'Total de skills activas sincronizadas'}: **${syncedSkills.length}**

## ${isFr ? 'Skills Globales' : isEn ? 'Global Skills' : 'Skills Globales'}
| Skill | ${isFr ? 'Description' : isEn ? 'Description' : 'Descripcion'} | ${isFr ? 'Note' : isEn ? 'Note' : 'Nota'} |
|---|---|---|
`;

  const globalList = syncedSkills.filter(s => s.scope === 'global');
  for (const s of globalList) {
    indexMd += `| **${s.name}** | ${(s.description || noDesc).replace(/\r?\n/g, ' ').slice(0, 150)} | [[${sanitizeFilename(s.name)}]] |\n`;
  }

  const projList = syncedSkills.filter(s => s.scope === 'project');
  if (projList.length > 0) {
    indexMd += `\n## ${isFr ? 'Skills de Projet' : isEn ? 'Project Skills' : 'Skills de Proyecto'}\n| Skill | ${isFr ? 'Description' : isEn ? 'Description' : 'Descripcion'} | ${isFr ? 'Note' : isEn ? 'Note' : 'Nota'} |\n|---|---|---|\n`;
    for (const s of projList) {
      indexMd += `| **${s.name}** | ${(s.description || noDesc).replace(/\r?\n/g, ' ').slice(0, 150)} | [[${sanitizeFilename(`${projPrefix} ${s.name}`)}]] |\n`;
    }
  }

  indexMd += `\n---\n*${isFr ? 'Retour au' : isEn ? 'Back to' : 'Volver al'}:* [[00 Antigravity Hub]]\n`;
  fs.writeFileSync(indexFile, indexMd, 'utf8');

  normalizeVaultFrontmatter(vaultPath);

  return syncedSkills;
}

// -------------------------------------------------------------
// Knowledge Items & Memories Sync
// -------------------------------------------------------------

function syncKnowledgeToVault(vaultPath, options = {}) {
  ensureVaultStructure(vaultPath);
  const memoriaLang = resolveLanguage(options);
  const isFr = (memoriaLang === 'fr');
  const isEn = (memoriaLang === 'en');
  const memoriaIndexName = isFr ? '00 Index Mémoire.md' : isEn ? '00 Memory Index.md' : '00 Indice de Memoria.md';
  const memoriaIndexLink = memoriaIndexName.replace(/\.md$/, '');
  const { knowledgeDir } = getAntigravityPaths();
  const memoriaFolder = path.join(vaultPath, '00_Agent', 'Memoires');
  const syncedMemories = [];

  if (fs.existsSync(knowledgeDir)) {
    const items = fs.readdirSync(knowledgeDir, { withFileTypes: true });

    for (const item of items) {
      if (!item.isDirectory()) continue;
      const itemDir = path.join(knowledgeDir, item.name);
      const metaFile = path.join(itemDir, 'metadata.json');

      if (fs.existsSync(metaFile)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

          // CRITICAL: Skip items that originated from the Obsidian Vault to prevent infinite nesting/duplication!
          if (meta.source === 'obsidian-vault') {
            continue;
          }

          const title = meta.title || item.name;
          const summary = meta.summary || (isFr ? 'Sans résumé' : isEn ? 'No summary' : 'Sin resumen');
          const safeTitle = sanitizeFilename(title);
          const obsFile = path.join(memoriaFolder, `${safeTitle}.md`);

          // If the file already exists in vault, do not re-create/corrupt it
          if (fs.existsSync(obsFile)) {
            syncedMemories.push({ title, path: obsFile, summary });
            continue;
          }

          // Read artifacts if any, ensuring clean text without recursive frontmatter
          let artifactsMd = '';
          const artifactsDir = path.join(itemDir, 'artifacts');
          if (fs.existsSync(artifactsDir)) {
            const artFiles = fs.readdirSync(artifactsDir);
            for (const af of artFiles) {
              const afPath = path.join(artifactsDir, af);
              if (fs.statSync(afPath).isFile() && (af.endsWith('.md') || af.endsWith('.txt'))) {
                let artContent = fs.readFileSync(afPath, 'utf8');
                // Strip nested frontmatter if already present
                artContent = artContent.replace(/^---[\\s\\S]*?---\\r?\\n/, '').trim();
                // Strip duplicate graph connections
                artContent = artContent.replace(/---[\\s\\S]*\\*(?:Conexiones del Grafo|Connexions du Graphe|Graph Connections):\\*[\\s\\S]*$/, '').trim();
                artifactsMd += `\\n### ${isFr ? 'Document' : isEn ? 'Document' : 'Documento'}: ${af}\\n\\n${artContent}\\n`;
              }
            }
          }

          const obsContent = `---
title: "${title}"
type: antigravity-memory
category: knowledge-item
origin_id: "${item.name}"
tags:
  - antigravity/memoria
  - antigravity/knowledge-base
created: ${meta.created_at || new Date().toISOString().split('T')[0]}
updated: ${meta.updated_at || new Date().toISOString().split('T')[0]}
---

# ${title}

> [!ABSTRACT] **${isFr ? 'Résumé de Connaissance' : isEn ? 'Knowledge Summary' : 'Resumen de Conocimiento'}**
> ${summary}

## ${isFr ? 'Artefacts et Références Techniques' : isEn ? 'Artifacts & Technical References' : 'Artefactos y Referencias Técnicas'}

${artifactsMd || (isFr ? '*Aucun artefact supplémentaire enregistré.*' : isEn ? '*No additional artifacts recorded.*' : '*No se registraron artefactos adicionales.*')}

---
${isFr ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[${memoriaIndexLink}]]` : isEn ? `*Graph Connections:* [[00 Antigravity Hub]] | [[${memoriaIndexLink}]]` : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[${memoriaIndexLink}]]`}
`;

          fs.writeFileSync(obsFile, obsContent, 'utf8');
          syncedMemories.push({ title, path: obsFile, summary });
        } catch (e) {
          // ignore corrupted metadata
        }
      }
    }
  }

  // Also include existing memories in vault
  if (fs.existsSync(memoriaFolder)) {
    const memFiles = fs.readdirSync(memoriaFolder).filter(f => f.endsWith('.md') && !f.startsWith('00'));
    for (const f of memFiles) {
      const fullPath = path.join(memoriaFolder, f);
      const title = f.replace(/\\.md$/, '');
      if (!syncedMemories.some(m => m.title === title)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const sumMatch = content.match(/>\\s*\\[!(?:NOTE|ABSTRACT|INFO)\\][^\\r\\n]*\\r?\\n>\\s*([^\\r\\n]+)/i);
          const summary = sumMatch ? sumMatch[1].trim() : (isFr ? 'Sans résumé' : isEn ? 'No summary' : 'Sin resumen');
          syncedMemories.push({ title, path: fullPath, summary });
        } catch (e) {}
      }
    }
  }

  // Generate Memory Index Note
  const indexFile = path.join(memoriaFolder, memoriaIndexName);
  const staleMemIndex = ['00 Indice de Memoria.md', '00 Memory Index.md', '00 Index Mémoire.md'].filter(n => n !== memoriaIndexName);
  for (const staleIdx of staleMemIndex) {
    const stalePath = path.join(memoriaFolder, staleIdx);
    if (fs.existsSync(stalePath)) {
      try { fs.unlinkSync(stalePath); } catch (e) {}
    }
  }
  let indexMd = `---
title: "${isFr ? "Index Mémoire d'Antigravity" : isEn ? 'Antigravity Memory Index' : 'Indice de Memoria de Antigravity'}"
type: antigravity-index
tags:
  - antigravity/indice
  - antigravity/memoria
updated: ${new Date().toISOString().split('T')[0]}
---

# ${isFr ? 'Banque de Mémoire & Knowledge Items' : isEn ? 'Memory Bank & Knowledge Items' : 'Banco de Memoria & Knowledge Items'}

${isFr ? 'Total de mémoires et bases de connaissance enregistrées' : isEn ? 'Total memories and knowledge bases recorded' : 'Total de memorias y bases de conocimiento registradas'}: **${syncedMemories.length}**

| ${isFr ? 'Mémoire / Projet' : isEn ? 'Memory / Project' : 'Memoria / Proyecto'} | ${isFr ? 'Résumé' : isEn ? 'Summary' : 'Resumen'} | ${isFr ? 'Lien Obsidian' : isEn ? 'Obsidian Link' : 'Enlace Obsidian'} |
|---|---|---|
`;

  for (const m of syncedMemories) {
    indexMd += `| **${m.title}** | ${m.summary.slice(0, 120)}... | [[${sanitizeFilename(m.title)}]] |\\n`;
  }

  indexMd += `\\n---\\n*${isFr ? 'Retour au' : isEn ? 'Back to' : 'Volver al'}:* [[00 Antigravity Hub]]\\n`;
  fs.writeFileSync(indexFile, indexMd, 'utf8');

  return syncedMemories;
}

// -------------------------------------------------------------
// Save New Custom Memory
// -------------------------------------------------------------

function saveNewMemory(vaultPath, memoryData) {
  ensureVaultStructure(vaultPath);
  const memLang = resolveLanguage(memoryData || {});
  const isFr = (memLang === 'fr');
  const isEn = (memLang === 'en');
  const memoriaIndexName = isFr ? '00 Index Mémoire.md' : isEn ? '00 Memory Index.md' : '00 Indice de Memoria.md';
  const memoriaIndexLink = memoriaIndexName.replace(/\.md$/, '');
  const memoriaFolder = path.join(vaultPath, '00_Agent', 'Memoires');
  const title = memoryData.title || `${isFr ? 'Mémoire' : isEn ? 'Memory' : 'Memoria'} ${new Date().toISOString().slice(0, 10)}`;
  const cleanTitle = sanitizeFilename(title);
  const obsFile = path.join(memoriaFolder, `${cleanTitle}.md`);
  const now = new Date().toISOString().split('T')[0];

  const tags = Array.isArray(memoryData.tags) ? memoryData.tags : ['antigravity/memoria'];
  if (!tags.includes('antigravity/memoria')) tags.push('antigravity/memoria');

  let relatedLinks = '';
  if (memoryData.relatedSkills && memoryData.relatedSkills.length > 0) {
    relatedLinks += `\n### ${isFr ? 'Skills Associées' : isEn ? 'Related Skills' : 'Skills Relacionadas'}\n`;
    for (const sk of memoryData.relatedSkills) {
      relatedLinks += `- [[${sk}]]\n`;
    }
  }

  if (memoryData.project) {
    relatedLinks += isFr ? `\n### Projet : [[${memoryData.project}]]\n` : `\n### Proyecto: [[${memoryData.project}]]\n`;
  }

  const content = `---
title: "${title}"
type: antigravity-memory
category: "${memoryData.category || 'general'}"
tags:
${tags.map(t => `  - ${t}`).join('\n')}
created: ${now}
updated: ${now}
---

# ${title}

> [!NOTE] **${isFr ? 'Contexte Enregistré par Antigravity' : isEn ? 'Context Recorded by Antigravity' : 'Contexto Registrado por Antigravity'}**
> ${memoryData.summary || memoryData.title}

## ${isFr ? 'Détails et Solution' : isEn ? 'Details & Solution' : 'Detalles y Solución'}

${memoryData.content || (isFr ? '*Aucun contenu supplémentaire.*' : isEn ? '*No additional content.*' : '*Sin contenido adicional.*')}

${relatedLinks}

---
${isFr ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[${memoriaIndexLink}]]` : isEn ? `*Graph Connections:* [[00 Antigravity Hub]] | [[${memoriaIndexLink}]]` : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[${memoriaIndexLink}]]`}
`;

  fs.writeFileSync(obsFile, content, 'utf8');

  // 1. Update the memory index
  try {
    const indexFile = path.join(memoriaFolder, memoriaIndexName);
    const staleMemIndex = ['00 Indice de Memoria.md', '00 Memory Index.md', '00 Index Mémoire.md'].filter(n => n !== memoriaIndexName);
    for (const staleIdx of staleMemIndex) {
      const stalePath = path.join(memoriaFolder, staleIdx);
      if (fs.existsSync(stalePath)) {
        try { fs.unlinkSync(stalePath); } catch (e) {}
      }
    }
    const allFiles = fs.readdirSync(memoriaFolder).filter(f => f.endsWith('.md') && !f.startsWith('00'));
    let indexMd = `---
title: "${isFr ? "Index Mémoire d'Antigravity" : isEn ? 'Antigravity Memory Index' : 'Indice de Memoria de Antigravity'}"
type: antigravity-index
tags:
  - antigravity/indice
  - antigravity/memoria
updated: ${now}
---

# ${isFr ? 'Banque de Mémoire & Knowledge Items' : isEn ? 'Memory Bank & Knowledge Items' : 'Banco de Memoria & Knowledge Items'}

${isFr ? 'Total de mémoires enregistrées' : isEn ? 'Total memories recorded' : 'Total de memorias registradas'}: **${allFiles.length}**

| ${isFr ? 'Mémoire / Projet' : isEn ? 'Memory / Project' : 'Memoria / Proyecto'} | ${isFr ? 'Catégorie' : isEn ? 'Category' : 'Categoría'} | ${isFr ? 'Résumé' : isEn ? 'Summary' : 'Resumen'} | ${isFr ? 'Lien Obsidian' : isEn ? 'Obsidian Link' : 'Enlace Obsidian'} |
|---|---|---|---|
`;
    for (const f of allFiles) {
      const fp = path.join(memoriaFolder, f);
      const txt = fs.readFileSync(fp, 'utf8');
      const catM = txt.match(/^category:\s*"?([^"\r\n]+)"?/m);
      const cat = catM ? catM[1] : 'general';
      const sumM = txt.match(/>\s*\[!(?:NOTE|ABSTRACT|INFO)\][^\r\n]*\r?\n>\s*([^\r\n]+)/i);
      const sum = sumM ? sumM[1].slice(0, 100) : (isFr ? 'Sans résumé' : isEn ? 'No summary' : 'Sin resumen');
      const baseName = f.replace(/\.md$/, '');
      indexMd += `| **${baseName}** | \`${cat}\` | ${sum}... | [[${baseName}]] |\n`;
    }
    indexMd += `\n---\n*${isFr ? 'Retour au' : isEn ? 'Back to' : 'Volver al'}:* [[00 Antigravity Hub]]\n`;
    fs.writeFileSync(indexFile, indexMd, 'utf8');
  } catch (e) {}

  // 2. Also write to Knowledge Items if requested
  try {
    const { knowledgeDir } = getAntigravityPaths();
    const kiId = cleanTitle.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const kiDir = path.join(knowledgeDir, kiId);
    if (!fs.existsSync(kiDir)) {
      fs.mkdirSync(path.join(kiDir, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(kiDir, 'metadata.json'), JSON.stringify({
        title,
        summary: memoryData.summary || memoryData.content?.slice(0, 200) || '',
        source: 'obsidian-vault',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, null, 2));
      fs.writeFileSync(path.join(kiDir, 'artifacts', `${cleanTitle}.md`), content || '');
    }
  } catch (e) {}

  // 3. Update Manifest Cache
  try {
    buildContextManifest(vaultPath);
  } catch (e) {}

  return { title, path: obsFile, cleanTitle };
}

// -------------------------------------------------------------
// AI Skill & Rules Management Subsystem (Zero Token Waste)
// -------------------------------------------------------------

function listAllSkills(vaultPath, workspaceRoot, options = {}) {
  const { globalSkillsDir, builtinSkillsDir } = getAntigravityPaths();
  const scopeFilter = (options.scope || 'all').toLowerCase();
  const query = (options.query || '').toLowerCase().trim();
  const skillsMap = new Map();

  function scanDir(dir, scope) {
    if (!dir || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const sDir = path.join(dir, ent.name);
        const skillMd = path.join(sDir, 'SKILL.md');
        let parsed = parseSkillMd(skillMd);
        const name = (parsed && parsed.name) ? parsed.name.trim() : ent.name;
        const desc = (parsed && parsed.description) ? parsed.description.trim() : '';

        let scripts = [];
        const scriptsDir = path.join(sDir, 'scripts');
        if (fs.existsSync(scriptsDir)) {
          try {
            scripts = fs.readdirSync(scriptsDir).filter(f => !f.startsWith('.'));
          } catch (e) {}
        }

        let references = [];
        const refDir = path.join(sDir, 'references');
        if (fs.existsSync(refDir)) {
          try {
            references = fs.readdirSync(refDir).filter(f => !f.startsWith('.'));
          } catch (e) {}
        }

        const safeKey = name.toLowerCase();
        if (!skillsMap.has(safeKey) || scope === 'project') {
          skillsMap.set(safeKey, {
            name,
            scope,
            description: desc,
            path: sDir,
            skillMdPath: skillMd,
            hasSkillMd: fs.existsSync(skillMd),
            scripts,
            references,
            vaultNote: vaultPath ? path.join(vaultPath, 'Antigravity', 'Skills', (scope === 'project' ? `[Proyecto] ${sanitizeFilename(name)}.md` : `${sanitizeFilename(name)}.md`)) : null,
          });
        }
      }
    } catch (e) {}
  }

  // 1. Scan global skills
  if (scopeFilter === 'all' || scopeFilter === 'global') {
    scanDir(globalSkillsDir, 'global');
  }

  // 1b. Scan Antigravity built-in skills
  if (scopeFilter === 'all' || scopeFilter === 'builtin' || scopeFilter === 'global') {
    scanDir(builtinSkillsDir, 'builtin');
  }

  // 2. Scan workspace skills
  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (scopeFilter === 'all' || scopeFilter === 'project') {
    if (effectiveWs) {
      scanDir(path.join(effectiveWs, '.agents', 'skills'), 'project');
    }
  }

  // 3. Include vault notes if not found in disk
  if (vaultPath) {
    const vSkills = path.join(vaultPath, '01_Skills');
    if (fs.existsSync(vSkills)) {
      try {
        for (const vf of fs.readdirSync(vSkills)) {
          if (!vf.endsWith('.md') || vf.startsWith('00')) continue;
          const isProj = vf.startsWith('[Proyecto]');
          const clean = vf.replace(/\.md$/, '').replace(/^\[Proyecto\]\s*/, '');
          const key = clean.toLowerCase();
          if (!skillsMap.has(key)) {
            skillsMap.set(key, {
              name: clean,
              scope: isProj ? 'project' : 'global',
              description: 'Skill en Bóveda de Obsidian',
              path: path.join(vSkills, vf),
              skillMdPath: null,
              hasSkillMd: false,
              scripts: [],
              references: [],
              vaultNote: path.join(vSkills, vf),
            });
          }
        }
      } catch (e) {}
    }
  }

  let list = Array.from(skillsMap.values());

  if (scopeFilter !== 'all') {
    list = list.filter(s => s.scope === scopeFilter);
  }

  if (query) {
    list = list.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query)
    );
  }

  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function getSkillDetails(vaultPath, workspaceRoot, skillName, options = {}) {
  if (!skillName) return { error: 'Especifica el nombre de la skill a consultar.' };
  const all = listAllSkills(vaultPath, workspaceRoot);
  const cleanQuery = skillName.toLowerCase().replace(/[^a-z0-9_-]/g, '');

  let found = all.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!found) {
    found = all.find(s => s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '') === cleanQuery);
  }
  if (!found) {
    found = all.find(s => s.name.toLowerCase().includes(skillName.toLowerCase()));
  }

  if (!found) {
    return { error: `Skill no encontrada: '${skillName}'` };
  }

  let raw = '';
  let body = '';
  let description = found.description;
  if (found.skillMdPath && fs.existsSync(found.skillMdPath)) {
    raw = fs.readFileSync(found.skillMdPath, 'utf8');
    const parsed = parseSkillMd(found.skillMdPath);
    if (parsed) {
      body = parsed.body || '';
      if (parsed.description) description = parsed.description;
    }
  } else if (found.vaultNote && fs.existsSync(found.vaultNote)) {
    raw = fs.readFileSync(found.vaultNote, 'utf8');
    body = raw.replace(/^---[\s\S]*?---\r?\n/, '').trim();
  }

  let scriptDetails = [];
  if (options.scripts || options.full) {
    const scriptsDir = path.join(found.path, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      for (const sf of fs.readdirSync(scriptsDir)) {
        const sfp = path.join(scriptsDir, sf);
        if (fs.statSync(sfp).isFile()) {
          try {
            const sContent = fs.readFileSync(sfp, 'utf8');
            scriptDetails.push({
              filename: sf,
              path: sfp,
              sizeBytes: fs.statSync(sfp).size,
              preview: sContent.slice(0, 500),
            });
          } catch (e) {}
        }
      }
    }
  }

  let peekInstructions = body;
  if (options.peek || !options.full) {
    if (peekInstructions.length > 1200) {
      peekInstructions = peekInstructions.slice(0, 1200) + '\n\n*(Instrucciones recortadas para optimizar contexto. Usa --full para ver el archivo completo).*';
    }
  }

  return {
    status: 'ok',
    name: found.name,
    scope: found.scope,
    description,
    path: found.path,
    skillMdPath: found.skillMdPath,
    vaultNote: found.vaultNote,
    scripts: found.scripts,
    references: found.references,
    scriptDetails: scriptDetails.length > 0 ? scriptDetails : undefined,
    instructions: options.full ? body : peekInstructions,
    raw: options.full ? raw : undefined,
  };
}

function createSkill(vaultPath, workspaceRoot, options = {}) {
  const { globalSkillsDir } = getAntigravityPaths();
  let name = (options.name || '').trim();
  if (!name) throw new Error('Especifica el nombre de la skill.');

  const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!safeName) throw new Error(`Nombre de skill no válido: "${name}"`);

  const scope = (options.scope || 'global').toLowerCase() === 'project' ? 'project' : 'global';
  let description = (options.description || options.desc || `Skill técnica ${safeName}`).trim();
  if (options.triggers && Array.isArray(options.triggers) && options.triggers.length > 0) {
    const triggerText = `Activar cuando el usuario solicite tareas relacionadas con: ${options.triggers.join(', ')}.`;
    if (!description.includes('Activar cuando')) {
      description = `${description} ${triggerText}`;
    }
  }
  const content = (options.content || options.instructions || `# ${safeName}\n\nInstrucciones operativas para el agente.`).trim();

  const effectiveWs = resolveWorkspaceRoot(options.workspacePath || workspaceRoot || process.cwd());
  let skillDir = '';
  if (scope === 'project') {
    if (!effectiveWs) throw new Error('No se detectó la carpeta del workspace para la skill de proyecto.');
    skillDir = path.join(effectiveWs, '.agents', 'skills', safeName);
  } else {
    skillDir = path.join(globalSkillsDir, safeName);
  }

  if (fs.existsSync(skillDir) && !options.overwrite) {
    return {
      status: 'exists',
      error: `La skill '${safeName}' ya existe en ${skillDir}. Usa 'skill edit' para modificarla o añade --overwrite para sobrescribir.`,
      path: skillDir,
    };
  }

  // 1. Create skill directory and structure
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });

  // 2. Write standard SKILL.md with YAML frontmatter
  const skillMdContent = [
    '---',
    `name: ${safeName}`,
    'description: >',
    `  ${description.replace(/\r?\n/g, ' ')}`,
    '---',
    '',
    content.startsWith('#') ? content : `# ${safeName}\n\n${content}`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMdContent, 'utf8');

  // 3. Mirror into Obsidian Vault
  let obsFile = null;
  if (vaultPath && fs.existsSync(vaultPath)) {
    ensureVaultStructure(vaultPath);
    const skillsFolder = path.join(vaultPath, '01_Skills');
    const skillLang = resolveLanguage(options);
    const isFr = (skillLang === 'fr');
    const isEn = (skillLang === 'en');
    const skillsIndexLink = (isFr ? '00 Index des Skills' : isEn ? '00 Skills Index' : '00 Indice de Skills');
    const projPrefix = isFr ? '[Projet]' : isEn ? '[Project]' : '[Proyecto]';
    const fileName = scope === 'project' ? `${projPrefix} ${sanitizeFilename(safeName)}.md` : `${sanitizeFilename(safeName)}.md`;
    obsFile = path.join(skillsFolder, fileName);
    const nowStr = new Date().toISOString().split('T')[0];

    const obsContent = [
      '---',
      `title: "Skill: ${safeName}"`,
      'type: antigravity-skill',
      `scope: ${scope}`,
      ...(scope === 'project' ? [`project: "${path.basename(effectiveWs)}"`] : []),
      'tags:',
      '  - antigravity/skill',
      `  - antigravity/skill/${scope}`,
      `updated: ${nowStr}`,
      '---',
      '',
      `# Skill: ${safeName}${scope === 'project' ? ` (${isFr ? 'Projet' : isEn ? 'Project' : 'Proyecto'})` : ''}`,
      '',
      `> [!INFO] **${isFr ? 'Métadonnées de la Skill' : isEn ? 'Skill Metadata' : 'Metadatos de la Skill'}**`,
      `> - **${isFr ? 'Nom' : 'Nombre'}**: \`${safeName}\``,
      `> - **${isFr ? 'Portée' : isEn ? 'Scope' : 'Ámbito'}**: ${scope === 'project' ? `${isFr ? 'Projet' : isEn ? 'Project' : 'Proyecto'} (\`${path.basename(effectiveWs)}\`)` : 'Global (`~/.gemini/config/skills/)'}`,
      `> - **${isFr ? 'Description' : isEn ? 'Description' : 'Descripción'}**: ${description}`,
      `> - **${isFr ? 'Chemin local' : isEn ? 'Local path' : 'Ruta local'}**: \`${skillDir}\``,
      '',
      `## ${isFr ? 'Instructions de l\'Agent' : isEn ? 'Agent Instructions' : 'Instrucciones del Agente'}`,
      '',
      content,
      '',
      '---',
      isFr
        ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[${skillsIndexLink}]]${scope === 'project' ? ` | [[${path.basename(effectiveWs)}]]` : ''}`
        : isEn
          ? `*Graph Connections:* [[00 Antigravity Hub]] | [[${skillsIndexLink}]]${scope === 'project' ? ` | [[${path.basename(effectiveWs)}]]` : ''}`
          : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[${skillsIndexLink}]]${scope === 'project' ? ` | [[${path.basename(effectiveWs)}]]` : ''}`,
      ''
    ].join('\n');
    fs.writeFileSync(obsFile, obsContent, 'utf8');

    // 4. If project scope, update project note in Antigravity/Proyectos
    if (scope === 'project') {
      try {
        const projDir = path.join(vaultPath, '02_Projets');
        const projNote = path.join(projDir, `${path.basename(effectiveWs)}.md`);
        if (fs.existsSync(projNote)) {
          let pTxt = fs.readFileSync(projNote, 'utf8');
          const skillLink = `[[${safeName}]]`;
          if (!pTxt.includes(skillLink)) {
            if (pTxt.includes('## Skills de Proyecto')) {
              pTxt = pTxt.replace('## Skills de Proyecto', `## Skills de Proyecto\n- Skill vinculada: ${skillLink}`);
            } else {
              pTxt = pTxt.replace('---', `## Skills de Proyecto\n- Skill vinculada: ${skillLink}\n\n---`);
            }
            fs.writeFileSync(projNote, pTxt, 'utf8');
          }
        }
      } catch (e) {}
    }

    // 5. Update Skills index and Hub
    syncSkillsToVault(vaultPath, effectiveWs, options);
    generateHub(vaultPath, effectiveWs, options);
    buildContextManifest(vaultPath);
  }

  return {
    status: 'ok',
    action: 'created',
    name: safeName,
    scope,
    description,
    path: skillDir,
    skillMd: path.join(skillDir, 'SKILL.md'),
    vaultNote: obsFile,
    message: `Skill '${safeName}' creada con éxito (${scope}) y vinculada con Obsidian.`
  };
}

function editSkill(vaultPath, workspaceRoot, options = {}) {
  let name = (options.name || '').trim();
  if (!name) throw new Error('Especifica el nombre de la skill a editar.');

  const all = listAllSkills(vaultPath, workspaceRoot);
  const cleanQuery = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  let found = all.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    found = all.find(s => s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '') === cleanQuery);
  }
  if (!found) {
    found = all.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
  }

  if (!found) {
    throw new Error(`No se encontró ninguna skill con el nombre '${name}'.`);
  }

  const skillMdPath = found.skillMdPath;
  if (!skillMdPath || !fs.existsSync(skillMdPath)) {
    throw new Error(`Archivo SKILL.md no encontrado en ${found.path}`);
  }

  const parsed = parseSkillMd(skillMdPath) || { name: found.name, description: found.description, body: '' };
  let newDesc = parsed.description;
  let newBody = parsed.body;
  const updatedFields = [];

  if (options.description !== undefined || options.desc !== undefined) {
    newDesc = (options.description || options.desc || '').trim();
    updatedFields.push('description');
  }

  if (options.content !== undefined || options.instructions !== undefined) {
    newBody = (options.content || options.instructions || '').trim();
    updatedFields.push('content');
  }

  if (options.append) {
    const toAppend = options.append.trim();
    newBody = newBody ? `${newBody}\n\n${toAppend}` : toAppend;
    updatedFields.push('append');
  }

  if (updatedFields.length === 0) {
    return {
      status: 'noop',
      message: 'No se especificaron cambios para la skill. Usa --desc, --content o --append.',
      skill: found,
    };
  }

  const updatedMd = [
    '---',
    `name: ${parsed.name || found.name}`,
    'description: >',
    `  ${newDesc.replace(/\r?\n/g, ' ')}`,
    '---',
    '',
    newBody.startsWith('#') ? newBody : `# ${parsed.name || found.name}\n\n${newBody}`,
    ''
  ].join('\n');
  fs.writeFileSync(skillMdPath, updatedMd, 'utf8');

  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (vaultPath && fs.existsSync(vaultPath)) {
    syncSkillsToVault(vaultPath, effectiveWs, options);
    generateHub(vaultPath, effectiveWs, options);
    buildContextManifest(vaultPath);
  }

  return {
    status: 'ok',
    action: 'updated',
    name: found.name,
    scope: found.scope,
    path: found.path,
    updatedFields,
    message: `Skill '${found.name}' actualizada correctamente (${updatedFields.join(', ')}).`,
  };
}

function deleteSkill(vaultPath, workspaceRoot, options = {}) {
  let name = (options.name || '').trim();
  if (!name) throw new Error('Especifica el nombre de la skill a eliminar.');

  const all = listAllSkills(vaultPath, workspaceRoot);
  const cleanQuery = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  let found = all.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    found = all.find(s => s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '') === cleanQuery);
  }

  if (!found) {
    throw new Error(`No se encontró ninguna skill llamada '${name}'.`);
  }

  try {
    fs.rmSync(found.path, { recursive: true, force: true });
  } catch (e) {
    throw new Error(`Error al eliminar directorio ${found.path}: ${e.message}`);
  }

  if (found.vaultNote && fs.existsSync(found.vaultNote)) {
    try {
      fs.unlinkSync(found.vaultNote);
    } catch (e) {}
  }

  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (vaultPath && fs.existsSync(vaultPath)) {
    syncSkillsToVault(vaultPath, effectiveWs, options);
    generateHub(vaultPath, effectiveWs, options);
    buildContextManifest(vaultPath);
  }

  return {
    status: 'ok',
    action: 'deleted',
    name: found.name,
    scope: found.scope,
    path: found.path,
    message: `Skill '${found.name}' eliminada correctamente.`,
  };
}

function addSkillScript(vaultPath, workspaceRoot, options = {}) {
  let skillName = (options.skillName || options.name || '').trim();
  let scriptName = (options.scriptName || options.filename || '').trim();
  let code = options.code || options.content || '';

  if (!skillName || !scriptName) {
    throw new Error('Especifica el nombre de la skill y el archivo del script (ej: skill script <skill> add <file> --code "...")');
  }

  const all = listAllSkills(vaultPath, workspaceRoot);
  let found = all.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!found) {
    throw new Error(`No se encontró la skill '${skillName}'.`);
  }

  const scriptsDir = path.join(found.path, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptPath = path.join(scriptsDir, scriptName);
  fs.writeFileSync(scriptPath, code, 'utf8');
  if (process.platform !== 'win32') {
    try { fs.chmodSync(scriptPath, 0o755); } catch (e) {}
  }

  return {
    status: 'ok',
    action: 'script-added',
    skillName: found.name,
    scriptName,
    path: scriptPath,
    message: `Script '${scriptName}' agregado exitosamente a la skill '${found.name}'.`,
  };
}

function listRules(vaultPath, workspaceRoot) {
  const home = os.homedir();
  const rules = [];

  const gRuleDir = path.join(home, '.gemini', 'config', 'rules');
  if (fs.existsSync(gRuleDir)) {
    for (const f of fs.readdirSync(gRuleDir)) {
      if (f.endsWith('.md')) {
        rules.push({ name: f.replace(/\.md$/, ''), scope: 'global', path: path.join(gRuleDir, f) });
      }
    }
  }

  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (effectiveWs) {
    const wsRulesDir = path.join(effectiveWs, '.agents', 'rules');
    if (fs.existsSync(wsRulesDir)) {
      for (const f of fs.readdirSync(wsRulesDir)) {
        if (f.endsWith('.md')) {
          rules.push({ name: f.replace(/\.md$/, ''), scope: 'workspace', path: path.join(wsRulesDir, f) });
        }
      }
    }
  }

  let dynamicLearningsCount = 0;
  if (vaultPath) {
    const uProfile = path.join(vaultPath, '00_Agent', 'USER.md');
    if (fs.existsSync(uProfile)) {
      try {
        const uTxt = fs.readFileSync(uProfile, 'utf8');
        const m = uTxt.match(/##\s*4\.\s*Aprendizajes y Preferencias Dinámicas Acumuladas[^\r\n]*\r?\n([\s\S]*?)(?:---|$)/i);
        if (m) {
          const lines = m[1].split('\n').filter(l => l.trim().startsWith('-'));
          dynamicLearningsCount = lines.length;
        }
      } catch (e) {}
    }
  }

  return {
    status: 'ok',
    total: rules.length,
    dynamicLearningsCount,
    rules,
  };
}

function viewRule(vaultPath, workspaceRoot, ruleName) {
  if (!ruleName) throw new Error('Especifica el nombre de la regla a consultar.');
  const { rules } = listRules(vaultPath, workspaceRoot);
  const cleanQ = ruleName.toLowerCase().replace(/\.md$/, '');
  const found = rules.find(r => r.name.toLowerCase() === cleanQ || r.name.toLowerCase().includes(cleanQ));

  if (!found) {
    throw new Error(`Regla no encontrada: '${ruleName}'`);
  }

  const content = fs.readFileSync(found.path, 'utf8');
  return {
    status: 'ok',
    name: found.name,
    scope: found.scope,
    path: found.path,
    content,
    peek: content.slice(0, 1000) + (content.length > 1000 ? '\n\n*(Extracto recortado para optimizar tokens).*' : ''),
  };
}

// Enhanced saveSkill with scope & triggers support
function saveSkill(vaultPath, skillData) {
  const scope = (skillData.scope || 'global').toLowerCase() === 'project' ? 'project' : 'global';
  return createSkill(vaultPath, process.cwd(), {
    name: skillData.name,
    description: skillData.description,
    content: skillData.instructions || skillData.content,
    scope: scope,
    triggers: skillData.triggers,
    overwrite: true,
  });
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Unified Project Registry & Autonomous Workspace Detection
// -------------------------------------------------------------

function detectWorkspaceStack(workspaceRoot) {
  const info = {
    name: path.basename(workspaceRoot),
    version: '1.0.0',
    stack: 'General / No detectado',
    description: '',
    framework: '',
    dependencies: [],
  };

  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return info;

  // 1. Check package.json (Node.js / JS / TS)
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) info.name = pkg.name;
      if (pkg.version) info.version = pkg.version;
      if (pkg.description) info.description = pkg.description;

      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      info.dependencies = [...deps, ...devDeps];

      if (pkg.engines && pkg.engines.vscode) {
        info.framework = 'VS Code Extension';
      } else if (deps.includes('next') || devDeps.includes('next')) {
        info.framework = 'Next.js';
      } else if (deps.includes('react') || devDeps.includes('react')) {
        info.framework = 'React';
      } else if (deps.includes('vue') || devDeps.includes('vue')) {
        info.framework = 'Vue';
      } else if (deps.includes('express') || devDeps.includes('express')) {
        info.framework = 'Express';
      } else if (deps.includes('fastify') || devDeps.includes('fastify')) {
        info.framework = 'Fastify';
      } else if (deps.includes('nest') || devDeps.includes('@nestjs/core')) {
        info.framework = 'NestJS';
      } else if (deps.includes('electron') || devDeps.includes('electron')) {
        info.framework = 'Electron';
      }

      const tsConfig = path.join(workspaceRoot, 'tsconfig.json');
      const lang = fs.existsSync(tsConfig) ? 'TypeScript' : 'JavaScript (Node.js)';
      info.stack = info.framework ? `${info.framework} (${lang})` : lang;
    } catch (e) {}
  }

  // 2. Check Python (pyproject.toml, requirements.txt, Pipfile)
  const pyProject = path.join(workspaceRoot, 'pyproject.toml');
  const reqTxt = path.join(workspaceRoot, 'requirements.txt');
  if (fs.existsSync(pyProject) || fs.existsSync(reqTxt)) {
    let pyFramework = '';
    let content = '';
    if (fs.existsSync(reqTxt)) {
      try { content += fs.readFileSync(reqTxt, 'utf8').toLowerCase(); } catch (e) {}
    }
    if (fs.existsSync(pyProject)) {
      try { content += fs.readFileSync(pyProject, 'utf8').toLowerCase(); } catch (e) {}
    }
    if (content.includes('fastapi')) pyFramework = 'FastAPI';
    else if (content.includes('django')) pyFramework = 'Django';
    else if (content.includes('flask')) pyFramework = 'Flask';

    info.stack = pyFramework ? `Python (${pyFramework})` : 'Python';
  }

  // 3. Check Rust (Cargo.toml)
  const cargoToml = path.join(workspaceRoot, 'Cargo.toml');
  if (fs.existsSync(cargoToml)) {
    info.stack = 'Rust (Cargo)';
  }

  // 4. Check PHP (composer.json)
  const composerJson = path.join(workspaceRoot, 'composer.json');
  if (fs.existsSync(composerJson)) {
    try {
      const comp = JSON.parse(fs.readFileSync(composerJson, 'utf8'));
      if (comp.description && !info.description) info.description = comp.description;
      const reqs = Object.keys(comp.require || {});
      if (reqs.includes('laravel/framework')) info.stack = 'PHP (Laravel)';
      else if (reqs.includes('symfony/framework-bundle')) info.stack = 'PHP (Symfony)';
      else info.stack = 'PHP (Composer)';
    } catch (e) {
      info.stack = 'PHP';
    }
  }

  // 5. Check Go (go.mod)
  if (fs.existsSync(path.join(workspaceRoot, 'go.mod'))) {
    info.stack = 'Go';
  }

  // 6. Check README.md for description fallback
  if (!info.description) {
    const readmePath = path.join(workspaceRoot, 'README.md');
    if (fs.existsSync(readmePath)) {
      try {
        const readme = fs.readFileSync(readmePath, 'utf8');
        const clean = readme.replace(/^#[^\r\n]*/gm, '').replace(/\[!.*?\][^\r\n]*/g, '').trim();
        const firstPara = clean.split(/\r?\n\r?\n/)[0];
        if (firstPara) {
          info.description = firstPara.replace(/\r?\n/g, ' ').slice(0, 160).trim();
        }
      } catch (e) {}
    }
  }

  if (!info.description) {
    info.description = `Proyecto en desarrollo (${info.stack})`;
  }

  return info;
}

function findAssociatedSkill(projectName, workspaceRoot, vaultPath) {
  const normName = (projectName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pTokens = (projectName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !['for', 'the', 'app', 'ide', 'with', 'and'].includes(t));

  function matchesSkill(skillName) {
    if (!skillName) return false;
    const clean = skillName.replace(/\.md$/, '').replace(/^\[Proyecto\]\s*/, '');
    const normSkill = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normSkill.includes(normName) || normName.includes(normSkill)) return true;

    const sTokens = clean.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);
    const common = pTokens.filter(t => sTokens.includes(t));
    if (common.length >= 2 || (pTokens.length === 1 && common.length === 1)) {
      return true;
    }
    return false;
  }

  // 1. Workspace skills
  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (effectiveWs) {
    const wsSkills = path.join(effectiveWs, '.agents', 'skills');
    if (fs.existsSync(wsSkills)) {
      try {
        const list = fs.readdirSync(wsSkills, { withFileTypes: true });
        for (const s of list) {
          if (s.isDirectory() && matchesSkill(s.name)) {
            return s.name;
          }
        }
      } catch (e) {}
    }
  }

  // 2. Global & Built-in skills
  const { globalSkillsDir, builtinSkillsDir } = getAntigravityPaths();
  for (const sDir of [globalSkillsDir, builtinSkillsDir]) {
    if (sDir && fs.existsSync(sDir)) {
      try {
        const list = fs.readdirSync(sDir, { withFileTypes: true });
        for (const s of list) {
          if (!s.isDirectory()) continue;
          if (matchesSkill(s.name)) {
            return s.name;
          }
        }
      } catch (e) {}
    }
  }

  // 3. Vault skills
  if (vaultPath) {
    const vaultSkillsDir = path.join(vaultPath, '01_Skills');
    if (fs.existsSync(vaultSkillsDir)) {
      try {
        const list = fs.readdirSync(vaultSkillsDir);
        for (const sf of list) {
          if (!sf.endsWith('.md') || sf.startsWith('00')) continue;
          const clean = sf.replace(/\.md$/, '').replace(/^\[Proyecto\]\s*/, '');
          if (matchesSkill(clean)) {
            return clean;
          }
        }
      } catch (e) {}
    }
  }

  return '—';
}

function syncProjectsIndex(vaultPath, options = {}) {
  ensureVaultStructure(vaultPath);
  const lang = resolveLanguage(options);
  const isEn = (lang === 'en');
  const isFr = (lang === 'fr');
  const projFolder = path.join(vaultPath, '02_Projets');
  const indexName = isFr ? '00 Index des Projets.md' : isEn ? '00 Projects Index.md' : '00 Indice de Proyectos.md';
  const indexFile = path.join(projFolder, indexName);
  const indexCandidates = ['00 Projects Index.md', '00 Indice de Proyectos.md', '00 Index des Projets.md'].filter(n => n !== indexName);
  for (const staleName of indexCandidates) {
    const stalePath = path.join(projFolder, staleName);
    if (fs.existsSync(stalePath)) {
      try { fs.unlinkSync(stalePath); } catch (e) {}
    }
  }
  const now = new Date().toISOString().split('T')[0];

  const projects = [];

  if (fs.existsSync(projFolder)) {
    const entries = fs.readdirSync(projFolder, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name.startsWith('00')) continue;
      let fp = null;
      let baseName = ent.name;
      if (ent.isDirectory()) {
        const arch = path.join(projFolder, ent.name, 'ARCHITECTURE.md');
        if (fs.existsSync(arch)) fp = arch;
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        fp = path.join(projFolder, ent.name);
        baseName = ent.name.replace(/\.md$/, '');
      }
      if (!fp) continue;
      try {
        const content = fs.readFileSync(fp, 'utf8');
        let name = baseName;
        let localPath = '—';
        let stack = '—';
        let summary = '—';
        let skill = '—';

        const nameMatch = content.match(/^project:\s*"([^"\r\n]+)"/m) || content.match(/>\s*-\s*\*\*Nombre\*\*:\s*`([^`]+)`/i) || content.match(/^title:\s*"Proyecto:\s*([^"\r\n]+)"/m);
        if (nameMatch) name = nameMatch[1].trim();

        const pathMatch = content.match(/>\s*-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i) || content.match(/-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i);
        if (pathMatch) localPath = pathMatch[1].trim();

        const stackMatch = content.match(/^stack:\s*"([^"\r\n]+)"/m) || content.match(/>\s*-\s*\*\*Stack\*\*:\s*([^\r\n]+)/i) || content.match(/-\s*\*\*Stack\*\*:\s*([^\r\n]+)/i);
        if (stackMatch) stack = stackMatch[1].replace(/[`*]/g, '').trim();

        const sumMatch = content.match(/## Decisiones de Diseño y Estructura[^\r\n]*\r?\n([^\r\n#]+)/i) || content.match(/>\s*-\s*\*\*Resumen\*\*:\s*([^\r\n]+)/i);
        if (sumMatch) summary = sumMatch[1].trim();

        const skillMatch = content.match(/\[\[(antigravity-[a-z0-9_-]+|seo|qr-[a-z0-9_-]+)\]\]/i);
        if (skillMatch) skill = skillMatch[1];
        else skill = findAssociatedSkill(name, localPath, vaultPath);

        if (name === 'Antigravity IDE' && localPath.includes('AppData')) continue;

        projects.push({
          name,
          localPath,
          stack,
          summary: summary.slice(0, 140),
          skill: skill !== '—' ? `[[${skill}]]` : '—',
          file: baseName,
        });
      } catch (e) {}
    }
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));

  let tableRows = '';
  if (projects.length === 0) {
    tableRows = isFr
      ? '| *Aucun projet enregistré pour le moment* | — | — | — | — | — |\n'
      : isEn
        ? '| *No projects registered yet* | — | — | — | — | — |\n'
        : '| *Aún no hay proyectos registrados* | — | — | — | — | — |\n';
  } else {
    for (const p of projects) {
      tableRows += `| **${p.name}** | \`${p.localPath}\` | ${p.stack} | ${p.summary} | ${p.skill} | [[${p.file}]] |\n`;
    }
  }

  const indexContent = isFr
    ? `---
title: "Index des Projets — Antigravity"
type: antigravity-index
tags:
  - antigravity/projets
  - antigravity/index
created: ${now}
updated: ${now}
---

# Index Unifié des Projets — Antigravity

> [!INFO] **Registre Consolidé des Projets**
> Registre unifié haute densité de tous les projets de workspace liés à Antigravity et Obsidian.

| Projet | Chemin Local | Stack Technique | Résumé | Skill Associée | Fiche |
|---|---|---|---|---|---|
${tableRows}
---
*Connexions du Graphe :* [[00 Antigravity Hub]] | [[00 Index des Projets]]
`
    : isEn
    ? `---
title: "Projects Index — Antigravity"
type: antigravity-index
tags:
  - antigravity/projects
  - antigravity/index
created: ${now}
updated: ${now}
---

# Unified Projects Index — Antigravity

> [!INFO] **Consolidated Projects Registry**
> Unified high-density registry of all workspace projects linked to Antigravity and Obsidian.

| Project | Local Path | Tech Stack | Summary | Associated Skill | Note |
|---|---|---|---|---|---|
${tableRows}
---
*Graph Connections:* [[00 Antigravity Hub]] | [[00 Projects Index]]
`
    : `---
title: "Índice de Proyectos — Antigravity"
type: antigravity-index
tags:
  - antigravity/proyectos
  - antigravity/index
created: ${now}
updated: ${now}
---

# Índice Unificado de Proyectos — Antigravity

> [!INFO] **Registro Consolidado de Proyectos**
> Registro unificado de alta densidad de todos los proyectos de workspace vinculados a Antigravity y Obsidian.

| Proyecto | Ruta Local | Stack Tecnológico | Resumen | Skill Asociada | Ficha |
|---|---|---|---|---|---|
${tableRows}
---
*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[00 Indice de Proyectos]]
`;

  fs.writeFileSync(indexFile, indexContent, 'utf8');

  // Single consolidated Knowledge Item
  try {
    const { knowledgeDir } = getAntigravityPaths();
    if (fs.existsSync(knowledgeDir)) {
      const targetDir = path.join(knowledgeDir, 'proyectos-antigravity');
      const artifactsDir = path.join(targetDir, 'artifacts');
      if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
      const meta = {
        title: isFr ? 'Projets Enregistrés — Antigravity' : isEn ? 'Registered Projects — Antigravity' : 'Proyectos Registrados — Antigravity',
        summary: isFr ? 'Registre consolidé des projets liés dans Antigravity avec chemin, stack technique et skills associées.' : isEn ? 'Consolidated registry of projects linked in Antigravity with path, tech stack and associated skills.' : 'Registro consolidado de proyectos vinculados en Antigravity con ruta, stack tecnológico y skills asociadas.',
        source: 'obsidian-vault',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        references: [],
      };
      fs.writeFileSync(path.join(targetDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8');
      fs.writeFileSync(path.join(artifactsDir, indexName), indexContent, 'utf8');
    }
  } catch (e) {}

  return { indexPath: indexFile, count: projects.length, projects };
}

function syncProject(vaultPath, workspaceRoot, options = {}) {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return null;

  ensureVaultStructure(vaultPath);
  const detected = detectWorkspaceStack(workspaceRoot);
  const projectName = detected.name || path.basename(workspaceRoot);
  const safeProj = sanitizeFilename(projectName);
  const hermesProjFolder = path.join(vaultPath, '02_Projets', safeProj);
  if (!fs.existsSync(hermesProjFolder)) fs.mkdirSync(hermesProjFolder, { recursive: true });

  const archFile = path.join(hermesProjFolder, 'ARCHITECTURE.md');
  const workFile = path.join(hermesProjFolder, 'WORKFLOW.md');
  const now = new Date().toISOString().split('T')[0];
  const associatedSkill = findAssociatedSkill(projectName, workspaceRoot, vaultPath);

  let existingRules = '';
  let existingAntiPatterns = '';
  if (fs.existsSync(archFile)) {
    try {
      const ex = fs.readFileSync(archFile, 'utf8');
      const rM = ex.match(/##\s*(?:Reglas y Condiciones Obligatorias(?: del Proyecto)?)[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
      if (rM && rM[1].trim() && !rM[1].includes('<!--')) existingRules = rM[1].trim();
      const apM = ex.match(/##\s*(?:Anti-Patrones y Trampas Prohibidas(?: del Proyecto)?)[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
      if (apM && apM[1].trim() && !apM[1].includes('<!--')) existingAntiPatterns = apM[1].trim();
    } catch (e) {}
  }

  const skillLink = associatedSkill !== '—' ? `[[${associatedSkill}]]` : '—';

  const archContent = `---
project: "${projectName}"
type: hermes-architecture
updated: ${now}
stack: "${detected.stack}"
---

# Arquitectura — ${projectName}

## Stack Tecnológico y Entorno
- **Ruta local**: \`${workspaceRoot}\`
- **Stack**: ${detected.stack}
- **Framework / Core**: \`${detected.framework || detected.stack}\`
- **Versión**: \`${detected.version}\`
- **Dependencias clave**: ${detected.dependencies.slice(0, 15).map(d => '`' + d + '`').join(', ') || 'Ninguna'}
- **Skill Asociada**: ${skillLink}

## Decisiones de Diseño y Estructura
${detected.description || `Proyecto en desarrollo (${detected.stack})`}

## Reglas y Condiciones Obligatorias del Proyecto
${existingRules || '<!-- Reglas operativas y condiciones obligatorias para este proyecto (commits, empaquetado, workflows, etc.) -->'}

## Anti-Patrones y Trampas Prohibidas del Proyecto
${existingAntiPatterns || '<!-- Trampas técnicas, errores a evitar y prácticas prohibidas en este repositorio -->'}
`;

  fs.writeFileSync(archFile, archContent, 'utf8');

  if (!fs.existsSync(workFile)) {
    const workContent = `# Workflow — ${projectName}

## Comandos Operativos Frecuentes
- Compilar: \`npm run build\`
- Probar: \`npm test\`
`;
    fs.writeFileSync(workFile, workContent, 'utf8');
  }

  syncProjectRulesToWorkspace(vaultPath, workspaceRoot, projectName);

  return {
    projectName,
    path: archFile,
    stack: detected.stack,
    summary: detected.description,
    skill: associatedSkill,
  };
}

function syncProjectRulesToWorkspace(vaultPath, workspaceRoot, projectName) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return null;
  const effectiveWs = resolveWorkspaceRoot(workspaceRoot || process.cwd());
  if (!effectiveWs || !fs.existsSync(effectiveWs)) return null;

  const projFolder = path.join(vaultPath, '02_Projets');
  if (!fs.existsSync(projFolder)) return null;

  let pName = projectName;
  let projFile = null;

  if (pName) {
    const archCandidate = path.join(projFolder, sanitizeFilename(pName), 'ARCHITECTURE.md');
    if (fs.existsSync(archCandidate)) projFile = archCandidate;
    const directFile = path.join(projFolder, `${sanitizeFilename(pName)}.md`);
    if (!projFile && fs.existsSync(directFile)) projFile = directFile;
  }

  if (!projFile) {
    for (const ent of fs.readdirSync(projFolder, { withFileTypes: true })) {
      let cand = null;
      if (ent.isDirectory() && !ent.name.startsWith('.')) {
        const arch = path.join(projFolder, ent.name, 'ARCHITECTURE.md');
        if (fs.existsSync(arch)) cand = arch;
      } else if (ent.isFile() && ent.name.endsWith('.md') && !ent.name.startsWith('00')) {
        cand = path.join(projFolder, ent.name);
      }
      if (cand) {
        try {
          const txt = fs.readFileSync(cand, 'utf8');
          const m = txt.match(/>\s*-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i) || txt.match(/-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i);
          if (m && path.resolve(m[1]).toLowerCase() === path.resolve(effectiveWs).toLowerCase()) {
            projFile = cand;
            pName = ent.name.replace(/\.md$/, '');
            break;
          }
        } catch (e) {}
      }
    }
  }

  if (!projFile || !fs.existsSync(projFile)) return null;

  const txt = fs.readFileSync(projFile, 'utf8');
  const rulesMatch = txt.match(/##\s*(?:Reglas y Condiciones Obligatorias(?: del Proyecto)?|Project Rules & Constraints)[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
  const apMatch = txt.match(/##\s*(?:Anti-Patrones y Trampas Prohibidas(?: del Proyecto)?|Anti-Patterns & Forbidden Traps)[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);

  const rawRules = rulesMatch ? rulesMatch[1].trim() : '';
  const cleanRules = rawRules.replace(/<!--[\s\S]*?-->/g, '').trim();

  let cleanAntiPatterns = '';
  if (apMatch && apMatch[1].trim()) {
    cleanAntiPatterns = apMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim();
  }

  if (!cleanRules && !cleanAntiPatterns) return null;

  const agentsRulesDir = path.join(effectiveWs, '.agents', 'rules');
  if (!fs.existsSync(agentsRulesDir)) {
    fs.mkdirSync(agentsRulesDir, { recursive: true });
  }

  const resolvedName = pName || path.basename(effectiveWs);
  const ruleFilePath = path.join(agentsRulesDir, 'project-rules.md');
  const ruleContent = [
    '---',
    'trigger: always_on',
    `description: Reglas Obligatorias y Anti-Patrones — ${resolvedName}`,
    '---',
    '',
    `# Reglas Obligatorias del Proyecto (${resolvedName})`,
    '',
    'Estas reglas han sido registradas en Obsidian Second Brain y son de OBLIGATORIO CUMPLIMIENTO en cada intervencion del agente en este workspace:',
    '',
    cleanRules ? `## Condiciones y Flujo de Trabajo\n${cleanRules}\n` : '',
    cleanAntiPatterns ? `## Anti-Patrones y Trampas Prohibidas (Errores Recurrentes)\n${cleanAntiPatterns}\n` : '',
  ].filter(Boolean).join('\n');

  fs.writeFileSync(ruleFilePath, ruleContent, 'utf8');
  const totalCount = (cleanRules + '\n' + cleanAntiPatterns).split('\n').filter(l => l.trim().startsWith('-')).length;
  return { ruleFilePath, rulesCount: totalCount, project: resolvedName };
}

function getProjectsRegistry(vaultPath) {
  const projFolder = path.join(vaultPath, '02_Projets');
  const list = [];
  if (!fs.existsSync(projFolder)) return list;

  const files = fs.readdirSync(projFolder);
  for (const f of files) {
    if (!f.endsWith('.md') || f.startsWith('00')) continue;
    const fp = path.join(projFolder, f);
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const baseName = f.replace(/\.md$/, '');
      let name = baseName;
      let localPath = '';
      let stack = '';
      let summary = '';
      let skill = '';

      const nameMatch = content.match(/>\s*-\s*\*\*Nombre\*\*:\s*`([^`]+)`/i);
      if (nameMatch) name = nameMatch[1].trim();

      const pathMatch = content.match(/>\s*-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i);
      if (pathMatch) localPath = pathMatch[1].trim();

      const stackMatch = content.match(/>\s*-\s*\*\*Stack\*\*:\s*([^\r\n]+)/i);
      if (stackMatch) stack = stackMatch[1].trim();

      const sumMatch = content.match(/>\s*-\s*\*\*Resumen\*\*:\s*([^\r\n]+)/i);
      if (sumMatch) summary = sumMatch[1].trim();

      const skillMatch = content.match(/>\s*-\s*\*\*Skill Asociada\*\*:\s*\[\[?([^\]\r\n]+)\]\]?/i);
      if (skillMatch) skill = skillMatch[1].replace(/^\[\[|\]\]$/g, '').trim();

      list.push({
        name,
        localPath,
        stack,
        summary,
        skill: skill || '—',
        note: baseName,
        relPath: `Antigravity/Proyectos/${f}`,
      });
    } catch (e) {}
  }
  return list;
}

function isProjectRegistered(vaultPath, workspaceRoot) {
  if (!workspaceRoot) return { registered: false, project: null };
  const projects = getProjectsRegistry(vaultPath);
  const normTarget = path.resolve(workspaceRoot).toLowerCase().replace(/\\/g, '/');
  const targetBase = path.basename(workspaceRoot).toLowerCase();

  for (const p of projects) {
    if (p.localPath && p.localPath !== '—') {
      const normProj = path.resolve(p.localPath).toLowerCase().replace(/\\/g, '/');
      if (normProj === normTarget) {
        return { registered: true, project: p };
      }
    }
    if (p.name.toLowerCase() === targetBase) {
      return { registered: true, project: p };
    }
  }

  return { registered: false, project: null };
}

// -------------------------------------------------------------
// Generate Main Antigravity Hub (The Central Brain MOC)
// -------------------------------------------------------------

function generateHub(vaultPath, workspaceRoot, options = {}) {
  ensureVaultStructure(vaultPath);
  const hubFile = path.join(vaultPath, '00 Antigravity Hub.md');
  const now = new Date().toISOString().split('T')[0];
  const projectName = workspaceRoot ? path.basename(workspaceRoot) : null;
  const userName = resolveUserName(vaultPath, options.userName);
  const { aiName, userCallsign } = resolvePersonality(vaultPath, options);
  const lang = resolveLanguage(options);
  const isEn = (lang === 'en');
  const isFr = (lang === 'fr');

  const content = isFr
    ? `---
title: "Antigravity Hub — Second Cerveau IA"
type: antigravity-hub
tags:
  - antigravity/hub
  - antigravity/second-brain
updated: ${now}
---

# Antigravity Hub — Second Cerveau IA

Bienvenue au cœur de mémoire, skills et connaissances interconnectées entre **Antigravity** et **Obsidian**.
Tous les nœuds de cette voûte sont liés bidirectionnellement pour illuminer ta **Vue Graphique (Graph View)**.

\`\`\`
       ┌──────────────────────────────────────────────┐
       │              00 Antigravity Hub              │
       └──────────────────────┬───────────────────────┘
          ┌───────────┬───────┴───────┬───────────┐
          ▼           ▼               ▼           ▼
        Soul       Skills          Mémoire   Sessions & Projets
\`\`\`

---

## Soul, Personnalité & Profil (Hermes Core)
Identité de l'agent et style de travail de ${userName} :
- [[00 Soul Antigravity]] — Archétype résolutif, principes non négociables et autonomie
- [[00 Personnalité IA]] — Nom de l'agent (${aiName}), appellation envers toi (${userCallsign}) et traits de comportement
- [[00 Profil Utilisateur]] — Préférences, habitudes techniques et apprentissages accumulés

---

## Skills Disponibles
Accède au catalogue complet des capacités et workflows maîtrisés par l'assistant :
- [[00 Index des Skills]]

---

## Mémoire & Base de Connaissance (Knowledge Items)
Leçons apprises, architectures, fixes de débogage, modèles et documentation permanente :
- [[00 Index Mémoire]]

---

## Continuité de Travail & Sessions
Historique chronologique des checkpoints, décisions d'architecture et jalons entre les sessions :
- [[00 Index des Sessions]]

---

## Projets Liés & Blueprints
Index consolidé des architectures de projets, anti-patterns et backlogs :
- [[00 Index des Projets]]
${projectName ? `- Projet Actif Actuel : [[${projectName}]]` : '- *Ouvre un projet dans Antigravity pour enregistrer automatiquement son blueprint.*'}

---

> [!TIP] **Comment fonctionne la synchronisation autonome ?**
> - Chaque fois qu'Antigravity résout un problème ou génère de la connaissance, elle est automatiquement stockée dans \`Antigravity/Memoria/\`.
> - Les sessions et jalons de travail sont enregistrés dans \`03_Sessions/\`.
> - Les skills globales de \`~/.gemini/config/skills/\` sont synchronisées en temps réel dans \`Antigravity/Skills/\`.
> - Tu peux créer ou éditer des skills ici même en Markdown et Antigravity les assimilera.
`
    : isEn
    ? `---
title: "Antigravity Hub — AI Second Brain"
type: antigravity-hub
tags:
  - antigravity/hub
  - antigravity/second-brain
updated: ${now}
---

# Antigravity Hub — AI Second Brain

Welcome to the interconnected memory, skills, and knowledge core between **Antigravity** and **Obsidian**.
All nodes in this vault are bidirectionally linked to light up your **Graph View**.

\`\`\`
       ┌──────────────────────────────────────────────┐
       │              00 Antigravity Hub              │
       └──────────────────────┬───────────────────────┘
          ┌───────────┬───────┴───────┬───────────┐
          ▼           ▼               ▼           ▼
        Soul       Skills          Memory     Sessions & Projects
\`\`\`

---

## Soul, Personality & Profile (Hermes Core)
Agent identity and working style of ${userName}:
- [[00 Soul de Antigravity]] — Decisive archetype, non-negotiable principles, and autonomy
- [[00 AI Personality]] — Agent name (${aiName}), callsign for you (${userCallsign}), and behavioral tone
- [[00 Perfil de Usuario]] — Preferences, technical habits, and accumulated learnings

---

## Available Skills
Access the complete catalog of capabilities and workflows mastered by the assistant:
- [[00 Indice de Skills]]

---

## Memory & Knowledge Base (Knowledge Items)
Lessons learned, architectures, debugging fixes, models, and permanent documentation:
- [[00 Indice de Memoria]]

---

## Work Continuity & Sessions
Chronological history of checkpoints, architecture decisions, and milestones across sessions:
- [[00 Indice de Sesiones]]

---

## Linked Projects & Blueprints
Consolidated index of project architectures, antipatterns, and backlogs:
- [[00 Indice de Proyectos]]
${projectName ? `- Current Active Project: [[${projectName}]]` : '- *Open a project in Antigravity to automatically register its blueprint.*'}

---

> [!TIP] **How does autonomous sync work?**
> - Every time Antigravity solves a problem or generates knowledge, it is automatically stored in \`Antigravity/Memoria/\`.
> - Work sessions and milestones are recorded in \`03_Sessions/\`.
> - Global skills from \`~/.gemini/config/skills/\` are synchronized in real-time into \`Antigravity/Skills/\`.
> - You can create or edit skills right here in Markdown and Antigravity will assimilate them.
`
    : `---
title: "Antigravity Hub — Segundo Cerebro IA"
type: antigravity-hub
tags:
  - antigravity/hub
  - antigravity/segundo-cerebro
updated: ${now}
---

# Antigravity Hub — Segundo Cerebro de IA

Bienvenido al núcleo de memoria, skills y conocimiento interconectado entre **Antigravity** y **Obsidian**.
Todos los nodos de esta bóveda están enlazados bidireccionalmente para iluminar tu **Vista Gráfica (Graph View)**.

\`\`\`
       ┌──────────────────────────────────────────────┐
       │              00 Antigravity Hub              │
       └──────────────────────┬───────────────────────┘
          ┌───────────┬───────┴───────┬───────────┐
          ▼           ▼               ▼           ▼
        Alma       Skills          Memoria    Sesiones & Proyectos
\`\`\`

---

## Alma, Personalidad & Perfil (Hermes Core)
Identidad del agente y estilo de trabajo de ${userName}:
- [[00 Soul de Antigravity]] — Arquetipo resolutivo, principios inquebrantables y autonomía
- [[00 Personalidad de la IA]] — Nombre del agente (${aiName}), trato hacia ti (${userCallsign}) y rasgos de comportamiento
- [[00 Perfil de Usuario]] — Preferencias, hábitos técnicos y aprendizajes acumulados

---

## Skills Disponibles
Accede al catálogo completo de capacidades y flujos que domina el asistente:
- [[00 Indice de Skills]]

---

## Memoria y Base de Conocimiento (Knowledge Items)
Lecciones aprendidas, arquitecturas, trucos, modelos y documentación permanente:
- [[00 Indice de Memoria]]

---

## Continuidad de Trabajo & Sesiones
Historial cronológico de checkpoints, decisiones arquitectónicas e hitos de sesión:
- [[00 Indice de Sesiones]]

---

## Proyectos Vinculados & Blueprints
Índice consolidado de arquitectura de proyectos, anti-patrones y backlog:
- [[00 Indice de Proyectos]]
${projectName ? `- Proyecto Activo Actual: [[${projectName}]]` : '- *Abre un proyecto en Antigravity para registrar su blueprint automáticamente.*'}

---

> [!TIP] **¿Cómo funciona la sincronización automática?**
> - Cada vez que Antigravity resuelve un problema o genera conocimiento, se guarda automáticamente en \`Antigravity/Memoria/\`.
> - Las sesiones e hitos de trabajo se registran en \`03_Sessions/\`.
> - Las skills globales de \`~/.gemini/config/skills/\` se mantienen sincronizadas en tiempo real en \`Antigravity/Skills/\`.
> - Puedes crear o editar skills aquí mismo con formato markdown y Antigravity las asimilará.
`;

  fs.writeFileSync(hubFile, content, 'utf8');
  return hubFile;
}

// -------------------------------------------------------------
// Vault Statistics
// -------------------------------------------------------------

function getVaultStats(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { memories: 0, skills: 0, projects: 0, sessions: 0, hubExists: false, soulActive: false, personalityActive: false, personalityConfigured: false, aiName: 'Hermes', userCallsign: '' };
  }

  const countMd = (dir) => {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('00')).length;
  };

  const countProjects = (dir) => {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir, { withFileTypes: true }).filter(ent => {
      if (ent.isDirectory() && !ent.name.startsWith('.')) return true;
      if (ent.isFile() && ent.name.endsWith('.md') && !ent.name.startsWith('00')) return true;
      return false;
    }).length;
  };

  const personalityInfo = resolvePersonality(vaultPath);
  const memDir = path.join(vaultPath, '00_Agent', 'Memoires');
  const memoriesCount = countMd(memDir);
  const skillsCount = countMd(path.join(vaultPath, '01_Skills'));
  const projectsCount = countProjects(path.join(vaultPath, '02_Projets'));
  const sessionsCount = countMd(path.join(vaultPath, '03_Sessions'));
  const toolsCount = countMd(path.join(vaultPath, '04_Outils'));

  const hubExists = fs.existsSync(path.join(vaultPath, '00 Antigravity Hub.md')) ||
                    fs.existsSync(path.join(vaultPath, '00_Agent', '00 Antigravity Hub.md'));
  const soulActive = fs.existsSync(path.join(vaultPath, '00_Agent', 'SOUL.md'));
  const personalityActive = personalityInfo.configured;

  return {
    memories: memoriesCount,
    skills: skillsCount,
    projects: projectsCount,
    sessions: sessionsCount,
    tools: toolsCount,
    hubExists,
    soulActive,
    personalityActive,
    personalityConfigured: personalityInfo.configured,
    aiName: personalityInfo.aiName,
    userCallsign: personalityInfo.userCallsign,
    personality: personalityInfo.personality,
  };
}

// -------------------------------------------------------------
// Sync All
// -------------------------------------------------------------


// -------------------------------------------------------------
// Vault to Antigravity Knowledge Items Sync (Bidirectional)
// -------------------------------------------------------------

function syncVaultToKnowledge(vaultPath) {
  const { knowledgeDir } = getAntigravityPaths();
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }

  const memoriaDir = path.join(vaultPath, '00_Agent', 'Memoires');
  const proyectosDir = path.join(vaultPath, '02_Projets');

  function sanitizeId(name) {
    return name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const base = path.basename(filePath, '.md');
    if (base.startsWith('00')) return;

    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let title = base;
    let summary = '';
    let originId = null;
    let body = content;

    if (fmMatch) {
      body = content.slice(fmMatch[0].length).trim();
      const lines = fmMatch[1].split('\n');
      for (const l of lines) {
        const tm = l.match(/^title:\s*"?([^"\r\n]+)"?$/);
        if (tm && tm[1]) title = tm[1].trim();
        const om = l.match(/^origin_id:\s*"?([^"\r\n]+)"?$/);
        if (om && om[1]) originId = om[1].trim();
      }
    }

    const bqMatch = body.match(/>\s*\[!.*?\]\s*\*\*.*?\*\*\r?\n>\s*([^\r\n]+)/);
    if (bqMatch && bqMatch[1]) {
      summary = bqMatch[1].trim();
    } else {
      summary = body.replace(/#.*|\r?\n/g, ' ').slice(0, 220).trim() + '...';
    }

    const id = originId || sanitizeId(title) || sanitizeId(base);
    const targetDir = path.join(knowledgeDir, id);
    const artifactsDir = path.join(targetDir, 'artifacts');

    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

    const meta = {
      title,
      summary,
      source: 'obsidian-vault',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      references: []
    };

    fs.writeFileSync(path.join(targetDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8');
    fs.writeFileSync(path.join(artifactsDir, base + '.md'), content, 'utf8');
  }

  if (fs.existsSync(memoriaDir)) {
    for (const f of fs.readdirSync(memoriaDir)) {
      if (f.endsWith('.md')) processFile(path.join(memoriaDir, f));
    }
  }

  // Clean legacy individual project knowledge items to avoid prompt token waste
  try {
    const items = fs.readdirSync(knowledgeDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (item.name.startsWith('proyecto-') && item.name !== 'proyectos-antigravity') {
        const metaPath = path.join(knowledgeDir, item.name, 'metadata.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.source === 'obsidian-vault' || (meta.title && meta.title.startsWith('Proyecto:'))) {
              fs.rmSync(path.join(knowledgeDir, item.name), { recursive: true, force: true });
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  // Export ONLY ONE single consolidated Knowledge Item for all projects: proyectos-antigravity
  if (fs.existsSync(proyectosDir)) {
    const indexResult = syncProjectsIndex(vaultPath);
    const targetDir = path.join(knowledgeDir, 'proyectos-antigravity');
    const artifactsDir = path.join(targetDir, 'artifacts');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

    let indexContent = '';
    if (indexResult.indexPath && fs.existsSync(indexResult.indexPath)) {
      indexContent = fs.readFileSync(indexResult.indexPath, 'utf8');
    }

    const projLang = resolveLanguage({});
    const projIndexName = (projLang === 'fr') ? '00 Index des Projets.md' : (projLang === 'en') ? '00 Projects Index.md' : '00 Indice de Proyectos.md';
    const meta = {
      title: (projLang === 'fr') ? 'Projets Enregistrés — Antigravity' : (projLang === 'en') ? 'Registered Projects — Antigravity' : 'Proyectos Registrados — Antigravity',
      summary: (projLang === 'fr') ? 'Registre consolidé des projets liés dans Antigravity avec chemin, stack technique et skills associées.' : (projLang === 'en') ? 'Consolidated registry of projects linked in Antigravity with path, tech stack and associated skills.' : 'Registro consolidado de proyectos vinculados en Antigravity con ruta, stack tecnológico y skills asociadas.',
      source: 'obsidian-vault',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      references: []
    };

    fs.writeFileSync(path.join(targetDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8');
    fs.writeFileSync(path.join(artifactsDir, projIndexName), indexContent, 'utf8');
  }
}

// -------------------------------------------------------------
// Context Manifest Cache & Ultra-Low-Context Triage / Peek
// -------------------------------------------------------------

function buildContextManifest(vaultPath) {
  ensureVaultStructure(vaultPath);
  const memDir = path.join(vaultPath, '00_Agent', 'Memoires');
  const skiDir = path.join(vaultPath, '01_Skills');
  const proDir = path.join(vaultPath, '02_Projets');

  const memories = [];
  if (fs.existsSync(memDir)) {
    for (const f of fs.readdirSync(memDir)) {
      if (!f.endsWith('.md') || f.startsWith('00')) continue;
      const fp = path.join(memDir, f);
      try {
        const txt = fs.readFileSync(fp, 'utf8');
        const titleMatch = txt.match(/^title:\s*"([^"\r\n]+)"/m) || txt.match(/^#+\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : f.replace(/\.md$/, '');

        const catMatch = txt.match(/^category:\s*"?([^"\r\n]+)"?/m);
        const category = catMatch ? catMatch[1].trim() : 'general';

        const sumMatch = txt.match(/>\s*\[!(?:NOTE|ABSTRACT|INFO)\][^\r\n]*\r?\n>\s*([^\r\n]+)/i);
        let summary = sumMatch ? sumMatch[1].trim() : '';
        if (!summary) {
          summary = txt.replace(/---[\s\S]*?---/, '').replace(/#+[^\r\n]+/g, '').replace(/\r?\n/g, ' ').trim().slice(0, 140);
        }

        const tagsMatch = txt.match(/^tags:\s*\r?\n((?:\s*-\s*[^\r\n]+\r?\n)+)/m);
        const tags = [];
        if (tagsMatch) {
          const lines = tagsMatch[1].split('\n');
          for (const l of lines) {
            const tm = l.match(/-\s*([^\r\n]+)/);
            if (tm) tags.push(tm[1].trim().toLowerCase());
          }
        }

        const stat = fs.statSync(fp);
        const bodyClean = txt
          .replace(/^---[\s\S]*?---\r?\n/, '')
          .replace(/---[\s\S]*?\*Conexiones.*\*[\s\S]*$/, '')
          .replace(/```[a-zA-Z]*\n?/g, ' ')
          .replace(/[#*`_>~|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        memories.push({
          title,
          category,
          summary: summary.slice(0, 180),
          tags,
          bodyExcerpt: bodyClean.slice(0, 2000),
          relPath: `Antigravity/Memoria/${f}`,
          updated: stat.mtime.toISOString().split('T')[0],
        });
      } catch (e) {}
    }
  }

  const skills = [];
  if (fs.existsSync(skiDir)) {
    for (const f of fs.readdirSync(skiDir)) {
      if (!f.endsWith('.md') || f.startsWith('00')) continue;
      const fp = path.join(skiDir, f);
      try {
        const txt = fs.readFileSync(fp, 'utf8');
        const nameMatch = txt.match(/^title:\s*"Skill:\s*([^"\r\n]+)"/m) || txt.match(/^#+\s*Skill:\s*\[\[([^\]]+)\]\]/m);
        const name = nameMatch ? nameMatch[1].trim() : f.replace(/\.md$/, '').replace(/^\[Proyecto\]\s*/, '');

        const scopeMatch = txt.match(/^scope:\s*(\w+)/m);
        const scope = scopeMatch ? scopeMatch[1].trim() : 'global';

        const descMatch = txt.match(/>\s*-\s*\*\*Descripción\*\*:\s*([^\r\n]+)/i);
        const description = descMatch ? descMatch[1].trim() : '';

        skills.push({
          name,
          scope,
          description: description.slice(0, 160),
          relPath: `Antigravity/Skills/${f}`,
        });
      } catch (e) {}
    }
  }

  const projects = [];
  if (fs.existsSync(proDir)) {
    for (const f of fs.readdirSync(proDir)) {
      if (!f.endsWith('.md') || f.startsWith('00')) continue;
      projects.push(f.replace(/\.md$/, ''));
    }
  }

  const sesDir = path.join(vaultPath, '03_Sessions');
  const sessions = [];
  if (fs.existsSync(sesDir)) {
    for (const f of fs.readdirSync(sesDir)) {
      if (!f.endsWith('.md') || f.startsWith('00')) continue;
      sessions.push(f.replace(/\.md$/, ''));
    }
  }

  const manifest = {
    updatedAt: new Date().toISOString(),
    vaultName: path.basename(vaultPath),
    stats: { memories: memories.length, skills: skills.length, projects: projects.length, sessions: sessions.length },
    skills,
    memories,
    projects,
    sessions,
  };

  try {
    const manifestFile = path.join(vaultPath, 'context-manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (e) {}

  return manifest;
}

function getContextManifest(vaultPath, forceRebuild = false) {
  const manifestFile = path.join(vaultPath, 'context-manifest.json');
  if (!forceRebuild && fs.existsSync(manifestFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      const diffMs = Date.now() - new Date(data.updatedAt || 0).getTime();
      if (diffMs < 7200000) return data;
    } catch (e) {}
  }
  return buildContextManifest(vaultPath);
}

function stemToken(word) {
  let w = (word || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (w.length <= 3) return w;

  const esSuffixes = [
    'amientos', 'amiento', 'imientos', 'imiento',
    'aciones', 'acion', 'iciones', 'icion',
    'idades', 'idad', 'mente',
    'ancias', 'ancia', 'encias', 'encia',
    'adoras', 'adores', 'adora', 'ador',
    'abamos', 'abais', 'arian', 'arias', 'aria',
    'eremos', 'iremos', 'eron',
    'iendo', 'ando', 'ieron',
    'ables', 'ibles', 'able', 'ible',
    'istas', 'ista', 'ismos', 'ismo',
    'aban', 'abas', 'aron',
    'ados', 'adas', 'ado', 'ada',
    'idos', 'idas', 'ido', 'ida',
    'es', 's'
  ];

  for (const suf of esSuffixes) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }

  const enSuffixes = [
    'ational', 'tional', 'ization', 'ation',
    'fulness', 'ousness', 'iveness',
    'encies', 'ency', 'ances', 'ance',
    'ously', 'fully', 'ively',
    'izing', 'ising', 'izer',
    'ating', 'ator',
    'ments', 'ment',
    'able', 'ible',
    'ness', 'ship',
    'ies', 'ied',
    'ing', 'ed',
    'es', 's'
  ];

  for (const suf of enSuffixes) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }

  const frSuffixes = [
    'ations', 'ation', 'ements', 'ement',
    'ites', 'ite', 'eurs', 'euse', 'euses',
    'ances', 'ance', 'ences', 'ence',
    'ments', 'ment', 'antes', 'ante',
    'ants', 'ant', 'ees', 'ee',
    'es', 's'
  ];

  for (const suf of frSuffixes) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }

  return w;
}

function tokenize(text) {
  if (!text) return [];
  const STOPWORDS = new Set([
    'de', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'en', 'a',
    'con', 'por', 'para', 'del', 'al', 'que', 'es', 'son', 'fue', 'era', 'como', 'se',
    'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'the', 'and', 'in', 'on', 'for', 'with', 'to',
    'at', 'is', 'it', 'this', 'that', 'from', 'by', 'an', 'be', 'or', 'as', 'not', 'no',
    'le', 'les', 'des', 'du', 'une', 'et', 'au', 'aux', 'ce', 'ces', 'cet', 'dans',
    'pour', 'sur', 'avec', 'est', 'sont', 'ete', 'etait', 'par', 'pas', 'plus', 'son',
    'sa', 'ses', 'qui', 'il', 'elle', 'nous', 'vous', 'on', 'ne', 'je', 'me', 'te',
    'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'nos', 'vos', 'leur', 'leurs', 'cette',
    'tout', 'tous', 'toute', 'toutes', 'comme', 'sans', 'sous', 'entre', 'vers', 'si',
    'tres', 'bien', 'aussi', 'etre', 'avoir', 'fait', 'faire', 'peut', 'dont', 'ou',
    'mais', 'donc', 'ni', 'car'
  ]);

  const expanded = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.:/\\()[\]{}'"`]/g, ' ');

  const rawWords = expanded
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));

  const stems = rawWords.map(stemToken).filter(w => w.length >= 2 && !STOPWORDS.has(w));
  return [...new Set([...rawWords, ...stems])];
}

function computeFullBM25(corpus, queryTokens, k1 = 1.2, b = 0.75) {
  const N = corpus.length;
  if (N === 0 || queryTokens.length === 0) return [];

  const docData = corpus.map(doc => {
    const tTokens = tokenize(doc.title || doc.name || '');
    const tagTokens = tokenize((doc.tags || []).join(' '));
    const sTokens = tokenize(doc.summary || doc.description || '');
    const bTokens = tokenize(doc.bodyExcerpt || doc.body || doc.solution || '');

    const weightedLen = 5.0 * tTokens.length + 3.5 * tagTokens.length + 2.5 * sTokens.length + 1.0 * bTokens.length;
    const allTokens = [...tTokens, ...tagTokens, ...sTokens, ...bTokens];

    return {
      tTokens,
      tagTokens,
      sTokens,
      bTokens,
      weightedLen: Math.max(weightedLen, 1),
      uniqueTokens: new Set(allTokens)
    };
  });

  const avgdl = docData.reduce((acc, d) => acc + d.weightedLen, 0) / N || 1;

  const df = {};
  for (const q of queryTokens) {
    let count = 0;
    for (const d of docData) {
      if (d.uniqueTokens.has(q)) count++;
    }
    df[q] = count;
  }

  return corpus.map((doc, idx) => {
    const d = docData[idx];
    let score = 0;
    const matchedTerms = [];

    for (const q of queryTokens) {
      if (df[q] > 0 && d.uniqueTokens.has(q)) {
        matchedTerms.push(q);
        const countT = d.tTokens.filter(t => t === q).length;
        const countTag = d.tagTokens.filter(t => t === q).length;
        const countS = d.sTokens.filter(t => t === q).length;
        const countB = d.bTokens.filter(t => t === q).length;

        const weightedTF = 5.0 * countT + 3.5 * countTag + 2.5 * countS + 1.0 * countB;
        const idf = Math.log(1 + (N - df[q] + 0.5) / (df[q] + 0.5));
        const num = weightedTF * (k1 + 1);
        const denom = weightedTF + k1 * (1 - b + b * (d.weightedLen / avgdl));
        score += idf * (num / denom);
      }
    }

    const titleNorm = (doc.title || doc.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const q of queryTokens) {
      if (titleNorm.includes(q)) score += 3.0;
    }

    let snippet = '';
    const fullText = (doc.bodyExcerpt || doc.body || doc.solution || doc.summary || '');
    if (fullText && matchedTerms.length > 0) {
      const lowerText = fullText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let bestPos = -1;
      for (const term of matchedTerms) {
        const pos = lowerText.indexOf(term);
        if (pos !== -1) {
          bestPos = pos;
          break;
        }
      }
      if (bestPos !== -1) {
        const start = Math.max(0, bestPos - 60);
        const end = Math.min(fullText.length, bestPos + 140);
        snippet = (start > 0 ? '...' : '') + fullText.slice(start, end).replace(/\s+/g, ' ').trim() + (end < fullText.length ? '...' : '');
      }
    }

    return { ...doc, score, matchedTerms, snippet };
  });
}

function triageContext(vaultPath, query) {
  if (!query || query.trim() === '') {
    return { hasAntecedents: false, recommendation: 'Consulta vacía. Procede normalmente.' };
  }

  const manifest = getContextManifest(vaultPath);
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return { hasAntecedents: false, recommendation: 'Sin palabras clave relevantes. Procede normalmente.' };
  }

  // 1. BM25 on Skills
  let skillMatch = null;
  const scoredSkills = computeFullBM25(manifest.skills || [], queryTokens);
  scoredSkills.sort((a, b) => b.score - a.score);
  if (scoredSkills.length > 0 && scoredSkills[0].score >= 2.0) {
    const best = scoredSkills[0];
    skillMatch = {
      name: best.name,
      scope: best.scope,
      summary: best.description || 'Procedimiento especializado',
      advice: `Usa la Skill [[${best.name}]] para este flujo de trabajo. Lee su SKILL.md para instrucciones operativas.`,
      score: Math.round(best.score * 100) / 100,
    };
  }

  // 2. Full-Text BM25 on Memories (ranking title, tags, summary, and full body content)
  const scoredMemories = computeFullBM25(manifest.memories || [], queryTokens);
  scoredMemories.sort((a, b) => b.score - a.score);
  const relevantMemories = scoredMemories.filter(m => m.score >= 1.2);
  const topMemories = relevantMemories.slice(0, 2).map(({ title, category, summary, relPath, score, snippet }) => ({
    title,
    category,
    summary,
    snippet: snippet || undefined,
    relPath,
    score: Math.round(score * 100) / 100,
  }));

  const hasAntecedents = topMemories.length > 0 || !!skillMatch;

  let recommendation = '';
  if (topMemories.length > 0) {
    recommendation = 'Antecedente encontrado con ranking BM25: Aplica directamente el resumen arriba indicado. Usa "peek" si necesitas ver el código exacto.';
  } else if (skillMatch) {
    recommendation = `Flujo técnico cubierto por la Skill [[${skillMatch.name}]]. Consulta sus instrucciones operativas.`;
  } else {
    recommendation = 'Sin antecedentes previos en el Vault. Procede con la solución sin consumir más contexto.';
  }

  return {
    query,
    hasAntecedents,
    skillMatch,
    memories: topMemories,
    recommendation,
  };
}

function peekMemory(vaultPath, noteName) {
  if (!noteName) return { error: 'Especifica la nota a inspeccionar.' };

  const cleanName = sanitizeFilename(noteName.endsWith('.md') ? noteName.slice(0, -3) : noteName);
  let target = path.join(vaultPath, 'Antigravity', 'Memoria', cleanName + '.md');

  if (!fs.existsSync(target)) {
    function find(dir) {
      if (!fs.existsSync(dir)) return null;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) {
          const r = find(fp);
          if (r) return r;
        } else if (e.name.toLowerCase() === (cleanName.toLowerCase() + '.md') || e.name.toLowerCase().includes(cleanName.toLowerCase())) {
          return fp;
        }
      }
      return null;
    }
    target = find(path.join(vaultPath, 'Antigravity'));
  }

  if (!target || !fs.existsSync(target)) {
    return { error: `Nota no encontrada: ${noteName}` };
  }

  const raw = fs.readFileSync(target, 'utf8');
  const catMatch = raw.match(/^category:\s*"?([^"\r\n]+)"?/m);
  const category = catMatch ? catMatch[1].trim() : 'general';

  const sumMatch = raw.match(/>\s*\[!(?:NOTE|ABSTRACT|INFO)\][^\r\n]*\r?\n>\s*([^\r\n]+)/i);
  const summary = sumMatch ? sumMatch[1].trim() : '';

  let body = raw.replace(/^---[\s\S]*?---\r?\n/, '');
  body = body.replace(/---[\s\S]*?\*(?:Conexiones del Grafo|Connexions du Graphe|Graph Connections):\*[\s\S]*$/, '');
  body = body.replace(/^#+\s*[^\r\n]+/gm, '').trim();

  const detailsMatch = raw.match(/##\s*(?:Detalles y Solución|Détails et Solution|Details & Solution|Details and Solution)\r?\n([\s\S]*?)(?:---|###|$)/i);
  let solutionText = detailsMatch ? detailsMatch[1].trim() : body;

  if (solutionText.length > 1200) {
    solutionText = solutionText.slice(0, 1200) + '\n\n*(Extracto resumido para ahorrar contexto).*';
  }

  return {
    title: path.basename(target, '.md'),
    category,
    summary,
    solution: solutionText || 'Sin detalles adicionales registrados.',
  };
}

function catalogContext(vaultPath) {
  const manifest = getContextManifest(vaultPath);
  return {
    skills: manifest.skills.map(s => ({ name: s.name, desc: s.description })),
    memories: manifest.memories.slice(0, 10).map(m => ({ title: m.title, cat: m.category, desc: m.summary })),
  };
}

// -------------------------------------------------------------
// 00_Meta schema normalizer — garantit tags + champs génériques du
// README 00_Meta sur les notes gérées/régénérées par le sync.
// -------------------------------------------------------------
const META_FOLDER_TAGS = {
  '01_Skills': ['dev', 'skills'],
  '02_Projets': ['dev', 'projet'],
  '02_Proyectos': ['dev', 'projet'],
  '00_Agent': ['dev', 'agents'],
  '00_Agente': ['dev', 'agents'],
  '03_Sessions': ['dev', 'agents', 'session'],
  '03_Sesiones': ['dev', 'agents', 'session'],
  '04_Outils': ['outils'],
  '04_Herramientas': ['outils'],
  'Chats': ['dev', 'agents', 'chat'],
  '70_Ecosysteme_Agents': ['dev', 'agents'],
  '_root': ['docs'],
};
const META_DOMAIN_VOCAB = new Set(['dev', 'marketing', 'research', 'finance']);
const META_GENERIC = [
  ['kanban_board', '""'], ['calendar_event', '""'], ['automation', 'false'],
  ['ci_status', '""'], ['repo', '""'], ['depends_on', '[]'],
  ['revision', '1'], ['change_log', '[]'],
];
const META_KEY_RE = /^([A-Za-z_][\w-]*)\s*:/;
const META_ITEM_RE = /^\s*-\s+(.*)$/;
const metaUnquote = s => s.trim().replace(/^['"]|['"]$/g, '');

function metaNormalizeNote(filePath, wantTags) {
  const today = new Date().toISOString().split('T')[0];
  const domain = wantTags.find(t => META_DOMAIN_VOCAB.has(t));
  let raw = fs.readFileSync(filePath, 'utf8');
  let bom = '';
  if (raw.charCodeAt(0) === 0xFEFF) { bom = '\uFEFF'; raw = raw.slice(1); }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  if (!lines[0] || lines[0].trim() !== '---') {
    const block = ['---', `created: "${today}"`, `updated: "${today}"`, 'tags:',
      ...wantTags.map(t => `  - ${t}`), ...(domain ? [`domain: "${domain}"`] : []),
      ...META_GENERIC.map(([k, v]) => `${k}: ${v}`), '---', ''];
    fs.writeFileSync(filePath, bom + block.join(eol) + lines.join(eol), 'utf8');
    return true;
  }
  let fmEnd = -1;
  for (let i = 1; i < Math.min(lines.length, 400); i++) {
    if (lines[i].trim() === '---') { fmEnd = i; break; }
  }
  if (fmEnd === -1) return false;
  const fm = lines.slice(1, fmEnd);
  const body = lines.slice(fmEnd + 1);
  const have = new Set();
  fm.forEach(l => { const m = l.match(META_KEY_RE); if (m) have.add(m[1]); });
  const existing = new Set();
  let tagsIdx = -1, tagsKind = 'absent';
  for (let i = 0; i < fm.length; i++) {
    const m = fm[i].match(META_KEY_RE);
    if (!m || m[1] !== 'tags') continue;
    tagsIdx = i;
    const v = fm[i].replace(META_KEY_RE, '').trim();
    if (v === '') {
      tagsKind = 'block';
      for (let j = i + 1; j < fm.length; j++) {
        const li = fm[j].match(META_ITEM_RE);
        if (li) existing.add(metaUnquote(li[1])); else if (fm[j].trim() !== '') break;
      }
    } else if (/^\[.*\]$/.test(v)) {
      tagsKind = 'inline';
      v.slice(1, -1).split(',').map(metaUnquote).filter(Boolean).forEach(t => existing.add(t));
    } else { tagsKind = 'scalar'; existing.add(metaUnquote(v)); }
    break;
  }
  const missing = wantTags.filter(t => !existing.has(t));
  let changed = false;
  const out = [];
  for (let i = 0; i < fm.length; i++) {
    const l = fm[i];
    const m = l.match(META_KEY_RE);
    const key = m ? m[1] : null;
    if (key === 'tags' && i === tagsIdx) {
      if (tagsKind === 'inline') {
        if (missing.length) { out.push(`tags: [${[...existing, ...missing].join(', ')}]`); changed = true; }
        else out.push(l);
      } else {
        out.push('tags:');
        if (tagsKind === 'scalar') { out.push(`  - ${metaUnquote(l.replace(META_KEY_RE, ''))}`); changed = true; }
        if (tagsKind === 'block') {
          let j = i + 1;
          for (; j < fm.length; j++) {
            if (META_ITEM_RE.test(fm[j]) || fm[j].trim() === '') { out.push(fm[j]); } else break;
          }
          i = j - 1;
        }
        if (missing.length) { for (const t of missing) out.push(`  - ${t}`); changed = true; }
      }
      continue;
    }
    if (key === 'updated') {
      const nv = `updated: "${today}"`;
      if (l !== nv) { out.push(nv); changed = true; } else out.push(l);
      continue;
    }
    out.push(l);
  }
  if (tagsKind === 'absent') { out.push('tags:', ...wantTags.map(t => `  - ${t}`)); changed = true; }
  if (domain && !have.has('domain')) { out.push(`domain: "${domain}"`); changed = true; }
  if (!have.has('created')) { out.push(`created: "${today}"`); changed = true; }
  if (!have.has('updated')) { out.push(`updated: "${today}"`); changed = true; }
  for (const [k, v] of META_GENERIC) {
    if (!have.has(k)) { out.push(`${k}: ${v}`); changed = true; }
  }
  if (changed) fs.writeFileSync(filePath, bom + ['---', ...out, '---', ...body].join(eol), 'utf8');
  return changed;
}

function normalizeVaultFrontmatter(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return 0;
  const targets = [];
  const collect = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'memory-database') collect(p); }
      else if (e.name.toLowerCase().endsWith('.md')) targets.push(p);
    }
  };
  for (const d of Object.keys(META_FOLDER_TAGS)) {
    if (d === '_root') continue;
    const p = path.join(vaultPath, d);
    if (fs.existsSync(p)) collect(p);
  }
  try {
    for (const f of fs.readdirSync(vaultPath)) {
      const p = path.join(vaultPath, f);
      if (/^00.*\.md$/i.test(f) && fs.statSync(p).isFile()) targets.push(p);
    }
  } catch (e) {}
  let n = 0;
  for (const p of targets) {
    const top = path.relative(vaultPath, p).split(path.sep)[0];
    const want = META_FOLDER_TAGS[top] || META_FOLDER_TAGS._root;
    try { if (metaNormalizeNote(p, want)) n++; } catch (e) {}
  }
  return n;
}

function syncAll(vaultPath, workspaceRoot, options = {}) {
  ensureVaultStructure(vaultPath);
  ensureSoulAndProfile(vaultPath, options);
  migrateToHermes(vaultPath);
  const skills = syncSkillsToVault(vaultPath, workspaceRoot, options);
  const memories = syncKnowledgeToVault(vaultPath, options);
  const project = workspaceRoot ? syncProject(vaultPath, workspaceRoot, options) : null;
  const hub = generateHub(vaultPath, workspaceRoot, options);
  syncVaultToKnowledge(vaultPath);
  buildContextManifest(vaultPath);
  normalizeVaultFrontmatter(vaultPath);
  const stats = getVaultStats(vaultPath);

  return {
    skillsCount: skills.length,
    memoriesCount: memories.length,
    project,
    hub,
    stats,
  };
}

function resetAllData(vaultPath, workspaceRoot) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    throw new Error(`El Vault de Obsidian no existe: ${vaultPath}`);
  }

  const baseDir = path.join(vaultPath, 'Antigravity');
  const memDir = path.join(vaultPath, '00_Agent', 'Memoires');
  const skiDir = path.join(vaultPath, '01_Skills');
  const proDir = path.join(vaultPath, '02_Projets');
  const sesDir = path.join(baseDir, 'Sesiones');
  const manifestFile = path.join(baseDir, 'context-manifest.json');

  // 1. Wipe Memories in Vault
  if (fs.existsSync(memDir)) {
    for (const f of fs.readdirSync(memDir)) {
      try { fs.unlinkSync(path.join(memDir, f)); } catch (e) {}
    }
  }

  // 2. Wipe Skills in Vault
  if (fs.existsSync(skiDir)) {
    for (const f of fs.readdirSync(skiDir)) {
      try { fs.unlinkSync(path.join(skiDir, f)); } catch (e) {}
    }
  }

  // 3. Wipe Projects in Vault
  if (fs.existsSync(proDir)) {
    for (const f of fs.readdirSync(proDir)) {
      try { fs.unlinkSync(path.join(proDir, f)); } catch (e) {}
    }
  }

  // 4. Wipe Sessions in Vault
  if (fs.existsSync(sesDir)) {
    for (const f of fs.readdirSync(sesDir)) {
      try { fs.unlinkSync(path.join(sesDir, f)); } catch (e) {}
    }
  }

  // 5. Delete manifest file
  if (fs.existsSync(manifestFile)) {
    try { fs.unlinkSync(manifestFile); } catch (e) {}
  }

  // 6. Clean Knowledge Items created by Obsidian
  const { knowledgeDir } = getAntigravityPaths();
  if (fs.existsSync(knowledgeDir)) {
    const kiFolders = fs.readdirSync(knowledgeDir, { withFileTypes: true });
    for (const kf of kiFolders) {
      if (!kf.isDirectory()) continue;
      const folderPath = path.join(knowledgeDir, kf.name);
      const metaPath = path.join(folderPath, 'metadata.json');
      let shouldDelete = false;

      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.source === 'obsidian-vault') {
            shouldDelete = true;
          }
        } catch (e) {}
      }

      // Known Obsidian generated IDs or duplicate sync items
      const obsKnownPrefixes = ['proyecto-', 'antigravity-', 'arquitectura-antigravity', 'protocolo-de-memoria', 'sincronizacion-bidireccional', 'solucion-a-variables', 'latalaya-arquitectura'];
      if (obsKnownPrefixes.some(p => kf.name.startsWith(p))) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
        } catch (e) {}
      }
    }
  }

  // 7. Re-create vault structure
  ensureVaultStructure(vaultPath);

  // 8. Re-sync active skills cleanly (no duplicates, no orphans)
  const skills = syncSkillsToVault(vaultPath, workspaceRoot);

  // 9. Generate fresh empty Memory Index
  const resetLang = resolveLanguage({});
  const isFr = (resetLang === 'fr');
  const isEn = (resetLang === 'en');
  const resetMemIndexName = isFr ? '00 Index Mémoire.md' : isEn ? '00 Memory Index.md' : '00 Indice de Memoria.md';
  for (const staleIdx of ['00 Indice de Memoria.md', '00 Memory Index.md', '00 Index Mémoire.md'].filter(n => n !== resetMemIndexName)) {
    const stalePath = path.join(memDir, staleIdx);
    if (fs.existsSync(stalePath)) {
      try { fs.unlinkSync(stalePath); } catch (e) {}
    }
  }
  const now = new Date().toISOString().split('T')[0];
  const indexFile = path.join(memDir, resetMemIndexName);
  const emptyIndexMd = `---
title: "${isFr ? "Index Mémoire d'Antigravity" : isEn ? 'Antigravity Memory Index' : 'Indice de Memoria de Antigravity'}"
type: antigravity-index
tags:
  - antigravity/indice
  - antigravity/memoria
updated: ${now}
---

# ${isFr ? 'Banque de Mémoire & Knowledge Items' : isEn ? 'Memory Bank & Knowledge Items' : 'Banco de Memoria & Knowledge Items'}

${isFr ? 'Total de mémoires enregistrées' : isEn ? 'Total memories recorded' : 'Total de memorias registradas'}: **0**

${isFr ? '*Aucune mémoire enregistrée. L\'IA sauvegardera automatiquement les leçons et l\'architecture, ou vous pouvez ajouter des notes depuis l\'onglet "Créer".*' : isEn ? '*No memories recorded. The AI will automatically save lessons and architecture, or you can add notes from the "Create" tab.*' : '*No hay memorias registradas. La IA guardará lecciones y arquitectura automáticamente o puedes añadir notas desde la pestaña "Crear".*'}

---
*${isFr ? 'Retour au' : isEn ? 'Back to' : 'Volver al'}:* [[00 Antigravity Hub]]
`;
  fs.writeFileSync(indexFile, emptyIndexMd, 'utf8');

  // 10. Generate fresh Hub
  const hub = generateHub(vaultPath, workspaceRoot);

  // 11. Re-sync current workspace project if any
  const project = workspaceRoot ? syncProject(vaultPath, workspaceRoot) : null;

  // 12. Build fresh clean manifest
  buildContextManifest(vaultPath);

  return {
    status: 'reset_complete',
    vaultPath,
    skillsCount: skills.length,
    memoriesCount: 0,
    project,
    hub,
  };
}

// -------------------------------------------------------------
// Sessions & Checkpoints Subsystem
// -------------------------------------------------------------

function syncSessionsIndex(vaultPath, options = {}) {
  const sesFolder = path.join(vaultPath, '03_Sessions');
  if (!fs.existsSync(sesFolder)) return { count: 0, sessions: [] };

  const sesLang = resolveLanguage(options);
  const isFr = (sesLang === 'fr');
  const isEn = (sesLang === 'en');
  const sesIndexName = isFr ? '00 Index des Sessions.md' : isEn ? '00 Sessions Index.md' : '00 Indice de Sesiones.md';
  const projIndexLink = isFr ? '00 Index des Projets' : isEn ? '00 Projects Index' : '00 Indice de Proyectos';

  const files = fs.readdirSync(sesFolder).filter(f => f.endsWith('.md') && !f.startsWith('00'));
  const list = [];
  for (const f of files) {
    try {
      const fp = path.join(sesFolder, f);
      const c = fs.readFileSync(fp, 'utf8');
      const base = f.replace(/\.md$/, '');
      let title = base;
      let proj = isFr ? 'Général' : 'General';
      let date = '';
      let time = '';
      let summary = '';

      const mTitle = c.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
      if (mTitle) title = mTitle[1].trim();
      const mP = c.match(/^project:\s*["']?([^"'\r\n]+)["']?/m);
      if (mP) proj = mP[1].trim();
      const mD = c.match(/^date:\s*["']?([^"'\r\n]+)["']?/m);
      if (mD) date = mD[1].trim();
      const mT = c.match(/^updated:\s*["']?([^"'\r\n]+)["']?/m) || c.match(/^time:\s*["']?([^"'\r\n]+)["']?/m);
      if (mT) time = mT[1].trim();
      const mSum = c.match(/>\s*\[!NOTE\]\s*\*\*(?:Último Hito|Resumen|Dernier Jalon|Résumé|Last Milestone|Summary)[^\r\n]*\*\*\r?\n>\s*([^\r\n]+)/i)
        || c.match(/^summary:\s*["']?([^"'\r\n]+)["']?/m);
      if (mSum) summary = mSum[1].trim();

      const milestoneMatches = c.match(/##\s*\d{2}:\d{2}\s*[—–-]/g) || [];
      const milestonesCount = milestoneMatches.length;

      const stat = fs.statSync(fp);
      list.push({
        file: f,
        base,
        title,
        project: proj,
        date: date || stat.mtime.toISOString().split('T')[0],
        time: time || '—',
        summary: summary || (isFr ? 'Sans résumé' : isEn ? 'No summary' : 'Sin resumen'),
        milestones: milestonesCount,
        mtime: stat.mtimeMs,
      });
    } catch (e) {}
  }

  list.sort((a, b) => b.mtime - a.mtime);

  let rows = '';
  if (list.length === 0) {
    rows = isFr
      ? '| *Aucune session enregistrée pour le moment* | — | — | — | — |\n'
      : isEn
        ? '| *No sessions recorded yet* | — | — | — | — |\n'
        : '| *Aún no hay sesiones registradas* | — | — | — | — |\n';
  } else {
    for (const s of list) {
      const badge = s.milestones > 1 ? ` (${s.milestones} ${isFr ? 'jalons' : isEn ? 'milestones' : 'hitos'})` : '';
      const projLabel = isFr ? `Projet: ${s.project}` : isEn ? `Project: ${s.project}` : `Proyecto: ${s.project}`;
      rows += `| ${s.date} | ${s.time} | [[${projLabel}]] | ${s.summary.replace(/\|/g, '-')} | [[${s.base}]]${badge} |\n`;
    }
  }

  const now = new Date().toISOString().split('T')[0];
  const idxContent = `---
title: "${isFr ? 'Index des Sessions et Checkpoints — Antigravity' : isEn ? 'Sessions & Checkpoints Index — Antigravity' : 'Índice de Sesiones y Checkpoints — Antigravity'}"
type: antigravity-index
tags:
  - antigravity/sessions
  - antigravity/index
created: ${now}
updated: ${now}
---

# ${isFr ? 'Index des Sessions et Checkpoints — Antigravity' : isEn ? 'Sessions & Checkpoints Index — Antigravity' : 'Índice de Sesiones y Checkpoints — Antigravity'}

> [!INFO] **${isFr ? 'Journal de Continuité de Travail' : isEn ? 'Work Continuity Log' : 'Bitácora de Continuidad de Trabajo'}**
> ${isFr ? 'Registre chronologique des jalons, décisions d\'architecture et sessions de travail pour maintenir la continuité entre les conversations.' : isEn ? 'Chronological log of milestones, architecture decisions and work sessions to maintain continuity between conversations.' : 'Registro cronológico de hitos, decisiones de arquitectura y sesiones de trabajo para mantener la continuidad entre conversaciones.'}

${isFr ? 'Total sessions enregistrées' : isEn ? 'Total sessions recorded' : 'Total sesiones registradas'}: **${list.length}**

| ${isFr ? 'Date' : isEn ? 'Date' : 'Fecha'} | ${isFr ? 'Heure' : isEn ? 'Time' : 'Hora'} | ${isFr ? 'Projet' : isEn ? 'Project' : 'Proyecto'} | ${isFr ? 'Résumé' : isEn ? 'Summary' : 'Resumen'} | Session |
|---|---|---|---|---|
${rows}
---
${isFr ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[${projIndexLink}]]` : isEn ? `*Graph Connections:* [[00 Antigravity Hub]] | [[${projIndexLink}]]` : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[${projIndexLink}]]`}
`;

  const idxFile = path.join(sesFolder, sesIndexName);
  try {
    fs.writeFileSync(idxFile, idxContent, 'utf8');
    for (const staleIdx of ['00 Indice de Sesiones.md', '00 Sessions Index.md', '00 Index des Sessions.md'].filter(n => n !== sesIndexName)) {
      const stalePath = path.join(sesFolder, staleIdx);
      if (fs.existsSync(stalePath)) {
        try { fs.unlinkSync(stalePath); } catch (e) {}
      }
    }
  } catch (e) {
    // Vault may be read-only (e.g. under Program Files) — index regeneration is best-effort
  }
  return { count: list.length, sessions: list };
}

function saveSessionCheckpoint(vaultPath, options = {}) {
  const sesFolder = path.join(vaultPath, '03_Sessions');
  const projFolder = path.join(vaultPath, '02_Projets');
  if (!fs.existsSync(sesFolder)) fs.mkdirSync(sesFolder, { recursive: true });

  const pName = options.project || 'General';
  let summary = options.summary || '';
  let content = options.content || '';
  const safeProject = sanitizeFilename(pName);
  const sesLang = resolveLanguage(options);
  const isFr = (sesLang === 'fr');
  const isEn = (sesLang === 'en');
  const sesIndexLink = isFr ? '00 Index des Sessions' : isEn ? '00 Sessions Index' : '00 Indice de Sesiones';
  const lastMilestoneLabel = isFr ? 'Dernier Jalon' : isEn ? 'Last Milestone' : 'Último Hito';

  if (!summary && content) summary = content.slice(0, 140);
  if (!summary) summary = isFr ? `Session de travail ${pName}` : isEn ? `Work session ${pName}` : `Sesión de trabajo ${pName}`;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const sessionBase = `${dateStr} - ${safeProject}`;
  const sessionFile = path.join(sesFolder, `${sessionBase}.md`);

  const tags = ['antigravity/session'];
  if (options.tags && Array.isArray(options.tags)) {
    for (const t of options.tags) if (!tags.includes(t)) tags.push(t);
  }

  const milestoneHeading = `## ${hours}:${mins} — ${summary}`;
  const milestoneBody = `### ${isFr ? 'Travail Réalisé et Décisions Techniques' : isEn ? 'Work Done & Technical Decisions' : 'Trabajo Realizado y Decisiones Técnicas'}\n${content || (isFr ? '*Aucun détail supplémentaire.*' : isEn ? '*No additional details.*' : '*Sin detalles adicionales.*')}`;

  let sessionMd = '';
  let isNew = !fs.existsSync(sessionFile);
  let totalMilestones = 1;

  if (isNew) {
    sessionMd = `---
title: "${isFr ? 'Sessions' : isEn ? 'Sessions' : 'Sesiones'}: ${pName} (${dateStr})"
type: antigravity-session-daily
project: "${pName}"
tags:
${tags.map(t => `  - ${t}`).join('\n')}
date: ${dateStr}
updated: "${hours}:${mins}"
summary: "${summary.replace(/"/g, '\\"')}"
milestones: 1
---

# ${isFr ? 'Sessions' : isEn ? 'Sessions' : 'Sesiones'}: ${pName} — ${dateStr}

> [!NOTE] **${lastMilestoneLabel} (${hours}:${mins})**
> ${summary}

${milestoneHeading}

${milestoneBody}

---
${isFr ? `*Connexions du Graphe :* [[00 Antigravity Hub]] | [[Projet: ${pName}]] | [[${sesIndexLink}]]` : isEn ? `*Graph Connections:* [[00 Antigravity Hub]] | [[Project: ${pName}]] | [[${sesIndexLink}]]` : `*Conexiones del Grafo:* [[00 Antigravity Hub]] | [[Proyecto: ${pName}]] | [[${sesIndexLink}]]`}
`;
  } else {
    let existing = fs.readFileSync(sessionFile, 'utf8');
    existing = existing.replace(/^updated:\s*["']?[^"'\r\n]+["']?/m, `updated: "${hours}:${mins}"`);
    existing = existing.replace(/^summary:\s*["']?[^"'\r\n]+["']?/m, `summary: "${summary.replace(/"/g, '\\"')}"`);
    existing = existing.replace(/^milestones:\s*(\d+)/m, (m, c) => {
      totalMilestones = parseInt(c, 10) + 1;
      return `milestones: ${totalMilestones}`;
    });

    const calloutRegex = />\s*\[!NOTE\]\s*\*\*(?:Último Hito|Dernier Jalon|Last Milestone)[^\r\n]*\*\*\r?\n>\s*[^\r\n]+/i;
    if (calloutRegex.test(existing)) {
      existing = existing.replace(calloutRegex, `> [!NOTE] **${lastMilestoneLabel} (${hours}:${mins})**\n> ${summary}`);
    } else if (existing.includes('> [!NOTE] **Resumen') || existing.includes('> [!NOTE] **Résumé') || existing.includes('> [!NOTE] **Summary')) {
      existing = existing.replace(/>\s*\[!NOTE\]\s*\*\*(?:Resumen|Résumé|Summary)[^\r\n]*\*\*\r?\n>\s*[^\r\n]+/i, `> [!NOTE] **${lastMilestoneLabel} (${hours}:${mins})**\n> ${summary}`);
    }

    const footerIdx = existing.lastIndexOf('\n---');
    if (footerIdx !== -1) {
      sessionMd = existing.slice(0, footerIdx) + `\n\n${milestoneHeading}\n\n${milestoneBody}\n` + existing.slice(footerIdx);
    } else {
      sessionMd = existing + `\n\n${milestoneHeading}\n\n${milestoneBody}\n`;
    }
  }

  fs.writeFileSync(sessionFile, sessionMd, 'utf8');
  syncSessionsIndex(vaultPath, options);

  // Append row to project note
  const projNote = path.join(projFolder, `${safeProject}.md`);
  if (fs.existsSync(projNote)) {
    try {
      let pContent = fs.readFileSync(projNote, 'utf8');
      const cleanAnchor = `${hours}:${mins} — ${summary}`.replace(/[#|^[\]]/g, '').trim();
      const row = `| ${dateStr} ${hours}:${mins} | ${summary.replace(/\|/g, '-')} | [[${sessionBase}#${cleanAnchor}|${sessionBase}]] |\n`;
      if (pContent.includes('## Bitácora de Sesiones y Avances Recientes')) {
        pContent = pContent.replace(/(## Bitácora de Sesiones y Avances Recientes[^\r\n]*\r?\n)(\| Fecha[^\r\n]*\r?\n\|---[^\r\n]*\r?\n)([\s\S]*?)(\r?\n##|$)/, (m, h, tableH, body, nextH) => {
          const cleanBody = body.replace(/\|\s*\*Sin sesiones registradas aún\*[^\r\n]*\r?\n/g, '').trim();
          const existingRows = cleanBody ? cleanBody.split(/\r?\n/).slice(0, 14).join('\n') + '\n' : '';
          return `${h}${tableH}${row}${existingRows}${nextH}`;
        });
        fs.writeFileSync(projNote, pContent, 'utf8');
      }
    } catch (e) {}
  }

  if (options.autoCommit) {
    gitCommitVault(vaultPath, `Sesión ${pName}: ${summary}`);
  }

  return {
    status: 'ok',
    action: 'session_saved',
    project: pName,
    summary,
    sessionFile,
    note: sessionBase,
  };
}

function getLastSession(vaultPath, projectName = null) {
  const { sessions } = syncSessionsIndex(vaultPath);
  if (!sessions || sessions.length === 0) return null;
  if (!projectName) return sessions[0];
  const filtered = sessions.filter(s => s.project.toLowerCase() === projectName.toLowerCase());
  return filtered.length > 0 ? filtered[0] : sessions[0];
}

function listSessions(vaultPath, options = {}) {
  const { sessions } = syncSessionsIndex(vaultPath);
  const limit = options.limit || 20;
  if (options.project) {
    return sessions.filter(s => s.project.toLowerCase() === options.project.toLowerCase()).slice(0, limit);
  }
  return sessions.slice(0, limit);
}

// -------------------------------------------------------------
// Backlog & Anti-Patterns Subsystem
// -------------------------------------------------------------

function getProjectNotePath(vaultPath, projectName) {
  const projFolder = path.join(vaultPath, '02_Projets');
  return path.join(projFolder, `${sanitizeFilename(projectName)}.md`);
}

function addProjectAntipattern(vaultPath, projectName, ruleText) {
  const safeName = sanitizeFilename(projectName);
  const pFolder = path.join(vaultPath, '02_Projets', safeName);
  if (!fs.existsSync(pFolder)) fs.mkdirSync(pFolder, { recursive: true });
  const noteFile = path.join(pFolder, 'ARCHITECTURE.md');
  if (!fs.existsSync(noteFile)) {
    fs.writeFileSync(noteFile, `# Arquitectura — ${projectName}\n\n## Anti-Patrones y Trampas Prohibidas\n`, 'utf8');
  }

  let content = fs.readFileSync(noteFile, 'utf8');
  const line = `- **PROHIBIDO:** ${ruleText.trim()}`;
  if (content.includes('## Anti-Patrones y Trampas Prohibidas')) {
    content = content.replace(/(## Anti-Patrones y Trampas Prohibidas[^\r\n]*\r?\n)([\s\S]*?)(\r?\n##|$)/, (m, h, body, nextH) => {
      const cleanBody = body.replace(/<!--[\s\S]*?-->/g, '').trim();
      const updated = cleanBody ? `${cleanBody}\n${line}` : line;
      return `${h}${updated}\n${nextH}`;
    });
  } else {
    content += `\n\n## Anti-Patrones y Trampas Prohibidas\n${line}\n`;
  }
  fs.writeFileSync(noteFile, content, 'utf8');

  // Immediately mirror to workspace rules
  try {
    let ws = null;
    const mP = content.match(/>\s*-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i) || content.match(/-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i);
    if (mP && fs.existsSync(mP[1].trim())) ws = mP[1].trim();
    syncProjectRulesToWorkspace(vaultPath, ws, projectName);
  } catch (e) {}

  return { status: 'ok', project: projectName, rule: ruleText };
}

function listProjectAntipatterns(vaultPath, projectName) {
  const noteFile = getProjectNotePath(vaultPath, projectName);
  if (!fs.existsSync(noteFile)) return [];
  const content = fs.readFileSync(noteFile, 'utf8');
  const match = content.match(/## Anti-Patrones y Trampas Prohibidas[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
  if (!match) return [];
  return match[1].split(/\r?\n/)
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^-\s*(\*\*[^*]+\*\*:)?/, '').trim());
}

function addProjectTask(vaultPath, projectName, taskText) {
  const noteFile = getProjectNotePath(vaultPath, projectName);
  if (!fs.existsSync(noteFile)) return { error: `Proyecto no encontrado: ${projectName}` };
  let content = fs.readFileSync(noteFile, 'utf8');
  const line = `- [ ] ${taskText.trim()}`;
  if (content.includes('## Backlog y Tareas Pendientes')) {
    content = content.replace(/(## Backlog y Tareas Pendientes[^\r\n]*\r?\n)([\s\S]*?)(\r?\n##|$)/, (m, h, body, nextH) => {
      const cleanBody = body.replace(/<!-- Tareas pendientes[^\r\n]*-->/g, '').trim();
      const updated = cleanBody ? `${cleanBody}\n${line}` : line;
      return `${h}${updated}\n${nextH}`;
    });
  } else {
    content += `\n\n## Backlog y Tareas Pendientes\n${line}\n`;
  }
  fs.writeFileSync(noteFile, content, 'utf8');
  return { status: 'ok', project: projectName, task: taskText };
}

function completeProjectTask(vaultPath, projectName, taskQuery) {
  const noteFile = getProjectNotePath(vaultPath, projectName);
  if (!fs.existsSync(noteFile)) return { error: `Proyecto no encontrado: ${projectName}` };
  let content = fs.readFileSync(noteFile, 'utf8');
  const reg = new RegExp(`- \\[ \\] ([^\\r\\n]*${taskQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\r\\n]*)`, 'i');
  if (reg.test(content)) {
    content = content.replace(reg, '- [x] $1 (Completada)');
    fs.writeFileSync(noteFile, content, 'utf8');
    return { status: 'ok', completed: true, project: projectName };
  }
  return { status: 'not_found', project: projectName };
}

function listProjectTasks(vaultPath, projectName) {
  const noteFile = getProjectNotePath(vaultPath, projectName);
  if (!fs.existsSync(noteFile)) return [];
  const content = fs.readFileSync(noteFile, 'utf8');
  const match = content.match(/## Backlog y Tareas Pendientes[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
  if (!match) return [];
  return match[1].split(/\r?\n/)
    .filter(l => l.trim().startsWith('- ['))
    .map(l => {
      const done = l.includes('- [x]');
      const text = l.replace(/^-\s*\[[ x]\]\s*/, '').trim();
      return { text, done };
    });
}

// -------------------------------------------------------------
// Encrypted Backup & Migration Subsystem
// -------------------------------------------------------------

function exportVaultEncrypted(vaultPath, password) {
  if (!password || typeof password !== 'string' || password.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres.');
  }
  const baseDir = path.join(vaultPath, 'Antigravity');
  if (!fs.existsSync(baseDir)) {
    throw new Error('No existe la carpeta Antigravity en el Vault.');
  }

  const files = {};
  function walk(dir, relPrefix = 'Antigravity') {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = path.join(relPrefix, ent.name).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        try {
          files[rel] = fs.readFileSync(full, 'utf8');
        } catch (e) {}
      }
    }
  }
  walk(baseDir);

  const payload = JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    vaultName: path.basename(vaultPath),
    totalFiles: Object.keys(files).length,
    files,
  });

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    format: 'antigravity-vault-backup',
    version: '1.0',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  }, null, 2);
}

function importVaultEncrypted(vaultPath, password, encryptedJsonString) {
  if (!password) throw new Error('Contraseña requerida para descifrar.');
  let parsed;
  try {
    parsed = typeof encryptedJsonString === 'string' ? JSON.parse(encryptedJsonString) : encryptedJsonString;
  } catch (e) {
    throw new Error('El archivo de respaldo no tiene un formato JSON válido.');
  }

  if (parsed.format !== 'antigravity-vault-backup' || !parsed.salt || !parsed.iv || !parsed.authTag || !parsed.ciphertext) {
    throw new Error('El archivo no es un respaldo cifrado de Antigravity válido.');
  }

  const salt = Buffer.from(parsed.salt, 'hex');
  const iv = Buffer.from(parsed.iv, 'hex');
  const authTag = Buffer.from(parsed.authTag, 'hex');
  const ciphertext = Buffer.from(parsed.ciphertext, 'hex');

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted;
  try {
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (e) {
    throw new Error('Contraseña incorrecta o archivo de respaldo alterado/dañado.');
  }

  const data = JSON.parse(decrypted);
  if (!data.files) throw new Error('El respaldo no contiene archivos.');

  ensureVaultStructure(vaultPath);
  let importedCount = 0;
  for (const [relPath, fileContent] of Object.entries(data.files)) {
    const targetFile = path.join(vaultPath, relPath);
    const parentDir = path.dirname(targetFile);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(targetFile, fileContent, 'utf8');
    importedCount++;
  }

  syncAll(vaultPath, null);
  return {
    status: 'ok',
    importedFiles: importedCount,
    exportedAt: data.exportedAt,
    originalVault: data.vaultName,
  };
}

// -------------------------------------------------------------
// Git Integration & Graph Data Subsystems
// -------------------------------------------------------------

function gitCommitVault(vaultPath, message) {
  return new Promise((resolve) => {
    if (!vaultPath || !fs.existsSync(path.join(vaultPath, '.git'))) {
      return resolve({ gitActive: false });
    }
    const cleanMsg = (message || 'Sincronización Antigravity').replace(/"/g, '\\"');
    const cmd = `git add Antigravity && git commit -m "Antigravity: ${cleanMsg}"`;
    exec(cmd, { cwd: vaultPath }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ gitActive: true, committed: false, error: stderr || err.message });
      }
      resolve({ gitActive: true, committed: true, output: stdout ? stdout.trim() : '' });
    });
  });
}

function listProjects(vaultPath) {
  const projFolder = path.join(vaultPath, '02_Projets');
  const results = [];
  if (!fs.existsSync(projFolder)) return results;
  const files = fs.readdirSync(projFolder);
  for (const f of files) {
    if (!f.endsWith('.md') || f.startsWith('00')) continue;
    const fp = path.join(projFolder, f);
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const baseName = f.replace(/\.md$/, '');
      let name = baseName;
      let localPath = '—';
      let stack = '—';
      let summary = '—';
      let skill = '—';

      const nameMatch = content.match(/>\s*-\s*\*\*Nombre\*\*:\s*`([^`]+)`/i) || content.match(/^title:\s*"Proyecto:\s*([^"\r\n]+)"/m);
      if (nameMatch) name = nameMatch[1].trim();

      const pathMatch = content.match(/>\s*-\s*\*\*Ruta local\*\*:\s*`([^`]+)`/i);
      if (pathMatch) localPath = pathMatch[1].trim();

      const stackMatch = content.match(/>\s*-\s*\*\*Stack\*\*:\s*([^\r\n]+)/i) || content.match(/###\s*Stack Tecnológico[^\r\n]*\r?\n([^\r\n#]+)/i);
      if (stackMatch) stack = stackMatch[1].replace(/[`*]/g, '').trim();

      const sumMatch = content.match(/>\s*-\s*\*\*Resumen\*\*:\s*([^\r\n]+)/i) || content.match(/>\s*\[!(?:INFO|ABSTRACT)\][^\r\n]*\r?\n>\s*([^\r\n]+)/i);
      if (sumMatch) summary = sumMatch[1].trim();

      const skillMatch = content.match(/>\s*-\s*\*\*Skill Asociada\*\*:\s*\[\[?([^\]\r\n]+)\]\]?/i) || content.match(/##\s*Skills de Proyecto[^\r\n]*\r?\n\[\[([^\]]+)\]\]/i);
      if (skillMatch) skill = skillMatch[1].replace(/^\[\[|\]\]$/g, '').trim();

      const taskMatches = content.match(/- \[[ xX]\]/g) || [];
      const pendingTasks = (content.match(/- \[ \]/g) || []).length;
      const completedTasks = (content.match(/- \[[xX]\]/g) || []).length;

      const antipatternsMatch = content.match(/##\s*Antipatrones y Trampas Prohibidas[^\r\n]*\r?\n([\s\S]*?)(?:---|\n##|$)/i);
      let antipatternsCount = 0;
      if (antipatternsMatch) {
        antipatternsCount = (antipatternsMatch[1].match(/- \*\*ADVERTENCIA\*\*/gi) || []).length;
      }

      const fileStat = fs.statSync(fp);
      const dateStr = fileStat.mtime.toISOString().split('T')[0];

      results.push({
        name,
        localPath,
        stack,
        summary: summary.slice(0, 160),
        skill: skill !== '—' ? skill : null,
        file: baseName,
        relPath: `Antigravity/Proyectos/${baseName}`,
        totalTasks: taskMatches.length,
        pendingTasks,
        completedTasks,
        antipatternsCount,
        date: dateStr,
      });
    } catch (e) {}
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

function getGraphData(vaultPath) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  if (!vaultPath || !fs.existsSync(vaultPath)) return { nodes, links };

  function addNode(id, label, group, relPath) {
    if (!id) return null;
    const key = id.toLowerCase();
    if (!nodeMap.has(key)) {
      const node = { id, label: label || id, group: group || 'default', relPath };
      nodeMap.set(key, node);
      nodes.push(node);
      return node;
    }
    return nodeMap.get(key);
  }

  const fileContents = [];

  // 1. Agent Core (00_Agent)
  const agenteDir = path.join(vaultPath, '00_Agent');
  if (fs.existsSync(agenteDir)) {
    addNode('Hermes Core', 'Hermes Core', 'hub', '00_Agent/SOUL.md');

    for (const item of fs.readdirSync(agenteDir)) {
      const fp = path.join(agenteDir, item);
      if (item.endsWith('.md')) {
        const base = item.replace(/\.md$/, '');
        const relPath = '00_Agent/' + item;
        const isSoul = item.includes('SOUL') || item.includes('USER') || item.includes('Personalidad') || item.includes('Personnalité') || item.includes('Soul') || item.includes('Profil') || item.includes('Profile');
        addNode(base, base, isSoul ? 'soul' : 'memory', relPath);
        try {
          fileContents.push({ id: base, content: fs.readFileSync(fp, 'utf8') });
        } catch (e) {}
      }
    }

    const memDir = path.join(agenteDir, 'Memoires');
    if (fs.existsSync(memDir)) {
      for (const item of fs.readdirSync(memDir)) {
        if (!item.endsWith('.md') || item.startsWith('00')) continue;
        const base = item.replace(/\.md$/, '');
        const relPath = '00_Agent/Memoires/' + item;
        addNode(base, base, 'memory', relPath);
        try {
          fileContents.push({ id: base, content: fs.readFileSync(path.join(memDir, item), 'utf8') });
        } catch (e) {}
      }
    }
  }

  // 2. Skills (01_Skills)
  const skillsDir = path.join(vaultPath, '01_Skills');
  if (fs.existsSync(skillsDir)) {
    for (const item of fs.readdirSync(skillsDir)) {
      if (!item.endsWith('.md') || item.startsWith('00')) continue;
      const base = item.replace(/\.md$/, '');
      const relPath = '01_Skills/' + item;
      addNode(base, base, 'skill', relPath);
      try {
        fileContents.push({ id: base, content: fs.readFileSync(path.join(skillsDir, item), 'utf8') });
      } catch (e) {}
    }
  }

  // 3. Projects (02_Projets)
  const proyectosDir = path.join(vaultPath, '02_Projets');
  if (fs.existsSync(proyectosDir)) {
    for (const item of fs.readdirSync(proyectosDir)) {
      const fp = path.join(proyectosDir, item);
      const isDir = fs.statSync(fp).isDirectory();
      if (isDir) {
        const archFile = path.join(fp, 'ARCHITECTURE.md');
        if (fs.existsSync(archFile)) {
          const relPath = '02_Projets/' + item + '/ARCHITECTURE.md';
          addNode(item, item, 'project', relPath);
          try {
            fileContents.push({ id: item, content: fs.readFileSync(archFile, 'utf8') });
          } catch (e) {}
        }
      } else if (item.endsWith('.md') && !item.startsWith('00')) {
        const base = item.replace(/\.md$/, '');
        const cleanName = base.replace(/^\[(?:Proyecto|Project|Projet)\]\s*/, '');
        const relPath = '02_Projets/' + item;
        addNode(cleanName, cleanName, 'project', relPath);
        nodeMap.set(base.toLowerCase(), nodeMap.get(cleanName.toLowerCase()));
        try {
          fileContents.push({ id: cleanName, content: fs.readFileSync(fp, 'utf8') });
        } catch (e) {}
      }
    }
  }

  // 4. Sessions (03_Sessions)
  const sesionesDir = path.join(vaultPath, '03_Sessions');
  if (fs.existsSync(sesionesDir)) {
    for (const item of fs.readdirSync(sesionesDir)) {
      if (!item.endsWith('.md') || item.startsWith('00')) continue;
      const base = item.replace(/\.md$/, '');
      const relPath = '03_Sessions/' + item;
      addNode(base, base, 'session', relPath);
      try {
        fileContents.push({ id: base, content: fs.readFileSync(path.join(sesionesDir, item), 'utf8') });
      } catch (e) {}
    }
  }

  // Fallback to legacy Antigravity directory if Hermes structure is absent
  const legacyDir = path.join(vaultPath, 'Antigravity');
  if (nodes.length <= 1 && fs.existsSync(legacyDir)) {
    const legacyGroups = [
      { folder: 'Alma', group: 'soul' },
      { folder: 'Skills', group: 'skill' },
      { folder: 'Memoria', group: 'memory' },
      { folder: 'Proyectos', group: 'project' },
      { folder: 'Sesiones', group: 'session' },
    ];
    for (const g of legacyGroups) {
      const d = path.join(legacyDir, g.folder);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.endsWith('.md')) continue;
        const base = f.replace(/\.md$/, '');
        const fp = path.join(d, f);
        const relPath = 'Antigravity/' + g.folder + '/' + f;
        addNode(base, base.replace(/^\[Proyecto\]\s*/, ''), g.group, relPath);
        try {
          fileContents.push({ id: base, content: fs.readFileSync(fp, 'utf8') });
        } catch (e) {}
      }
    }
  }

  // Resolve links from wikilinks [[Target]]
  const linkSet = new Set();
  const hubNode = nodeMap.get('hermes core') || nodeMap.get('00 antigravity hub');

  for (const item of fileContents) {
    const matches = item.content.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g);
    for (const m of matches) {
      const targetName = m[1].trim();
      const targetId = targetName.endsWith('.md') ? targetName.slice(0, -3) : targetName;
      const cleanTarget = targetId.replace(/^\[Proyecto\]\s*/, '');
      const resolvedTarget = nodeMap.get(cleanTarget.toLowerCase()) || nodeMap.get(targetId.toLowerCase());
      if (resolvedTarget && resolvedTarget.id !== item.id) {
        const key = item.id + '->' + resolvedTarget.id;
        const revKey = resolvedTarget.id + '->' + item.id;
        if (!linkSet.has(key) && !linkSet.has(revKey)) {
          linkSet.add(key);
          links.push({ source: item.id, target: resolvedTarget.id });
        }
      }
    }
  }

  // Link floating root items to Hub if hub exists
  if (hubNode) {
    for (const node of nodes) {
      if (node.id === hubNode.id) continue;
      if (node.group === 'soul' || node.group === 'project') {
        const key = hubNode.id + '->' + node.id;
        const revKey = node.id + '->' + hubNode.id;
        if (!linkSet.has(key) && !linkSet.has(revKey)) {
          linkSet.add(key);
          links.push({ source: hubNode.id, target: node.id });
        }
      }
    }
  }

  return { nodes, links };
}

// -------------------------------------------------------------
// MCP Server Safe Management (Zero Collision / Non-Destructive)
// -------------------------------------------------------------

function getMcpStatus(vaultPath) {
  const home = os.homedir();
  const mcpConfigFile = path.join(home, '.gemini', 'config', 'mcp_config.json');
  const serverPath = path.join(home, '.gemini', 'config', 'skills', 'antigravity-obsidian', 'scripts', 'mcp-server.js');
  const targetVault = vaultPath || (getActiveOrConfiguredVault() ? getActiveOrConfiguredVault().path : null);

  let installed = false;
  let enabled = false;
  let otherServers = [];
  let serverConfig = null;

  if (fs.existsSync(mcpConfigFile)) {
    try {
      let raw = fs.readFileSync(mcpConfigFile, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.mcpServers) {
        const keys = Object.keys(parsed.mcpServers);
        otherServers = keys.filter(k => k !== 'antigravity-obsidian');
        if (parsed.mcpServers['antigravity-obsidian']) {
          installed = true;
          serverConfig = parsed.mcpServers['antigravity-obsidian'];
          enabled = serverConfig.disabled !== true;
        }
      }
    } catch (e) {}
  }

  return {
    installed,
    enabled,
    configPath: mcpConfigFile,
    serverPath: serverPath.replace(/\\/g, '/'),
    vaultPath: targetVault ? targetVault.replace(/\\/g, '/') : null,
    otherServers,
    serverConfig,
  };
}

function installMcpServer(vaultPath, options = {}) {
  const home = os.homedir();
  const configDir = path.join(home, '.gemini', 'config');
  const mcpConfigFile = path.join(configDir, 'mcp_config.json');
  const serverPath = path.join(configDir, 'skills', 'antigravity-obsidian', 'scripts', 'mcp-server.js').replace(/\\/g, '/');

  let targetVault = vaultPath;
  if (!targetVault) {
    const v = getActiveOrConfiguredVault();
    targetVault = v ? v.path : '';
  }
  const normalizedVault = (targetVault || '').replace(/\\/g, '/');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let mcpData = { mcpServers: {} };
  if (fs.existsSync(mcpConfigFile)) {
    try {
      let raw = fs.readFileSync(mcpConfigFile, 'utf8').replace(/^\uFEFF/, '');
      mcpData = JSON.parse(raw);
      if (!mcpData || typeof mcpData !== 'object') {
        mcpData = { mcpServers: {} };
      }
      if (!mcpData.mcpServers || typeof mcpData.mcpServers !== 'object') {
        mcpData.mcpServers = {};
      }
      // Backup current configuration
      try {
        fs.copyFileSync(mcpConfigFile, path.join(configDir, 'mcp_config.json.bak'));
      } catch (e) {}
    } catch (err) {
      const corruptBackup = path.join(configDir, `mcp_config.json.corrupt.${Date.now()}`);
      try { fs.copyFileSync(mcpConfigFile, corruptBackup); } catch (e) {}
      mcpData = { mcpServers: {} };
    }
  }

  // Preserve all other MCP servers safely!
  mcpData.mcpServers['antigravity-obsidian'] = {
    command: 'node',
    args: [serverPath],
    env: {
      OBSIDIAN_VAULT_PATH: normalizedVault,
    },
    disabled: false,
  };

  fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpData, null, 2), 'utf8');

  return {
    status: 'ok',
    action: 'installed',
    enabled: true,
    configPath: mcpConfigFile,
    otherServers: Object.keys(mcpData.mcpServers).filter(k => k !== 'antigravity-obsidian'),
    message: 'Servidor MCP de Obsidian instalado y activado en mcp_config.json sin alterar el resto de servidores.',
  };
}

function disableMcpServer() {
  const home = os.homedir();
  const mcpConfigFile = path.join(home, '.gemini', 'config', 'mcp_config.json');

  if (!fs.existsSync(mcpConfigFile)) {
    return { status: 'not_found', message: 'No existe mcp_config.json.' };
  }

  try {
    let raw = fs.readFileSync(mcpConfigFile, 'utf8').replace(/^\uFEFF/, '');
    const mcpData = JSON.parse(raw);
    if (mcpData && mcpData.mcpServers && mcpData.mcpServers['antigravity-obsidian']) {
      try {
        fs.copyFileSync(mcpConfigFile, path.join(path.dirname(mcpConfigFile), 'mcp_config.json.bak'));
      } catch (e) {}
      mcpData.mcpServers['antigravity-obsidian'].disabled = true;
      fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpData, null, 2), 'utf8');
      return {
        status: 'ok',
        action: 'disabled',
        enabled: false,
        message: 'Servidor MCP desactivado correctamente (disabled: true). La IA operará mediante Node CLI como fallback sin MCP.',
      };
    } else {
      return { status: 'not_installed', message: 'El servidor MCP de Obsidian no está configurado en mcp_config.json.' };
    }
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

function enableMcpServer(vaultPath) {
  const home = os.homedir();
  const mcpConfigFile = path.join(home, '.gemini', 'config', 'mcp_config.json');

  if (!fs.existsSync(mcpConfigFile)) {
    return installMcpServer(vaultPath);
  }

  try {
    let raw = fs.readFileSync(mcpConfigFile, 'utf8').replace(/^\uFEFF/, '');
    const mcpData = JSON.parse(raw);
    if (mcpData && mcpData.mcpServers && mcpData.mcpServers['antigravity-obsidian']) {
      mcpData.mcpServers['antigravity-obsidian'].disabled = false;
      if (vaultPath) {
        if (!mcpData.mcpServers['antigravity-obsidian'].env) {
          mcpData.mcpServers['antigravity-obsidian'].env = {};
        }
        mcpData.mcpServers['antigravity-obsidian'].env.OBSIDIAN_VAULT_PATH = vaultPath.replace(/\\/g, '/');
      }
      fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpData, null, 2), 'utf8');
      return {
        status: 'ok',
        action: 'enabled',
        enabled: true,
        message: 'Servidor MCP activado correctamente en mcp_config.json.',
      };
    } else {
      return installMcpServer(vaultPath);
    }
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

function uninstallMcpServer() {
  const home = os.homedir();
  const mcpConfigFile = path.join(home, '.gemini', 'config', 'mcp_config.json');

  if (!fs.existsSync(mcpConfigFile)) {
    return { status: 'not_found', message: 'No existe mcp_config.json.' };
  }

  try {
    let raw = fs.readFileSync(mcpConfigFile, 'utf8').replace(/^\uFEFF/, '');
    const mcpData = JSON.parse(raw);
    if (mcpData && mcpData.mcpServers && mcpData.mcpServers['antigravity-obsidian']) {
      try {
        fs.copyFileSync(mcpConfigFile, path.join(path.dirname(mcpConfigFile), 'mcp_config.json.bak'));
      } catch (e) {}
      delete mcpData.mcpServers['antigravity-obsidian'];
      fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpData, null, 2), 'utf8');
      return {
        status: 'ok',
        action: 'uninstalled',
        enabled: false,
        message: 'Servidor MCP eliminado de mcp_config.json manteniendo el resto de servidores intactos. La IA continuará operando vía Node CLI.',
      };
    } else {
      return { status: 'not_installed', message: 'El servidor MCP de Obsidian no figuraba en mcp_config.json.' };
    }
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  syncVaultToKnowledge,
  getAntigravityPaths,
  resolveWorkspaceRoot,
  ensureVaultStructure,
  ensureSoulAndProfile,
  getSoulAndProfile,
  resolvePersonality,
  ensurePersonality,
  getPersonality,
  savePersonality,
  recordUserLearning,
  resolveUserName,
  resolveLanguage,
  syncSkillsToVault,
  syncKnowledgeToVault,
  saveNewMemory,
  saveSkill,
  createSkill,
  editSkill,
  getSkillDetails,
  listAllSkills,
  deleteSkill,
  addSkillScript,
  listRules,
  viewRule,
  syncProject,
  syncProjectsIndex,
  getProjectsRegistry,
  isProjectRegistered,
  generateHub,
  getVaultStats,
  syncAll,
  normalizeVaultFrontmatter,
  resetAllData,
  buildContextManifest,
  getContextManifest,
  triageContext,
  peekMemory,
  catalogContext,
  syncSessionsIndex,
  saveSessionCheckpoint,
  getLastSession,
  listSessions,
  addProjectAntipattern,
  listProjectAntipatterns,
  addProjectTask,
  completeProjectTask,
  listProjectTasks,
  listProjects,
  exportVaultEncrypted,
  importVaultEncrypted,
  gitCommitVault,
  getGraphData,
  getMcpStatus,
  installMcpServer,
  disableMcpServer,
  enableMcpServer,
  uninstallMcpServer,
  syncProjectRulesToWorkspace,
  HERMES_USER_MAX_CHARS,
  HERMES_MEMORY_MAX_CHARS,
  updateBoundedMemory,
  getSkill,
  saveHermesSkill,
  sessionRecall,
  compileHermesBootstrap,
  getHermesQuotas,
  migrateToHermes,
  ensureHermesCore,
};
