/**
 * The QA report as data: one structured model that the dashboard's report page, the PDF, the
 * Excel workbook and pipeline stage 8 all read, so every figure is computed once and reads the
 * same everywhere. Presentation lives in reports.mjs (PDF, Excel) and the web app.
 *
 * Sources, and nothing else:
 *   - executions  projects/<id>/data/runs/<id>/run.json (each test's result and evidence)
 *   - test plan   the catalogue (test case titles, steps, test data, expected results)
 *   - defects     the defect book (stage 7's records + what people changed on the dashboard)
 *   - project     project.json (name, URL, environment)
 *
 * A figure no source records is shown as "Not Provided" / "Pending Update" / "Not recorded",
 * never estimated. Anything inconsistent goes into `validation`, never silently corrected.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { OPEN_STATUSES, DEFECT_STATUSES, counts as storedCounts, finished, storeFor } from './store.mjs';
import { projectConfig } from './project.mjs';
import { workspaceDir } from './workspace.mjs';
import { explainFailure, explainError } from './plain.mjs';
import { dmy, numbered } from './formats.mjs';

const require = createRequire(import.meta.url);

export const NOT_PROVIDED = 'Not Provided';
export const PENDING_UPDATE = 'Pending Update';
export const PENDING_CLASSIFICATION = 'Pending QA Classification';
export const NOT_LINKED = 'Defect Not Linked – Requires QA Investigation';
export const NO_EVIDENCE = 'Evidence Not Available';
export const NO_COVERAGE = 'Coverage Not Available';

export const PRIORITY_DEFINITIONS = [
  ['P0', 'Immediate attention required.'],
  ['P1', 'High priority; should be addressed before release.'],
  ['P2', 'Normal priority; should be addressed in the planned development cycle.'],
  ['P3', 'Low priority; minor improvement or cosmetic issue.'],
];
export const SEVERITY_DEFINITIONS = [
  ['Critical', 'Core application functionality is unavailable or a major business operation is blocked.'],
  ['High', 'Important functionality is significantly affected.'],
  ['Medium', 'Functionality is partially affected or a workaround exists.'],
  ['Low', 'Minor visual, usability, or cosmetic issue.'],
];
/** Older records use other scales; each value maps to exactly one standard level (shown in the report). */
const PRIORITY_MAP = { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3', critical: 'P0', blocker: 'P0', high: 'P1', medium: 'P2', normal: 'P2', low: 'P3' };
const SEVERITY_MAP = { critical: 'Critical', blocker: 'Critical', high: 'High', major: 'High', medium: 'Medium', minor: 'Medium', moderate: 'Medium', low: 'Low', trivial: 'Low', cosmetic: 'Low' };
export const SCALE_MAPPING = {
  priority: [['Critical / Blocker', 'P0'], ['High', 'P1'], ['Medium / Normal', 'P2'], ['Low', 'P3']],
  severity: [['Critical / Blocker', 'Critical'], ['High / Major', 'High'], ['Medium / Minor / Moderate', 'Medium'], ['Low / Trivial / Cosmetic', 'Low']],
};

const THEMES = [
  ['normal', 'Normal Theme'],
  ['dark', 'Dark Theme'],
  ['contrast', 'High Contrast Theme'],
  ['forced-colors', 'Forced Colors Mode'],
];

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const browserName = (b) => ({ chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' })[b] ?? b;

/** Standard level for a recorded priority / severity, and how it was arrived at. */
function classify(raw, map, by) {
  const value = String(raw ?? '').trim();
  if (!value) return { value: PENDING_CLASSIFICATION, recorded: null, standard: false, provisional: false, pending: true };
  const std = map[value.toLowerCase()];
  if (!std) return { value: PENDING_CLASSIFICATION, recorded: value, standard: false, provisional: false, pending: true, unknown: true };
  return { value: std, recorded: value, standard: std === value, provisional: by === 'Defect analysis', pending: false };
}

/** Browser versions Playwright ships (the ones the executions ran on, unless a lane recorded its own). */
function shippedVersions() {
  try {
    const file = require.resolve('playwright-core/browsers.json');
    const out = {};
    for (const b of JSON.parse(readFileSync(file, 'utf8')).browsers) out[b.name] = b.browserVersion ?? null;
    return out;
  } catch {
    return {};
  }
}

/** The stage 7 notes on failures that are not app defects (environment, script, test data). */
function notDefects(pid) {
  const dir = join(workspaceDir(pid), 'qa', '06-report');
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('defects.json'))) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const n of j.notDefects ?? []) out.push({ ...n, analysedAt: j.generatedAt ?? null });
    } catch {}
  }
  return out;
}

/** Raw defect records, to find ids recorded twice (the merged book keeps only the last one). */
function rawDefectIds(pid) {
  const dir = join(workspaceDir(pid), 'qa', '06-report');
  const seen = new Map();
  if (!existsSync(dir)) return seen;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('defects.json'))) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const d of Array.isArray(j) ? j : (j.defects ?? [])) if (d?.id) seen.set(d.id, [...(seen.get(d.id) ?? []), f]);
    } catch {}
  }
  const overlay = join(workspaceDir(pid), 'data', 'defects.json');
  try {
    for (const d of JSON.parse(readFileSync(overlay, 'utf8')).created ?? []) seen.set(d.id, [...(seen.get(d.id) ?? []), 'data/defects.json']);
  } catch {}
  return seen;
}

/**
 * Evidence files: "chromium-3-1-0-screenshot.png" is lane chromium, result 3, attempt 1 (a retry),
 * attachment 0. The caption says which test, which attempt and which browser.
 */
function attemptOf(file) {
  const m = String(file).match(/^(?:([a-z]+)-)?(\d+)-(\d+)-\d+-/);
  return m ? { browser: m[1] ?? null, attempt: Number(m[3]) } : { browser: null, attempt: 0 };
}

/**
 * Build the report. `runId` limits it to one execution (its module only); otherwise each module's
 * latest finished execution is used, preferring whole-module executions.
 */
