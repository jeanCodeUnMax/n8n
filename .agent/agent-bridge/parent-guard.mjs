/**
 * parent-guard — suicide le processus si un ancêtre meurt.
 *
 * Usage: `guardAncestors()` au démarrage d'un daemon spawné par l'IDE.
 * Résout la chaîne PPID une fois (WMI), puis poll toutes les 5s.
 * Dès qu'un ancêtre (hors system/init) disparaît -> process.exit.
 */

import { execFileSync } from 'node:child_process'

const POLL_MS = 5_000
const SYSTEM_NAMES = new Set(['system', 'registry', 'smss.exe', 'csrss.exe',
  'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'svchost.exe',
  'tasklist.exe', 'conhost.exe'])

function procInfo(pid) {
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-Command',
      `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ParentProcessId,Name | ConvertTo-Json -Compress)`,
    ], { encoding: 'utf8', timeout: 8000, windowsHide: true }).trim()
    if (!out) return null
    const p = JSON.parse(out)
    return { ppid: p.ParentProcessId, name: String(p.Name || '').toLowerCase() }
  } catch { return null }
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

export function ancestorChain(fromPid = process.ppid) {
  const chain = []
  let cur = fromPid
  for (let i = 0; i < 16 && cur && cur > 4; i++) {
    const info = procInfo(cur)
    if (!info) break
    if (SYSTEM_NAMES.has(info.name)) break
    chain.push(cur)
    cur = info.ppid
  }
  return chain
}

export function guardAncestors({ onExit, pollMs = POLL_MS } = {}) {
  const chain = ancestorChain()
  if (!chain.length) return null
  const t = setInterval(() => {
    for (const pid of chain) {
      if (!alive(pid)) {
        clearInterval(t)
        try { onExit?.(pid) } catch {}
        process.exit(0)
      }
    }
  }, pollMs)
  t.unref()
  return t
}
