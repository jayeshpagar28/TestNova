/**
 * Projects, each in its own workspace. TestNova supports several projects side by side; nothing one
 * project produces is ever written where another project reads it.
 *
 *   projects/<id>/project.json        name, URL, environment, browsers, roles (names only)
 *   projects/<id>/.env                that project's test logins (never served, never logged)
 *   projects/<id>/knowledge/          its knowledge sources (Setup screen)
 *   projects/<id>/pipeline.json, logs its AI Pipeline state and stage logs
 *   projects/<id>/qa/                 stages 1-4 and 6-8 outputs
 *   projects/<id>/src/, tests/        its Page Object Model and specs (stage 5), on its own copy of
 *                                     the framework: playwright.config.ts, tsconfig.json, src/utils…
 *   projects/<id>/data/               its executions, regressions and dashboard defect changes
 *   projects/<id>/catalogue.json      its modules and tests, rebuilt from the files above
 *   projects/active.json              the project shown by default (the last one created or picked)
 *
 * The agents and Playwright run with the workspace as their working directory, so the relative
 * paths in the agent instructions (qa/…, tests/e2e/…, src/pages/…) land in that project only.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECTS = join(ROOT, 'projects');
const ACTIVE = join(PROJECTS, 'active.json');

const readJson = (path, fallback = null) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};

export const workspaceDir = (id) => join(PROJECTS, id);
export const isProjectId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,60}$/.test(id) && existsSync(join(PROJECTS, id, 'project.json'));

/** Every project id, oldest first. */
export function projectIds() {
  if (!existsSync(PROJECTS)) return [];
  return readdirSync(PROJECTS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isProjectId(e.name))
    .map((e) => ({ id: e.name, at: readJson(join(PROJECTS, e.name, 'project.json'))?.createdAt ?? '' }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((p) => p.id);
}

/** The default project: projects/active.json, else the newest project, else null. */
export function activeProjectId() {
  const id = readJson(ACTIVE, {})?.id;
  if (isProjectId(id)) return id;
  return projectIds().at(-1) ?? null;
}

export function setActiveProject(id) {
  if (!isProjectId(id)) throw Object.assign(new Error('Unknown project'), { status: 404 });
  mkdirSync(PROJECTS, { recursive: true });
  writeFileSync(ACTIVE, `${JSON.stringify({ id }, null, 2)}\n`);
}

/** Where deleted projects go: a trash folder, so a mistaken delete can be undone by moving it back. */
export const DELETED = join(ROOT, '.testnova', 'deleted-projects');

/**
 * Delete a project: its folder (settings, knowledge, pipeline, tests, executions, reports) moves to
 * .testnova/deleted-projects/<id>-<time>/. Nothing of any other project is touched. If it was the
 * default project, the newest remaining one becomes the default. Returns where it went.
 */
export function deleteProject(id) {
  if (!isProjectId(id)) throw Object.assign(new Error('Unknown project'), { status: 404 });
  mkdirSync(DELETED, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const to = join(DELETED, `${id}-${stamp}`);
  try {
    renameSync(workspaceDir(id), to);
  } catch (e) {
    const busy = ['EPERM', 'EBUSY', 'EACCES'].includes(e.code);
    throw Object.assign(new Error(busy
      ? 'A file of this project is open in another program (an editor, a terminal in its folder, a test or browser still running). Close it and try again.'
      : `Could not delete the project: ${e.message}`), { status: 409 });
  }
  if (readJson(ACTIVE, {})?.id === id) {
    const next = projectIds().at(-1);
    if (next) writeFileSync(ACTIVE, `${JSON.stringify({ id: next }, null, 2)}
`);
  }
  return { deleted: id, movedTo: to, active: activeProjectId() };
}

/**
 * The framework every workspace starts from: copied from the repository root when the project is
 * created. Once copied a file belongs to the project (the healer may adjust a fixture) and is never
 * overwritten. The master prompt is instructions only, so it is refreshed on every stage.
 */
export const SCAFFOLD = [
  'playwright.config.ts',
  'tsconfig.json',
  'src/global-setup.ts',
  'src/utils/load-env.ts',
  'src/utils/project.ts',
  'src/utils/web-signals.ts',
  'src/pages/base.page.ts',
  'src/components/base.component.ts',
  'src/fixtures/test.ts',
  'src/fixtures/pages.ts',
  'src/data/test-data.ts',
  'src/data/data-sheet.ts',
  'tests/seed.spec.ts',
  'qa/README.md',
];
const REFRESHED = ['prompts/master-prompt.md'];
/** Instruction folders, refreshed like the master prompt: the testing-type standards and pipeline rules. */
const REFRESHED_DIRS = ['prompts/testing-types'];

/** Create (or complete) a project's workspace. Never overwrites what the project already has. */
export function ensureWorkspace(id) {
  const ws = workspaceDir(id);
  for (const rel of SCAFFOLD) {
    const from = join(ROOT, 'scaffold', rel);
    const to = join(ws, rel);
    if (existsSync(to) || !existsSync(from)) continue;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  for (const rel of REFRESHED) {
    const from = join(ROOT, rel);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(ws, rel)), { recursive: true });
    copyFileSync(from, join(ws, rel));
  }
  for (const rel of REFRESHED_DIRS) {
    const from = join(ROOT, rel);
    if (existsSync(from)) cpSync(from, join(ws, rel), { recursive: true, force: true });
  }
  for (const d of ['qa', 'tests/e2e', 'data/runs', 'data/regressions', 'knowledge/files']) mkdirSync(join(ws, d), { recursive: true });
  // An own .env, even an empty one: the framework's .env lookup walks up from the workspace and
  // must stop here, never reaching another project's (or the root's) logins.
  if (!existsSync(join(ws, '.env'))) writeFileSync(join(ws, '.env'), '# Test logins for this project only. Written by the Setup screen. Never commit.\n');
  return ws;
}
