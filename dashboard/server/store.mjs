/**
 * What TestNova remembers, per project: one folder per execution under projects/<id>/data/runs/,
 * its regressions, and its defects. Defects are read from the project's own QA records
 * (qa/06-report/*-defects.json); anything changed from the dashboard goes in data/defects.json
 * alongside them, so those records are never rewritten. `storeFor(pid)` gives one project's store;
 * nothing in it can see another project's files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readCatalogue } from './catalogue.mjs';
import { projectConfig } from './project.mjs';
import { ROOT, workspaceDir } from './workspace.mjs';

export { ROOT };
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

/** The defect life cycle every report and the dashboard use. "New" in older records reads as Open. */
export const DEFECT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Retest', 'Closed', 'Reopened'];
/** Still to be dealt with: counted as outstanding everywhere. */
export const OPEN_STATUSES = new Set(['Open', 'In Progress', 'Retest', 'Reopened']);
/** Defect fields people fill in after the analysis (the dashboard and the defect register). */
export const DEFECT_FIELDS = ['store', 'instance', 'developer', 'resolvedDate', 'devComment', 'qaComment', 'changes', 'priority', 'severity', 'type'];
/** An id in the provisional or the register scheme: BUG-001, DEF-001, TN-DEF-001. */
const DEFECT_ID = /\b(?:[A-Z]+-)*[A-Z]+-\d+\b/g;
export const testRef = (moduleId, testId) => `${moduleId}|${testId}`;

export function counts(run) {
  const c = { total: run.tests.length, passed: 0, failed: 0, skipped: 0, blocked: 0, notrun: 0, pending: 0, running: 0 };
  for (const t of run.tests) c[t.status] += 1;
  return c;
}

export const finished = (run) => run.status !== 'running';

const stores = new Map();
/** Drop a deleted project's cached store. */
export const forgetStore = (pid) => stores.delete(pid);
/** One project's store (cached). */
export function storeFor(pid) {
  if (!pid) throw Object.assign(new Error('No project selected. Create one on the Setup screen.'), { status: 409 });
  if (!stores.has(pid)) stores.set(pid, createStore(pid));
  return stores.get(pid);
}

