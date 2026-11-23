/**
 * The AI Pipeline: 8 stages, each a Claude agent from .claude/agents, run one at a time through the
 * Claude Agent SDK (fallback: the `claude` CLI with stream-json). State lives in
 * projects/<id>/pipeline.json so a refresh or a server restart shows the truth; a stage the server
 * was running when it stopped is marked failed, never passed.
 *
 * Every project has its own pipeline, run in its own workspace (projects/<id>/, see workspace.mjs):
 * the agents' working directory is that folder, so their qa/, tests/ and src/ outputs belong to that
 * project alone. Projects' pipelines are independent; each runs one stage at a time.
 *
 * A stage passes only when its expected output files exist and validate. The agent saying it is
 * done is not enough.
 */
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { ROOT, buildCatalogue } from './catalogue.mjs';
import { projectView, secretValues } from './knowledge.mjs';
import { storeFor } from './store.mjs';
import { writeDefectSheet } from './reports.mjs';
import { writeQaReport } from './qa-render.mjs';
import { ensureWorkspace, isProjectId, projectIds, workspaceDir } from './workspace.mjs';
import { guardHook } from './guard.mjs';
import { liveBegin, liveEnd } from './live.mjs';
import { CHECKPOINT_RULES, assessCheckpoint, clearCheckpoint, lastStepsFrom, readCheckpoint, resumeBrief } from './checkpoint.mjs';
import { labelOf, resolveStage, typeOf, typePrompt, unavailable } from './testing-types.mjs';

const LOG_KEEP = 500;
/** Wall-clock limit per stage attempt; a stage that hits it is resumable, like an interrupted one. */
const STAGE_TIMEOUT_MS = Number(process.env.TESTNOVA_STAGE_TIMEOUT_MIN ?? 90) * 60_000;
/** Tools that would let an agent idle or wake itself later: an unattended stage must run straight through. */
const DISALLOWED_TOOLS = ['ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList', 'Monitor', 'RemoteTrigger', 'PushNotification', 'EnterWorktree', 'ExitWorktree', 'TaskStop'];
/** PIDs no agent command may kill: this server and the process that launched it. */
const PROTECTED_PIDS = () => [String(process.pid), String(process.ppid)];

/**
 * Modules whose newest executed run is older than the code it ran: the module's spec
 * (tests/e2e/NN-<id>.spec.ts), the shared page objects, components, fixtures and data (src/),
 * or playwright.config.ts. `runs` is newest first. Returns "module (spec changed 10:42, last
 * run 10:31)" lines.
 */
function staleModules({ runs, kbModules, listFiles, mtime }) {
  const clock = (ms) => new Date(ms).toTimeString().slice(0, 5);
  const shared = Math.max(mtime('src'), mtime('playwright.config.ts'));
  const specs = listFiles('tests/e2e', (f) => /^\d+-.+\.spec\.ts$/.test(f));
  const out = [];
  for (const m of kbModules()) {
    const last = runs.find((r) => r.moduleId === m.id);
    if (!last) continue;
    const spec = specs.find((f) => f.replace(/^tests\/e2e\/\d+-/, '').replace(/\.spec\.ts$/, '') === m.id);
    const specAt = spec ? mtime(spec) : 0;
    const changed = Math.max(specAt, shared);
    // 2 s of grace: a run started right after a save reads the saved file
    if (changed > last.startedAt + 2000) out.push(`${m.id} (${specAt >= shared ? 'its spec' : 'shared page objects/fixtures'} changed ${clock(changed)}, last run ${last.id} started ${clock(last.startedAt)})`);
  }
  return out;
}

// ── a project's files, as the stage checks see them ─────────────────────────
/**
 * Helpers bound to one project's workspace: every path is relative to projects/<id>/. `type` is the
 * run's testing type: for a typed run, `scopeModules` are the knowledge-base modules its stage 3
 * put in scope (qa/03-test-plan/scope.json); for Full Coverage they are all of them, as before.
 */
function ctx(pid, type = null) {
  const W = workspaceDir(pid);
  const exists = (p) => existsSync(join(W, p));
  const listFiles = (rel, filter = () => true) => {
    const base = join(W, rel);
    if (!existsSync(base)) return [];
    const out = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (!e.name.startsWith('.') && filter(e.name)) out.push(relative(W, p).split(sep).join('/'));
      }
    };
    walk(base);
    return out.sort();
  };
  const readKb = () => JSON.parse(readFileSync(join(W, 'qa', '00-knowledge-base', 'knowledge-base.json'), 'utf8'));
  const kbModules = () => {
    try {
      return readKb().modules.filter((m) => !m.skip);
    } catch {
      return [];
    }
  };
  const read = (file) => readFileSync(join(W, file), 'utf8');
  const countRows = (file, re) => (exists(file) ? read(file).split(/\r?\n/).filter((l) => re.test(l)).length : 0);
  const typecheck = () => new Promise((done) => {
    execFile(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', join(W, 'tsconfig.json')], { cwd: W, timeout: 180_000, maxBuffer: 8 << 20 }, (err, stdout) => {
      done(err ? { ok: false, output: stdout.split('\n').slice(0, 15).join('\n') } : { ok: true });
    });
  });
  /** Newest modification time (ms) of a file, or of any file under a folder; 0 when absent. */
  const mtime = (rel) => {
    const p = join(W, rel);
    if (!existsSync(p)) return 0;
    if (!statSync(p).isDirectory()) return statSync(p).mtimeMs;
    return listFiles(rel).reduce((m, f) => Math.max(m, statSync(join(W, f)).mtimeMs), 0);
  };
  /** scope.json as written by a typed stage 3, or { error }. */
  const readScope = () => {
    if (!exists(SCOPE_FILE)) return { error: `${SCOPE_FILE} is missing.` };
    try {
      const s = JSON.parse(read(SCOPE_FILE));
      if (!Array.isArray(s.modules)) return { error: `${SCOPE_FILE} has no "modules" array.` };
      return s;
    } catch (e) {
      return { error: `${SCOPE_FILE} does not parse: ${e.message}` };
    }
  };
  const scopeModules = () => {
    if (!typeOf(type)) return kbModules();
    const s = readScope();
    if (s.error || s.testingType !== type) return kbModules();
    return kbModules().filter((m) => s.modules.find((x) => x.id === m.id)?.inScope !== false);
  };
  return { pid, W, type, exists, listFiles, mtime, readKb, kbModules, readScope, scopeModules, read, countRows, typecheck, allRuns: () => storeFor(pid).allRuns(), buildCatalogue: () => buildCatalogue(pid) };
}

const SCOPE_FILE = 'qa/03-test-plan/scope.json';
const TYPED_ARTIFACTS = new Set(['qa/03-test-plan/ui-inventory.md', 'qa/03-test-plan/rules-matrix.md', 'qa/03-test-plan/attack-surface.md']);

/** Every TC row of a plan's case tables, as { id, type } (columns found by header). */
function planRows(text) {
  const rows = [];
  let idAt = -1;
  let typeAt = -1;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) {
      idAt = -1;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (/^(id|test case id)$/i.test(cells[0] ?? '')) {
      idAt = 0;
      typeAt = cells.findIndex((c) => /^(test )?type$/i.test(c));
    } else if (idAt >= 0 && /^TC-/.test(cells[0] ?? '')) rows.push({ id: cells[0], type: typeAt >= 0 ? cells[typeAt] ?? '' : '' });
  }
  return rows;
}

/**
 * What a typed stage 3 must add to the plans: scope.json for every module, the type's planning
 * artifact, TC ids with the type prefix and Type values from the type's codes. Null when it holds.
 */
