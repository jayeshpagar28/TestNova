import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This project's workspace (projects/<id>/): this file is <workspace>/src/utils/load-env.ts. */
const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Load `.env` into `process.env`.
 *
 * Playwright Test does not read `.env` itself. Without this, a run from a fresh
 * terminal has no TEST_USERNAME, the authenticated suites skip, and the run
 * still exits 0: a green run that tested nothing. The loader is wired into both
 * the config (the CLI process) and the fixtures (worker processes), and
 * `loadEnv()` reports what it found so preflight can print it.
 *
 * Values already present in the environment always win, so a deliberate
 * override still works:
 *
 *   APP_URL=https://staging.example.com npm test
 *
 * Hand-rolled rather than dotenv: unquoted values with spaces and a '#' inside
 * a password must survive, and Node's `process.loadEnvFile` overrides variables
 * that are already set, which would silently defeat the override above.
 */

export type LoadEnvResult = {
  /** Absolute path of the file that was read, or null if none exists. */
  file: string | null;
  /** Names set into process.env by this call. */
  applied: string[];
  /** Names present in the file but left alone because the env already had them. */
  skipped: string[];
  /** 1-based line numbers that could not be parsed. */
  malformed: number[];
};

const EMPTY: LoadEnvResult = { file: null, applied: [], skipped: [], malformed: [] };

let cached: LoadEnvResult | null = null;

/** Walk up from `start` looking for a `.env`, stopping at the filesystem root. */
function findEnvFile(start: string): string | null {
  let dir = resolve(start);

  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Strip one matching pair of surrounding quotes, if present. */
function unquote(value: string): { value: string; quoted: boolean } {
  const first = value[0];
  if ((first === '"' || first === "'" || first === '`') && value.endsWith(first) && value.length > 1) {
    return { value: value.slice(1, -1), quoted: true };
  }
  return { value, quoted: false };
}

export function parseEnv(text: string): { pairs: Map<string, string>; malformed: number[] } {
  const pairs = new Map<string, string>();
  const malformed: number[] = [];

  // A BOM would otherwise become part of the first key's name.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) {
      malformed.push(index + 1);
      return;
    }

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      malformed.push(index + 1);
      return;
    }

    const { value, quoted } = unquote(withoutExport.slice(eq + 1).trim());

    // An inline comment is only a comment on an unquoted value, and only when
    // whitespace precedes the '#' — otherwise '#' is an ordinary character,
    // which matters for passwords.
    const cleaned = quoted ? value : value.replace(/\s+#.*$/, '');

    pairs.set(key, cleaned);
  });

  return { pairs, malformed };
}

/**
 * Read `.env` once per process and apply it. Repeat calls return the cached
 * result, so importing this from both the config and the fixtures is free.
 */
// The lookup starts at the workspace, not the process's working directory: every workspace has its
// own .env (written by the Setup screen), so the walk stops there and never reaches the logins of
// another project or of the repository root.
export function loadEnv(cwd: string = WORKSPACE): LoadEnvResult {
  if (cached) return cached;

  const file = findEnvFile(cwd);
  if (!file) {
    cached = EMPTY;
    return cached;
  }

  const { pairs, malformed } = parseEnv(readFileSync(file, 'utf8'));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of pairs) {
    if (process.env[key] !== undefined) {
      skipped.push(key);
      continue;
    }
    process.env[key] = value;
    applied.push(key);
  }

  cached = { file, applied, skipped, malformed };
  return cached;
}
