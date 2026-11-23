/**
 * Root entry point for running Playwright from the repository root (`npx playwright test`, the
 * playwright-test MCP server in .mcp.json). Every project has its own workspace and config in
 * projects/<id>/; this file hands over to the default project's (projects/active.json), or to the
 * one named by TESTNOVA_PROJECT:
 *
 *   TESTNOVA_PROJECT=<id> npx playwright test tests/e2e/01-login.spec.ts
 *
 * The dashboard never uses this file: it runs each project's own config directly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PlaywrightTestConfig } from '@playwright/test';

const root = fileURLToPath(new URL('.', import.meta.url));
const active = join(root, 'projects', 'active.json');
const id = process.env.TESTNOVA_PROJECT ?? (existsSync(active) ? (JSON.parse(readFileSync(active, 'utf8')) as { id?: string }).id : undefined);
if (!id || !existsSync(join(root, 'projects', id, 'playwright.config.ts'))) {
  throw new Error('No TestNova project to run. Create one on the dashboard Setup screen, or set TESTNOVA_PROJECT=<id>.');
}
const ws = join(root, 'projects', id);
const { default: config } = (await import(pathToFileURL(join(ws, 'playwright.config.ts')).href)) as { default: PlaywrightTestConfig };

// Paths in the project's config are relative to its own folder: make them absolute here.
export default {
  ...config,
  testDir: join(ws, 'tests'),
  globalSetup: join(ws, 'src', 'global-setup.ts'),
  outputDir: join(ws, 'test-results'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: join(ws, 'playwright-report') }], ['json', { outputFile: join(ws, 'test-results', 'results.json') }]],
} satisfies PlaywrightTestConfig;
