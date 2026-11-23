/**
 * The test catalogue: what modules exist and which tests each one has. Rebuilt from real sources,
 * never typed in by hand:
 *
 * Per project: every path below is inside projects/<id>/ (see workspace.mjs).
 *
 *   modules  qa/00-knowledge-base/knowledge-base.json (id, name, lucide icon, run order) once the
 *            pipeline has produced it; before that, one module per tests/e2e/NN-<id>.spec.ts
 *   tests    `playwright test --list --reporter=json`, so titles built at runtime and tests
 *            declared in loops are listed exactly as Playwright sees them
 *   plan     priority, steps, expected result, description, test data, created date, type, AC
 *            and preconditions from the qa/03-test-plan tables. Columns are found by header name,
 *            so the readable format (Test Case ID | TC Created Date | ... , see formats.mjs) and
 *            the older ID | Title | Priority | Steps | Expected one both work. A plan without a
 *            created-date column dates its cases by the plan file. Joined on the TC id; a test
 *            with no plan entry has none of them, and nothing is inferred.
 *
 * Written to projects/<id>/catalogue.json; the page fetches it from GET /api/catalogue.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, workspaceDir } from './workspace.mjs';
import { testTypeOf } from './testing-types.mjs';

export { ROOT };
export const catalogueFile = (pid) => join(workspaceDir(pid), 'catalogue.json');
const EMPTY = { generatedAt: null, source: 'spec-files', listError: null, modules: [] };

/** A project's catalogue as last built; empty before stage 5 (or for no project). */
export function readCatalogue(pid) {
  if (!pid) return EMPTY;
  try {
    return JSON.parse(readFileSync(catalogueFile(pid), 'utf8'));
  } catch {
    return EMPTY;
  }
}

