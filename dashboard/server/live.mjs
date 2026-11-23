/**
 * Live preview of the agent's browser, for the AI Pipeline screen.
 *
 * The playwright-test MCP server launches its own (headless) Chromium from the project's Playwright
 * config. For a pipeline stage the MCP server is pointed at a small wrapper config (logs/live.config.ts)
 * that adds `--remote-debugging-port=<free port>` to the Chromium projects, nothing else. While
 * someone has the preview open, this module attaches to that browser over the DevTools protocol as a
 * passive second client and keeps the latest screencast frame in memory.
 *
 * Strictly an observer: it never sends input to the page, frames are never written to disk, and a
 * failure here is swallowed: it can never fail, slow or change a stage. When nobody watches for a
 * few seconds the screencast stops. TESTNOVA_LIVE=0 turns the whole feature off (MCP then gets the
 * project's own config, exactly as before).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const POLL_MS = 1500; // how often targets are re-checked while someone watches
const IDLE_MS = 8000; // stop the screencast this long after the last viewer request

const sessions = new Map(); // project id -> session

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Chromium, by project name or device: other engines cannot take the flag. */
const CHROMIUM = (p) => p?.use?.browserName === 'chromium' || p?.use?.defaultBrowserType === 'chromium' || (!p?.use?.browserName && !p?.use?.defaultBrowserType && p?.name === 'chromium');

/**
 * Write the wrapper config for one stage. Paths are made absolute (the wrapper lives in logs/), the
 * same way the repository's root playwright.config.ts hands over to a project.
 */
function writeLiveConfig(W, port) {
  const file = join(W, 'logs', 'live.config.ts');
  mkdirSync(join(W, 'logs'), { recursive: true });
  const ws = JSON.stringify(W);
  writeFileSync(file, `// Written by TestNova for the AI Pipeline live preview. Only the playwright-test MCP server of a
// pipeline stage uses it: it is the project's own config plus a DevTools port on Chromium. Do not edit.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PlaywrightTestConfig } from '@playwright/test';

const ws = ${ws};
const port = ${port};
const { default: config } = (await import(pathToFileURL(join(ws, 'playwright.config.ts')).href)) as { default: PlaywrightTestConfig };
const chromium = ${CHROMIUM.toString()};
const flag = (use: PlaywrightTestConfig['use']) => ({
  ...use,
  launchOptions: { ...use?.launchOptions, args: [...(use?.launchOptions?.args ?? []), \`--remote-debugging-port=\${port}\`] },
});

export default {
  ...config,
  testDir: join(ws, 'tests'),
  globalSetup: join(ws, 'src', 'global-setup.ts'),
  outputDir: join(ws, 'test-results'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: join(ws, 'playwright-report') }], ['json', { outputFile: join(ws, 'test-results', 'results.json') }]],
  projects: (config.projects ?? []).map((p) => (chromium(p) ? { ...p, use: flag(p.use) } : p)),
} satisfies PlaywrightTestConfig;
`);
  return file;
}

/**
 * Prepare the live preview for a stage. Returns the config the MCP server should load, or null to
 * keep the project's own config (feature off, or the MCP browser is not Chromium).
 * `browsers` is the project's browser list: the MCP server drives the first one.
 */
export async function liveBegin(projectId, n, W, browsers) {
  liveEnd(projectId);
  if (process.env.TESTNOVA_LIVE === '0') return null;
  if ((browsers?.[0] ?? 'chromium') !== 'chromium') return null;
  try {
    const port = await freePort();
    const config = writeLiveConfig(W, port);
    sessions.set(projectId, { n, port, frame: null, at: 0, url: '', title: '', ws: null, targetId: null, viewedAt: 0, timer: null, nextId: 1 });
    return config;
  } catch {
    return null;
  }
}

/** The stage ended: drop the session and any open connection. */
export function liveEnd(projectId) {
  const s = sessions.get(projectId);
  if (!s) return;
  sessions.delete(projectId);
  disconnect(s);
}

function disconnect(s) {
  clearInterval(s.timer);
  s.timer = null;
  try {
    s.ws?.close();
  } catch {
    // already closed
  }
  s.ws = null;
  s.targetId = null;
}

async function targets(port) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: ctl.signal });
    return (await res.json()).filter((x) => x.type === 'page' && !String(x.url).startsWith('devtools://'));
  } finally {
    clearTimeout(t);
  }
}

/** One watch tick: pick the page the agent is on and keep a screencast attached to it. */
async function tick(s) {
  if (Date.now() - s.viewedAt > IDLE_MS) return disconnect(s);
  let list;
  try {
    list = await targets(s.port);
  } catch {
    // no browser yet, or it closed between tool calls
    if (s.ws) disconnect(s);
    s.timer ??= setInterval(() => tick(s), POLL_MS);
    return undefined;
  }
  // the most recently opened real page; about:blank only when there is nothing else
  const page = list.find((x) => x.url !== 'about:blank') ?? list[0];
  if (!page) return undefined;
  s.url = page.url;
  s.title = page.title;
  if (s.ws && s.targetId === page.id) return undefined;
  if (s.ws) {
    const timer = s.timer;
    s.timer = null;
    disconnect(s);
    s.timer = timer;
  }
  attach(s, page);
  return undefined;
}

function attach(s, page) {
  let ws;
  try {
    ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {
    return;
  }
  s.ws = ws;
  s.targetId = page.id;
  const send = (method, params = {}) => {
    const id = s.nextId++;
    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch {
      // closed meanwhile
    }
    return id;
  };
  let shotId = 0;
  ws.addEventListener('open', () => {
    // a still frame at once (the screencast sends frames only when something repaints), then the cast
    shotId = send('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
    send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 800, everyNthFrame: 2 });
  });
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.method === 'Page.screencastFrame') {
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId });
      s.frame = msg.params.data;
      s.at = Date.now();
    } else if (msg.id === shotId && msg.result?.data && !s.frame) {
      s.frame = msg.result.data;
      s.at = Date.now();
    }
  });
  const gone = () => {
    if (s.ws === ws) {
      s.ws = null;
      s.targetId = null;
    }
  };
  ws.addEventListener('close', gone);
  ws.addEventListener('error', gone);
}

/**
 * What the preview shows for a project's stage. Each call counts as someone watching, which starts
 * (or keeps) the screencast. `since`: the `at` of the frame the viewer already has; the image is
 * only sent when newer.
 *   state 'off'     no live session for this stage (not running, or not a Chromium browser)
 *   state 'waiting' the stage runs but its browser is not open (yet, or between tool calls)
 *   state 'live'    a frame is available
 */
export function liveFrame(projectId, n, since = 0) {
  const s = sessions.get(projectId);
  if (!s || s.n !== n) return { state: 'off' };
  s.viewedAt = Date.now();
  if (!s.timer) {
    s.timer = setInterval(() => tick(s), POLL_MS);
    tick(s);
  }
  if (!s.frame) return { state: 'waiting' };
  const stale = !s.ws && Date.now() - s.at > 5000;
  return { state: stale ? 'waiting' : 'live', at: s.at, url: s.url, title: s.title, ...(s.at > since ? { frame: s.frame } : {}) };
}
