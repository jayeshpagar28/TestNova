import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.js';

/**
 * The project under test.
 *
 * Every TestNova project has its own workspace, `projects/<id>/`, holding this
 * framework copy, its `project.json` (written by the Setup screen) and its own
 * `.env` with that project's test logins. This file lives at
 * `<workspace>/src/utils/project.ts`, so the workspace is two folders up: a run
 * of this workspace can only ever see this project, never another one.
 *
 * Environment variables win over the file, so a one-off run against another
 * environment needs no edit:
 *
 *   APP_URL=https://staging.example.com TEST_BROWSERS=firefox npx playwright test
 */

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export const ALL_BROWSERS: readonly BrowserName[] = ['chromium', 'firefox', 'webkit'];

export interface RoleRef {
  /** Display name, e.g. "Admin". */
  readonly name: string;
  /** Key used in .env: TEST_<KEY>_USERNAME / TEST_<KEY>_PASSWORD. Empty for the default role. */
  readonly key: string;
}

export interface ProjectConfig {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly environment: string;
  readonly browsers: readonly BrowserName[];
  readonly roles: readonly RoleRef[];
}

/** This project's workspace (projects/<id>/). TESTNOVA_ROOT overrides it for tooling. */
export const ROOT = resolve(process.env.TESTNOVA_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
export const PROJECT_FILE = join(ROOT, 'project.json');

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
  } catch {
    return null;
  }
}

/** The id of this workspace's project: TESTNOVA_PROJECT, else project.json. */
export function activeProjectId(): string | null {
  loadEnv(ROOT);
  if (process.env.TESTNOVA_PROJECT) return process.env.TESTNOVA_PROJECT;
  return readJson<{ id?: string }>(PROJECT_FILE)?.id ?? null;
}

const isBrowser = (b: string): b is BrowserName => (ALL_BROWSERS as readonly string[]).includes(b);

/** This workspace's project, with environment overrides applied. Null when nothing is configured. */
export function activeProject(): ProjectConfig | null {
  loadEnv(ROOT);
  const file = readJson<Partial<ProjectConfig>>(PROJECT_FILE);

  const url = process.env.APP_URL ?? file?.url ?? '';
  if (!url) return null;

  const envBrowsers = process.env.TEST_BROWSERS?.split(',').map((b) => b.trim()).filter(isBrowser);
  const browsers = envBrowsers?.length ? envBrowsers : (file?.browsers ?? []).filter(isBrowser);

  return {
    id: file?.id ?? activeProjectId() ?? 'adhoc',
    name: file?.name ?? 'Ad-hoc run',
    url,
    environment: process.env.TEST_ENV ?? file?.environment ?? 'QA',
    browsers: browsers.length ? browsers : ['chromium'],
    roles: file?.roles?.length ? file.roles : [{ name: 'Default', key: '' }],
  };
}

/** `.env` key prefix for a role: TEST_ for the default role, TEST_ADMIN_ for "admin". */
export function envPrefix(roleKey: string): string {
  const key = roleKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key ? `TEST_${key}_` : 'TEST_';
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** Credentials for a role, from this workspace's .env only. Empty strings when not configured. */
export function credentialsFor(roleKey = ''): Credentials {
  loadEnv(ROOT);
  const prefix = envPrefix(roleKey);
  return {
    username: process.env[`${prefix}USERNAME`] ?? '',
    password: process.env[`${prefix}PASSWORD`] ?? '',
  };
}