function createStore(pid) {
const WS = workspaceDir(pid);
// TESTNOVA_DATA (self-tests) moves every project's data under <TESTNOVA_DATA>/<id>.
const DATA = process.env.TESTNOVA_DATA ? join(process.env.TESTNOVA_DATA, pid) : join(WS, 'data');
const RUNS = join(DATA, 'runs');
const REGRESSIONS = join(DATA, 'regressions');
const OVERLAY = join(DATA, 'defects.json');
const REPORTS = join(WS, 'qa', '06-report');
// TestNova's defects come from stage 7's qa/06-report/<project>-defects.json (its .xlsx is
// generated from the same data), so no hand-kept tracker workbook.
const DEFECT_SHEET = null;

mkdirSync(RUNS, { recursive: true });
mkdirSync(REPORTS, { recursive: true });
mkdirSync(REGRESSIONS, { recursive: true });

// ── catalogue ───────────────────────────────────────────────────────────────
const catalogue = () => readCatalogue(pid);
const findModule = (id) => catalogue().modules.find((m) => m.id === id);

/** "Build" on the dashboard is the environment under test (web apps rarely expose a build number). */
function appBuild() {
  const p = projectConfig(pid);
  return { version: p?.environment ?? null, code: null };
}

// ── executions ──────────────────────────────────────────────────────────────
const runFile = (id) => join(RUNS, id, 'run.json');
const runDir = (id) => join(RUNS, id);

function saveRun(run) {
  mkdirSync(runDir(run.id), { recursive: true });
  writeFileSync(runFile(run.id), JSON.stringify(run, null, 1));
}

function getRun(id) {
  if (!/^EX-[\w-]+$/.test(id) || !existsSync(runFile(id))) return null;
  return JSON.parse(readFileSync(runFile(id), 'utf8'));
}

/** Every execution, newest first (run ids sort by time). */
function allRuns(moduleId) {
  const runs = readdirSync(RUNS).sort().reverse().map(getRun).filter(Boolean);
  return moduleId ? runs.filter((r) => r.moduleId === moduleId) : runs;
}

// ── regressions: the modules run in order, one execution each ───────────────
function saveRegression(regression) {
  writeFileSync(join(REGRESSIONS, `${regression.id}.json`), JSON.stringify(regression, null, 1));
}

function getRegression(id) {
  const file = join(REGRESSIONS, `${id}.json`);
  if (!/^RG-[\w-]+$/.test(id) || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every regression, newest first. */
const allRegressions = () =>
  readdirSync(REGRESSIONS).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => getRegression(f.slice(0, -5))).filter(Boolean);

function defectIdsOf(run, defects = defectBook()) {
  // unique defects: one defect hit by several tests counts once; a test may hit several defects
  const entryOf = (t) => findModule(run.moduleId)?.tests.find((c) => c.key === t.key) ?? null;
  const ids = run.tests.filter((t) => t.status === 'failed').flatMap((t) => defects.linksFor(run.moduleId, t, entryOf(t)).ids);
  return [...new Set(ids)];
}

function summary(run, defects = defectBook()) {
  const { tests: _tests, log: _log, ...rest } = run;
  return { ...rest, counts: counts(run), defects: defectIdsOf(run, defects) };
}

// ── defects ─────────────────────────────────────────────────────────────────
function readOverlay() {
  const o = existsSync(OVERLAY) ? JSON.parse(readFileSync(OVERLAY, 'utf8')) : {};
  return { created: [], status: {}, links: {}, fields: {}, history: {}, ...o };
}
const writeOverlay = (overlay) => writeFileSync(OVERLAY, JSON.stringify(overlay, null, 1));

/**
 * The record's wording in the six standard states. Wording that does not map (Deferred, Rejected,
 * Not a defect…) returns null: the reports show it as recorded and flag it, never guess a state.
 */
function normaliseStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('reopen')) return 'Reopened';
  if (s.startsWith('new') || s.startsWith('open') || s.startsWith('assigned')) return 'Open';
  if (s.startsWith('in progress') || s.startsWith('in-progress')) return 'In Progress';
  if (s.startsWith('retest') || s.startsWith('ready for qa') || s.startsWith('ready for retest')) return 'Retest';
  if (s.startsWith('resolved') || s.startsWith('fixed')) return 'Resolved';
  if (s.startsWith('closed') || s.startsWith('verified')) return 'Closed';
  return null;
}

/**
 * The other ids a defect is known by: its own `aliases`, else the provisional ids its record
 * names ("Provisional BUG-001; …"), as stage 7 writes when a stage 4 finding becomes a DEF.
 */
function aliasesOf(d) {
  if (Array.isArray(d.aliases)) return d.aliases.map(String);
  const text = `${d.title ?? ''} ${d.description ?? ''}`;
  return [...new Set(text.match(DEFECT_ID) ?? [])].filter((x) => x !== d.id && /^BUG-\d+$/.test(x));
}

let sheetCache = { mtime: 0, rows: [] };
async function sheetDefects() {
  if (!DEFECT_SHEET || !existsSync(DEFECT_SHEET)) return [];
  const mtime = statSync(DEFECT_SHEET).mtimeMs;
  if (mtime === sheetCache.mtime) return sheetCache.rows;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DEFECT_SHEET);
  const sheet = wb.worksheets[0];
  const text = (v) => (v == null ? '' : typeof v === 'object' ? (v.text ?? v.result ?? (v.richText ?? []).map((r) => r.text).join('')) : String(v)).trim();
  const header = sheet.getRow(1).values.map(text);
  const col = (name) => header.indexOf(name);
  const rows = [];
  sheet.eachRow((row, i) => {
    const id = text(row.values[col('Defect ID')]);
    if (i === 1 || !id) return;
    rows.push({
      id,
      title: text(row.values[col('Title')]),
      module: text(row.values[col('Module')]),
      status: text(row.values[col('Status')]),
      priority: text(row.values[col('Priority')]),
      severity: text(row.values[col('Severity')]),
    });
  });
  sheetCache = { mtime, rows };
  return rows;
}

