/**
 * A project's run settings, for the server: the JavaScript twin of src/utils/project.ts (the server
 * runs plain Node and cannot import TypeScript). Read from projects/<id>/project.json only: with
 * several projects, a global APP_URL / TEST_BROWSERS override would apply to all of them, so the
 * server ignores those (a one-off run from a terminal still honours them in the workspace).
 * Credentials are never read here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeProjectId, isProjectId, workspaceDir } from './workspace.mjs';

const BROWSERS = ['chromium', 'firefox', 'webkit'];

const readJson = (path) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
};

/** The project's URL, environment and browsers; null when it does not exist or has no URL. */
export function projectConfig(pid) {
  if (!isProjectId(pid)) return null;
  const file = readJson(join(workspaceDir(pid), 'project.json'));
  if (!file?.url) return null;
  const browsers = (file.browsers ?? []).filter((b) => BROWSERS.includes(b));
  return {
    id: pid,
    name: file.name ?? pid,
    url: file.url,
    environment: file.environment ?? 'QA',
    browsers: browsers.length ? browsers : ['chromium'],
    testingType: file.testingType ?? null,
  };
}

/** The default project's settings (projects/active.json). */
export const activeProject = () => projectConfig(activeProjectId());
