/**
 * Starts and watches executions. A module is its spec file run by Playwright Test, in its project's
 * workspace, on every browser of that project. One execution at a time per project, so runs never
 * compete for the application under test or its test accounts; different projects (different
 * applications and accounts) run independently. Results arrive from
 * dashboard/reporter/reporter.mjs through an events file.
 */
import { execFile, spawn } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT, counts, finished, storeFor } from './store.mjs';
import { projectConfig } from './project.mjs';
import { projectIds, workspaceDir } from './workspace.mjs';

/** Browser versions of the installed Playwright (playwright-core/browsers.json). */
const BROWSER_VERSIONS = (() => {
  try {
    const file = createRequire(import.meta.url).resolve('playwright-core/browsers.json');
    return Object.fromEntries(JSON.parse(readFileSync(file, 'utf8')).browsers.map((x) => [x.name, x.browserVersion ?? null]));
  } catch {
    return {};
  }
})();

// Outside dashboard/server on purpose: Playwright loads it on every run, and the API must never
// restart (or reload) because a run touched one of its own files.
const REPORTER = join(ROOT, 'dashboard', 'reporter', 'reporter.mjs');
const POLL_MS = 250;
const LOG_LINES = 600;
/** Windows exit codes that mean the test process (or a browser) could not start: environment, not tests. */
const EXIT_CODES = {
  3221225794: 'The test process could not start: Windows error 0xC0000142 (DLL initialization failed). This is an environment problem, usually too many processes open on the PC (desktop heap exhausted). Close unused dashboards, browsers and terminals and run again.',
  3221225781: 'The test process could not start: Windows error 0xC0000135 (a required DLL was not found). Install the Microsoft Visual C++ 2015-2022 Redistributable (x64).',
  3221225477: 'The test process crashed: Windows error 0xC0000005 (access violation).',
};

/** Set by the pipeline self-test only: run this config instead of the real runner. */
const TEST_CONFIG = process.env.TESTNOVA_TEST_CONFIG;

const current = new Map(); // project id -> the execution running now
const regressions = new Map(); // project id -> the regression running now
const listeners = new Set();
const regressionListeners = new Set();
export const onRunChange = (fn) => listeners.add(fn);
export const onRegressionChange = (fn) => regressionListeners.add(fn);
export const activeRun = (pid) => current.get(pid)?.run ?? null;
export const activeRegression = (pid) => regressions.get(pid) ?? null;

const publishRegression = (rg) => {
  storeFor(rg.projectId).saveRegression(rg);
  for (const fn of regressionListeners) fn(rg);
};

const publish = (state) => {
  state.run.counts = counts(state.run);
  for (const fn of listeners) fn(state.run);
};

const stamp = (d) => d.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const stripTags = (title) => title.replace(/\s*@[\w-]+(?:\s+[A-Z]+(?:-[A-Z]+)*-\d+)?/g, '').replace(/\s+/g, ' ').trim();
const failure = (message, status) => Object.assign(new Error(message), { status });

/** --grep is a regular expression: escape the title so it selects exactly one test. */
const titlePattern = (title) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── re-runs that carry results (stage 6 healing, "re-run failed") ───────────
const TC_ID = /\b(TC-(?:[A-Z0-9]+-)+[A-Z]?\d+[a-z]?)\b/;
const generatedId = (id) => !id || /-U\d{2,}$/.test(id) || id === 'Unlisted';
/** The same test in two lists: by TC id (it survives tag edits), else by its title without tags. */
const sameTest = (a, b) => (!generatedId(a.id) && a.id === b.id) || stripTags(a.title) === stripTags(b.title);

/** Newest modification time of the code every spec shares: src/ and playwright.config.ts. */
function sharedCodeAt(ws) {
  let newest = 0;
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  walk(join(ws, 'src'));
  const config = join(ws, 'playwright.config.ts');
  return existsSync(config) ? Math.max(newest, statSync(config).mtimeMs) : newest;
}

/**
 * A spec split into its test blocks and everything else. A block runs from a `test(...)` line to the
 * next test, describe, hook or `test.use` line; the rest (imports, describes, hooks) is `shared`.
 * Blank lines and indentation are ignored, so only real edits count as changes.
 */