/** Tracker records in reading order: the JSON files, then the workbook, which is the live sheet. */
let tracker = new Map();
async function refreshDefects() {
  const merged = new Map();
  for (const f of readdirSync(REPORTS).filter((name) => name.endsWith('defects.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(REPORTS, f), 'utf8'));
    } catch (e) {
      console.warn(`defects file ${f} not read: ${e.message}`);
      continue;
    }
    // stage 7 writes { defects: [...] }; a bare array is accepted too
    for (const d of Array.isArray(parsed) ? parsed : (parsed.defects ?? [])) merged.set(d.id, { ...d, source: f });
  }
  try {
    for (const d of await sheetDefects()) merged.set(d.id, { ...merged.get(d.id), ...d, source: 'Defect Sheet' });
  } catch (e) {
    console.warn(`defect sheet not read: ${e.message}`);
  }
  tracker = merged;
}

/**
 * Every defect of the project, as one book: stage 7's records, defects created on the dashboard,
 * and what people changed since (status with its history, assignee, comments, resolution).
 * A defect is found by its own id or by any id it was known by before (BUG-016 → DEF-008), so
 * a test tagged with the provisional id still reaches the one register entry.
 */
function defectBook() {
  const overlay = readOverlay();
  const view = (d) => {
    const fields = overlay.fields[d.id] ?? {};
    const raw = overlay.status[d.id] ?? d.status ?? null;
    return {
      id: d.id,
      aliases: aliasesOf(d),
      title: d.title ?? '',
      module: d.module ?? '',
      // as recorded; the report maps them to P0-P3 / Critical-Low and says when it did
      priority: fields.priority ?? d.priority ?? '',
      severity: fields.severity ?? d.severity ?? '',
      classifiedBy: fields.priority || fields.severity ? 'QA' : d.priority || d.severity ? (d.source === 'TestNova' ? 'QA' : 'Defect analysis') : null,
      type: fields.type ?? d.type ?? '',
      classification: d.classification ?? null,
      signal: d.signal ?? null,
      source: d.source ?? 'TestNova',
      trackerStatus: d.status ?? null,
      status: normaliseStatus(raw),
      // the wording as recorded: a change made on the dashboard, else the record's own status
      statusLabel: raw ?? 'Open',
      history: overlay.history[d.id] ?? [],
      date: d.date ?? d.createdAt?.slice(0, 10) ?? null,
      store: fields.store ?? d.store ?? '',
      instance: fields.instance ?? d.instance ?? '',
      description: d.description ?? '',
      testData: d.testData ?? '',
      steps: d.steps ?? [],
      expected: d.expected ?? '',
      actual: d.actual ?? '',
      evidence: d.evidence ?? [],
      tests: d.tests ?? [],
      executions: d.executions ?? (d.runId ? [d.runId] : []),
      developer: fields.developer ?? d.developer ?? '',
      resolvedDate: fields.resolvedDate ?? d.resolvedDate ?? '',
      devComment: fields.devComment ?? d.devComment ?? '',
      qaComment: fields.qaComment ?? d.qaComment ?? '',
      changes: fields.changes ?? d.changes ?? '',
    };
  };
  const records = [...tracker.values(), ...overlay.created];
  const byId = new Map(records.map((d) => [d.id, view(d)]));
  // alias -> every register id claiming it (more than one is a duplicate to review)
  const claims = new Map();
  for (const d of byId.values()) for (const a of d.aliases) if (!byId.has(a)) claims.set(a, [...(claims.get(a) ?? []), d.id]);
  const resolve = (id) => (byId.has(id) ? id : claims.get(id)?.[0] ?? null);
  const missing = (id) => ({ id, missing: true, aliases: [], title: '', module: '', priority: '', severity: '', classifiedBy: null, type: '', source: 'Not in the defect records', trackerStatus: null, status: null, statusLabel: 'Not in the defect records', history: [], date: null, store: '', instance: '', description: '', testData: '', steps: [], expected: '', actual: '', evidence: [], tests: [], executions: [], developer: '', resolvedDate: '', devComment: '', qaComment: '', changes: '' });
  const get = (id) => byId.get(resolve(id)) ?? missing(id);
  const tagsOf = (test) => String(test?.knownDefect ?? '').split(/[\s,;]+/).filter((x) => x && x !== 'UNTRACKED');

  /**
   * Every defect a test is linked to, the primary one first: a link made on the dashboard, else
   * the tag in the spec (resolved through aliases), plus every record that lists the test.
   * `unresolved` are tags no register entry knows.
   */
  function linksFor(moduleId, test, entry = null) {
    const manual = overlay.links[testRef(moduleId, test.id)];
    const tags = [...new Set([...tagsOf(entry), ...tagsOf(test)])];
    const ids = [];
    const unresolved = [];
    // how each link was made: 'manual' (dashboard), 'tag' (the spec names it), 'record' (the
    // defect record lists the test: it hit the defect, which may not be why its check failed)
    const basis = {};
    const add = (id, how) => {
      if (!ids.includes(id)) {
        ids.push(id);
        basis[id] = how;
      }
    };
    if (manual) add(resolve(manual) ?? manual, 'manual');
    for (const t of tags) {
      // a provisional id split into several register defects links the test to each of them
      const all = byId.has(t) ? [t] : claims.get(t) ?? [];
      if (all.length) for (const r of all) add(r, 'tag');
      else unresolved.push(t);
    }
    for (const d of byId.values()) if (d.tests.includes(test.id)) add(d.id, 'record');
    return { ids, basis, tags, unresolved, manual: manual ?? null };
  }

  return {
    all: () => [...byId.values()],
    get,
    resolve,
    claims: () => claims,
    linksFor,
    /** The primary defect of a test, or null. */
    forTest(moduleId, test, entry) {
      const id = linksFor(moduleId, test, entry).ids[0];
      return id ? get(id) : null;
    },
  };
}

function createDefect({ moduleId, testId, title, description, priority, severity, runId }) {
  const overlay = readOverlay();
  const run = runId ? getRun(runId) : null;
  const result = run?.tests.find((t) => t.id === testId);
  const plan = findModule(moduleId)?.tests.find((t) => t.id === testId);
  const defect = {
    // the register's own scheme: the next DEF number after every id the project already has
    id: `DEF-${String(1 + Math.max(0, ...defectBook().all().map((d) => Number(d.id.match(/^DEF-(\d+)$/)?.[1] ?? 0)))).padStart(3, '0')}`,
    title, description, priority, severity,
    module: findModule(moduleId)?.name ?? moduleId,
    date: new Date().toISOString().slice(0, 10),
    tests: testId ? [testId] : [],
    // what the defect sheet's "Test Data / Required Info" and "Screenshot / STR" columns show
    testData: [plan?.testData && `Test data: ${plan.testData}`, run && `Browser: ${run.device}`, run?.url && `URL: ${run.url}`].filter(Boolean).join('\n'),
    steps: plan?.steps ? plan.steps.split('\n') : [],
    expected: result?.failure?.expected ?? plan?.expected ?? '',
    actual: result?.failure?.actual ?? result?.failure?.reason ?? '',
    evidence: (result?.evidence ?? []).filter((e) => e.contentType?.startsWith('image/')).map((e) => `data/runs/${runId}/evidence/${e.file}`),
    status: 'Open', source: 'TestNova', runId, createdAt: new Date().toISOString(),
  };
  overlay.created.push(defect);
  if (testId) overlay.links[testRef(moduleId, testId)] = defect.id;
  writeOverlay(overlay);
  return defect;
}

function linkDefect(moduleId, testId, defectId) {
  const overlay = readOverlay();
  overlay.links[testRef(moduleId, testId)] = defectId;
  writeOverlay(overlay);
}

/** A status change, kept with who made it and when, so the history survives every report. */
function setDefectStatus(id, status, by = 'This PC', note = '') {
  if (!DEFECT_STATUSES.includes(status)) throw Object.assign(new Error(`Status must be one of ${DEFECT_STATUSES.join(', ')}.`), { status: 400 });
  const overlay = readOverlay();
  const before = defectBook().get(id);
  overlay.status[id] = status;
  overlay.history[id] = [...(overlay.history[id] ?? []), { at: new Date().toISOString(), from: before.statusLabel ?? null, to: status, by, ...(note ? { note } : {}) }];
  // the date a defect was resolved is recorded when it is, unless someone has already entered one
  if (status === 'Resolved' && !overlay.fields[id]?.resolvedDate) overlay.fields[id] = { ...overlay.fields[id], resolvedDate: new Date().toISOString().slice(0, 10) };
  writeOverlay(overlay);
}

/** Assignee, comments, resolution and classification, as people enter them. Empty clears a field. */
function setDefectFields(id, fields, by = 'This PC') {
  const overlay = readOverlay();
  const current = { ...(overlay.fields[id] ?? {}) };
  const changed = [];
  for (const key of DEFECT_FIELDS) {
    if (!(key in fields)) continue;
    const value = String(fields[key] ?? '').trim().slice(0, 4000);
    if ((current[key] ?? '') === value) continue;
    if (value) current[key] = value;
    else delete current[key];
    changed.push(key);
  }
  overlay.fields[id] = current;
  if (changed.length) overlay.history[id] = [...(overlay.history[id] ?? []), { at: new Date().toISOString(), fields: changed, by }];
  writeOverlay(overlay);
  return changed;
}

// ── the module page ─────────────────────────────────────────────────────────
/**
 * Each test's status is what it last actually did: the newest finished execution that reached it.
 * A test no execution has reached is Not Run. Nothing is carried over from anywhere else.
 */
function moduleView(id, active) {
  const module = findModule(id);
  if (!module) return null;
  const defects = defectBook();
  const runs = allRuns(id);
  const done = runs.filter(finished);
  const tests = module.tests.map((t) => {
    const last = done.map((run) => ({ run, row: run.tests.find((r) => r.key === t.key && r.id === t.id) })).find(({ row }) => row && row.status !== 'notrun');
    return {
      ...t,
      status: last?.row.status ?? 'notrun',
      runId: last?.run.id ?? null,
      lastAt: last?.row.startedAt ?? null,
      durationMs: last?.row.durationMs ?? null,
      defect: defects.forTest(id, t),
    };
  });
  const linked = new Map();
  for (const t of tests) if (t.defect) linked.set(t.defect.id, t.defect);
  const { tests: _all, ...info } = module;
  return { module: { ...info, total: tests.length }, tests, runs: runs.map((r) => summary(r, defects)), defects: [...linked.values()], active: active?.moduleId === id ? active : null };
}

// ── the main dashboard ──────────────────────────────────────────────────────
/** The dashboard charts four states; a skipped test was not executed, so it counts as Not executed. */
const CHART_STATUS = { passed: 'passed', failed: 'failed', blocked: 'blocked' };
const chartStatus = (s) => CHART_STATUS[s] ?? 'notrun';
const zero = () => ({ passed: 0, failed: 0, blocked: 0, notrun: 0 });
const OPEN_DEFECT = OPEN_STATUSES;
const TREND_POINTS = 40;

const passRate = (c) => (c.passed + c.failed ? (c.passed / (c.passed + c.failed)) * 100 : null);

/**
 * Every figure on the main dashboard, from stored executions only. A test's state is what the
 * newest finished execution that reached it recorded (as on a module page); the trend replays
 * the executions in order, one bar per execution, each showing the whole suite right after it.
 */
function dashboardView() {
  const defects = defectBook();
  const cat = catalogue();
  const done = allRuns().filter(finished).reverse(); // oldest first
  const state = new Map(); // `${moduleId}|${key}` -> { status, durationMs, run }
  const ref = (moduleId, key) => `${moduleId}|${key}`;
  const total = cat.modules.reduce((n, m) => n + m.tests.length, 0);
  const prevByModule = new Map(); // moduleId -> pass rate before its latest execution

  const snapshot = (moduleIds) => {
    const c = zero();
    for (const m of cat.modules) {
      if (moduleIds && !moduleIds.includes(m.id)) continue;
      for (const t of m.tests) c[chartStatus(state.get(ref(m.id, t.key))?.status)] += 1;
    }
    return c;
  };

  const trend = [];
  for (const [i, run] of done.entries()) {
    const module = cat.modules.find((m) => m.id === run.moduleId);
    if (!module) continue;
    const before = passRate(snapshot([module.id]));
    let reached = false;
    for (const t of module.tests) {
      const row = run.tests.find((r) => r.key === t.key && r.id === t.id);
      if (!row || row.status === 'notrun') continue;
      state.set(ref(module.id, t.key), { status: row.status, durationMs: row.durationMs ?? 0, run });
      reached = true;
    }
    if (reached) prevByModule.set(module.id, before);
    // A regression's module executions make one bar, placed where its last one ends.
    if (run.regressionId && done[i + 1]?.regressionId === run.regressionId) continue;
    trend.push({
      runId: run.regressionId ?? run.id, status: run.status, module: run.regressionId ? 'Full regression' : run.moduleName,
      build: run.build?.version ?? '', at: run.endedAt ?? run.startedAt, counts: snapshot(),
    });
  }

  const causes = { app: 0, script: 0, env: 0, data: 0, known: 0, triage: 0 };
  const modules = cat.modules.map((m) => {
    const counts = zero();
    let durationMs = 0;
    let lastRun = null;
    for (const t of m.tests) {
      const s = state.get(ref(m.id, t.key));
      counts[chartStatus(s?.status)] += 1;
      if (!s) continue;
      durationMs += s.durationMs;
      lastRun = Math.max(lastRun ?? 0, s.run.endedAt ?? s.run.startedAt);
      if (s.status === 'failed') causes[defects.forTest(m.id, t) ? 'known' : 'triage'] += 1;
    }
    return {
      id: m.id, order: m.order, name: m.name, icon: m.icon, spec: m.spec, total: m.tests.length,
      counts, passRate: passRate(counts), prevPassRate: prevByModule.get(m.id) ?? null, lastRun, durationMs,
    };
  });

  const latest = done.at(-1) ?? null;
  const four = (tests) => {
    const c = zero();
    for (const t of tests) c[chartStatus(t.status)] += 1;
    return c;
  };
  let run = null;
  const regression = latest?.regressionId ? getRegression(latest.regressionId) : null;
  if (regression && regression.status !== 'running') {
    // The latest result came from a full regression: summarise the regression as a whole.
    const runsOf = (rg) => rg.modules.map((m) => m.runId && getRun(m.runId)).filter(Boolean);
    const prev = allRegressions().find((rg) => rg.id < regression.id && rg.status !== 'running') ?? null;
    const executed = runsOf(regression);
    run = {
      runId: regression.id, status: regression.status, moduleId: null, module: 'All modules', scope: 'regression', target: null,
      build: regression.build?.version ?? null, buildCode: regression.build?.code ?? null, device: executed[0]?.device ?? null,
      startedAt: regression.startedAt, endedAt: regression.endedAt ?? regression.startedAt,
      counts: four(executed.flatMap((r) => r.tests)), prevCounts: prev ? four(runsOf(prev).flatMap((r) => r.tests)) : null,
      prevRunId: prev?.id ?? null, defects: new Set(executed.flatMap((r) => defectIdsOf(r, defects))).size,
      modulesRun: executed.filter((r) => r.tests.some((t) => t.status !== 'notrun')).length, modulesTotal: regression.modules.length,
    };
  } else if (latest) {
    const same = (r) => r.moduleId === latest.moduleId && r.scope === latest.scope && r.target?.key === latest.target?.key;
    const prev = done.slice(0, -1).reverse().find(same) ?? null;
    run = {
      runId: latest.id, status: latest.status, moduleId: latest.moduleId, module: latest.moduleName, scope: latest.scope,
      target: latest.target?.id ?? null, build: latest.build?.version ?? null, buildCode: latest.build?.code ?? null,
      device: latest.device, startedAt: latest.startedAt, endedAt: latest.endedAt ?? latest.startedAt,
      counts: four(latest.tests), prevCounts: prev ? four(prev.tests) : null, prevRunId: prev?.id ?? null,
      defects: defectIdsOf(latest, defects).length,
    };
  }

  return {
    sample: false,
    build: appBuild(),
    total,
    executions: done.length,
    modules,
    trend: trend.slice(-TREND_POINTS),
    causes,
    run,
    openDefects: defects.all().filter((d) => OPEN_DEFECT.has(d.status)).length,
    unsetDefects: defects.all().filter((d) => !d.status).length,
  };
}

// ── the regression page ─────────────────────────────────────────────────────
/** One test as the regression page shows it: its status, why it failed, and its defect. */
function regressionTest(moduleId, t, defects) {
  const failed = t.status === 'failed';
  const defect = failed ? defects.forTest(moduleId, t, findModule(moduleId)?.tests.find((c) => c.key === t.key)) : null;
  return {
    key: t.key, id: t.id, title: t.title, scenario: t.scenario ?? t.title, priority: t.priority ?? null,
    knownDefect: t.knownDefect ?? null, status: t.status, startedAt: t.startedAt ?? null, durationMs: t.durationMs ?? null,
    skipReason: t.skipReason ?? null,
    failure: failed && t.failure ? { reason: t.failure.reason, message: t.failure.message, expected: t.failure.expected, actual: t.failure.actual } : null,
    defect: defect && { id: defect.id, title: defect.title, status: defect.status, source: defect.source },
  };
}

/**
 * A regression with every module's tests. A module that has started shows its execution (the live
 * one for the module running now); one still to come lists its catalogue tests as Pending, or
 * Not Run once the regression has ended without reaching it.
 */
function regressionView(id, active) {
  const rg = getRegression(id);
  if (!rg) return null;
  const defects = defectBook();
  const cat = catalogue();
  const modules = rg.modules.map((slot) => {
    const m = cat.modules.find((x) => x.id === slot.moduleId);
    const run = slot.runId ? (active?.id === slot.runId ? active : getRun(slot.runId)) : null;
    const waiting = slot.status === 'pending' ? 'pending' : 'notrun';
    const tests = run
      ? run.tests.map((t) => regressionTest(slot.moduleId, t, defects))
      : (m?.tests ?? []).map((t) => regressionTest(slot.moduleId, { ...t, status: waiting }, defects));
    return {
      ...slot, icon: m?.icon ?? null, startedAt: run?.startedAt ?? null, endedAt: run?.endedAt ?? null,
      currentKey: run?.currentKey ?? null, errors: run?.errors ?? [], tests,
    };
  });
  return { ...rg, modules, total: modules.reduce((n, m) => n + m.tests.length, 0) };
}

return {
  pid, RUNS,
  catalogue, findModule, appBuild, runDir, saveRun, getRun, allRuns, saveRegression, getRegression, allRegressions, defectIdsOf, summary, refreshDefects, defectBook, createDefect, linkDefect, setDefectStatus, setDefectFields, moduleView, dashboardView, regressionView,
};
}