const PRIORITY = { C: 'Critical', H: 'High', M: 'Medium', L: 'Low' };
const priorityOf = (cell) => {
  const word = cell?.match(/\b(Critical|High|Medium|Low|C|H|M|L)\b/i)?.[1];
  return word ? (PRIORITY[word.toUpperCase()] ?? word[0].toUpperCase() + word.slice(1).toLowerCase()) : null;
};
// TC-LOGIN-001, and with a testing-type segment: TC-FN-LOGIN-001, TC-SEC-SITE-003
const TC = /\b(TC-(?:[A-Z0-9]+-)+[A-Z]?\d+[a-z]?)\b/;
const titleCase = (slug) => slug.replace(/(^|-)(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());

/** TC id -> its plan fields, from every "| ID | ... |" or "| Test Case ID | ... |" table in the test plans. */
function readPlans(PLAN_DIR) {
  const plans = new Map();
  if (!existsSync(PLAN_DIR)) return plans;
  for (const file of readdirSync(PLAN_DIR).filter((f) => f.endsWith('.md'))) {
    let header = null;
    const stat = statSync(join(PLAN_DIR, file));
    const fileDate = new Date(Math.min(stat.birthtimeMs || stat.mtimeMs, stat.mtimeMs)).toISOString().slice(0, 10);
    for (const line of readFileSync(join(PLAN_DIR, file), 'utf8').split(/\r?\n/)) {
      if (!line.startsWith('|')) {
        header = null;
        continue;
      }
      const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
      if (/^(ID|Test Case ID)$/i.test(cells[0])) header = cells;
      else if (header && TC.test(cells[0])) {
        const at = (name) => cells[header.findIndex((h) => name.test(h))] || null;
        const br = (s) => s?.replace(/<br\s*\/?>/gi, '\n') ?? null;
        const given = (name) => {
          const v = at(name);
          return v && !/^(—|–|-|n\/?a|not run|not executed( yet)?)$/i.test(v) ? v : null;
        };
        plans.set(cells[0].match(TC)[1], {
          priority: priorityOf(at(/^(priority|pri|p)$/i)),
          expected: br(given(/^expected/i)),
          steps: br(given(/^(test )?steps/i)),
          description: br(given(/^description$/i)),
          testData: br(given(/^test data/i)),
          created: given(/created/i) ?? fileDate,
          type: given(/^(test )?type$/i),
          ac: given(/^(ac|ac ref(erence)?)$/i),
          preconditions: br(given(/^pre-?conditions?$/i)),
        });
      }
    }
  }
  return plans;
}

function readKnowledgeBase(KB_FILE) {
  try {
    const kb = JSON.parse(readFileSync(KB_FILE, 'utf8'));
    return Array.isArray(kb.modules) && kb.modules.length ? kb : null;
  } catch {
    return null;
  }
}

/** `playwright test --list --reporter=json`, flattened to { file, title, describe, tags } per test. */
function listTests(ws, SPEC_DIR) {
  return new Promise((done) => {
    // no spec files yet is a normal state (before pipeline stage 5), not a listing error
    if (!existsSync(SPEC_DIR) || !readdirSync(SPEC_DIR).some((f) => f.endsWith('.spec.ts'))) return done({ tests: [], error: null });
    execFile(
      process.execPath,
      [join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '-c', join(ws, 'playwright.config.ts'), 'tests/e2e', '--list', '--reporter=json'],
      // one project is enough to list: every browser runs the same tests
      { cwd: ws, maxBuffer: 64 * 1024 * 1024, timeout: 120_000, env: { ...process.env, TEST_BROWSERS: 'chromium', FORCE_COLOR: '0' } },
      (err, stdout, stderr) => {
        let json;
        try {
          json = JSON.parse(stdout.slice(stdout.indexOf('{')));
        } catch {
          return done({ tests: [], error: (stderr || err?.message || 'playwright --list failed').trim().split('\n').slice(0, 6).join('\n') });
        }
        const tests = [];
        const walk = (suite, describe) => {
          for (const spec of suite.specs ?? []) tests.push({ file: spec.file.replace(/\\/g, '/'), title: spec.title, describe, tags: spec.tags ?? [], line: spec.line, annotations: (spec.tests ?? []).flatMap((x) => x.annotations ?? []) });
          for (const child of suite.suites ?? []) walk(child, child.title && !child.title.endsWith('.ts') ? child.title : describe);
        };
        for (const s of json.suites ?? []) walk(s, null);
        const errors = (json.errors ?? []).map((e) => e.message ?? String(e));
        return done({ tests, error: errors.length ? errors.join('\n').slice(0, 2000) : null });
      },
    );
  });
}

export async function buildCatalogue(pid) {
  if (!pid) return EMPTY;
  const ws = workspaceDir(pid);
  const KB_FILE = join(ws, 'qa', '00-knowledge-base', 'knowledge-base.json');
  const SPEC_DIR = join(ws, 'tests', 'e2e');
  const CATALOGUE_FILE = catalogueFile(pid);
  const plans = readPlans(join(ws, 'qa', '03-test-plan'));
  const kb = readKnowledgeBase(KB_FILE);
  const { tests, error } = await listTests(ws, SPEC_DIR);
  const specFiles = existsSync(SPEC_DIR) ? readdirSync(SPEC_DIR).filter((f) => /^\d+-.+\.spec\.ts$/.test(f)) : [];
  const specFor = (id) => specFiles.find((f) => f.replace(/^\d+-/, '').replace(/\.spec\.ts$/, '') === id) ?? null;

  const defs = kb
    ? kb.modules.filter((m) => !m.skip).map((m) => ({ id: m.id, name: m.name, icon: m.icon || 'Box', order: Number(m.order) || 999, description: m.description ?? '' }))
    : specFiles.map((f) => {
        const [, order, slug] = f.match(/^(\d+)-(.+)\.spec\.ts$/);
        return { id: slug, name: titleCase(slug), icon: 'Box', order: Number(order), description: '' };
      });

  const modules = defs
    .sort((a, b) => a.order - b.order)
    .map((m) => {
      const file = specFor(m.id);
      const mine = file ? tests.filter((t) => t.file.endsWith(`e2e/${file}`) || t.file === file) : [];
      let unnamed = 0;
      const prefix = `TC-${m.id.split('-').map((w) => w[0]).join('').toUpperCase()}`;
      return {
        id: m.id,
        order: m.order,
        name: m.name,
        icon: m.icon,
        description: m.description,
        spec: file ? `tests/e2e/${file}` : null,
        deviceStep: null,
        tests: mine.map((t, index) => {
          const found = t.title.match(TC)?.[1];
          const id = found ?? `${prefix}-U${String((unnamed += 1)).padStart(2, '0')}`;
          const defect = t.title.match(/@known-defect(?:\s+([A-Z]+(?:-[A-Z]+)*-\d+))?/);
          // the defect id may follow the tag in the title, or (as the agents are told) sit in a
          // `defect` annotation: { annotation: { type: 'defect', description: 'BUG-003' } }
          // ("BUG-007, BUG-013" or several annotations name several; the first is the primary link,
          // and every one is kept, comma-separated, so the reports link the test to each defect)
          const ids = [...new Set((t.annotations ?? []).flatMap((a) => (a.type === 'defect' ? String(a.description ?? '').match(/\b[A-Z]+(?:-[A-Z]+)*-\d+\b/g) ?? [] : [])))];
          const annotated = ids.length ? ids.join(', ') : null;
          const clean = t.title.replace(/\s*@[\w-]+(?:\s+[A-Z]+(?:-[A-Z]+)*-\d+)?/g, '').trim();
          const body = clean.replace(/^[^:]{0,90}?(?:TC-|BR-|AC-)[^:]{0,90}:\s+/, '');
          const [scenario, ...rest] = body.split(/\s+—\s+/);
          const plan = plans.get(id);
          return {
            key: `${m.id}#${index}`,
            id,
            idGenerated: !found,
            title: clean,
            scenario,
            description: rest.join(' — '),
            group: t.describe ?? m.name,
            modifier: null,
            knownDefect: defect ? (defect[1] ?? annotated ?? 'UNTRACKED') : null,
            live: t.tags.includes('@live') || /@live\b/.test(t.title),
            priority: plan?.priority ?? null,
            expected: plan?.expected ?? null,
            steps: plan?.steps ?? null,
            planDescription: plan?.description ?? null,
            testData: plan?.testData ?? null,
            created: plan?.created ?? null,
            type: plan?.type ?? null,
            ac: plan?.ac ?? null,
            preconditions: plan?.preconditions ?? null,
            // only typed tests carry it, so a Full Coverage catalogue is unchanged
            ...(testTypeOf(t.title, t.tags) ? { testingType: testTypeOf(t.title, t.tags) } : {}),
          };
        }),
      };
    });

  const catalogue = { projectId: pid, generatedAt: new Date().toISOString(), source: kb ? 'knowledge-base' : 'spec-files', listError: error, modules };
  mkdirSync(ws, { recursive: true });
  const text = `${JSON.stringify(catalogue, null, 1)}\n`;
  // Rewrite only on a real change, so Vite does not reload the page for nothing.
  const prev = existsSync(CATALOGUE_FILE) ? readFileSync(CATALOGUE_FILE, 'utf8') : '';
  if (prev.replace(/"generatedAt": "[^"]*"/, '') !== text.replace(/"generatedAt": "[^"]*"/, '')) writeFileSync(CATALOGUE_FILE, text);
  return catalogue;
}