export function specBlocks(text) {
  const START = /^\s*test(?:\.(?:only|skip|fixme|fail|slow))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
  const BOUNDARY = /^\s*test\.(?:describe|beforeEach|afterEach|beforeAll|afterAll|use)\b/;
  const blocks = [];
  const shared = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const m = raw.match(START);
    if (m) {
      cur = { title: m[2], id: m[2].match(TC_ID)?.[1] ?? null, lines: [] };
      blocks.push(cur);
    } else if (BOUNDARY.test(raw)) cur = null;
    if (!line) continue;
    (cur ? cur.lines : shared).push(line);
  }
  return { shared: shared.join('\n'), blocks: blocks.map((b) => ({ title: b.title, id: b.id, text: b.lines.join('\n') })) };
}

/** The block a test comes from: by TC id, else by title (a templated title matches as a pattern). */
function blockOf(spec, test) {
  if (!generatedId(test.id)) {
    const byId = spec.blocks.filter((b) => b.id === test.id);
    if (byId.length === 1) return byId[0];
  }
  const want = stripTags(test.title);
  return spec.blocks.find((b) => {
    const title = stripTags(b.title);
    if (!title.includes('${')) return title === want;
    const re = new RegExp(`^${title.split(/\$\{[^}]*\}/).map(titlePattern).join('.*')}$`);
    return re.test(want);
  }) ?? null;
}

const USABLE = new Set(['passed', 'failed', 'skipped']);

/**
 * What a re-run of `module` must execute, and what it may carry from the module's last full
 * execution. A carried result is only kept when nothing it depends on changed since that execution
 * started: not the shared code, not the spec's shared part, not its own test block. Anything else is
 * re-run. Returns { full: reason } when the whole module must run instead.
 */
export function planRerun(pid, module, rerun) {
  const store = storeFor(pid);
  const ws = workspaceDir(pid);
  const executed = (r) => r.status !== 'error' && r.tests.some((t) => t.status === 'passed' || t.status === 'failed');
  const base = store.allRuns().find((r) => r.moduleId === module.id && r.scope === 'module' && finished(r) && executed(r));
  if (!base) return { full: 'There is no earlier full execution of this module to carry results from.' };
  const snapshot = join(store.runDir(base.id), 'spec-snapshot.ts');
  if (!existsSync(snapshot)) return { full: `${base.id} was recorded before re-runs were supported (no spec snapshot).`, base: base.id };
  if (sharedCodeAt(ws) > base.startedAt) return { full: `Shared code (src/ page objects, components, fixtures, data, or playwright.config.ts) changed after ${base.id} started, so none of its results can be carried.`, base: base.id };
  const before = specBlocks(readFileSync(snapshot, 'utf8'));
  const now = specBlocks(readFileSync(join(ws, module.spec), 'utf8'));
  if (before.shared !== now.shared) return { full: `The spec's shared part (imports, describe blocks, hooks) changed after ${base.id}.`, base: base.id };

  const run = new Set();
  const why = {};
  const mark = (t, reason) => {
    if (run.has(t.key)) return;
    run.add(t.key);
    why[t.key] = reason;
  };
  for (const t of module.tests) {
    const a = blockOf(now, t);
    const b = blockOf(before, t);
    const prev = base.tests.find((x) => sameTest(x, t));
    if (!a || !b || a.text !== b.text) mark(t, 'its test code changed');
    else if (!prev || !USABLE.has(prev.status)) mark(t, `no result in ${base.id}`);
  }
  const asked = rerun === 'failed'
    ? module.tests.filter((t) => base.tests.some((x) => x.status === 'failed' && sameTest(x, t)))
    : module.tests.filter((t) => (Array.isArray(rerun) ? rerun : []).includes(t.key));
  if (Array.isArray(rerun) && asked.length !== rerun.length) throw failure('Unknown test in "rerun".', 404);
  for (const t of asked) mark(t, rerun === 'failed' ? `failed in ${base.id}` : 'requested');
  if (!run.size) throw failure(`Nothing to re-run: ${base.id} has no failed test, and no test changed since.`, 409);
  if (run.size === module.tests.length) return { full: 'Every test needs to run again.', base: base.id };
  return { base, keys: run, why };
}

