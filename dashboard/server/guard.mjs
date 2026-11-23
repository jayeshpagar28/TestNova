/**
 * Process guard for pipeline agents. Every Bash/PowerShell command an agent runs passes through
 * `commandGuard` first (an SDK PreToolUse hook; for the CLI engine, this file run as a command hook).
 *
 * Why: the agents run inside the TestNova server's process tree. On 2026-11-05 stage 5 ran
 * `Get-Process node | Stop-Process -Force` to stop a slow test run, which killed the server, every
 * other dashboard and the MCP servers, and failed the stage after 37 minutes of work. A rule in the
 * prompt is not enough, so the commands are refused here, with a reason the agent can act on.
 *
 * Refused:
 *  - killing processes by name/image or all at once (Stop-Process -Name, Get-Process … | Stop-Process,
 *    taskkill /IM, pkill, killall, kill-port, wmic … delete, Terminate via CIM) — only an explicit PID
 *    the agent started itself may be stopped;
 *  - any kill naming the TestNova server's own PID or its parent;
 *  - sleeping longer than MAX_SLEEP_S (waiting on a background run instead of running it bounded);
 *  - `playwright test` runs without a --global-timeout (except --list), so no run can hang a stage.
 */

export const MAX_SLEEP_S = 120;
export const MAX_GLOBAL_TIMEOUT_MS = 900_000;

const KILL_BROAD = [
  /\bStop-Process\b(?![^|;&\n]*-Id\b)/i, // Stop-Process without -Id (by -Name, or piped from Get-Process)
  /\bspps\b(?![^|;&\n]*-Id\b)/i,
  /\|\s*(kill|Stop-Process|spps)\b/i, // anything piped into a kill
  /\btaskkill\b[^|;&\n]*\/IM\b/i,
  /\btaskkill\b(?![^|;&\n]*\/PID\b)/i,
  /\b(pkill|killall)\b/i,
  /\bkill-port\b/i,
  /\bwmic\b[^|;&\n]*\bprocess\b[^|;&\n]*\b(delete|terminate)\b/i,
  /\b(Invoke-CimMethod|Invoke-WmiMethod)\b[^|;&\n]*\bTerminate\b/i,
  /\bkill\s+(-\d+\s+)?-1\b/, // kill -1 / kill -9 -1: every process
];

const shellCommand = (tool, input) => (/^(Bash|PowerShell)$/.test(tool) ? String(input?.command ?? '') : null);

// ── Security Testing runs (mode "security"): prompts/testing-types/security pipeline rules §4 ──
const SCANNERS = /\b(sqlmap|nmap|masscan|zmap|nikto|zaproxy|zap-cli|owasp-zap|burp(suite)?|wfuzz|ffuf|gobuster|dirb|dirbuster|feroxbuster|hydra|medusa|ncrack|john|hashcat|wpscan|nuclei|commix|xsstrike|arjun|amass|subfinder|sslscan|sslyze|testssl(\.sh)?|metasploit|msfconsole)\b/i;
const INSTALLS = /\b(npm|pnpm|yarn)\s+(i|install|add)\b|\bnpx\s+(?!(playwright|tsc)\b)[\w@./-]|\bpip3?\s+install\b|\b(winget|choco|scoop)\s+install\b|\bInstall-(Module|Package)\b|\bapt(-get)?\s+install\b|\bgo\s+install\b|\bcargo\s+install\b/i;
const RAW_NET = /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|nc|ncat|netcat|telnet|socat)\b/i;
const REMOTE_URL = /\b(https?|wss?|ftp):\/\/(?!(127\.0\.0\.1|localhost|\[::1\])([:/]|$))/i;

/** Why a command is refused in a Security Testing run, or null. */
function securityGuard(cmd) {
  if (SCANNERS.test(cmd)) return `Refused in a Security Testing run: "${cmd.match(SCANNERS)[0]}" is a scanner or attack tool. The pipeline rules (§4) allow only the safe, minimal-proof checks of the test plan, through the browser and the Playwright tests.`;
  if (INSTALLS.test(cmd)) return 'Refused in a Security Testing run: installing packages or tools is not allowed. Use what the workspace already has (Playwright Test, its request API, TypeScript).';
  if (RAW_NET.test(cmd) && (REMOTE_URL.test(cmd) || /\b(nc|ncat|netcat|telnet|socat)\b/i.test(cmd))) return 'Refused in a Security Testing run: raw network tools may only call the TestNova API on this PC. Reach the application under test through the browser or the Playwright tests, which stay within the authorized origin.';
  return null;
}

