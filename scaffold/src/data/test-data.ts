/**
 * Test data. Specs take every value from here: no literals, no credentials.
 *
 * Credentials come from .env on this PC only (written by the Setup screen),
 * never from project.json, logs or reports. A role with no credentials yields
 * empty strings, and the auth fixture skips the test with the reason instead of
 * typing blanks into the login form.
 *
 * Generated suites add their module data below (or in a workbook read through
 * ./data-sheet.ts when a row can only be used once).
 */
import { loadEnv } from '../utils/load-env.js';
import { activeProject, credentialsFor, type Credentials } from '../utils/project.js';

loadEnv();

export type User = Credentials;

const project = activeProject();

/** Every configured role's credentials, keyed by role key ('' is the default role). */
export const users: Readonly<Record<string, User>> = Object.fromEntries(
  (project?.roles ?? [{ name: 'Default', key: '' }]).map((r) => [r.key, credentialsFor(r.key)]),
);

/** The default role. */
export const defaultUser: User = credentialsFor('');

/** Values that are never valid for any account. Safe to use for negative tests. */
export const invalid = {
  username: 'testnova.invalid.user@example.invalid',
  password: 'Not-The-Password-42!',
} as const;

// Module data (routes, messages, inputs…) is added below by stage 5 of the AI Pipeline.