function typedPlanProblem(c) {
  const t = typeOf(c.type);
  if (!t) return null;
  const scope = c.readScope();
  if (scope.error) return scope.error;
  if (scope.testingType !== t.key) return `${SCOPE_FILE} says testingType "${scope.testingType}", but this run is ${t.label} ("${t.key}").`;
  const unlisted = c.kbModules().filter((m) => !scope.modules.some((x) => x.id === m.id)).map((m) => m.id);
  if (unlisted.length) return `${SCOPE_FILE} does not list these knowledge-base modules (in scope or not, with a reason): ${unlisted.join(', ')}`;
  if (!c.scopeModules().length) return `${SCOPE_FILE} puts no module in scope.`;
  if (!c.exists(t.artifact)) return `${t.artifact} is missing.`;
  const rows = c.scopeModules().flatMap((m) => planRows(c.read(`qa/03-test-plan/${m.id}-test-plan.md`)).map((r) => ({ ...r, module: m.id })));
  const badId = rows.filter((r) => !r.id.startsWith(`TC-${t.prefix}-`));
  if (badId.length) return `Test case ids must start with TC-${t.prefix}-: ${badId.slice(0, 6).map((r) => `${r.id} (${r.module})`).join(', ')}${badId.length > 6 ? ` (+${badId.length - 6} more)` : ''}`;
  const badType = rows.filter((r) => !t.code.test(r.type));
  if (badType.length) return `The Type column must hold a ${t.label} code from the applicability map of ${t.rules}: ${badType.slice(0, 6).map((r) => `${r.id} "${r.type}"`).join(', ')}${badType.length > 6 ? ` (+${badType.length - 6} more)` : ''}`;
  return null;
}

/**
 * outputs: folders the stage writes (shown as its files); check: why it has not passed, or null;
 * counts: the key figures for the card. Every number comes from the files.
 */
export /** Does this test plan hold the case table? Its header names an ID, title, priority, steps and expected result. */
function planTable(text) {
  return text.split(/\r?\n/).some((line) => {
    if (!line.startsWith('|')) return false;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
    const has = (re) => cells.some((c) => re.test(c));
    return /^(id|test case id)$/.test(cells[0] ?? '') && has(/^(test )?title$/) && has(/^priority$/) && has(/^(test )?steps/) && has(/^expected/);
  });
}

/** The Status cell of every TC row of a results file's tables, located by the table's header. */
function resultStatuses(text) {
  const out = [];
  let at = -1;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) {
      at = -1;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (/^(id|test case id)$/i.test(cells[0] ?? '')) at = cells.findIndex((c) => /^status$/i.test(c));
    else if (at >= 0 && /^TC-/.test(cells[0] ?? '')) out.push(cells[at] ?? '');
  }
  return out;
}

const STAGES = [
  {
    n: 1, name: 'BA Agent', title: 'Read and analyze the helper docs and explore the web application', agent: 'ba-explorer',
    outputs: ['qa/01-user-story'],
    async check({ listFiles }) {
      return listFiles('qa/01-user-story', (f) => /^US_.*\.md$/.test(f)).length ? null : 'No user story (qa/01-user-story/US_*.md) was written.';
    },
    counts: ({ listFiles }) => ({ stories: listFiles('qa/01-user-story', (f) => /^US_.*\.md$/.test(f)).length, screenshots: listFiles('qa/01-user-story', (f) => /\.(png|jpe?g)$/i.test(f)).length }),
  },
  {
    n: 2, name: 'BA Agent 2.0', title: 'Create the knowledge base', agent: 'knowledge-base-builder', reviewable: true,
    outputs: ['qa/00-knowledge-base'],
    async check({ exists, readKb }) {
      if (!exists('qa/00-knowledge-base/knowledge-base.md')) return 'knowledge-base.md is missing.';
      let kb;
      try {
        kb = readKb();
      } catch (e) {
        return `knowledge-base.json does not parse: ${e.message}`;
      }
      if (!Array.isArray(kb.modules) || !kb.modules.length) return 'knowledge-base.json has no modules.';
      const bad = kb.modules.filter((m) => !m.id || !/^[a-z0-9-]+$/.test(m.id) || !m.name);
      return bad.length ? `Modules without a valid kebab-case id or a name: ${bad.map((m) => m.id ?? '?').join(', ')}` : null;
    },
    counts: ({ readKb }) => {
      try {
        const kb = readKb();
        return { modules: kb.modules?.length ?? 0, rules: kb.businessRules?.length ?? 0, flows: kb.flows?.length ?? 0, gaps: kb.gaps?.length ?? 0 };
      } catch {
        return {};
      }
    },
  },
  {
    n: 3, name: 'Test Planner Agent', title: 'Create the test plan', agent: 'test-planner', reviewable: true,
    outputs: ['qa/03-test-plan'],
    async check(c) {
      const { exists, scopeModules, read } = c;
      // a typed run plans its in-scope modules only, so scope.json comes first
      if (c.type && c.readScope().error) return c.readScope().error;
      const missing = scopeModules().filter((m) => !exists(`qa/03-test-plan/${m.id}-test-plan.md`)).map((m) => m.id);
      if (missing.length) return `No test plan for: ${missing.join(', ')}`;
      const noTable = scopeModules().filter((m) => !planTable(read(`qa/03-test-plan/${m.id}-test-plan.md`))).map((m) => m.id);
      if (noTable.length) return `These plans lack the test case table (Test Case ID | TC Created Date | Module | Test Title | Description | Test Steps / Steps to Reproduce | Test Data | Expected Result | Actual Result | Status | Priority ...): ${noTable.join(', ')}`;
      return typedPlanProblem(c);
    },
    // a typed run's planning artifacts (the rules matrix lists TC ids too) are not test cases
    counts: ({ listFiles, countRows }) => ({ plans: listFiles('qa/03-test-plan', (f) => f.endsWith('-test-plan.md')).length, cases: listFiles('qa/03-test-plan', (f) => f.endsWith('.md') && !TYPED_ARTIFACTS.has(f)).reduce((n, f) => n + countRows(f, /^\|\s*TC-/), 0) }),
  },
  {
    n: 4, name: 'Human-Like Testing Heuristics', title: 'Perform exploratory testing', agent: 'exploratory-tester', reviewable: true,
    outputs: ['qa/04-exploratory'],
    async check({ listFiles, exists }) {
      if (!listFiles('qa/04-exploratory', (f) => f.endsWith('-results.md')).length) return 'No results file (qa/04-exploratory/<module>-results.md) was written.';
      return exists('qa/04-exploratory/summary.md') ? null : 'qa/04-exploratory/summary.md is missing.';
    },
    counts: ({ listFiles, read }) => {
      // the Status column is found by its header, so any column order counts the same
      const statuses = listFiles('qa/04-exploratory', (f) => f.endsWith('-results.md')).flatMap((f) => resultStatuses(read(f)));
      const n = (re) => statuses.filter((s) => re.test(s)).length;
      return { passed: n(/^pass/i), failed: n(/^fail/i), blocked: n(/^blocked/i) };
    },
  },
  {
    n: 5, name: 'Test Generator Agent', title: 'Generate automation scripts', agent: 'test-generator',
    outputs: ['tests/e2e', 'src/pages', 'src/components', 'src/fixtures', 'src/data'],
    async check({ listFiles, typecheck }) {
      const specs = listFiles('tests/e2e', (f) => /^\d+-.+\.spec\.ts$/.test(f));
      if (!specs.length) return 'No spec file (tests/e2e/NN-<module>.spec.ts) was written.';
      const tc = await typecheck();
      return tc.ok ? null : `Typecheck fails:\n${tc.output}`;
    },
    counts: async ({ listFiles, buildCatalogue }) => {
      const c = await buildCatalogue();
      return { specs: listFiles('tests/e2e', (f) => /^\d+-.+\.spec\.ts$/.test(f)).length, tests: c.modules.reduce((n, m) => n + m.tests.length, 0), pages: listFiles('src/pages', (f) => f.endsWith('.page.ts')).length - 1 };
    },
  },
  {
    n: 6, name: 'Test Healer Agent', title: 'Execute and heal the automation tests', agent: 'test-healer',
    outputs: ['qa/05-healing'],
    async check({ exists, allRuns, scopeModules: kbModules, listFiles, mtime }, stage) {
      if (!exists('qa/05-healing/healing-log.md')) return 'qa/05-healing/healing-log.md is missing.';
      // whole-module executions only (a re-run that carries results is one): a single-test run
      // says nothing about the rest of its module
      const runs = allRuns().filter((r) => r.startedAt >= (stage.since ?? stage.startedAt ?? 0) && r.status !== 'running' && r.scope === 'module');
      if (!runs.length) return 'No module was executed through the TestNova runner during this stage.';
      // A run counts only when tests really executed: a run that died at start-up (status "error",
      // nothing passed or failed) is not a result, and must never let the later stages report on nothing.
      const executed = (r) => r.status !== 'error' && (r.tests ?? []).some((t) => t.status === 'passed' || t.status === 'failed');
      const missing = kbModules().filter((m) => !runs.some((r) => r.moduleId === m.id && executed(r))).map((m) => m.id);
      if (!missing.length) {
        // a healed script counts only once it has been executed again: results older than the
        // code they report on say nothing about whether the fix works
        const stale = staleModules({ runs: runs.filter(executed), kbModules, listFiles, mtime });
        return stale.length
          ? `Scripts were changed after their module's last execution, so its results do not show whether the fixes work: ${stale.join('; ')}. Re-run these modules through the TestNova runner (POST /runs) and update the healing log.`
          : null;
      }
      const errors = runs.filter((r) => r.status === 'error').map((r) => `${r.id} (${r.moduleId}): ${String(r.errors?.find((e) => String(e).trim()) ?? `exit code ${r.exitCode}`).split('\n')[0].slice(0, 160)}`);
      return `No executed test result for: ${missing.join(', ')}. ${errors.length ? `Runs that could not execute: ${errors.slice(0, 4).join('; ')}${errors.length > 4 ? ` (+${errors.length - 4} more)` : ''}.` : ''} Fix the environment and resume the stage.`;
    },
    counts: ({ allRuns }, stage) => {
      const runs = allRuns().filter((r) => r.startedAt >= (stage.since ?? stage.startedAt ?? 0) && r.status !== 'running' && r.scope === 'module');
      const latest = new Map();
      for (const r of runs) if (!latest.has(r.moduleId)) latest.set(r.moduleId, r);
      const tests = [...latest.values()].flatMap((r) => r.tests);
      return { executions: runs.length, passed: tests.filter((t) => t.status === 'passed').length, failed: tests.filter((t) => t.status === 'failed').length };
    },
  },
  {
    n: 7, name: 'Defect Analysis', title: 'Classify failures and check the web signals', agent: 'defect-analyst',
    outputs: ['qa/06-report'],
    async check({ exists, read }, _stage, project) {
      const base = `qa/06-report/${project.id}-defects`;
      if (!exists(`${base}.json`)) return `${base}.json is missing.`;
      try {
        const d = JSON.parse(read(`${base}.json`));
        if (!Array.isArray(d.defects)) return `${base}.json has no "defects" array.`;
      } catch (e) {
        return `${base}.json does not parse: ${e.message}`;
      }
      // the defect sheet is built here from the JSON, in the one readable format (formats.mjs)
      try {
        await writeDefectSheet(project.id);
      } catch (e) {
        return `${base}.xlsx could not be written: ${e.message}`;
      }
      return exists(`${base}.xlsx`) ? null : `${base}.xlsx is missing.`;
    },
    counts: ({ read }, _stage, project) => {
      try {
        const d = JSON.parse(read(`qa/06-report/${project.id}-defects.json`));
        return { defects: d.defects.length, critical: d.defects.filter((x) => /critical|blocker/i.test(`${x.severity} ${x.priority}`)).length, notDefects: d.notDefects?.length ?? 0 };
      } catch {
        return {};
      }
    },
  },
  {
    n: 8, name: 'QA Report Generator Agent', title: 'Generate the QA test report', agent: 'qa-reporter',
    outputs: ['qa/06-report'],
    async check({ exists }, _stage, project) {
      // the agent writes the narrative (.md); the figures, register, evidence and the .pdf / .xlsx
      // come from TestNova's report engine, the same one the dashboard uses, so they always agree
      if (!exists(`qa/06-report/${project.id}-test-report.md`)) return `qa/06-report/${project.id}-test-report.md is missing.`;
      try {
        const { report } = await writeQaReport(project.id);
        const errors = report.validation.filter((v) => v.level === 'error');
        if (errors.length) return `The report data failed validation: ${errors.map((e) => e.message).join(' ')}`;
      } catch (e) {
        return `The QA report could not be generated: ${e.message}`;
      }
      const missing = ['pdf', 'xlsx'].map((x) => `qa/06-report/${project.id}-test-report.${x}`).filter((p) => !exists(p));
      return missing.length ? `Missing: ${missing.join(', ')}` : null;
    },
    counts: ({ listFiles }) => ({ reports: listFiles('qa/06-report', (f) => /-test-report\.(md|pdf|xlsx)$/.test(f)).length }),
  },
];

