#!/usr/bin/env node
/**
 * `npm run dashboard`: the API and the Vite dev server together; stopping this stops both.
 * Ports: TESTNOVA_PORT (API, default 5181) and TESTNOVA_WEB_PORT (page, default 5180).
 */
import { execFile, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboard = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
// Vite 8 on Windows hangs at start-up (never opens its port, no error) when its working directory
// has an upper-case drive letter, e.g. a terminal opened in "D:\TestNova" (verified 2026-11-19:
// "D:\..." stuck for 30 s+, "d:\..." ready in 6 s). Start it from the lower-case form.
const webDir = join(dashboard, 'web').replace(/^([A-Z]):/, (_, d) => `${d.toLowerCase()}:`);
const children = [
  // No --watch: a restart kills a running pipeline stage or execution (it happened: Playwright
  // loading the reporter counted as a change on Windows). Restart the dashboard to load new code.
  spawn(process.execPath, [join(dashboard, 'server', 'index.mjs')], { stdio: 'inherit' }),
  // npm runs Vite through a shell on Windows, so killing npm alone would orphan Vite: kill the tree.
  spawn(win ? 'npm.cmd run dev' : 'npm run dev', { cwd: webDir, stdio: 'inherit', shell: true }),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (win) execFile('taskkill', ['/pid', String(c.pid), '/T', '/F'], () => {});
    else c.kill();
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', stop);