/**
 * Why this tool call must not run, or null. `protect` lists PIDs that must never be killed; `mode`
 * "security" adds the Security Testing restrictions.
 */
export function commandGuard(tool, input, protect = [], mode = null) {
  const cmd = shellCommand(tool, input);
  if (cmd === null) return null;
  if (mode === 'security') {
    const refused = securityGuard(cmd);
    if (refused) return refused;
  }

  if (input?.run_in_background) {
    return 'Background commands are disabled in the pipeline: a background run ends your turn and the stage then waits on nothing. Run the command in the foreground with a bounded timeout (for Playwright: --global-timeout and --max-failures).';
  }

  if (KILL_BROAD.some((re) => re.test(cmd))) {
    return 'Refused: this kills processes by name or all at once. The TestNova server, the dashboard and the MCP servers are node processes too, so this would kill the pipeline itself (it did on 2026-11-05). Stop only a process you started, by its PID (Stop-Process -Id <pid> / taskkill /PID <pid>). To stop a slow Playwright run, do not kill it: rerun it bounded with --global-timeout, --max-failures and --retries=0.';
  }

  const isKill = /\b(Stop-Process|spps|taskkill|kill)\b/i.test(cmd);
  if (isKill) {
    const hit = protect.filter(Boolean).find((pid) => new RegExp(`\\b${pid}\\b`).test(cmd));
    if (hit) return `Refused: PID ${hit} is the TestNova server (or its parent) that is running this pipeline stage.`;
  }

  const sleeps = [...cmd.matchAll(/\b(?:Start-Sleep|sleep)\b\s*(?:-(?:Seconds|s)\s*)?(\d+(?:\.\d+)?)(\s*-?m(?:illi)?s(?:econds)?\b|ms\b)?/gi)];
  for (const m of sleeps) {
    const seconds = m[2] ? Number(m[1]) / 1000 : Number(m[1]);
    if (seconds > MAX_SLEEP_S) {
      return `Refused: sleeping ${seconds}s. Do not wait on background work; run it in the foreground with a bounded timeout. Sleeps longer than ${MAX_SLEEP_S}s are not allowed in the pipeline.`;
    }
  }

  if (/\bplaywright(\.cmd)?\s+test\b/i.test(cmd) && !/--list\b/.test(cmd)) {
    const g = cmd.match(/--global-timeout[=\s]+(\d+)/);
    if (!g) return `Refused: every \`playwright test\` run in the pipeline needs --global-timeout=<ms> (at most ${MAX_GLOBAL_TIMEOUT_MS}) so it cannot hang the stage. Add it, plus --retries=0 and --max-failures=<n>, and run again.`;
    if (Number(g[1]) > MAX_GLOBAL_TIMEOUT_MS) return `Refused: --global-timeout ${g[1]} is above the pipeline's limit of ${MAX_GLOBAL_TIMEOUT_MS} ms. Run a smaller set of tests instead.`;
  }
  return null;
}

/** The SDK hook: deny with the reason, so the agent sees it and adapts. */
export function guardHook(protect, mode = null) {
  return async (input) => {
    const reason = commandGuard(input.tool_name, input.tool_input, protect, mode);
    return reason ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } } : {};
  };
}

// Run as a Claude Code command hook (CLI engine): JSON on stdin, exit 2 with the reason to refuse.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  let raw = '';
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw);
      const protect = String(process.env.TESTNOVA_PROTECT_PIDS ?? '').split(',').filter(Boolean);
      const reason = commandGuard(input.tool_name, input.tool_input, protect, process.env.TESTNOVA_GUARD_MODE || null);
      if (reason) {
        process.stderr.write(reason);
        process.exit(2);
      }
    } catch {
      // unreadable input: let the call through rather than wedge the agent
    }
    process.exit(0);
  });
}