const REVIEW_AFTER = new Set(STAGES.filter((s) => s.reviewable).map((s) => s.n));

// ── state ───────────────────────────────────────────────────────────────────
const stateFile = (id) => join(workspaceDir(id), 'pipeline.json');
const logFile = (id, n, attempt) => join(workspaceDir(id), 'logs', `stage-${n}-attempt-${attempt}.jsonl`);

function freshState(id, testingType = null) {
  return {
    projectId: id, status: 'idle', pauseForReview: false, startedAt: null, endedAt: null, current: null, engine: null, testingType,
    stages: STAGES.map((s) => ({ n: s.n, status: 'waiting', attempt: 0, startedAt: null, endedAt: null, error: null, warning: null, counts: {}, files: [], result: null })),
  };
}
export function loadState(id) {
  if (!isProjectId(id)) return null;
  try {
    return JSON.parse(readFileSync(stateFile(id), 'utf8'));
  } catch {
    return freshState(id);
  }
}
function saveState(state) {
  mkdirSync(workspaceDir(state.projectId), { recursive: true });
  writeFileSync(stateFile(state.projectId), JSON.stringify(state, null, 1));
}

const listeners = new Set();
export const onPipeline = (fn) => listeners.add(fn);
const emit = (event) => {
  for (const fn of listeners) fn(event);
};
function publish(state) {
  saveState(state);
  emit({ type: 'pipeline', pipeline: view(state) });
}

/** A stage's definition as this run sees it (a testing type swaps the agents of stages 3 and 4). */
const stageOf = (state, n) => resolveStage(STAGES[n - 1], state?.testingType ?? null);

/**
 * The state plus each stage's static description, for the page. Before a run has started, the
 * project's testing type decides the agents shown. `pendingTestingType`: the project's type, when
 * it was changed after this run started (Start offers the switch).
 */
export function view(state) {
  if (!state) return null;
  const started = state.stages.some((s) => s.status !== 'waiting');
  const wanted = projectView(state.projectId)?.testingType ?? null;
  const testingType = started ? (state.testingType ?? null) : wanted;
  const typed = { ...state, testingType };
  return {
    ...typed,
    testingTypeLabel: labelOf(testingType),
    pendingTestingType: started && wanted !== testingType ? { key: wanted, label: labelOf(wanted) } : null,
    stages: state.stages.map((s) => ({ ...s, ...pick(stageOf(typed, s.n)) })),
  };
}
const pick = (d) => ({ name: d.name, title: d.title, agent: d.agent, reviewable: Boolean(d.reviewable), outputs: d.outputs });

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
/**
 * Is a run in this state being driven by some other live TestNova server? Then this process must
 * not touch it. Known by the owner's pid; for a state written before owners were recorded, by its
 * running stage's log still growing.
 */
