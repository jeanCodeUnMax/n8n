# Console Hider — masque les fenetres console (ConsoleWindowClass) des
# process appartenant au kit : serveurs ACP, MCP node/python, CLIs agents.
# Tourne en boucle ~3s, quasi zero CPU. Lance par start-workspace.ps1
# avec -WindowStyle Hidden. Single instance garanti par mutex nomme.
#
# Principe : Windows cree une fenetre console visible pour tout exe
# console spawne par un parent SANS console (IDE, services). On ne peut
# pas corriger le spawn des autres (Devin ACP, kilo, hermes...) — donc
# on masque la fenetre apres coup : ShowWindow(hwnd, SW_HIDE).

$mutexName = 'Global\Hephaistos2ConsoleHider'
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $mutex.WaitOne(0)) { exit 0 }  # deja en cours

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WinH {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@

# Signatures cmdline des process non-interactifs dont la console est
# parasite. Un shell interactif (cmd/pwsh sans ces patterns) reste
# visible — on ne masque que ce qui matche.
$HidePatterns = @(
    'acp', 'agentmemory', 'qdrant', 'zvec', 'nim_mcp', 'nim-router',
    'rag_rest_bridge', 'model-discovery', 'mcp-server', 'mcp_', '-mcp',
    'server.js', 'index.js', 'shim.mjs', 'broker.mjs', 'bridge.js',
    'monitor.js', 'task-watch', 'kilo', 'cline', 'roo', 'opencode',
    'vibe', 'hermes', 'agy_', 'aider', 'goose', 'hphe-', 'hephaistos',
    'orchestrator', 'everything-mcp', 'filesystem', 'puppeteer',
    'context7', 'hfspace', 'task-manager', 'projet-Gateway',
    'playwright-scrape', 'mcp-server-git', 'wmic', 'tasklist', 'taskkill'
)
$rx = ($HidePatterns | ForEach-Object { [regex]::Escape($_) }) -join '|'

$cmdCache = @{}   # pid -> cmdline (rafraichi par passe)
function Get-Cmdline([int]$procId) {
    if ($cmdCache.ContainsKey($procId)) { return $cmdCache[$procId] }
    try {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction Stop
        $cmdCache[$procId] = [string]$p.CommandLine
    } catch { $cmdCache[$procId] = '' }
    return $cmdCache[$procId]
}

$script:cb = [WinH+EnumProc] {
    param([IntPtr]$h, [IntPtr]$l)
    $sb = New-Object System.Text.StringBuilder 64
    [void][WinH]::GetClassName($h, $sb, 64)
    if ($sb.ToString() -eq 'ConsoleWindowClass' -and [WinH]::IsWindowVisible($h)) {
        $pidOut = 0u
        [void][WinH]::GetWindowThreadProcessId($h, [ref]$pidOut)
        $cl = Get-Cmdline([int]$pidOut)
        if ($cl -and ($cl -match $rx)) {
            [void][WinH]::ShowWindow($h, 0)  # SW_HIDE
        }
    }
    return $true
}

while ($true) {
    try { [void][WinH]::EnumWindows($script:cb, [IntPtr]::Zero) } catch { }
    if ((Get-Date).Second -lt 3) { $cmdCache = @{} }  # purge cache ~1/min
    Start-Sleep -Seconds 3
}