export async function buildQaReport(pid, { runId = null, now = Date.now() } = {}) {
  const store = storeFor(pid);
  await store.refreshDefects();
  const book = store.defectBook();
  const cat = store.catalogue();
  const project = projectConfig(pid) ?? { id: pid, name: pid, url: null, environment: null, browsers: [] };
  const WS = workspaceDir(pid);
  const validation = [];
  const warn = (check, message, source, level = 'warning') => validation.push({ level, check, message, source });

  const moduleById = new Map(cat.modules.map((m) => [m.id, m]));
  const moduleNameOf = (id) => moduleById.get(id)?.name ?? cat.modules.find((m) => m.name === id)?.name ?? id;
  const moduleIdOf = (id) => (moduleById.has(id) ? id : cat.modules.find((m) => m.name === id)?.id ?? id);

  // ── which executions ─────────────────────────────────────────────────────
  const done = store.allRuns().filter(finished);
  let selected; // moduleId -> run | null
  if (runId) {
    const run = store.getRun(runId);
    if (!run) throw Object.assign(new Error('Unknown execution'), { status: 404 });
    if (!finished(run)) throw Object.assign(new Error('This execution has not finished.'), { status: 409 });
    selected = new Map([[run.moduleId, run]]);
  } else {
    selected = new Map(cat.modules.map((m) => [m.id, done.find((r) => r.moduleId === m.id && r.scope === 'module') ?? done.find((r) => r.moduleId === m.id) ?? null]));
  }
  const runs = [...selected.values()].filter(Boolean);
  const modulesInScope = runId ? cat.modules.filter((m) => selected.has(m.id)) : cat.modules;

  // ── evidence helpers ─────────────────────────────────────────────────────
  const evidenceFile = (run, e) => join(store.runDir(run.id), 'evidence', e.file);
  // records may annotate a path: "qa/04-exploratory/home-results.md (TC-HOME-013)"
  const recordPath = (raw) => {
    const p = String(raw).replace(/\s+\([^)]*\)\s*$/, '').trim();
    return [join(WS, p), join(WS, p.replace(/^dashboard\/data\//, 'data/'))].find((f) => existsSync(f)) ?? null;
  };
  /** Which test of which execution a recorded evidence path belongs to (for its caption). */
  const ownerOf = (p) => {
    const m = String(p).match(/runs\/(EX-[\w-]+)\/evidence\/([^/]+)$/);
    if (!m) return null;
    const run = store.getRun(m[1]);
    const test = run?.tests.find((t) => (t.evidence ?? []).some((e) => e.file === m[2]));
    return run ? { run, test } : null;
  };

  const figures = []; // every image the report shows, numbered once
  const figureByPath = new Map();
  const figure = (path, caption, context) => {
    if (figureByPath.has(path)) return figureByPath.get(path);
    const f = { n: figures.length + 1, path, caption, ...context };
    figures.push(f);
    figureByPath.set(path, f);
    return f;
  };
  const caption = ({ testId, testTitle, moduleName, runIdOf, browser, attempt, kind = 'Screenshot' }) =>
    `${kind} of ${testId}${testTitle ? ` (${testTitle})` : ''} in ${moduleName}, taken when the check failed${attempt ? ` on retry ${attempt}` : ' on the first attempt'}${browser ? `, ${browserName(browser)}` : ''}, execution ${runIdOf}.`;

  // ── test cases ───────────────────────────────────────────────────────────
  const STATUS = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', blocked: 'Skipped' };
  const testCases = [];
  const failures = [];
  const unresolvedTags = new Map(); // tag -> [test ids]
  const nd = notDefects(pid);

  for (const m of modulesInScope) {
    const run = selected.get(m.id) ?? null;
    if (run) {
      // the per-test results are the record; a stale stored summary is flagged, never used
      const real = storedCounts(run);
      const KEYS = ['passed', 'failed', 'skipped', 'blocked', 'notrun', 'pending', 'running'];
      const differ = run.counts ? KEYS.filter((k) => (run.counts[k] ?? 0) !== (real[k] ?? 0)) : [];
      if (differ.length) {
        const say = (c) => differ.map((k) => `${c[k] ?? 0} ${k === 'notrun' ? 'not run' : k}`).join(', ');
        warn('Stored totals', `Execution ${run.id} (${m.name}) stores a summary of ${say(run.counts)}, but its test results show ${say(real)}. The report uses the test results.`, `data/runs/${run.id}/run.json`);
      }
      for (const t of run.tests.filter((x) => ['running', 'pending'].includes(x.status))) {
        warn('Unfinished test result', `${t.id} in ${run.id} is recorded as "${t.status}" although the execution finished; it is reported as Not Executed.`, `data/runs/${run.id}/run.json`);
      }
      for (const lane of run.lanes ?? []) {
        if (run.lanes.length !== 1) break;
        if (lane.passed !== real.passed || lane.failed !== real.failed) warn('Browser totals', `Execution ${run.id}: the ${browserName(lane.browser)} totals (${lane.passed} passed, ${lane.failed} failed) differ from the test results (${real.passed} passed, ${real.failed} failed). The report uses the test results.`, `data/runs/${run.id}/run.json`);
      }
      const planned = new Set(m.tests.map((t) => t.key));
      const extra = run.tests.filter((t) => !planned.has(t.key) && !m.tests.some((c) => c.id === t.id));
      if (extra.length) warn('Coverage', `Execution ${run.id} contains ${extra.length} test(s) no longer in the test plan (${extra.slice(0, 5).map((t) => t.id).join(', ')}); they are not counted.`, `data/runs/${run.id}/run.json`, 'info');
    }

    for (const entry of m.tests) {
      const result = run?.tests.find((t) => t.key === entry.key) ?? run?.tests.find((t) => t.id === entry.id) ?? null;
      const status = result ? (STATUS[result.status] ?? 'Not Executed') : 'Not Executed';
      const tc = {
        key: entry.key, id: entry.id, moduleId: m.id, module: m.name, title: entry.scenario ?? entry.title, scenario: entry.planDescription || entry.description || entry.scenario || entry.title,
        priority: entry.priority ?? null, testData: entry.testData || NOT_PROVIDED, steps: entry.steps ? numbered(entry.steps) : NOT_PROVIDED,
        expected: entry.expected || result?.expectedResult || NOT_PROVIDED, created: entry.created ?? null,
        status, executionId: run?.id ?? null, durationMs: result?.durationMs ?? null,
        browsers: result?.browsers ?? null, skipReason: result?.skipReason ?? null, defectIds: [],
        actual: !result ? 'Not executed' : status === 'Passed' ? 'As expected' : status === 'Skipped' ? `Not executed${result.skipReason ? `: ${result.skipReason}` : ''}` : null,
      };
      if (status === 'Failed') {
        const links = book.linksFor(m.id, result, entry);
        for (const t of links.unresolved) unresolvedTags.set(t, [...(unresolvedTags.get(t) ?? []), entry.id]);
        const defects = links.ids.map((id) => book.get(id));
        const primary = defects[0] ?? null;
        const words = explainFailure({ test: { ...entry, expectedResult: result.expectedResult }, failure: result.failure, defect: primary, moduleName: m.name });
        tc.defectIds = links.ids;
        tc.actual = words.actual;
        // screenshots and recordings of this failure (the last attempt first: it is the one that counted)
        const files = (result.evidence ?? []).map((e) => ({ ...e, path: evidenceFile(run, e), ...attemptOf(e.file) }));
        const shots = files.filter((e) => e.contentType?.startsWith('image/')).sort((a, b) => b.attempt - a.attempt);
        const recordings = files.filter((e) => e.contentType?.startsWith('video/')).sort((a, b) => b.attempt - a.attempt);
        const evidence = [];
        const figured = new Set(); // one numbered figure per browser: the attempt that counted (the last)
        for (const s of shots) {
          if (!existsSync(s.path)) {
            warn('Evidence', `Screenshot ${s.file} of ${entry.id} (${run.id}) is listed but the file is missing.`, `data/runs/${run.id}/evidence`);
            continue;
          }
          const text = caption({ testId: entry.id, testTitle: tc.title, moduleName: m.name, runIdOf: run.id, browser: s.browser, attempt: s.attempt });
          const lane = s.browser ?? 'default';
          if (figured.has(lane)) {
            evidence.push({ kind: 'image', figure: null, caption: text, path: s.path, file: `data/runs/${run.id}/evidence/${s.file}` });
            continue;
          }
          figured.add(lane);
          const f = figure(s.path, text, { kind: 'image', contentType: s.contentType, testId: entry.id, runId: run.id, defectIds: links.ids, attempt: s.attempt });
          evidence.push({ kind: 'image', figure: f.n, caption: f.caption, path: s.path, file: `data/runs/${run.id}/evidence/${s.file}` });
        }
        for (const v of recordings) {
          if (!existsSync(v.path)) continue;
          evidence.push({ kind: 'video', caption: `Screen recording of ${entry.id}${v.attempt ? `, retry ${v.attempt}` : ', first attempt'}${v.browser ? `, ${browserName(v.browser)}` : ''} (execution ${run.id}).`, path: v.path, file: `data/runs/${run.id}/evidence/${v.file}` });
        }
        const trace = files.find((e) => e.name === 'trace' && existsSync(e.path));
        const analysis = nd.filter((n) => n.test === entry.id);
        failures.push({
          ...tc,
          simple: words.simple, expected: tc.expected !== NOT_PROVIDED ? tc.expected : words.expected ?? NOT_PROVIDED, actual: words.actual,
          impact: words.impact ?? 'To be assessed by QA.', impactBasis: words.impactBasis, technical: words.technical,
          defectNote: links.ids.length ? null : NOT_LINKED,
          defectLinks: links.ids.map((id) => ({ id, basis: links.basis[id], title: book.get(id).title, label: { manual: 'linked by QA', tag: 'named by the test', record: 'recorded by the defect analysis for this test' }[links.basis[id]] })),
          unresolvedTags: links.unresolved, manualLink: links.manual,
          retried: (result.retry ?? 0) > 0,
          evidence, trace: trace ? `data/runs/${run.id}/evidence/${trace.file}` : null,
          analysis: analysis.map((n) => `Defect analysis${n.analysedAt ? ` (${dmy(n.analysedAt)})` : ''} classified an earlier failure of this test as ${n.classification}: ${n.reason}`),
        });
      }
      testCases.push(tc);
    }
  }

  // ── modules ──────────────────────────────────────────────────────────────
  const modules = modulesInScope.map((m) => {
    const rows = testCases.filter((t) => t.moduleId === m.id);
    const run = selected.get(m.id) ?? null;
    const c = { total: rows.length, passed: 0, failed: 0, skipped: 0, notExecuted: 0 };
    for (const t of rows) c[{ Passed: 'passed', Failed: 'failed', Skipped: 'skipped' }[t.status] ?? 'notExecuted'] += 1;
    const defectIds = [...new Set(rows.flatMap((t) => t.defectIds))];
    const status = !run ? { label: 'Not Executed', tone: 'grey' }
      : c.failed ? { label: 'Failed', tone: 'red' }
        : c.notExecuted || c.skipped ? { label: 'Passed with gaps', tone: 'orange' }
          : { label: 'Passed', tone: 'green' };
    const types = {};
    for (const id of defectIds) {
      const t = book.get(id).type || 'Unclassified';
      types[t] = (types[t] ?? 0) + 1;
    }
    const executed = c.total - c.notExecuted - c.skipped;
    const explanation = !run
      ? `${m.name} has not been executed yet, so none of its ${c.total} test cases have a result.`
      : [
        `${executed} of ${c.total} test cases were executed: ${c.passed} passed and ${c.failed} failed.`,
        c.skipped ? `${c.skipped} ${c.skipped === 1 ? 'was' : 'were'} skipped.` : '',
        c.notExecuted ? `${c.notExecuted} ${c.notExecuted === 1 ? 'was' : 'were'} not executed.` : '',
        c.failed
          ? defectIds.length
            ? `The failures trace back to ${defectIds.length} unique defect${defectIds.length === 1 ? '' : 's'} (${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')}).`
            : 'None of the failures is linked to a defect yet; QA needs to investigate them.'
          : 'No problems were found in this module.',
        c.failed && rows.some((t) => t.status === 'Failed' && !t.defectIds.length) ? `${rows.filter((t) => t.status === 'Failed' && !t.defectIds.length).length} failure(s) are not yet linked to a defect.` : '',
      ].filter(Boolean).join(' ');
    return {
      id: m.id, name: m.name, executionId: run?.id ?? null, executedAt: run?.startedAt ?? null, endedAt: run?.endedAt ?? null, durationMs: run?.durationMs ?? null,
      browsers: (run?.lanes ?? []).map((l) => l.browser), ...c, passPct: pct(c.passed, c.total), failPct: pct(c.failed, c.total), defectIds, status, explanation,
    };
  });

  // ── totals (from the test cases themselves) ──────────────────────────────
  const totals = { modules: modules.length, modulesExecuted: modules.filter((m) => m.executionId).length, total: testCases.length, passed: 0, failed: 0, skipped: 0, notExecuted: 0 };
  for (const t of testCases) totals[{ Passed: 'passed', Failed: 'failed', Skipped: 'skipped' }[t.status] ?? 'notExecuted'] += 1;
  totals.passPct = pct(totals.passed, totals.total);
  totals.failPct = pct(totals.failed, totals.total);
  totals.executedPct = pct(totals.passed + totals.failed, totals.total);

  // check 1 and 2: the module rows add up to the overall figures, and each row adds up to its total
  for (const k of ['total', 'passed', 'failed', 'skipped', 'notExecuted']) {
    const sum = modules.reduce((n, m) => n + m[k], 0);
    if (sum !== totals[k]) warn('Totals', `Module ${k} figures add up to ${sum}, the overall figure is ${totals[k]}.`, 'report calculation', 'error');
  }
  for (const m of modules) if (m.passed + m.failed + m.skipped + m.notExecuted !== m.total) warn('Totals', `${m.name}: passed + failed + skipped + not executed (${m.passed + m.failed + m.skipped + m.notExecuted}) does not equal its ${m.total} test cases.`, 'report calculation', 'error');
  const catalogueTotal = modulesInScope.reduce((n, m) => n + m.tests.length, 0);
  if (catalogueTotal !== totals.total) warn('Totals', `The test plan has ${catalogueTotal} test cases but the report counts ${totals.total}.`, 'catalogue.json', 'error');

  // ── defect register ──────────────────────────────────────────────────────
  const failingBy = new Map(); // defect id -> failed test ids in this report
  for (const f of failures) for (const id of f.defectIds) failingBy.set(id, [...(failingBy.get(id) ?? []), f.id]);
  const scopeModules = new Set(modulesInScope.map((m) => m.id));
  const all = book.all().filter((d) => !runId || scopeModules.has(moduleIdOf(d.module)) || failingBy.has(d.id));
  const register = all.map((d) => {
    const priority = classify(d.priority, PRIORITY_MAP, d.classifiedBy);
    const severity = classify(d.severity, SEVERITY_MAP, d.classifiedBy);
    const status = d.status ?? null;
    const closedLike = status === 'Resolved' || status === 'Closed';
    // evidence: what the defect record names, then this report's screenshots of its failing tests
    const evidence = [];
    for (const p of d.evidence ?? []) {
      const file = recordPath(p);
      if (!file) {
        warn('Evidence', `${d.id} lists evidence "${p}" but the file does not exist.`, 'defect record');
        continue;
      }
      if (/\.(png|jpe?g|webp)$/i.test(file)) {
        const owner = ownerOf(p);
        const t = owner?.test;
        const f = figure(file, t
          ? caption({ testId: t.id, testTitle: t.scenario ?? t.title, moduleName: owner.run.moduleName, runIdOf: owner.run.id, ...attemptOf(p.split('/').pop()) })
          : `Screenshot recorded with ${d.id}: ${d.title}.`, { kind: 'image', testId: t?.id ?? null, runId: owner?.run.id ?? null, defectIds: [d.id] });
        if (!f.defectIds?.includes(d.id)) f.defectIds = [...(f.defectIds ?? []), d.id];
        evidence.push({ kind: 'image', figure: f.n, caption: f.caption, path: file, file: p });
      } else if (/\.(webm|mp4)$/i.test(file)) {
        evidence.push({ kind: 'video', caption: `Screen recording recorded with ${d.id}.`, path: file, file: p });
      } else {
        const owner = ownerOf(p);
        const name = p.split('/').pop();
        const what = /web-signals/.test(name) ? 'Network and browser-console log' : /error-context/.test(name) ? 'Page structure at the moment of failure' : /trace/.test(name) ? 'Step-by-step trace' : 'Supporting file';
        evidence.push({ kind: 'file', caption: `${what}${owner?.test ? ` of ${owner.test.id}` : ''}${owner ? `, execution ${owner.run.id}` : ''} (${name}).`, path: file, file: p });
      }
    }
    // the same file can be named by the record and by a failing test (different path spellings)
    const same = (a, b) => a.file === b.file || a.path.toLowerCase() === b.path.toLowerCase();
    for (const f of failures.filter((x) => x.defectIds.includes(d.id))) {
      for (const e of f.evidence) if (!evidence.some((x) => same(x, e))) evidence.push(e);
    }
    const tests = [...new Set([...(d.tests ?? []), ...(failingBy.get(d.id) ?? [])])];
    const flags = [];
    if (closedLike && failingBy.has(d.id)) flags.push(`Marked ${status} but still failing in this report (${failingBy.get(d.id).join(', ')}): retest failed, consider Reopened.`);
    if (!status) flags.push(`Status "${d.statusLabel}" is not one of the standard statuses (${DEFECT_STATUSES.join(', ')}).`);
    return {
      id: d.id, aliases: d.aliases, dateReported: d.date ? dmy(d.date) : NOT_PROVIDED,
      store: d.store || NOT_PROVIDED, instance: d.instance || project.environment || NOT_PROVIDED, instanceRecorded: Boolean(d.instance),
      moduleId: moduleIdOf(d.module), module: d.module ? moduleNameOf(d.module) : NOT_PROVIDED,
      title: d.title || NOT_PROVIDED, description: d.description || NOT_PROVIDED, testData: d.testData || NOT_PROVIDED,
      steps: d.steps?.length ? numbered(d.steps) : NOT_PROVIDED, expected: d.expected || NOT_PROVIDED, actual: d.actual || NOT_PROVIDED,
      status: status ?? d.statusLabel ?? 'Open', statusKnown: Boolean(status), open: status ? OPEN_STATUSES.has(status) : true,
      priority, severity, classifiedBy: d.classifiedBy, type: d.type || PENDING_CLASSIFICATION,
      developer: d.developer || PENDING_UPDATE,
      resolvedDate: d.resolvedDate ? dmy(d.resolvedDate) : closedLike ? PENDING_UPDATE : 'Not resolved yet',
      devComment: d.devComment || PENDING_UPDATE, qaComment: d.qaComment || PENDING_UPDATE, changes: d.changes || PENDING_UPDATE,
      tests, failingTests: failingBy.get(d.id) ?? [], failingNow: failingBy.has(d.id), executions: d.executions ?? [],
      evidence, history: d.history ?? [], source: d.source, flags,
      missing: ['title', 'description', 'steps', 'expected', 'actual', 'module'].filter((k) => !(Array.isArray(d[k]) ? d[k].length : d[k])),
    };
  }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const registerIds = new Set(register.map((d) => d.id));

  // checks 4 to 8: unique ids, references resolve, missing fields, duplicates, evidence
  for (const [id, sources] of rawDefectIds(pid)) if (sources.length > 1) warn('Defect IDs', `Defect id ${id} is recorded ${sources.length} times (${sources.join(', ')}); only one record is shown.`, sources.join(', '), 'error');
  // one provisional finding split into several defects is normal (e.g. per page); same titles are not
  for (const [alias, owners] of book.claims()) if (owners.length > 1) warn('Defect references', `Provisional id ${alias} was split into ${owners.length} defects (${owners.join(', ')}); a test tagged ${alias} is linked to each of them. Check they are distinct issues.`, 'defect records', 'info');
  for (const [tag, tests] of unresolvedTags) {
    const linked = failures.filter((f) => tests.includes(f.id) && f.defectIds.length).map((f) => `${f.id} → ${f.defectIds.join(', ')}`);
    warn('Defect references', `${tests.join(', ')} ${tests.length === 1 ? 'is' : 'are'} tagged ${tag}, which is not in the defect register${linked.length ? `; linked through the defect records instead (${linked.join('; ')})` : ''}.`, 'test scripts (@known-defect)');
  }
  const unlinked = failures.filter((f) => !f.defectIds.length);
  if (unlinked.length) warn('Unlinked failures', `${unlinked.length} failed test case(s) have no defect: ${unlinked.map((f) => f.id).join(', ')}. Marked "${NOT_LINKED}".`, 'defect records');
  for (const f of failures) for (const id of f.defectIds) if (!registerIds.has(id) && !book.get(id).missing) warn('Defect references', `${f.id} links to ${id}, which is outside this report's register.`, 'defect links');
  const byTitle = new Map();
  for (const d of register) {
    const k = `${d.moduleId}|${d.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    byTitle.set(k, [...(byTitle.get(k) ?? []), d.id]);
  }
  for (const ids of byTitle.values()) if (ids.length > 1) warn('Possible duplicate', `${ids.join(', ')} have the same title in the same module.`, 'defect records');
  const pendingClass = register.filter((d) => d.priority.pending || d.severity.pending);
  if (pendingClass.length) warn('Classification', `${pendingClass.length} defect(s) need a priority or severity: ${pendingClass.map((d) => d.id).join(', ')}.`, 'defect records', 'info');
  const provisional = register.filter((d) => d.priority.provisional || d.severity.provisional);
  if (provisional.length) warn('Classification', `${provisional.length} defect(s) carry the priority and severity proposed by the automated defect analysis; QA has not confirmed them yet.`, 'defect records', 'info');
  const incomplete = register.filter((d) => d.missing.length);
  if (incomplete.length) warn('Missing fields', `${incomplete.map((d) => `${d.id} (${d.missing.join(', ')})`).join('; ')} are missing information.`, 'defect records', 'info');
  for (const d of register) for (const flag of d.flags) warn('Defect status', `${d.id}: ${flag}`, 'defect records');
  const noEvidence = register.filter((d) => !d.evidence.some((e) => e.kind === 'image'));
  if (noEvidence.length) warn('Evidence', `${noEvidence.length} defect(s) have no screenshot: ${noEvidence.map((d) => d.id).join(', ')}.`, 'defect records', 'info');
  for (const d of register) if (d.moduleId && !moduleById.has(d.moduleId)) warn('Defect references', `${d.id} names module "${d.module}", which is not in the test plan.`, 'defect records');

  // ── accessibility themes, from the scans each execution kept ─────────────
  const themeTests = new Map(THEMES.map(([k]) => [k, { scanned: new Set(), failed: new Set(), defects: new Set() }]));
  const aware = new Set();
  let scanFiles = 0;
  for (const run of runs) {
    for (const t of run.tests) {
      for (const e of t.evidence ?? []) {
        const m = e.name.match(/^a11y-.+-(normal|dark|contrast|forced-colors)$/);
        if (!m) continue;
        const file = evidenceFile(run, e);
        if (!existsSync(file)) continue;
        let blocking = 0;
        try {
          blocking = (JSON.parse(readFileSync(file, 'utf8')).violations ?? []).filter((v) => v.impact === 'critical' || v.impact === 'serious').length;
        } catch {
          continue;
        }
        scanFiles += 1;
        const slot = themeTests.get(m[1]);
        const id = `${run.moduleId}|${t.id}`;
        aware.add(id);
        slot.scanned.add(id);
        if (blocking) {
          slot.failed.add(id);
          const entry = moduleById.get(run.moduleId)?.tests.find((c) => c.key === t.key);
          // the accessibility defects behind it (a server error hit by the same test is not a theme issue)
          if (t.status === 'failed') for (const d of book.linksFor(run.moduleId, t, entry).ids) if (/accessib/i.test(book.get(d).type)) slot.defects.add(d);
        }
      }
    }
  }
  const accessibility = {
    available: scanFiles > 0,
    scans: scanFiles,
    basis: 'Automated accessibility scans (axe-core, WCAG 2 A/AA) kept with each execution. A theme counts as failed for a test case when its scan found critical or serious problems.',
    themes: THEMES.map(([key, label]) => {
      const s = themeTests.get(key);
      if (!scanFiles) return { key, label, available: false, tests: null, passed: null, failed: null, notTested: null, defects: [] };
      return { key, label, available: s.scanned.size > 0, tests: s.scanned.size, passed: s.scanned.size - s.failed.size, failed: s.failed.size, notTested: aware.size - s.scanned.size, defects: [...s.defects].sort() };
    }),
    testCases: aware.size,
  };

  // ── comparison with the previous execution of each module ────────────────
  const comparison = { available: false, modules: [], defects: { new: [], resolved: [], reopened: [], persistent: [] }, note: '' };
  const prevLinked = new Set();
  const curLinked = new Set(failures.flatMap((f) => f.defectIds));
  for (const m of modules) {
    const run = selected.get(m.id);
    if (!run) continue;
    const prev = done.find((r) => r.moduleId === m.id && r.id < run.id && r.scope === run.scope && finished(r)) ?? null;
    if (!prev) {
      comparison.modules.push({ id: m.id, name: m.name, previous: null, current: run.id, note: 'No earlier execution to compare with.' });
      continue;
    }
    comparison.available = true;
    const entryOf = (t) => moduleById.get(m.id)?.tests.find((c) => c.key === t.key);
    const prevKeys = new Set(prev.tests.map((t) => t.key));
    const curKeys = new Set(run.tests.map((t) => t.key));
    const sameCoverage = prevKeys.size === curKeys.size && [...prevKeys].every((k) => curKeys.has(k));
    const p = storedCounts(prev);
    const prevPct = pct(p.passed, prev.tests.length);
    const curPct = pct(storedCounts(run).passed, run.tests.length);
    const fixed = [];
    const broke = [];
    for (const t of run.tests) {
      const before = prev.tests.find((x) => x.key === t.key);
      if (!before) continue;
      if (before.status === 'failed' && t.status === 'passed') fixed.push(t.id);
      if (before.status === 'passed' && t.status === 'failed') broke.push(t.id);
    }
    for (const t of prev.tests.filter((x) => x.status === 'failed')) for (const id of book.linksFor(m.id, t, entryOf(t)).ids) prevLinked.add(id);
    comparison.modules.push({
      id: m.id, name: m.name, previous: prev.id, current: run.id, previousPassPct: prevPct, passPct: curPct,
      change: prevPct == null || curPct == null ? null : Math.round((curPct - prevPct) * 10) / 10,
      improved: fixed, regressed: broke, sameCoverage,
      note: sameCoverage ? null : `Coverage differs: the earlier execution ran ${prevKeys.size} test cases, this one ${curKeys.size}. Pass rates are not directly comparable.`,
    });
  }
  if (comparison.available) {
    comparison.defects.new = [...curLinked].filter((id) => !prevLinked.has(id)).sort();
    comparison.defects.persistent = [...curLinked].filter((id) => prevLinked.has(id)).sort();
    comparison.defects.resolved = [...prevLinked].filter((id) => !curLinked.has(id)).sort();
    comparison.defects.reopened = register.filter((d) => d.status === 'Reopened' || d.history.some((h) => h.to === 'Reopened') || (['Resolved', 'Closed'].includes(d.status) && d.failingNow)).map((d) => d.id);
    comparison.note = 'Each module is compared with its previous execution of the same scope. "Resolved" here means the defect no longer caused a failure; its status in the register is what the team recorded.';
  } else {
    comparison.note = 'No earlier executions are available to compare with.';
  }

  // ── metadata ─────────────────────────────────────────────────────────────
  const shipped = shippedVersions();
  const browsers = new Map();
  for (const run of runs) {
    for (const l of run.lanes?.length ? run.lanes : [{ browser: String(run.device ?? '').split(/[ ·,]/)[0] || null }]) {
      if (!l.browser) continue;
      const version = l.version ?? null;
      browsers.set(l.browser, version ?? browsers.get(l.browser) ?? null);
    }
  }
  let viewport = null;
  try {
    viewport = require('playwright-core').devices['Desktop Chrome'].viewport;
  } catch {}
  const startedAt = runs.length ? Math.min(...runs.map((r) => r.startedAt)) : null;
  const endedAt = runs.length ? Math.max(...runs.map((r) => r.endedAt ?? r.startedAt)) : null;
  const regressions = new Set(runs.map((r) => r.regressionId).filter(Boolean));
  const stamp = new Date(now);
  const two = (n) => String(n).padStart(2, '0');
  const meta = {
    reportId: `TNR-${pid.toUpperCase()}-${stamp.getFullYear()}${two(stamp.getMonth() + 1)}${two(stamp.getDate())}-${two(stamp.getHours())}${two(stamp.getMinutes())}${two(stamp.getSeconds())}`,
    scope: runId ? 'execution' : 'consolidated',
    project: { id: pid, name: project.name, url: project.url ?? NOT_PROVIDED, environment: project.environment ?? NOT_PROVIDED },
    build: NOT_PROVIDED,
    browsers: [...browsers].map(([name, version]) => ({ name: browserName(name), version: version ?? null, versionNote: version ? null : shipped[name] ? `Not recorded by the execution; this TestNova installation runs ${browserName(name)} ${shipped[name]}` : 'Not recorded' })),
    device: viewport ? `Desktop browser profile, ${viewport.width} × ${viewport.height} viewport (some tests also resize to mobile and tablet widths)` : NOT_PROVIDED,
    executionStart: startedAt, executionEnd: endedAt, generatedAt: now,
    executionIds: runs.map((r) => r.id),
    suite: runId ? runs[0].id : regressions.size === 1 && runs.every((r) => r.regressionId) ? [...regressions][0] : 'Latest execution of each module',
    definitions: {
      passPct: 'Pass % = passed test cases ÷ all test cases in scope (not executed ones count against it).',
      defects: 'Unique defects: each defect counts once, however many test cases it affects. A test case can be affected by more than one defect.',
    },
  };

  // ── overall status, observations, recommendation ─────────────────────────
  const open = register.filter((d) => d.open);
  const isTop = (d) => d.priority.value === 'P0' || d.severity.value === 'Critical';
  const isHigh = (d) => d.priority.value === 'P1' || d.severity.value === 'High';
  const openTop = open.filter(isTop);
  const openHigh = open.filter((d) => !isTop(d) && isHigh(d));
  const linkedUnique = new Set(failures.flatMap((f) => f.defectIds));
  totals.uniqueDefects = register.length;
  totals.defectsLinkedToFailures = linkedUnique.size;
  totals.openDefects = open.length;
  totals.resolvedDefects = register.filter((d) => d.status === 'Resolved' || d.status === 'Closed').length;
  totals.failedLinked = failures.length - unlinked.length;
  totals.failedUnlinked = unlinked.length;
  const overall = !runs.length ? { label: 'Not Executed', tone: 'grey' }
    : totals.failed ? { label: totals.notExecuted ? 'Partially executed – issues found' : 'Completed – issues found', tone: 'red' }
      : totals.notExecuted || totals.skipped ? { label: 'Partially executed – no failures', tone: 'orange' }
        : { label: 'Completed – all test cases passed', tone: 'green' };

  const byCount = (map) => [...map].sort((a, b) => b[1] - a[1]);
  const typeCounts = new Map();
  for (const d of open) typeCounts.set(d.type, (typeCounts.get(d.type) ?? 0) + 1);
  const attention = modules.filter((m) => m.failed || !m.executionId).sort((a, b) => (a.passPct ?? -1) - (b.passPct ?? -1));
  const executedNames = modules.filter((m) => m.executionId).map((m) => m.name);
  const fmtDate = (ms) => (ms ? dmy(ms) : null);
  const span = fmtDate(startedAt) === fmtDate(endedAt) ? fmtDate(startedAt) : `${fmtDate(startedAt)} to ${fmtDate(endedAt)}`;
  const summary = !runs.length
    ? `No module of ${project.name} has been executed yet, so there are no results to report.`
    : [
      `Testing of ${project.name} covered ${totals.modulesExecuted} of ${totals.modules} application module${totals.modules === 1 ? '' : 's'} (${executedNames.join(', ')}) in the ${meta.project.environment} environment${span ? ` on ${span}` : ''}.`,
      `Of ${totals.total} test cases, ${totals.passed} passed (${totals.passPct}%) and ${totals.failed} failed${totals.skipped ? `, ${totals.skipped} were skipped` : ''}${totals.notExecuted ? `, and ${totals.notExecuted} were not executed` : ''}.`,
      totals.failed
        ? `The failures trace back to ${linkedUnique.size} unique defect${linkedUnique.size === 1 ? '' : 's'}${unlinked.length ? `, and ${unlinked.length} failure${unlinked.length === 1 ? ' is' : 's are'} still to be investigated` : ''}. The most affected area${attention.length > 1 ? 's are' : ' is'} ${attention.filter((m) => m.failed).slice(0, 3).map((m) => m.name).join(', ')}.`
        : 'No test case failed.',
      register.length
        ? `The defect register holds ${register.length} defect${register.length === 1 ? '' : 's'}, of which ${open.length} ${open.length === 1 ? 'is' : 'are'} still open${openTop.length ? `, including ${openTop.length} that need${openTop.length === 1 ? 's' : ''} immediate attention` : ''}${typeCounts.size ? `; most open defects concern ${byCount(typeCounts).slice(0, 2).map(([t]) => t.toLowerCase()).join(' and ')}` : ''}.`
        : '',
    ].filter(Boolean).join(' ');

  const reasons = [];
  if (openTop.length) reasons.push(`${openTop.length} open defect${openTop.length === 1 ? ' is' : 's are'} rated P0 or Critical: ${openTop.map((d) => `${d.id} ${d.title}`).join('; ')}.`);
  if (openHigh.length) reasons.push(`${openHigh.length} open defect${openHigh.length === 1 ? ' is' : 's are'} rated P1 or High.`);
  if (unlinked.length) reasons.push(`${unlinked.length} failed test case${unlinked.length === 1 ? ' has' : 's have'} not been investigated (no defect linked).`);
  if (totals.notExecuted) reasons.push(`${totals.notExecuted} test case${totals.notExecuted === 1 ? ' was' : 's were'} not executed.`);
  if (totals.skipped) reasons.push(`${totals.skipped} test case${totals.skipped === 1 ? ' was' : 's were'} skipped, so ${totals.skipped === 1 ? 'its' : 'their'} behaviour is unverified.`);
  if (modules.some((m) => !m.executionId)) reasons.push(`${modules.filter((m) => !m.executionId).map((m) => m.name).join(', ')} ${modules.filter((m) => !m.executionId).length === 1 ? 'has' : 'have'} not been tested.`);
  if (pendingClass.length) reasons.push(`${pendingClass.length} defect${pendingClass.length === 1 ? ' is' : 's are'} still pending QA classification.`);
  if (provisional.length) reasons.push(`Priorities and severities of ${provisional.length} defect${provisional.length === 1 ? '' : 's'} are proposals of the automated analysis and need QA confirmation.`);
  const recommendation = !runs.length
    ? { verdict: 'Testing not completed', tone: 'grey', text: 'No executions are available; testing must be carried out before any release decision.' }
    : openTop.length
      ? { verdict: 'Not ready for release', tone: 'red', text: 'Critical or immediate-attention defects are open. Fix them, retest the affected modules and re-run this report before release.' }
      : openHigh.length || unlinked.length || totals.notExecuted || totals.skipped || modules.some((m) => !m.executionId)
        ? { verdict: 'Conditional – not ready until the listed items are addressed', tone: 'orange', text: 'No blocking defect is open, but high-priority defects, uninvestigated failures or untested areas remain. Address them and retest before release.' }
        : open.length
          ? { verdict: 'Release only with accepted known issues', tone: 'orange', text: 'Only lower-priority defects remain open. Release is possible if stakeholders accept these known issues.' }
          : { verdict: 'No open issues found by testing', tone: 'green', text: 'All executed test cases passed and no defect is open. The release decision rests with the stakeholders; a high pass rate alone is not a release approval.' };
  recommendation.reasons = reasons;

  const shipBrowsers = new Set([...browsers.keys()]);
  const additional = [];
  for (const m of modules.filter((x) => !x.executionId)) additional.push(`${m.name}: not executed at all.`);
  if (totals.notExecuted) additional.push(`${totals.notExecuted} test case${totals.notExecuted === 1 ? '' : 's'} without a result in the latest executions.`);
  if (unlinked.length) additional.push(`Investigate the failures not linked to a defect: ${unlinked.map((f) => f.id).join(', ')}.`);
  // skipped test cases, grouped by the reason the test gave (e.g. missing test login)
  const skipReasons = new Map();
  for (const c of testCases.filter((x) => x.status === 'Skipped')) {
    const why = c.skipReason || 'no reason recorded';
    skipReasons.set(why, [...(skipReasons.get(why) ?? []), c.id]);
  }
  for (const [why, ids] of skipReasons) additional.push(`${ids.length} test case${ids.length === 1 ? '' : 's'} skipped (${why}): ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ` and ${ids.length - 8} more` : ''}.`);
  const other = ['chromium', 'firefox', 'webkit'].filter((b) => !shipBrowsers.has(b));
  if (runs.length && other.length) additional.push(`Cross-browser coverage: these executions ran on ${[...shipBrowsers].map(browserName).join(', ')} only; ${other.map(browserName).join(' and ')} ${other.length === 1 ? 'was' : 'were'} not tested.`);
  for (const t of accessibility.themes.filter((x) => accessibility.available && !x.available)) additional.push(`${t.label}: no accessibility scan in this theme.`);
  if (!accessibility.available) additional.push('Accessibility themes: no theme-specific scans were recorded.');
  for (const n of nd) additional.push(`${n.test}: the defect analysis classified an earlier failure as ${n.classification} (${n.reason}); re-check once the cause is addressed.`);
  if (comparison.defects.reopened.length) additional.push(`Retest ${comparison.defects.reopened.join(', ')}: marked resolved or reopened but still failing.`);

  const a11yOpen = open.filter((d) => /accessib/i.test(d.type));
  const observations = {
    majorIssues: [...openTop, ...openHigh].map((d) => ({ id: d.id, title: d.title, module: d.module, priority: d.priority.value, severity: d.severity.value, status: d.status })),
    modulesNeedingAttention: attention.map((m) => ({ id: m.id, name: m.name, reason: m.executionId ? `${m.failed} of ${m.total} test cases failed (pass rate ${m.passPct}%), ${m.defectIds.length} unique defect${m.defectIds.length === 1 ? '' : 's'}.` : 'Not executed.' })),
    outstanding: { open: open.length, byPriority: ['P0', 'P1', 'P2', 'P3', PENDING_CLASSIFICATION].map((p) => [p, open.filter((d) => d.priority.value === p).length]).filter(([, n]) => n), byStatus: DEFECT_STATUSES.map((s) => [s, register.filter((d) => d.status === s).length]).filter(([, n]) => n) },
    accessibility: accessibility.available
      ? [
        `${a11yOpen.length} open accessibility defect${a11yOpen.length === 1 ? '' : 's'}.`,
        ...accessibility.themes.filter((t) => t.available).map((t) => `${t.label}: ${t.tests} test case${t.tests === 1 ? '' : 's'} scanned, ${t.failed} with serious problems.`),
      ]
      : [NO_COVERAGE],
    additionalTesting: additional,
  };

  // figures are numbered in reading order: the register's defects in turn, then unlinked failures
  const order = [];
  for (const d of register) for (const e of d.evidence) if (e.figure && !order.includes(e.figure)) order.push(e.figure);
  for (const f of failures.filter((x) => !x.defectIds.length)) for (const e of f.evidence) if (e.figure && !order.includes(e.figure)) order.push(e.figure);
  for (const f of figures) if (!order.includes(f.n)) order.push(f.n);
  const renumber = new Map(order.map((old, i) => [old, i + 1]));
  for (const f of figures) f.n = renumber.get(f.n);
  figures.sort((a, b) => a.n - b.n);
  // the register shares evidence entries with the failures: renumber each entry once
  const done2 = new Set();
  for (const list of [...register.map((d) => d.evidence), ...failures.map((f) => f.evidence)]) {
    for (const e of list) {
      if (!e.figure || done2.has(e)) continue;
      done2.add(e);
      e.figure = renumber.get(e.figure);
    }
  }

  // the fingerprint of every figure, so the dashboard, PDF and Excel can show they agree
  const fingerprint = createHash('sha256').update(JSON.stringify({ totals, modules: modules.map((m) => [m.id, m.total, m.passed, m.failed, m.skipped, m.notExecuted, m.defectIds]), register: register.map((d) => [d.id, d.status, d.priority.value, d.severity.value]) })).digest('hex').slice(0, 12);

  return {
    meta: { ...meta, fingerprint },
    overall, summary, totals, modules, testCases, failures, register, figures, accessibility, comparison, observations, recommendation,
    validation: validation.sort((a, b) => ['error', 'warning', 'info'].indexOf(a.level) - ['error', 'warning', 'info'].indexOf(b.level)),
    appendix: {
      logs: runs.map((r) => ({ executionId: r.id, module: r.moduleName, errors: r.errors ?? [], log: (r.log ?? []).slice(-200) })),
      technical: failures.filter((f) => f.technical).map((f) => ({ id: f.id, module: f.module, executionId: f.executionId, technical: f.technical, trace: f.trace })),
      scales: SCALE_MAPPING, priorities: PRIORITY_DEFINITIONS, severities: SEVERITY_DEFINITIONS, notDefects: nd,
    },
  };
}

/** The report without file paths and long texts: what the dashboard page needs. */
export function forWeb(report) {
  const strip = (e) => ({ kind: e.kind, figure: e.figure ?? null, caption: e.caption, file: e.file });
  return {
    ...report,
    testCases: undefined,
    failures: report.failures.map((f) => ({ ...f, evidence: f.evidence.map(strip) })),
    register: report.register.map((d) => ({ ...d, evidence: d.evidence.map(strip) })),
    figures: report.figures.map(({ path: _p, ...f }) => f),
    appendix: { ...report.appendix, logs: undefined },
  };
}

export { explainError };