function ownedElsewhere(state) {
  if (state.status !== 'running') return false;
  if (state.ownerPid && state.ownerPid !== process.pid) return alive(state.ownerPid);
  const s = state.stages.find((x) => x.status === 'running');
  if (!s) return false;
  try {
    return Date.now() - statSync(logFile(state.projectId, s.n, s.attempt)).mtimeMs < 10 * 60_000;
  } catch {
    return false;
  }
}

/** An interrupted run is a failure: the server stopped while a stage was running. */
export function recoverPipeline() {
  for (const id of projectIds()) recoverProject(id);
}

function recoverProject(id) {
  if (!existsSync(stateFile(id))) return;
  const state = loadState(id);
  if (ownedElsewhere(state)) {
    console.log(`pipeline ${id}: stage ${state.current} is being run by another TestNova server (pid ${state.ownerPid ?? 'unknown'}); following it`);
    return;
  }
  let changed = false;
  for (const s of state.stages) {
    if (s.status === 'running') {
      const endedAt = Date.now();
      const error = 'Interrupted: the TestNova server stopped while this stage was running. Retry resumes from the checkpoint; completed work is kept.';
      Object.assign(s, { status: 'failed', endedAt, error, resumable: true, interrupted: true });
      s.history = [...(s.history ?? []), { attempt: s.attempt, status: 'failed', resumed: Boolean(s.resumed), startedAt: s.startedAt, endedAt, error, cost: null, sessionId: s.sessionId ?? null }].slice(-20);
      changed = true;
    }
  }
  if (state.status === 'running') {
    Object.assign(state, { status: 'failed', current: null, endedAt: Date.now() });
    changed = true;
  }
  if (changed) saveState(state);
}

// ── logs ────────────────────────────────────────────────────────────────────
let secrets = [];
const redact = (text) => {
  let s = String(text ?? '');
  for (const v of secrets) s = s.split(v).join('[redacted]');
  return s;
};
const recent = new Map(); // `${project}:${n}:${attempt}` -> entries
function log(state, n, entry) {
  const stage = state.stages[n - 1];
  const e = { at: Date.now(), ...entry, text: redact(entry.text).slice(0, 4000) };
  const key = `${state.projectId}:${n}:${stage.attempt}`;
  const list = recent.get(key) ?? [];
  list.push(e);
  if (list.length > LOG_KEEP) list.splice(0, list.length - LOG_KEEP);
  recent.set(key, list);
  mkdirSync(join(workspaceDir(state.projectId), 'logs'), { recursive: true });
  appendFileSync(logFile(state.projectId, n, stage.attempt), `${JSON.stringify(e)}\n`);
  emit({ type: 'pipelineLog', projectId: state.projectId, stage: n, attempt: stage.attempt, entry: e });
}
export function stageLog(id, n, attempt) {
  if (!isProjectId(id)) return [];
  const key = `${id}:${n}:${attempt}`;
  if (recent.has(key)) return recent.get(key);
  try {
    return readFileSync(logFile(id, n, attempt), 'utf8').trim().split('\n').filter(Boolean).slice(-LOG_KEEP).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ── agents ──────────────────────────────────────────────────────────────────
function agentDefinition(name) {
  const text = readFileSync(join(ROOT, '.claude', 'agents', `${name}.md`), 'utf8');
  const [, front = '', body = text] = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/) ?? [];
  const field = (k) => front.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const tools = field('tools').split(',').map((t) => t.trim()).filter(Boolean);
  // On Windows Claude Code's shell tool is PowerShell as well as Bash, and agents reach for it.
  // An agent allowed a shell gets both; otherwise "don't ask" mode refuses the call and the stage
  // stalls (stage 6 did exactly this when it tried to call the runner API).
  if (process.platform === 'win32' && tools.includes('Bash') && !tools.includes('PowerShell')) tools.push('PowerShell');
  return { tools, model: field('model') || undefined, body };
}

/** The authorization record a Security run's every stage works under (pipeline rules §1). */
function authorizationLine(testingType, authorization) {
  if (!typeOf(testingType)?.requiresAuthorization) return '';
  if (!authorization) return 'Authorization record: NONE. Do passive analysis only; every active check is Blocked — no authorization recorded.';
  return `Authorization record: confirmed by ${authorization.by} on ${authorization.at}${authorization.reference ? `, reference "${authorization.reference}"` : ''}, for the ${authorization.environment} environment. In-scope origin: ${authorization.scope} only; never contact another host.`;
}

function stagePrompt(stageDef, project, apiBase, testingType = null, authorization = null) {
  // from stage 4 on, a typed run names only the modules its stage 3 put in scope
  const kb = stageDef.n >= 4 ? ctx(project.id, testingType).scopeModules() : ctx(project.id).kbModules();
  const q = `?project=${encodeURIComponent(project.id)}`;
  return [
    `You are running stage ${stageDef.n} of the TestNova AI Pipeline: ${stageDef.name} — ${stageDef.title}.`,
    `Project: "${project.name}" (id ${project.id}), ${project.url}, environment ${project.environment}, browsers ${project.browsers.join(', ')}.`,
    typePrompt(testingType, stageDef.n),
    authorizationLine(testingType, authorization),
    'Your working directory is this project\'s own workspace. Every path in your instructions is relative to it: where they say `projects/<id>/project.json` or `projects/<id>/knowledge/`, read `project.json` and `knowledge/` here. Write every output inside this directory (qa/, tests/, src/) and never read or change files of another project.',
    'Project file: project.json. Knowledge sources: knowledge/ (sources.json, extracted/, links.json, links/, notes.md). Pipeline rules: prompts/master-prompt.md.',
    `Roles: ${project.roles.map((r) => `${r.name} (this workspace's .env: ${r.key ? `TEST_${r.key.toUpperCase()}_USERNAME/_PASSWORD` : 'TEST_USERNAME/TEST_PASSWORD'})`).join('; ')}.`,
    kb.length ? `Modules from the knowledge base: ${kb.map((m) => `${m.order}. ${m.id}`).join(', ')}.` : '',
    stageDef.n === 6 ? `The TestNova API base URL is ${apiBase}. Every call must name this project with ${q}. Start a module run with POST ${apiBase}/runs${q} and JSON {"moduleId":"<id>"}; poll GET ${apiBase}/runs/<run id>${q} until status is not "running".` : '',
    stageDef.n === 6 ? `After the first full run of a module, re-run it with JSON {"moduleId":"<id>","rerun":"failed"} (or "rerun": ["<test key>", ...]): TestNova re-runs the failed tests and every test whose code changed, and carries the other results from the module's last full run. When shared code (src/, playwright.config.ts) or the spec's shared part changed, it runs the whole module by itself and says why in "rerun.full". Either way the result is a whole-module execution for the stage check.` : '',
    'Follow your agent instructions and prompts/master-prompt.md exactly. You are running unattended: never ask a question, never wait for input; make the most reasonable choice, and record any assumption or blocker in your output files.',
    `Tools you may use: ${agentDefinition(stageDef.agent).tools.join(', ')}. Any other tool is refused. If a call is refused, do not give up: do the same thing with a permitted tool (for example Bash instead of PowerShell, or the reverse). Record a blocker only when no permitted tool can do it.`,
    'Never write a credential value into any file or message.',
    'Process safety: you run inside the TestNova server\'s process tree. Never stop processes by name or all at once (no `Get-Process node | Stop-Process`, `taskkill /IM`, `pkill`, `killall`, `kill-port`): that kills the server and this stage with it. Stop only a process you started, by its PID. Never run commands in the background and never sleep-wait; run tests in the foreground and bounded (`--global-timeout`, `--max-failures`, `--retries=0`). These rules are enforced: a refused command comes back with the reason.',
    CHECKPOINT_RULES(stageDef.n),
    `Write your outputs under: ${stageDef.outputs.join(', ')}. Finish with a short summary of the files you wrote and the key counts.`,
  ].filter(Boolean).join('\n\n');
}

/**
 * One stage through the Agent SDK. Resolves with { cost, turns, summary } or throws.
 * `prompt` is the full stage prompt, or the resume brief when `resumeSession` restores the
 * previous attempt's conversation. The session id is saved on the stage as soon as it is known,
 * so even a run killed mid-way can be resumed.
 */
async function runWithSdk(state, stageDef, project, apiBase, abort, opts = {}) {
  // Live preview (live.mjs): a passive viewer of the agent's browser. It only swaps the MCP server's
  // config for a wrapper that adds a DevTools port; with TESTNOVA_LIVE=0 or a non-Chromium project
  // the MCP server gets the project's own config, as before.
  const liveConfig = await liveBegin(state.projectId, stageDef.n, workspaceDir(state.projectId), project?.browsers);
  try {
    return await runSdkStage(state, stageDef, project, apiBase, abort, { ...opts, liveConfig });
  } finally {
    liveEnd(state.projectId);
  }
}

async function runSdkStage(state, stageDef, project, apiBase, abort, { prompt, resumeSession, liveConfig } = {}) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const W = workspaceDir(state.projectId);
  const def = agentDefinition(stageDef.agent);
  const stage = state.stages[stageDef.n - 1];
  const headless = process.env.TESTNOVA_HEADED === '1' ? [] : ['--headless'];
  const q = query({
    prompt: prompt ?? stagePrompt(stageDef, project, apiBase, state.testingType ?? null, state.authorization),
    options: {
      cwd: W,
      abortController: abort,
      model: def.model,
      ...(resumeSession ? { resume: resumeSession } : {}),
      systemPrompt: { type: 'preset', preset: 'claude_code', append: def.body },
      allowedTools: def.tools,
      disallowedTools: DISALLOWED_TOOLS,
      // headless and unattended: anything the agent definition does not list is refused, not asked
      permissionMode: 'dontAsk',
      settingSources: [],
      // Every shell command passes the process guard (guard.mjs): no broad kills, no long sleeps,
      // no unbounded test runs.
      // A Security run's shell commands also pass the security guard (no scanners, installs or raw
      // network tools aimed at other hosts).
      hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [guardHook(PROTECTED_PIDS(), typeOf(state.testingType)?.guard ?? null)] }] },
      // Only the MCP servers below: never the user's own servers or claude.ai cloud connectors
      // (Drive, Docs…), which have no place in an unattended test pipeline.
      strictMcpConfig: true,
      settings: { disableClaudeAiConnectors: true },
      // No background tasks: a backgrounded command ends the agent's turn and the stage then idles
      // (stage 5 attempt 2 did, waking itself with ScheduleWakeup).
      env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
      mcpServers: {
        'playwright-test': {
          type: 'stdio', command: process.execPath,
          args: [join(ROOT, 'node_modules', 'playwright', 'cli.js'), 'run-test-mcp-server', '-c', liveConfig ?? join(W, 'playwright.config.ts'), ...headless],
          cwd: W,
        },
      },
      stderr: (d) => log(state, stageDef.n, { kind: 'stderr', text: d }),
    },
  });
  let result = null;
  for await (const msg of q) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      log(state, stageDef.n, { kind: 'system', text: `Agent ${stageDef.agent} ${resumeSession ? `resumed session ${resumeSession.slice(0, 8)}` : 'started'} (${msg.model}); MCP: ${(msg.mcp_servers ?? []).map((s) => `${s.name} ${s.status}`).join(', ') || 'none'}` });
      if (msg.session_id && stage.sessionId !== msg.session_id) {
        stage.sessionId = msg.session_id;
        publish(state);
      }
    }
    if (msg.type === 'assistant') {
      for (const block of msg.message.content ?? []) {
        if (block.type === 'text' && block.text.trim()) log(state, stageDef.n, { kind: 'text', text: block.text });
        if (block.type === 'tool_use') log(state, stageDef.n, { kind: 'tool', tool: block.name.replace(/^mcp__playwright-test__/, 'browser:'), text: JSON.stringify(block.input).slice(0, 400) });
      }
    }
    if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
      for (const block of msg.message.content) {
        if (block.type !== 'tool_result') continue;
        const content = Array.isArray(block.content) ? block.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : String(block.content ?? '');
        if (block.is_error) log(state, stageDef.n, { kind: 'tool-error', text: content.slice(0, 600) });
      }
    }
    if (msg.type === 'result') {
      result = msg;
      log(state, stageDef.n, { kind: 'result', text: `${msg.subtype}${msg.is_error ? ' (error)' : ''} · ${msg.num_turns} turns · $${(msg.total_cost_usd ?? 0).toFixed(2)}${msg.result ? `\n${msg.result}` : ''}` });
      // The first result ends the stage: nothing may keep the session alive after it.
      break;
    }
  }
  if (!result) throw new Error('The agent ended without a result.');
  if (result.subtype !== 'success' || result.is_error) throw new Error(`The agent stopped: ${result.subtype}${result.result ? ` — ${String(result.result).slice(0, 300)}` : ''}`);
  return { cost: result.total_cost_usd ?? null, turns: result.num_turns, summary: String(result.result ?? '').slice(0, 2000) };
}