/** Copy a carried test's evidence into this execution, renumbered so it cannot clash with new files. */
function carryEvidence(store, fromRun, toRun, test, n) {
  const dir = join(store.runDir(toRun), 'evidence');
  mkdirSync(dir, { recursive: true });
  return (test.evidence ?? []).flatMap((e) => {
    const from = join(store.runDir(fromRun), 'evidence', e.file);
    if (!existsSync(from)) return [];
    // reporter names: [<browser>-]<index>-<retry>-<attachment>-<name>; index 9000+ is never used by a run
    const file = /^(?:[a-z]+-)?\d+-/.test(e.file) ? e.file.replace(/^((?:[a-z]+-)?)\d+-/, `$1${9000 + n}-`) : `c${n}-${e.file}`;
    copyFileSync(from, join(dir, file));
    return [{ ...e, file }];
  });
}

/**
 * "Device" on the web: the browsers and environment of the project, and whether its application
 * answers. Cached briefly per project: the dashboard asks on every refresh.
 */
const probes = new Map();
export async function deviceStatus(pid) {
  const project = projectConfig(pid);
  if (!project) return { online: false, id: null, detail: 'No project configured. Create one on the Setup screen.' };
  const id = `${project.browsers.join(', ')} · ${project.environment}`;
  const probe = probes.get(pid) ?? { at: 0, value: null };
  if (probe.value && probe.value.id === id && probe.url === project.url && Date.now() - probe.at < 15_000) return probe.value;
  let online = false;
  let detail = '';
  try {
    const res = await fetch(project.url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    online = res.status < 500;
    detail = online ? '' : `${project.url} answered HTTP ${res.status}`;
  } catch (e) {
    detail = `${project.url} is not reachable (${e.cause?.code ?? e.name})`;
  }
  probes.set(pid, { at: Date.now(), url: project.url, value: { online, id, detail } });
  return probes.get(pid).value;
}

/** A test's status across browsers: failed if any browser failed, else the best result. */
const RANK = { failed: 5, running: 4, passed: 3, blocked: 2, skipped: 1, notrun: 0, pending: 0 };
function overall(byBrowser) {
  const all = Object.values(byBrowser);
  if (all.includes('running')) return 'running';
  if (all.includes('failed')) return 'failed';
  return all.sort((a, b) => RANK[b] - RANK[a])[0] ?? 'pending';
}

/** A catalogue row for an event: the exact title, else the TC id, else a new row for this run. */
function rowFor(run, rawTitle) {
  const title = stripTags(rawTitle);
  const tcId = title.match(/\b(TC-(?:[A-Z0-9]+-)+[A-Z]?\d+[a-z]?)\b/)?.[1];
  let row = run.tests.find((t) => t.eventTitle === title) ?? run.tests.find((t) => t.title === title);
  if (!row && tcId) row = run.tests.find((t) => t.id === tcId && !t.eventTitle);
  if (!row) {
    row = { key: `extra:${title}`, id: tcId ?? 'Unlisted', title, scenario: title, description: '', priority: null, expectedResult: null, knownDefect: null, status: 'pending' };
    run.tests.push(row);
  }
  row.eventTitle = title;
  delete row.carriedFrom; // this execution ran it: its result is fresh
  return row;
}

function apply(run, e) {
  if (e.type === 'begin') run.scheduled = e.total;
  if (e.type === 'error') run.errors.push(e.message);
  if (e.type === 'testBegin') {
    const row = rowFor(run, e.title);
    row.browsers = { ...(row.browsers ?? {}), [e.project ?? 'default']: 'running' };
    row.status = 'running';
    row.startedAt ??= e.at;
    row.retry = e.retry;
    run.currentKey = row.key;
  }
  if (e.type === 'testEnd') {
    const row = rowFor(run, e.title);
    // Anything skipped because it is parked on an open question is Blocked, not merely Skipped.
    const blocked = e.status === 'skipped' && /\bblocked\b/i.test(`${e.skipReason ?? ''} ${row.title}`);
    row.browsers = { ...(row.browsers ?? {}), [e.project ?? 'default']: blocked ? 'blocked' : e.status };
    row.status = overall(row.browsers);
    row.durationMs = (row.durationMs ?? 0) + e.durationMs;
    row.retry = e.retry;
    row.skipReason = e.skipReason;
    // keep the first browser's failure; a later passing browser does not erase it
    if (e.failure) row.failure = { ...e.failure, browser: e.project ?? null };
    else if (row.status !== 'failed') row.failure = null;
    row.steps = e.steps;
    row.evidence = [...(row.evidence ?? []), ...e.evidence.map((x) => ({ ...x, browser: e.project ?? null }))];
    if (run.currentKey === row.key) run.currentKey = null;
  }
}

// ── browser lanes ───────────────────────────────────────────────────────────
/**
 * An execution runs each browser of the project as its own Playwright process, in parallel: a
 * "lane". Lanes have their own events file and output folder, and prefix their evidence, so they
 * never overwrite each other. A browser that cannot launch on this PC is found by a quick preflight
 * and marked unavailable with the fix, instead of failing every test (Firefox without the VC++
 * runtime did exactly that); the other browsers still run and report.
 */
const LANE_WORKERS = Math.max(1, Number(process.env.TESTNOVA_LANE_WORKERS ?? 1));
const MAX_LANES = Math.max(1, Number(process.env.TESTNOVA_MAX_LANES ?? 3));
const ANSI = /\u001b\[[0-9;]*m/g;

/** Successful launches are remembered for a while; a failure is checked again on every run. */
const launchedAt = new Map();
async function launchProblem(browser) {
  if (Date.now() - (launchedAt.get(browser) ?? 0) < 10 * 60_000) return null;
  try {
    const pw = await import('playwright');
    if (!pw[browser]?.launch) return `${browser}: not a Playwright browser.`;
    const b = await pw[browser].launch({ headless: true, timeout: 45_000 });
    await b.close();
    launchedAt.set(browser, Date.now());
    return null;
  } catch (e) {
    return launchReason(browser, e.message);
  }
}

export function launchReason(browser, message) {
  const text = String(message ?? '').replace(ANSI, '');
  const libs = (text.match(/missing libraries:\s*([\s\S]*?)(?:\n\s*\n|$)/i)?.[1] ?? '').split(/\s+/).filter((l) => /\.(dll|so[\d.]*)$/i.test(l));
  if (libs.length) return `${browser} cannot launch on this PC: missing ${libs.join(', ')}.${libs.some((l) => /^(msvcp|vcruntime)/i.test(l)) ? ' Install the Microsoft Visual C++ 2015-2022 Redistributable (x64), then run again.' : ''}`;
  if (/Executable doesn't exist|playwright install/i.test(text)) return `${browser} is not installed. Run: npx playwright install ${browser}`;
  return `${browser} cannot launch: ${text.split('\n').find((l) => l.trim())?.trim().slice(0, 220) ?? 'unknown error'}`;
}

/** Per-browser counts from the test rows. */
/** A lane's totals. `freshOnly`: only tests this execution ran, not results carried from an earlier one. */
function laneCounts(run, browser, freshOnly = false) {
  const c = { passed: 0, failed: 0, skipped: 0, blocked: 0, notrun: 0 };
  for (const t of run.tests) {
    if (freshOnly && t.carriedFrom) continue;
    const s = t.browsers?.[browser];
    if (s && s in c) c[s] += 1;
  }
  return c;
}

function drainLane(state, lane) {
  if (!existsSync(lane.events)) return 0;
  const size = statSync(lane.events).size;
  if (size <= lane.offset) return 0;
  const buffer = Buffer.alloc(size - lane.offset);
  const fd = openSync(lane.events, 'r');
  readSync(fd, buffer, 0, buffer.length, lane.offset);
  closeSync(fd);
  const lines = (lane.partial + buffer.toString('utf8')).split('\n');
  lane.offset = size;
  lane.partial = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.type === 'begin') {
      lane.total = e.total;
      state.run.scheduled = state.lanes.reduce((n, l) => n + (l.total ?? 0), 0);
      continue;
    }
    if (e.type === 'error') {
      state.run.errors.push(state.lanes.length > 1 ? `[${lane.browser}] ${e.message}` : e.message);
      continue;
    }
    apply(state.run, lane.browser === 'default' ? e : { ...e, project: e.project ?? lane.browser });
  }
  return lines.length;
}

function drain(state) {
  let n = 0;
  for (const lane of state.lanes) n += drainLane(state, lane);
  if (n) {
    for (const l of state.run.lanes ?? []) if (l.status === 'running') Object.assign(l, laneCounts(state.run, l.browser));
    publish(state);
  }
}

function startLane(state, lane) {
  const { run } = state;
  const info = run.lanes.find((l) => l.browser === lane.browser);
  writeFileSync(lane.events, '');
  const args = [...state.baseArgs, ...(lane.browser === 'default' ? [] : [`--project=${lane.browser}`, `--output=${join(state.ws, 'test-results', lane.browser)}`])];
  Object.assign(info, { status: 'running', startedAt: Date.now() });
  lane.child = spawn(process.execPath, args, {
    // the project's own workspace: its config, page objects, .env and test-results
    cwd: state.ws,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      TESTNOVA_EVENTS: lane.events,
      TESTNOVA_EVIDENCE: state.evidence,
      TESTNOVA_EVIDENCE_PREFIX: lane.browser === 'default' ? '' : `${lane.browser}-`,
      TESTNOVA_RUN_ID: run.id,
      TESTNOVA_LANE: lane.browser,
      ...(lane.browser === 'default' ? {} : { TESTNOVA_WORKERS: String(LANE_WORKERS) }),
      // one test run from its row keeps trace and video even when it passes
      ...(run.target ? { TESTNOVA_EVIDENCE_MODE: 'on' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk) => lane.log.push(...chunk.toString().replace(ANSI, '').split(/\r?\n/));
  lane.child.stdout.on('data', collect);
  lane.child.stderr.on('data', collect);
  lane.child.on('error', (e) => {
    lane.log.push(e.message);
    laneEnded(state, lane, 1);
  });
  lane.child.on('close', (code) => laneEnded(state, lane, code));
}

function laneEnded(state, lane, code) {
  if (lane.done) return;
  lane.done = true;
  lane.exitCode = code;
  drainLane(state, lane);
  const info = state.run.lanes.find((l) => l.browser === lane.browser);
  const c = laneCounts(state.run, lane.browser);
  // whether this lane ran anything is judged on its own tests: carried results ran earlier
  const own = laneCounts(state.run, lane.browser, true);
  const executed = own.passed + own.failed;
  let status;
  let reason = null;
  if (state.stopped) status = 'stopped';
  else if (!executed && code !== 0) {
    status = 'error';
    const at = lane.log.findIndex((l) => /browserType\.launch|Host system is missing|Executable doesn't exist/i.test(l));
    reason = at >= 0 ? launchReason(lane.browser, lane.log.slice(at).join('\n')) : EXIT_CODES[code] ?? (lane.log.filter((l) => l.trim()).slice(-6).join('\n') || `exit code ${code}`);
    state.run.errors.push(state.lanes.length > 1 ? `[${lane.browser}] ${reason}` : reason);
  } else if (!executed) status = 'skipped';
  else status = c.failed ? 'failed' : 'passed';
  Object.assign(info, c, { status, reason, exitCode: code, endedAt: Date.now() });
  nextLanes(state);
}

/** Start queued lanes up to the limit; finish the execution when every lane is done. */
function nextLanes(state) {
  const live = state.lanes.filter((l) => l.child && !l.done).length;
  const queued = state.lanes.filter((l) => !l.child && !l.done);
  if (state.stopped) {
    for (const l of queued) {
      l.done = true;
      Object.assign(state.run.lanes.find((x) => x.browser === l.browser), { status: 'stopped', endedAt: Date.now() });
    }
  } else for (const l of queued.slice(0, Math.max(0, MAX_LANES - live))) startLane(state, l);
  if (state.lanes.every((l) => l.done)) finish(state);
  else publish(state);
}

function finish(state) {
  if (state.finished) return;
  state.finished = true;
  clearInterval(state.timer);
  drain(state);
  const { run } = state;
  for (const t of run.tests) if (t.status === 'pending' || t.status === 'running') t.status = 'notrun';
  run.currentKey = null;
  run.endedAt = Date.now();
  run.durationMs = run.endedAt - run.startedAt;
  const codes = state.lanes.map((l) => l.exitCode).filter((c) => c != null);
  run.exitCode = codes.find((c) => c !== 0) ?? (codes.length ? 0 : 1);
  const logs = state.lanes.flatMap((l) => (state.lanes.length > 1 ? [`── ${l.browser} ──`, ...l.log] : l.log));
  run.log = logs.slice(-LOG_LINES);
  const c = counts(run);
  // a re-run that could not execute is an error even though its carried results look fine
  const own = counts({ tests: run.tests.filter((t) => !t.carriedFrom) });
  const executed = own.passed + own.failed;
  const preconditionFailed = logs.some((l) => /failed: .* is not run/.test(l));
  if (state.stopped) run.status = 'stopped';
  else if (preconditionFailed || (!executed && run.exitCode !== 0)) run.status = 'error';
  else if (!executed) run.status = 'skipped';
  else run.status = c.failed ? 'failed' : 'passed';
  if (run.status === 'error') {
    run.errors = run.errors.filter((e) => String(e ?? '').trim());
    if (!run.errors.length) run.errors.push(logs.filter((l) => l.trim()).slice(-14).join('\n'));
    if (!run.errors.some((e) => String(e).trim())) run.errors = [`The test process ended with exit code ${run.exitCode} before running any test, and printed nothing.`];
  }
  run.counts = counts(run); // the file on disk must hold the final counts, not the last mid-run ones
  storeFor(run.projectId).saveRun(run);
  current.delete(run.projectId);
  publish(state);
  if (run.regressionId && regressions.get(run.projectId)?.id === run.regressionId) moduleFinished(run);
}

/** Preflight the browsers, then start the lanes. Runs after startRun has returned the execution. */
async function launchLanes(state, browsers) {
  const { run } = state;
  if (browsers[0] !== 'default') {
    const problems = await Promise.all(browsers.map((b) => launchProblem(b)));
    browsers.forEach((b, i) => {
      if (!problems[i]) return;
      state.lanes.find((l) => l.browser === b).done = true;
      Object.assign(run.lanes.find((l) => l.browser === b), { status: 'unavailable', reason: problems[i], endedAt: Date.now() });
      run.errors.push(`[${b}] ${problems[i]}`);
      // not run in this browser: it neither passes nor fails the test
      for (const t of run.tests) if (t.status === 'pending') t.browsers = { ...(t.browsers ?? {}), [b]: 'notrun' };
    });
  }
  nextLanes(state);
}

export function stopRun(projectId, id) {
  const state = current.get(projectId);
  if (!state || state.run.id !== id) throw failure('That execution is not running', 409);
  state.stopped = true;
  const live = state.lanes.filter((l) => l.child && !l.done);
  for (const l of live) {
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(l.child.pid), '/T', '/F'], () => {});
    else l.child.kill('SIGTERM');
  }
  if (!live.length) nextLanes(state); // still in preflight, or nothing started: end now
}

export function startRun(pid, moduleId, testKey, regressionId = null, { rerun = null } = {}) {
  const store = storeFor(pid);
  const busy = current.get(pid);
  if (busy) throw failure(`${busy.run.moduleName} is already running. TestNova runs one execution at a time per project.`, 409);
  const rg = regressions.get(pid);
  if (rg && rg.id !== regressionId) throw failure('A full regression is running for this project. TestNova runs one execution at a time per project.', 409);
  const module = store.findModule(moduleId);
  if (!module) throw failure('Unknown module', 404);
  if (!module.spec) throw failure(`${module.name} has no spec file yet (tests/e2e/NN-${module.id}.spec.ts). Stage 5 of the AI Pipeline writes it.`, 409);
  const project = projectConfig(pid);
  if (!project) throw failure('No project is configured. Create one on the Setup screen first.', 409);
  const target = testKey ? module.tests.find((t) => t.key === testKey) : null;
  if (testKey && !target) throw failure('Unknown test', 404);
  if (rerun && rerun !== 'failed' && !Array.isArray(rerun)) throw failure('"rerun" is "failed" or a list of test keys.', 400);
  // a re-run that may carry results; { full } means the whole module has to run
  const plan = rerun && !target && !TEST_CONFIG ? planRerun(pid, module, rerun) : null;
  const carry = plan?.keys ? plan : null;

  const now = new Date();
  let id = `EX-${stamp(now)}`;
  // Two executions can start within one second (a module that cannot start, then the next).
  for (let n = 2; existsSync(store.runDir(id)); n += 1) id = `EX-${stamp(now)}-${n}`;
  const run = {
    id,
    projectId: pid,
    projectName: project.name,
    moduleId,
    moduleName: module.name,
    scope: target ? 'test' : 'module',
    target: target ? { key: target.key, id: target.id, title: target.title } : null,
    regressionId,
    status: 'running',
    startedAt: now.getTime(),
    endedAt: null,
    durationMs: null,
    build: store.appBuild(),
    device: `${project.browsers.join(', ')} · ${project.environment}`,
    url: project.url,
    scheduled: null,
    currentKey: null,
    errors: [],
    ...(plan ? { rerun: carry
      ? { requested: rerun, base: carry.base.id, ran: module.tests.filter((t) => carry.keys.has(t.key)).map((t) => ({ key: t.key, id: t.id, why: carry.why[t.key] })), carried: module.tests.length - carry.keys.size }
      : { requested: rerun, base: plan.base ?? null, full: plan.full } } : {}),
    tests: module.tests.map((t) => {
      const row = {
        key: t.key, id: t.id, title: t.title, scenario: t.scenario, description: t.description,
        priority: t.priority, expectedResult: t.expected, knownDefect: t.knownDefect,
        status: !target || t.key === target.key ? 'pending' : 'notrun',
      };
      if (!carry || carry.keys.has(t.key)) return row;
      // carried: the earlier result, still valid for this code (planRerun checked), with where it ran
      const prev = carry.base.tests.find((x) => sameTest(x, t));
      return { ...prev, ...row, status: prev.status, carriedFrom: prev.carriedFrom ?? carry.base.id };
    }),
  };
  store.saveRun(run);

  const ws = workspaceDir(pid);
  if (!TEST_CONFIG) {
    // what this execution ran, so a later re-run can tell which test blocks changed since
    try {
      copyFileSync(join(ws, module.spec), join(store.runDir(id), 'spec-snapshot.ts'));
    } catch {
      // without a snapshot a later re-run simply runs the whole module
    }
  }
  if (carry) {
    let n = 0;
    for (const t of run.tests) if (t.carriedFrom) t.evidence = carryEvidence(store, carry.base.id, id, t, (n += 1));
    store.saveRun(run);
  }
  const reporter = `--reporter=list,${REPORTER}`;
  const pick = carry ? module.tests.filter((t) => carry.keys.has(t.key)).map((t) => (t.idGenerated ? titlePattern(t.title) : `${titlePattern(t.id)}(?![\\w-])`)) : [];
  const grep = target ? ['--grep', titlePattern(target.title)] : carry ? ['--grep', pick.join('|')] : [];
  const cli = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const baseArgs = TEST_CONFIG ? [cli, 'test', '-c', TEST_CONFIG, reporter, ...grep] : [cli, 'test', '-c', join(ws, 'playwright.config.ts'), module.spec, reporter, ...grep];
  // one lane per browser, run in parallel (the self-test config runs as a single lane)
  const browsers = TEST_CONFIG ? ['default'] : project.browsers;
  // each lane records the browser build Playwright runs, so reports can name the version tested
  run.lanes = browsers.map((browser) => ({ browser, version: BROWSER_VERSIONS[browser] ?? null, status: 'pending', reason: null, passed: 0, failed: 0, skipped: 0, blocked: 0, notrun: 0, exitCode: null, startedAt: null, endedAt: null }));
  const state = {
    run, ws, baseArgs, evidence: join(store.runDir(id), 'evidence'), stopped: false, finished: false, timer: null,
    lanes: browsers.map((browser) => ({ browser, events: join(store.runDir(id), browsers.length > 1 || browser !== 'default' ? `events-${browser}.jsonl` : 'events.jsonl'), offset: 0, partial: '', log: [], child: null, done: false, exitCode: null, total: 0 })),
  };
  state.timer = setInterval(() => drain(state), POLL_MS);
  current.set(pid, state);
  publish(state);
  launchLanes(state, browsers).catch((e) => {
    run.errors.push(`Could not start the browsers: ${e.message}`);
    for (const l of state.lanes) l.done = true;
    finish(state);
  });
  return run;
}

// ── full regression ─────────────────────────────────────────────────────────
/**
 * Every module in the knowledge base's run order, one execution each. A failed module does not stop
 * the regression; an unreachable application does, since nothing after it could run either.
 */
export async function startRegression(pid) {
  const store = storeFor(pid);
  const busy = () => current.has(pid) || regressions.has(pid);
  if (busy()) throw failure('An execution is already running for this project. TestNova runs one execution at a time per project.', 409);
  const device = await deviceStatus(pid);
  if (!device.online) throw failure(device.detail || 'The application is not reachable, so a regression cannot start.', 409);
  if (busy()) throw failure('An execution is already running for this project. TestNova runs one execution at a time per project.', 409);
  const now = new Date();
  const regression = {
    id: `RG-${stamp(now)}`,
    projectId: pid,
    status: 'running',
    startedAt: now.getTime(),
    endedAt: null,
    build: store.appBuild(),
    device: device.id,
    index: 0,
    stopped: false,
    note: null,
    modules: [...store.catalogue().modules]
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ moduleId: m.id, name: m.name, runId: null, status: 'pending' })),
  };
  regressions.set(pid, regression);
  nextModule(pid);
  return regression;
}

