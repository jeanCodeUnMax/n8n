// Hephaistos 2.1 — client disciplinaire.
// Audit C2 : la logique (seuils <80 probation, <50 quarantine, <20 euthanized,
// table agent_discipline, agents.active) est portee par le tool Rust MCP
// `discipline_agent` / `agent_status` (hphe-kit::orch). Ce script n'est plus
// qu'un front CLI : plus d'acces SQLite direct depuis JS.
import { execFileSync } from 'node:child_process';

const HPHE_MCP = process.env.HPHE_MCP_BIN || 'C:/Program Files/servers/hephaistos2-kit/extension/server/hphe-mcp.exe';

function callTool(tool, args = {}) {
  const out = execFileSync(HPHE_MCP, ['--tool', tool, '--args', JSON.stringify(args)], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  // Le binaire logge des lignes INFO sur stderr ; stdout = JSON seul.
  const text = out.trim();
  const start = text.indexOf('{');
  const startArr = text.indexOf('[');
  const at = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  if (at === -1) throw new Error(`reponse ${tool} non-JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(at));
}

export function penalize(agentName, points, reason) {
  const r = callTool('discipline_agent', {
    agent_name: agentName,
    points_delta: -Math.abs(points),
    reason,
  });
  console.log(`[DISCIPLINE] ${r.agent} : -${Math.abs(points)} pts | Motif: ${reason} | Score: ${r.score_after}/100 [${String(r.status).toUpperCase()}]`);
  if (r.status === 'euthanized') {
    console.warn(`[EUTHANASIE] L'agent ${r.agent} a ete DEBRANCHE (active = 0).`);
  }
  return { agentName: r.agent, score: r.score_after, status: r.status };
}

export function reward(agentName, points, reason) {
  const r = callTool('discipline_agent', {
    agent_name: agentName,
    points_delta: Math.abs(points),
    reason,
  });
  console.log(`[REHABILITATION] ${r.agent} : +${Math.abs(points)} pts | Motif: ${reason} | Nouveau score: ${r.score_after}/100 [${String(r.status).toUpperCase()}]`);
  if (r.active === 1) {
    console.log(`[REACTIVATION] L'agent ${r.agent} est actif dans orchestrator.db.`);
  }
  return { agentName: r.agent, score: r.score_after, status: r.status };
}

export function getStatus() {
  const agents = callTool('list_agents');
  const rows = [];
  for (const a of Array.isArray(agents) ? agents : agents.agents || []) {
    const name = a.agent_name || a.name;
    if (!name) continue;
    try {
      const s = callTool('agent_status', { agent_name: name });
      rows.push({
        agent_name: name,
        score: s.score,
        status: s.discipline_status || 'nominal',
        penalties_count: s.penalties_count ?? 0,
        rewards_count: s.rewards_count ?? 0,
        updated_at: s.discipline_updated_at ?? null,
      });
    } catch {
      rows.push({ agent_name: name, score: null, status: 'unreadable' });
    }
  }
  return rows.sort((x, y) => (x.score ?? 999) - (y.score ?? 999));
}

const args = process.argv.slice(2);
const cmd = args[0] || 'status';

if (cmd === 'status') {
  console.log('\n=== TABLEAU DE BORD DISCIPLINAIRE & PRODUCTIVITE (Hephaistos 2.1 / MCP) ===');
  console.table(getStatus());
} else if (cmd === 'penalize' || cmd === 'reward') {
  const agent = args[1];
  const pts = parseInt(args[2], 10);
  const reason = args.slice(3).join(' ') || (cmd === 'penalize' ? 'Manquement aux consignes' : 'Gain de productivite / Clemence du Boss');
  if (!agent || isNaN(pts)) {
    console.error(`Usage: node agent-discipline.mjs ${cmd} <agent> <points> <motif>`);
    process.exit(1);
  }
  (cmd === 'penalize' ? penalize : reward)(agent, pts, reason);
}
