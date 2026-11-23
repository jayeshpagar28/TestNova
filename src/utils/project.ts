import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnv } from './load-env.js';

/**
 * The project under test.
 *
 * The Setup screen writes `projects/<id>/project.json` and points
 * `projects/active.json` at it. Credentials are never in that file: they live
 * in `.env` on this PC only (see `credentialsFor`). Environment variables win
 * over the file, so a one-off run against another environment needs no edit:
 *
 *   APP_URL=https://staging.example.com TEST_BROWSERS=firefox npm test
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

export const ROOT = resolve(process.env.TESTNOVA_ROOT ?? process.cwd());
export const PROJECTS_DIR = join(ROOT, 'projects');

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
  } catch {
    return null;
  }
}

/** The id of the active project: TESTNOVA_PROJECT, else projects/active.json. */
export function activeProjectId(): string | null {
  loadEnv(ROOT);
  if (process.env.TESTNOVA_PROJECT) return process.env.TESTNOVA_PROJECT;
  return readJson<{ id?: string }>(join(PROJECTS_DIR, 'active.json'))?.id ?? null;
}

const isBrowser = (b: string): b is BrowserName => (ALL_BROWSERS as readonly string[]).includes(b);

/** The active project, with environment overrides applied. Null when nothing is configured. */
export function activeProject(): ProjectConfig | null {
  loadEnv(ROOT);
  const id = activeProjectId();
  const file = id ? readJson<Partial<ProjectConfig>>(join(PROJECTS_DIR, id, 'project.json')) : null;

  const url = process.env.APP_URL ?? file?.url ?? '';
  if (!url) return null;

  const envBrowsers = process.env.TEST_BROWSERS?.split(',').map((b) => b.trim()).filter(isBrowser);
  const browsers = envBrowsers?.length ? envBrowsers : (file?.browsers ?? []).filter(isBrowser);

  return {
    id: id ?? 'adhoc',
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

/** Credentials for a role, from .env only. Empty strings when not configured. */
export function credentialsFor(roleKey = ''): Credentials {
  loadEnv(ROOT);
  const prefix = envPrefix(roleKey);
  return {
    username: process.env[`${prefix}USERNAME`] ?? '',
    password: process.env[`${prefix}PASSWORD`] ?? '',
  };
}
