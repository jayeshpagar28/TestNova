import { randomUUID } from 'node:crypto';
import type { FullConfig } from '@playwright/test';
import { loadEnv } from './utils/load-env.js';
import { activeProject, credentialsFor, envPrefix, ROOT } from './utils/project.js';

/**
 * Preflight: runs once before any test.
 *
 * Each problem below would otherwise present as something else: no project
 * means every `page.goto('/')` fails as "invalid URL"; an unreachable app means
 * every test times out and reads as a UI regression; missing credentials mean
 * the authenticated suites skip and the run is green. So: fail loudly, before
 * the first test, with the fix.
 */

type Check = { level: 'ok' | 'warn' | 'fail'; line: string; detail?: string };

async function reachable(url: string): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    // Any HTTP answer means the server is up; a 401/403 login wall is normal.
    return { ok: res.status < 500, detail: `HTTP ${res.status}` };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return { ok: false, detail: cause ?? (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const checks: Check[] = [];
  const env = loadEnv(ROOT);
  checks.push(
    env.file
      ? { level: 'ok', line: `.env loaded (${env.applied.length} set, ${env.skipped.length} kept from shell)` }
      : { level: 'warn', line: 'No .env file', detail: 'Authenticated tests will skip. Save credentials on the Setup screen.' },
  );

  const project = activeProject();
  if (!project) {
    checks.push({
      level: 'fail',
      line: 'No project configured',
      detail: 'Create one on the dashboard Setup screen, or set APP_URL for an ad-hoc run.',
    });
  } else {
    checks.push({ level: 'ok', line: `Project ${project.name} [${project.environment}] on ${project.browsers.join(', ')}` });
    const probe = await reachable(project.url);
    checks.push(
      probe.ok
        ? { level: 'ok', line: `${project.url} reachable (${probe.detail})` }
        : { level: 'fail', line: `${project.url} is not reachable (${probe.detail})`, detail: 'Check the URL, VPN, or that the environment is up.' },
    );
    for (const role of project.roles) {
      const c = credentialsFor(role.key);
      if (!c.username || !c.password) {
        checks.push({
          level: 'warn',
          line: `No credentials for role "${role.name}"`,
          detail: `Set ${envPrefix(role.key)}USERNAME and ${envPrefix(role.key)}PASSWORD in .env; tests needing this role will skip.`,
        });
      }
    }
  }

  // One id per run, shared by every worker: src/data/data-sheet.ts uses it so a
  // retried test gets back the single-use row it already claimed.
  process.env.TESTNOVA_RUN_ID ??= randomUUID();

  const mark = { ok: '✓', warn: '!', fail: '✗' } as const;
  console.log('\nTestNova preflight');
  for (const c of checks) {
    console.log(`  ${mark[c.level]} ${c.line}`);
    if (c.detail) console.log(`      ${c.detail}`);
  }
  const failed = checks.filter((c) => c.level === 'fail');
  if (failed.length) throw new Error(`Preflight failed: ${failed.map((c) => c.line).join('; ')}`);
  console.log('');
}