/** Fallback: `claude -p … --output-format stream-json`, when the SDK cannot be loaded. */
function runWithCli(state, stageDef, project, apiBase, abort, { prompt, resumeSession } = {}) {
  const def = agentDefinition(stageDef.agent);
  const stage = state.stages[stageDef.n - 1];
  const guard = join(ROOT, 'dashboard', 'server', 'guard.mjs');
  // a file rather than inline JSON: quotes do not survive the Windows shell
  const settingsFile = join(workspaceDir(state.projectId), 'logs', 'agent-settings.json');
  mkdirSync(join(workspaceDir(state.projectId), 'logs'), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: `"${process.execPath}" "${guard}"` }] }] } }, null, 1));
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt ?? stagePrompt(stageDef, project, apiBase, state.testingType ?? null, state.authorization), '--output-format', 'stream-json', '--verbose', '--append-system-prompt', def.body, '--allowedTools', def.tools.join(','), '--disallowedTools', DISALLOWED_TOOLS.join(','), '--permission-mode', 'dontAsk', '--settings', settingsFile];
    if (resumeSession) args.push('--resume', resumeSession);
    if (def.model) args.push('--model', def.model);
    const env = { ...process.env, TESTNOVA_PROTECT_PIDS: PROTECTED_PIDS().join(','), TESTNOVA_GUARD_MODE: typeOf(state.testingType)?.guard ?? '', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' };
    const child = spawn(process.env.TESTNOVA_CLAUDE_CLI ?? 'claude', args, { cwd: workspaceDir(state.projectId), shell: process.platform === 'win32', signal: abort.signal, env });
    let buf = '';
    let result = null;
    child.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id && stage.sessionId !== msg.session_id) {
            stage.sessionId = msg.session_id;
            publish(state);
          }
          if (msg.type === 'assistant') for (const b of msg.message.content ?? []) {
            if (b.type === 'text') log(state, stageDef.n, { kind: 'text', text: b.text });
            if (b.type === 'tool_use') log(state, stageDef.n, { kind: 'tool', tool: b.name, text: JSON.stringify(b.input).slice(0, 400) });
          }
          if (msg.type === 'result') result = msg;
        } catch {
          // not JSON: ignore
        }
      }
    });
    child.stderr.on('data', (d) => log(state, stageDef.n, { kind: 'stderr', text: String(d) }));
    child.on('error', reject);
    child.on('close', (code) => (result && !result.is_error ? resolve({ cost: result.total_cost_usd ?? null, turns: result.num_turns, summary: String(result.result ?? '') }) : reject(new Error(`claude exited with ${code}`))));
  });
}