function nextModule(pid) {
  const rg = regressions.get(pid);
  if (rg.stopped || rg.index >= rg.modules.length) return endRegression(pid);
  const slot = rg.modules[rg.index];
  try {
    const run = startRun(pid, slot.moduleId, undefined, rg.id);
    slot.runId = run.id;
    slot.status = 'running';
    return publishRegression(rg);
  } catch (e) {
    slot.status = 'error';
    slot.error = e.message;
    rg.index += 1;
    return nextModule(pid);
  }
}

async function moduleFinished(run) {
  const pid = run.projectId;
  const rg = regressions.get(pid);
  const slot = rg.modules[rg.index];
  slot.status = run.status;
  rg.index += 1;
  // A module that could not run while the application is unreachable: the rest cannot run either.
  if (run.status === 'error' && !rg.stopped) {
    const device = await deviceStatus(pid);
    if (!device.online) {
      rg.stopped = true;
      rg.note = 'The application stopped answering, so the remaining modules were not run.';
    }
  }
  publishRegression(rg);
  setImmediate(() => nextModule(pid));
}

function endRegression(pid) {
  const rg = regressions.get(pid);
  for (const slot of rg.modules) if (slot.status === 'pending') slot.status = 'notrun';
  rg.endedAt = Date.now();
  const outcomes = rg.modules.map((m) => m.status);
  if (rg.stopped) rg.status = rg.note ? 'error' : 'stopped';
  else if (outcomes.some((s) => s === 'failed' || s === 'error')) rg.status = 'failed';
  else rg.status = 'passed';
  rg.index = rg.modules.length;
  publishRegression(rg);
  regressions.delete(pid);
}

export function stopRegression(pid, id) {
  const rg = regressions.get(pid);
  if (!rg || rg.id !== id) throw failure('That regression is not running', 409);
  rg.stopped = true;
  publishRegression(rg);
  const state = current.get(pid);
  if (state) stopRun(pid, state.run.id);
}

/** An execution left "running" on disk belonged to a server that has since stopped. */
export function recoverInterrupted() {
  for (const pid of projectIds()) recoverProject(storeFor(pid));
}

function recoverProject({ allRegressions, allRuns, saveRegression, saveRun }) {
  for (const rg of allRegressions()) {
    if (rg.status !== 'running') continue;
    for (const slot of rg.modules) if (slot.status === 'pending' || slot.status === 'running') slot.status = 'notrun';
    rg.status = 'error';
    rg.endedAt = Date.now();
    rg.note = 'The TestNova server stopped during this regression, so the remaining modules have no result.';
    saveRegression(rg);
  }
  for (const run of allRuns()) {
    if (run.status !== 'running') continue;
    for (const t of run.tests) if (t.status === 'pending' || t.status === 'running') t.status = 'notrun';
    run.status = 'error';
    run.currentKey = null;
    run.endedAt = Date.now();
    run.durationMs = run.endedAt - run.startedAt;
    run.errors.push('The TestNova server stopped during this execution, so its remaining tests have no result.');
    saveRun(run);
  }
}