let sdkAvailable = null;
async function engine() {
  if (sdkAvailable === null) {
    try {
      await import('@anthropic-ai/claude-agent-sdk');
      sdkAvailable = true;
    } catch {
      sdkAvailable = false;
    }
  }
  return sdkAvailable ? 'sdk' : 'cli';
}

// ── orchestration ───────────────────────────────────────────────────────────
const running = new Map(); // project id -> { state, abort, n }
export const pipelineBusy = (pid) => running.has(pid);
const failure = (message, status = 409) => Object.assign(new Error(message), { status });

async function stageFiles(c, stageDef) {
  return stageDef.outputs.flatMap((o) => c.listFiles(o)).filter((f, i, a) => a.indexOf(f) === i && !f.endsWith('.gitkeep')).slice(0, 300);
}

/** Output files with size and time, for a resume brief. */
function outputDetails(c, def) {
  return def.outputs.flatMap((o) => c.listFiles(o)).filter((f, i, a) => a.indexOf(f) === i && !f.endsWith('.gitkeep')).map((p) => {
    try {
      const s = statSync(join(c.W, p));
      return { path: p, size: s.size, mtime: s.mtimeMs };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => a.mtime - b.mtime);
}

/** Does the agent's saved conversation still exist (so the session can be resumed)? */
function sessionExists(W, sessionId) {
  if (!sessionId) return false;
  const base = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  return existsSync(join(base, 'projects', W.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`));
}

/** Statuses after which a stage resumes on its next run (rather than starting over). */
const RESUMABLE = new Set(['failed', 'stopped', 'running']);

async function runStage(state, n, apiBase) {
  const def = stageOf(state, n);
  const stage = state.stages[n - 1];
  const project = projectView(state.projectId);
  const c = ctx(state.projectId, state.testingType ?? null);
  ensureWorkspace(state.projectId); // the framework copy, and a fresh master prompt
  const resuming = Boolean(stage.resumable && stage.attempt > 0);
  const prev = { attempt: stage.attempt, error: stage.error, sessionId: stage.sessionId };
  if (!resuming) {
    clearCheckpoint(c.W, n); // a fresh run must not pick up an earlier run's progress
    stage.sessionId = null;
  }
  // `since`: when this stage's work began, across resumed attempts (stage 6 counts runs from it)
  stage.since = resuming ? (stage.since ?? stage.startedAt) : Date.now();
  Object.assign(stage, { status: 'running', attempt: stage.attempt + 1, startedAt: Date.now(), endedAt: null, error: null, warning: null, result: null, resumable: false, interrupted: false, resumed: resuming });
  state.current = n;
  publish(state);
  const abort = new AbortController();
  running.set(state.projectId, { state, abort, n });
  secrets = secretValues();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, STAGE_TIMEOUT_MS);
  try {
    state.engine = await engine();
    const run = state.engine === 'sdk' ? runWithSdk : runWithCli;
    log(state, n, { kind: 'system', text: `Stage ${n} (${def.name}) attempt ${stage.attempt} via ${state.engine === 'sdk' ? 'Claude Agent SDK' : 'claude CLI'}${resuming ? ` — resuming attempt ${prev.attempt}` : ''} · ${labelOf(state.testingType ?? null)} · agent ${def.agent}` });

    let skipAgent = false;
    let opts = {};
    if (resuming) {
      const cp = readCheckpoint(c.W, n);
      const assessed = assessCheckpoint(c.W, cp);
      const problem = await def.check(c, stage, project);
      if (assessed?.allDone && !problem) {
        skipAgent = true;
        log(state, n, { kind: 'system', text: `Checkpoint: all ${assessed.tasks.length} tasks are done and the outputs validate. Passing without running the agent again.` });
        stage.result = { cost: 0, turns: 0, summary: 'Resumed from the checkpoint: every task was already done and the outputs validate.' };
      } else {
        const withSession = sessionExists(c.W, prev.sessionId);
        const facts = { n, attempt: stage.attempt, budgetMin: Math.round(STAGE_TIMEOUT_MS / 60_000), prevError: prev.error, cp, assessed, files: outputDetails(c, def), problem, lastSteps: lastStepsFrom(logFile(state.projectId, n, prev.attempt)) };
        const fresh = `${stagePrompt(def, project, apiBase, state.testingType ?? null, state.authorization)}\n\n${resumeBrief({ ...facts, sessionResumed: false })}`;
        log(state, n, { kind: 'system', text: `Resume: ${assessed ? `checkpoint ${assessed.done.length} done, ${assessed.inProgress.length} in progress, ${assessed.pending.length} pending` : cp?.error ? `checkpoint unreadable (${cp.error})` : 'no checkpoint; the files on disk are the record'}; outputs ${problem ? 'do not validate yet' : 'validate'}; ${withSession ? `restoring session ${prev.sessionId.slice(0, 8)}` : 'new session with a resume brief'}.` });
        opts = withSession ? { prompt: resumeBrief({ ...facts, sessionResumed: true }), resumeSession: prev.sessionId, fallbackPrompt: fresh } : { prompt: fresh };
      }
    }

    if (!skipAgent) {
      try {
        stage.result = await run(state, def, project, apiBase, abort, opts);
      } catch (e) {
        // A restored session can fail to load (too large, or written by another version): then a new
        // session with the same brief, rather than failing the stage.
        if (!opts.resumeSession || abort.signal.aborted) throw e;
        log(state, n, { kind: 'system', text: `Could not continue the saved session (${redact(e.message).slice(0, 200)}). Continuing in a new session with the resume brief.` });
        stage.result = await run(state, def, project, apiBase, abort, { prompt: opts.fallbackPrompt });
      }
    }
    log(state, n, { kind: 'system', text: 'Validating the stage outputs…' });
    const problem = await def.check(c, stage, project);
    stage.files = await stageFiles(c, def);
    stage.counts = await def.counts(c, stage, project);
    if (problem) throw new Error(`Outputs did not validate: ${problem}`);
    stage.status = state.pauseForReview && REVIEW_AFTER.has(n) ? 'review' : 'passed';
    log(state, n, { kind: 'system', text: stage.status === 'review' ? 'Outputs validated. Waiting for your review.' : 'Outputs validated. Stage passed.' });
  } catch (e) {
    // Whatever stopped it, the work on disk and the checkpoint stay: the next run resumes.
    stage.resumable = true;
    if (timedOut) {
      stage.status = 'failed';
      stage.error = `Timed out after ${Math.round(STAGE_TIMEOUT_MS / 60_000)} minutes. Retry resumes from the checkpoint.`;
      log(state, n, { kind: 'error', text: stage.error });
    } else if (abort.signal.aborted) {
      stage.status = 'stopped';
      stage.error = 'Stopped by the user. Retry resumes from the checkpoint.';
    } else {
      stage.status = 'failed';
      stage.error = redact(e.message).slice(0, 2000);
      log(state, n, { kind: 'error', text: stage.error });
    }
    stage.files = await stageFiles(c, def).catch(() => []);
  } finally {
    clearTimeout(timer);
    stage.endedAt = Date.now();
    stage.history = [...(stage.history ?? []), { attempt: stage.attempt, status: stage.status, resumed: resuming, startedAt: stage.startedAt, endedAt: stage.endedAt, error: stage.error, cost: stage.result?.cost ?? null, sessionId: stage.sessionId ?? null }].slice(-20);
    running.delete(state.projectId);
  }
  publish(state);
  return stage.status;
}

/** Why a passed stage's outputs no longer validate, or null. The project counts as busy meanwhile. */
async function revalidate(state, n) {
  const def = stageOf(state, n);
  const placeholder = { state, abort: new AbortController(), n };
  running.set(state.projectId, placeholder);
  try {
    return await def.check(ctx(state.projectId, state.testingType ?? null), state.stages[n - 1], projectView(state.projectId));
  } catch (e) {
    return e.message;
  } finally {
    if (running.get(state.projectId) === placeholder) running.delete(state.projectId);
  }
}

/** Run stages from `from` until one fails, stops or waits for review. */
async function drive(state, from, apiBase) {
  state.status = 'running';
  state.ownerPid = process.pid;
  state.startedAt ??= Date.now();
  state.endedAt = null;
  publish(state);
  for (let n = from; n <= STAGES.length; n += 1) {
    const s = state.stages[n - 1];
    if (s.status === 'skipped') continue;
    if (s.status === 'passed') {
      // A passed stage is skipped only while its outputs still exist and validate; otherwise it
      // resumes, so the later stages never build on missing or broken files.
      const problem = await revalidate(state, n);
      if (!problem) continue;
      Object.assign(s, { status: 'failed', error: `Outputs no longer validate: ${problem}`, resumable: true });
      log(state, n, { kind: 'system', text: `${s.error} Resuming this stage.` });
      // the stages after it were built on these outputs: they run again too
      for (const later of state.stages.slice(n)) {
        if (later.status === 'waiting') continue;
        Object.assign(later, { status: 'waiting', error: null, warning: null, resumable: false, sessionId: null });
        clearCheckpoint(workspaceDir(state.projectId), later.n);
      }
      publish(state);
    }
    const outcome = await runStage(state, n, apiBase);
    if (outcome === 'review') {
      Object.assign(state, { status: 'paused', current: n });
      return publish(state);
    }
    if (outcome !== 'passed') {
      Object.assign(state, { status: outcome === 'stopped' ? 'stopped' : 'failed', current: n, endedAt: Date.now() });
      return publish(state);
    }
  }
  Object.assign(state, { status: 'completed', current: null, endedAt: Date.now() });
  await buildCatalogue(state.projectId).catch(() => {});
  return publish(state);
}

function requireProject(id) {
  if (!isProjectId(id)) throw failure('Configure a project on the Setup screen first.');
  const state = loadState(id);
  if (!running.has(id) && ownedElsewhere(state)) {
    throw failure(`Another TestNova server on this PC (pid ${state.ownerPid ?? 'unknown'}) is running this pipeline. Control it from that dashboard, or wait for it to finish.`);
  }
  return state;
}

/**
 * Follow a run that another server process is driving: re-publish its state when pipeline.json
 * changes and relay new log lines as they are appended, so viewers of this server (e.g. through
 * the shared link) see it live. Does nothing for a run this process owns.
 */
export function followForeignRuns() {
  const lastState = new Map();
  const offsets = new Map();
  setInterval(() => {
    for (const id of projectIds()) if (!running.has(id)) follow(id);
  }, 1500);

  function follow(id) {
    if (!existsSync(stateFile(id))) return;
    let text;
    try {
      text = readFileSync(stateFile(id), 'utf8');
    } catch {
      return;
    }
    let state;
    try {
      state = JSON.parse(text);
    } catch {
      return; // mid-write
    }
    if (text !== lastState.get(id)) {
      const first = !lastState.has(id);
      lastState.set(id, text);
      if (!first) emit({ type: 'pipeline', pipeline: view(state) });
    }
    const s = state.stages.find((x) => x.status === 'running');
    if (!s) return;
    const file = logFile(id, s.n, s.attempt);
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    const from = offsets.get(file) ?? size; // start at the end: earlier lines are fetched on demand
    if (size > from) {
      const chunk = readFileSync(file).subarray(from, size).toString('utf8');
      const complete = chunk.slice(0, chunk.lastIndexOf('\n') + 1);
      for (const line of complete.split('\n').filter(Boolean)) {
        try {
          emit({ type: 'pipelineLog', projectId: id, stage: s.n, attempt: s.attempt, entry: JSON.parse(line) });
        } catch {
          // partial line
        }
      }
      offsets.set(file, from + Buffer.byteLength(complete));
    } else offsets.set(file, from);
  }
}

// ── testing type: the project's, fixed when it was created ──────────────────
/** An environment name that means production. Security testing never runs there. */
export const PRODUCTION_ENV = /\b(prod|production|live)\b/i;

/**
 * The project's testing type, checked for this run: it must be available, and Security Testing
 * needs a non-production environment and the operator's authorization (recorded on the run).
 */
function typeForRun(id, state, { securityAuthorization, actor } = {}) {
  const project = projectView(id);
  const type = project?.testingType ?? null;
  const why = unavailable(type);
  if (why) throw failure(why);
  // a run started under one type stays that type; startPipeline switches it first when confirmed
  if (state.stages.some((s) => s.status !== 'waiting') && (state.testingType ?? null) !== type) {
    throw failure(`This pipeline ran as ${labelOf(state.testingType ?? null)}, but the project is now ${labelOf(type)}. Start the pipeline from the Setup screen or the AI Pipeline page to switch it.`);
  }
  const t = typeOf(type);
  if (t?.requiresAuthorization) {
    if (PRODUCTION_ENV.test(project.environment ?? '')) {
      throw failure(`Security Testing never runs against a production environment, and this project's environment is "${project.environment}". Use a QA, UAT or staging environment.`);
    }
    if (!state.authorization) {
      if (securityAuthorization?.confirmed !== true) {
        throw Object.assign(failure('Security Testing needs your confirmation that you are authorized to test this non-production environment.'), { code: 'AUTHORIZATION_REQUIRED' });
      }
      state.authorization = {
        by: String(actor ?? 'This PC').slice(0, 200),
        at: new Date().toISOString(),
        reference: String(securityAuthorization.reference ?? '').trim().slice(0, 300) || null,
        scope: (() => {
          try {
            return new URL(project.url).origin;
          } catch {
            return project.url;
          }
        })(),
        environment: project.environment,
      };
    }
  }
  return type;
}

/** The outputs of stages 3–6 that belong to one testing type (stage 7/8 reports and the defect register stay). */
const TYPED_OUTPUTS = [['qa/03-test-plan', '03-test-plan'], ['qa/04-exploratory', '04-exploratory'], ['qa/05-healing', '05-healing'], ['tests/e2e', 'tests-e2e']];

/**
 * Move one testing type's plans, results, healing log and specs to qa/archive/<type>-<time>/ (outside
 * tests/, so Playwright never lists them). The knowledge base, page objects, executions and the
 * defect register are kept. Returns the archive path, or null when there was nothing to move.
 */
function archiveTypedOutputs(id, fromType) {
  const W = workspaceDir(id);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const rel = `qa/archive/${fromType ?? 'full-coverage'}-${stamp}`;
  let moved = 0;
  for (const [from, to] of TYPED_OUTPUTS) {
    const src = join(W, from);
    if (!existsSync(src) || !readdirSync(src).length) continue;
    mkdirSync(join(W, rel), { recursive: true });
    try {
      renameSync(src, join(W, rel, to));
      moved += 1;
    } catch (e) {
      throw failure(['EPERM', 'EBUSY', 'EACCES'].includes(e.code)
        ? `Could not archive ${from}: a file in it is open in another program (an editor, a terminal, a running test). Close it and start again.`
        : `Could not archive ${from}: ${e.message}`);
    }
  }
  ensureWorkspace(id); // recreates tests/e2e and the other folders the stages expect
  return moved ? rel : null;
}

/** Switch a run to another testing type: stages 1–2 are kept, stages 3–8 run again for the new type. */
function switchTestingType(state, wanted) {
  const from = state.testingType ?? null;
  const archive = archiveTypedOutputs(state.projectId, from);
  for (const s of state.stages.slice(2)) {
    Object.assign(s, { status: 'waiting', error: null, warning: null, resumable: false, sessionId: null, counts: {}, files: [], result: null });
    clearCheckpoint(workspaceDir(state.projectId), s.n);
  }
  state.testingType = wanted;
  state.authorization = null; // a Security authorization belongs to the run it was given for
  state.switches = [...(state.switches ?? []), { at: Date.now(), from, to: wanted, archive }].slice(-20);
  Object.assign(state, { status: 'idle', current: null, endedAt: null });
  return archive;
}

export function startPipeline(id, { pauseForReview, switchTestingType: confirmSwitch, securityAuthorization, actor } = {}, apiBase) {
  if (running.has(id)) throw failure('This project\'s pipeline is already running.');
  requireProject(id);
  const state = loadState(id);
  if (typeof pauseForReview === 'boolean') state.pauseForReview = pauseForReview;
  const wanted = projectView(id)?.testingType ?? null;
  if (state.stages.some((s) => s.status !== 'waiting') && (state.testingType ?? null) !== wanted) {
    // The project's testing type was changed after this pipeline ran: the switch re-runs stages
    // 3–8 for the new type, so the user confirms it first.
    if (confirmSwitch !== true) {
      throw Object.assign(failure(`This pipeline ran as ${labelOf(state.testingType ?? null)}, and the project is now ${labelOf(wanted)}. Starting switches it: stages 3–8 run again for ${labelOf(wanted)}, their current outputs move to qa/archive/, and the knowledge base, executions and defect register are kept.`), { code: 'TESTING_TYPE_CHANGED', detail: { from: state.testingType ?? null, to: wanted } });
    }
    // everything the new type needs (availability, environment, authorization) is checked before
    // anything is archived
    typeForRun(id, freshState(id), { securityAuthorization, actor });
    switchTestingType(state, wanted);
    state.testingType = typeForRun(id, state, { securityAuthorization, actor });
    // With review on, the switched run stops at the knowledge-base review before stage 3, so the
    // modules for the new type can be chosen there (stage 2 already passed and would be skipped).
    const kb = state.stages[1];
    if (state.pauseForReview && kb.status === 'passed') {
      kb.status = 'review';
      Object.assign(state, { status: 'paused', current: 2 });
      publish(state);
      return view(state);
    }
  } else state.testingType = typeForRun(id, state, { securityAuthorization, actor });
  // Even when every stage shows "passed", Start re-validates them all: a stage that passed on a
  // weaker check (or whose files were removed since) resumes; if all still hold, the run completes
  // at once without running any agent.
  // a stage that failed or stopped (or was interrupted) resumes rather than starting over
  for (const s of state.stages) if (RESUMABLE.has(s.status) && s.attempt > 0) s.resumable = true;
  // from stage 1: passed stages are re-validated (cheap) and skipped while their outputs hold
  drive(state, 1, apiBase).catch((e) => console.error('pipeline', e));
  return view(state);
}

/** A fresh run of everything: earlier outputs stay on disk; the agents overwrite them. */
export function restartPipeline(id, opts, apiBase) {
  if (running.has(id)) throw failure('This project\'s pipeline is already running.');
  requireProject(id);
  const prev = loadState(id);
  // a restart is a new run: a fresh authorization for Security Testing
  const state = freshState(id);
  state.testingType = typeForRun(id, state, opts ?? {});
  // a restart under another type must not leave the old type's plans and specs mixed in
  if ((prev.testingType ?? null) !== state.testingType && prev.stages.slice(2).some((s) => s.status !== 'waiting')) {
    const archive = archiveTypedOutputs(id, prev.testingType ?? null);
    if (archive) state.switches = [...(prev.switches ?? []), { at: Date.now(), from: prev.testingType ?? null, to: state.testingType, archive }].slice(-20);
  }
  state.pauseForReview = typeof opts?.pauseForReview === 'boolean' ? opts.pauseForReview : prev.pauseForReview;
  for (const s of state.stages) {
    s.attempt = prev.stages[s.n - 1]?.attempt ?? 0; // keep attempt numbers unique for logs
    s.history = prev.stages[s.n - 1]?.history ?? [];
    clearCheckpoint(workspaceDir(id), s.n); // a restart is a fresh run: no resuming
  }
  drive(state, 1, apiBase).catch((e) => console.error('pipeline', e));
  return view(state);
}

export function stopPipeline(id) {
  if (!running.has(id)) throw failure('This project\'s pipeline is not running.');
  running.get(id).abort.abort();
}

/**
 * Retry one stage. A stage that failed, stopped or was interrupted resumes from its checkpoint and
 * saved session; a passed (or reviewed, or skipped) stage, or `fresh`, runs again from scratch.
 * Only this stage and the ones after it are affected; earlier stages are kept.
 */
export function retryStage(id, n, apiBase, { fresh = false } = {}) {
  if (running.has(id)) throw failure('This project\'s pipeline is already running.');
  const state = requireProject(id);
  const s = state.stages[n - 1];
  if (!s) throw failure('Unknown stage', 404);
  s.resumable = !fresh && RESUMABLE.has(s.status) && s.attempt > 0;
  if (!s.resumable) s.sessionId = null;
  const W = workspaceDir(id);
  for (const later of state.stages.slice(n - 1)) {
    if (later.n > n) {
      // a retried stage invalidates everything after it, including their progress records
      Object.assign(later, { resumable: false, sessionId: null });
      clearCheckpoint(W, later.n);
    }
    if (later.status !== 'waiting') Object.assign(later, { status: 'waiting', warning: null, ...(later.n > n || !s.resumable ? { error: null } : {}) });
  }
  drive(state, n, apiBase).catch((e) => console.error('pipeline', e));
  return view(state);
}

export function skipStage(id, n) {
  if (running.has(id)) throw failure('Stop the pipeline before skipping a stage.');
  const state = requireProject(id);
  const s = state.stages[n - 1];
  if (!s) throw failure('Unknown stage', 404);
  if (s.status === 'passed') throw failure('This stage has passed; there is nothing to skip.');
  Object.assign(s, { status: 'skipped', warning: 'Skipped by the user: later stages run without this stage\'s outputs and may fail or be incomplete.', endedAt: Date.now() });
  if (state.status === 'paused' && state.current === n) state.status = 'idle';
  publish(state);
  return view(state);
}

export function approveStage(id, n, apiBase) {
  if (running.has(id)) throw failure('This project\'s pipeline is already running.');
  const state = requireProject(id);
  const s = state.stages[n - 1];
  if (!s || s.status !== 'review') throw failure('This stage is not waiting for review.');
  s.status = 'passed';
  drive(state, n + 1, apiBase).catch((e) => console.error('pipeline', e));
  return view(state);
}

export function setReview(id, pauseForReview) {
  const state = running.get(id)?.state ?? requireProject(id);
  state.pauseForReview = Boolean(pauseForReview);
  publish(state);
  return view(state);
}

// ── stage files: view, and edit while a stage waits for review ──────────────
const READABLE = /^(qa|tests|src|specs)\//;
export function readStageFile(id, path) {
  if (!isProjectId(id)) throw failure('Unknown project', 404);
  const rel = String(path ?? '').replace(/\\/g, '/');
  if (!READABLE.test(rel) || rel.includes('..') || /(^|\/)\.env/.test(rel)) throw failure('That file is not part of the pipeline outputs.', 403);
  const abs = join(workspaceDir(id), rel);
  if (!existsSync(abs)) throw failure('No such file', 404);
  const size = statSync(abs).size;
  return { path: rel, abs, size };
}

export function writeStageFile(id, path, content) {
  const { path: rel, abs } = readStageFile(id, path);
  const state = requireProject(id);
  const reviewing = state.stages.find((s) => s.status === 'review');
  const def = reviewing && stageOf(state, reviewing.n);
  if (!def || !def.outputs.some((o) => rel.startsWith(`${o}/`))) throw failure('Files can only be edited while their stage is waiting for your review.');
  if (!/\.(md|json|csv|txt)$/.test(rel)) throw failure('Only text outputs (.md, .json, .csv, .txt) can be edited here.');
  if (rel.endsWith('.json')) JSON.parse(content); // refuse a broken JSON before it breaks the next stage
  writeFileSync(abs, content);
  return { path: rel, size: Buffer.byteLength(content) };
}
