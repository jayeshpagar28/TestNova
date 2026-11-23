/**
 * PDF and Excel reports, built only from stored executions: a test appears with the status an
 * execution recorded for it, and a module nobody has executed is reported as Not Run. PDFs are
 * printed by the installed Chrome through playwright-core. `reportsFor(pid)` reports one project only,
 * from that project's executions, and names the project on every report.
 *
 * Test cases and defects are laid out in the readable formats of formats.mjs, the same columns as
 * the stage 7 defect sheet (`writeDefectSheet`), so every report reads the same way.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { counts, finished, storeFor } from './store.mjs';
import { projectConfig } from './project.mjs';
import { workspaceDir } from './workspace.mjs';
import { addDefectSheet, addTestCaseSheet, defectRow, defectTableHtml, testCaseRow, testCaseTableHtml } from './formats.mjs';
import { buildQaReport } from './qa-report.mjs';
import { registerExcel, reportExcel, reportPdf } from './qa-render.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const { chromium } = require('playwright-core');

const reports = new Map();
/** One project's reports (cached). */
export function reportsFor(pid) {
  if (!reports.has(pid)) reports.set(pid, createReports(pid));
  return reports.get(pid);
}

/**
 * qa/06-report/<id>-defects.xlsx, the project's defect sheet, rebuilt from its defect records
 * (stage 7's JSON plus defects created or re-statused on the dashboard).
 */
export async function writeDefectSheet(pid) {
  const store = storeFor(pid);
  await store.refreshDefects();
  const file = join(workspaceDir(pid), 'qa', '06-report', `${pid}-defects.xlsx`);
  writeFileSync(file, await reportsFor(pid).defectSheet());
  return file;
}

function createReports(pid) {
const WS = workspaceDir(pid);
const { allRuns, catalogue, defectBook, defectIdsOf, runDir } = storeFor(pid);
const projectName = () => projectConfig(pid)?.name ?? pid;

const RUN_LABEL = { passed: 'Passed', failed: 'Failed', skipped: 'Nothing executed', stopped: 'Stopped', error: 'Could not run' };
const NOT_CAPTURED = 'Not captured';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
const span = (ms) => {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

// ── the readable rows ───────────────────────────────────────────────────────
const moduleOf = (id) => catalogue().modules.find((m) => m.id === id || m.name === id) ?? null;
const moduleName = (id) => moduleOf(id)?.name ?? id;
/** A test as the plan describes it (catalogue), with what the execution itself recorded. */
const planned = (moduleId, t) => {
  const entry = moduleOf(moduleId)?.tests.find((c) => c.key === t.key) ?? moduleOf(moduleId)?.tests.find((c) => c.id === t.id);
  return { ...t, expected: t.expectedResult ?? null, ...(entry ?? {}) };
};
const failureDefect = (moduleId, t) => (t?.status === 'failed' ? defectBook().forTest(moduleId, t) : null);
const runTestRows = (run) => run.tests.map((t) => testCaseRow({ test: planned(run.moduleId, t), moduleName: run.moduleName, result: t, defect: failureDefect(run.moduleId, t) }));
const defectRows = (defects) => defects.map((d) => defectRow(d, moduleName));
const byId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
const runDefects = (run, book) => defectIdsOf(run, book).map((id) => book.get(id)).sort(byId);

/** Evidence paths in defect records are relative to the workspace (older ones to the repo). */
const defectImages = (d) =>
  (d.evidence ?? [])
    .filter((p) => /\.(png|jpe?g)$/i.test(p))
    .map((p) => [join(WS, p), join(WS, p.replace(/^dashboard\/data\//, 'data/'))].find((f) => existsSync(f)))
    .filter(Boolean)
    .slice(0, 3);

const failureRows = (run, book) => run.tests.filter((t) => t.status === 'failed').map((test) => ({ test, defect: book.forTest(run.moduleId, test) }));
const expectedOf = (t) => t.failure?.expected ?? t.expectedResult ?? NOT_CAPTURED;
const actualOf = (t) => t.failure?.actual ?? t.failure?.reason ?? NOT_CAPTURED;

const imagesOf = (run, t) =>
  (t.evidence ?? [])
    .filter((e) => e.contentType?.startsWith('image/'))
    .map((e) => ({ ...e, path: join(runDir(run.id), 'evidence', e.file) }))
    .filter((e) => existsSync(e.path));

// ── PDF ─────────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box}body{font:11px/1.45 "Segoe UI",Arial,sans-serif;color:#1c1d22;margin:0}
h1{font-size:23px;font-weight:600;margin:0}h2{font-size:15px;font-weight:600;margin:22px 0 8px;break-after:avoid}h3{font-size:12px;margin:12px 0 4px;break-after:avoid}
.brand{color:#4b57d6;letter-spacing:.22em;font-size:11px;font-weight:600;margin:0 0 4px}.muted{color:#666a75}
table{width:100%;border-collapse:collapse;margin:6px 0}th{background:#eef0f6;text-align:left;font-weight:600}th,td{border:1px solid #d9dbe3;padding:4px 6px;vertical-align:top;word-break:break-word}
table.fmt{font-size:9px;line-height:1.35;table-layout:fixed}table.fmt td{word-break:normal;overflow-wrap:anywhere}table.fmt th{word-break:normal;overflow-wrap:normal}table.fmt .nw{white-space:nowrap;overflow-wrap:normal}table.fmt th{background:#2f3a8f;color:#fff}table.fmt tr:nth-child(even) td{background:#f7f8fb}
tr{break-inside:avoid}.tiles{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.tile{flex:1 1 90px;border:1px solid #d9dbe3;border-radius:7px;padding:7px 9px}.tile b{display:block;font-size:17px;font-weight:600}
.s-failed{color:#b3203f;font-weight:600}.s-passed{color:#0f7572;font-weight:600}.s-blocked{color:#8a5f14;font-weight:600}
.failure{border:1px solid #e3c4cc;border-left:3px solid #b3203f;border-radius:6px;padding:8px 10px;margin:9px 0}.failure-head{break-inside:avoid}
pre{white-space:pre-wrap;word-break:break-word;background:#f5f6f9;border-radius:5px;padding:6px;font:9.5px/1.4 Consolas,monospace;margin:4px 0}
img{max-width:300px;max-height:300px;border:1px solid #d9dbe3;border-radius:5px;margin:4px 8px 4px 0}.banner{background:#fbf1dc;border:1px solid #e5c988;border-radius:6px;padding:7px 9px;margin:8px 0}
.section{break-before:page}.first{break-before:auto}`;

function summaryTiles(run, book) {
  const c = counts(run);
  const tiles = [['Total', c.total], ['Passed', c.passed], ['Failed', c.failed], ['Skipped', c.skipped + c.blocked], ['Not Run', c.notrun], ['Defects', defectIdsOf(run, book).length], ['Duration', span(run.durationMs)]];
  return `<div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><b>${esc(v)}</b>${esc(k)}</div>`).join('')}</div>`;
}

function runHeader(run) {
  const rows = [
    ['Module', run.moduleName], ['Execution ID', run.id], ['Execution date and time', when(run.startedAt)], ['Finished', when(run.endedAt)],
    ['Result', RUN_LABEL[run.status] ?? run.status], ['Scope', run.scope === 'test' ? `Single test: ${run.target.id}` : 'Whole module'],
    ['Environment', run.build?.version ?? '—'], ['Browser', run.device ?? '—'],
  ];
  return `<table>${rows.map(([k, v]) => `<tr><th style="width:170px">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
}

function failureBlock(run, { test: t, defect }, detailed) {
  const images = imagesOf(run, t).map((e) => `<img alt="${esc(e.name)}" src="data:${e.contentType};base64,${readFileSync(e.path).toString('base64')}">`).join('');
  const others = (t.evidence ?? []).filter((e) => !e.contentType?.startsWith('image/')).map((e) => e.name);
  const steps = detailed && t.steps?.length
    ? `<h3>Steps</h3><table><tr><th>Step</th><th style="width:70px">Time</th></tr>${t.steps.map((s) => `<tr><td>${esc(s.title)}${s.error ? `<br><span class="s-failed">${esc(s.error)}</span>` : ''}</td><td>${span(s.durationMs)}</td></tr>`).join('')}</table>`
    : '';
  return `<div class="failure"><div class="failure-head"><b>${esc(t.id)}</b> ${esc(t.title)}</div>
    <table>
      <tr><th style="width:130px">Failure reason</th><td>${esc(t.failure?.reason ?? NOT_CAPTURED)}</td></tr>
      <tr><th>Expected result</th><td>${esc(expectedOf(t))}</td></tr>
      <tr><th>Actual result</th><td>${esc(actualOf(t))}</td></tr>
      <tr><th>Defect</th><td>${defect ? `${esc(defect.id)} (${esc(defect.statusLabel ?? defect.status ?? 'Status not set')})${defect.title ? ` ${esc(defect.title)}` : ''}` : 'No defect linked'}</td></tr>
    </table>
    <h3>Error message</h3><pre>${esc(t.failure?.message ?? NOT_CAPTURED)}</pre>
    ${detailed && t.failure?.stack ? `<h3>Stack trace</h3><pre>${esc(t.failure.stack)}</pre>` : ''}
    ${steps}
    ${images ? `<h3>Screenshots</h3>${images}` : ''}
    ${others.length ? `<p class="muted">Other evidence kept with this execution: ${esc(others.join(', '))}</p>` : ''}
  </div>`;
}

function runSection(run, book, detailed, first) {
  const failures = failureRows(run, book);
  const skipped = run.tests.filter((t) => t.skipReason);
  return `<section class="section ${first ? 'first' : ''}">
    <h2>${esc(run.moduleName)}</h2>
    ${run.errors?.length ? `<div class="banner"><b>This execution reported errors.</b><pre>${esc(run.errors.join('\n'))}</pre></div>` : ''}
    ${runHeader(run)}${summaryTiles(run, book)}
    <h2>Test cases</h2>
    ${testCaseTableHtml(runTestRows(run))}
    <h2>Defects</h2>
    ${defectTableHtml(defectRows(runDefects(run, book)))}
    <h2>Failures in detail (${failures.length})</h2>
    ${failures.length ? failures.map((f) => failureBlock(run, f, detailed)).join('') : '<p class="muted">No test failed in this execution.</p>'}
    ${detailed && skipped.length ? `<h2>Skipped and blocked tests</h2><table><tr><th style="width:92px">Test case</th><th>Reason given by the test</th></tr>${skipped.map((t) => `<tr><td>${esc(t.id)}</td><td>${esc(t.skipReason)}</td></tr>`).join('')}</table>` : ''}
    ${detailed && run.log?.length ? `<h2>Execution log</h2><pre>${esc(run.log.join('\n'))}</pre>` : ''}
  </section>`;
}

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const cover = (title, subtitle) => `<p class="brand">TESTNOVA</p><h1>${esc(title)}</h1><p class="muted">${esc(projectName())} · ${esc(subtitle)} · Generated ${esc(when(Date.now()))}</p>`;

async function toPdf(html) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const tab = await browser.newPage();
    await tab.setContent(html, { waitUntil: 'load' });
    // landscape: the ten-column test case and defect tables need the width
    return await tab.pdf({
      format: 'A4', landscape: true, printBackground: true, margin: { top: '12mm', bottom: '13mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;font-size:8px;color:#777;padding:0 10mm;display:flex;justify-content:space-between"><span>TestNova</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
  } finally {
    await browser.close();
  }
}

function runPdf(run, detailed) {
  const title = `${run.moduleName} ${detailed ? 'Detailed Execution Report' : 'Test Report'}`;
  return toPdf(page(title, cover(title, run.id) + runSection(run, defectBook(), detailed, true)));
}

/** The newest finished execution of each module, preferring whole-module ones. */
function consolidated() {
  const runs = allRuns().filter(finished);
  return catalogue().modules.map((module) => ({
    module,
    run: runs.find((r) => r.moduleId === module.id && r.scope === 'module') ?? runs.find((r) => r.moduleId === module.id) ?? null,
  }));
}

/** Every test case of the project: its result in its module's latest execution, else Not Run. */
function consolidatedTestRows(rows) {
  return rows.flatMap(({ module, run }) =>
    module.tests.map((entry) => {
      const result = run?.tests.find((t) => t.key === entry.key) ?? run?.tests.find((t) => t.id === entry.id) ?? null;
      return testCaseRow({ test: result ? planned(module.id, result) : entry, moduleName: module.name, result, defect: failureDefect(module.id, result) });
    }));
}

const hasExecutions = () => allRuns().some(finished);

function moduleRow(module, run, book) {
  if (!run) return { name: module.name, execution: 'Not Run', when: '', total: module.tests.length, passed: 0, failed: 0, skipped: 0, notrun: module.tests.length, defects: 0, duration: '—', result: 'Not Run' };
  const c = counts(run);
  return { name: module.name, execution: run.id, when: when(run.startedAt), total: c.total, passed: c.passed, failed: c.failed, skipped: c.skipped + c.blocked, notrun: c.notrun, defects: defectIdsOf(run, book).length, duration: span(run.durationMs), result: RUN_LABEL[run.status] ?? run.status };
}

function consolidatedPdf() {
  const book = defectBook();
  const rows = consolidated();
  const table = `<h2>Execution summary across modules</h2><p class="muted">Each module shows its latest finished execution. A module with no execution is Not Run.</p>
    <table><tr><th>Module</th><th style="width:150px">Execution ID</th><th style="width:44px">Total</th><th style="width:44px">Pass</th><th style="width:44px">Fail</th><th style="width:44px">Skip</th><th style="width:44px">Not Run</th><th style="width:44px">Defects</th><th style="width:58px">Duration</th></tr>
    ${rows.map(({ module, run }) => {
      const r = moduleRow(module, run, book);
      return `<tr><td>${esc(r.name)}</td><td>${esc(r.execution)}</td><td>${r.total}</td><td>${r.passed}</td><td>${r.failed}</td><td>${r.skipped}</td><td>${r.notrun}</td><td>${r.defects}</td><td>${esc(r.duration)}</td></tr>`;
    }).join('')}</table>`;
  const defects = `<section class="section"><h2>Defects (${book.all().length})</h2>${defectTableHtml(defectRows(book.all().sort(byId)))}</section>`;
  const sections = rows.filter((r) => r.run).map(({ run }) => runSection(run, book, false, false)).join('');
  return toPdf(page('Consolidated Test Report', cover('Consolidated Test Report', 'All modules') + table + defects + sections));
}

// ── Excel ───────────────────────────────────────────────────────────────────
function styled(sheet, columns) {
  sheet.columns = columns;
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F3A8F' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

function wrapAll(sheet) {
  sheet.eachRow((row, i) => {
    if (i > 1) row.alignment = { wrapText: true, vertical: 'top' };
  });
}

/** One row per screenshot, labelled with its defect, so the "Screenshot / STR" names can be seen. */
function addDefectScreenshots(wb, defects) {
  const withImages = defects.map((d) => ({ d, images: defectImages(d) })).filter((x) => x.images.length);
  if (!withImages.length) return;
  const sheet = wb.addWorksheet('Defect Screenshots');
  sheet.columns = [{ header: 'Defect', key: 'id', width: 40 }, { header: 'Screenshot', key: 'img', width: 70 }];
  sheet.getRow(1).font = { bold: true };
  let row = 2;
  for (const { d, images } of withImages) {
    for (const file of images) {
      const id = wb.addImage({ buffer: readFileSync(file), extension: /\.jpe?g$/i.test(file) ? 'jpeg' : 'png' });
      const cell = sheet.getCell(row, 1);
      cell.value = `${d.id}: ${d.title}\n${file.split(/[\\/]/).pop()}`;
      cell.alignment = { wrapText: true, vertical: 'top' };
      sheet.getRow(row).height = 260;
      sheet.addImage(id, { tl: { col: 1, row: row - 1 }, ext: { width: 480, height: 340 } });
      row += 1;
    }
  }
}

/** Execution details the readable test case sheet leaves out: execution, duration, skip reason, failures, evidence. */
function addRunDetails(wb, runs, book) {
  const cases = wb.addWorksheet('Execution Details');
  styled(cases, [
    { header: 'Module', key: 'module', width: 20 }, { header: 'Execution ID', key: 'run', width: 22 }, { header: 'Test Case ID', key: 'id', width: 14 },
    { header: 'Test Case Name', key: 'name', width: 60 }, { header: 'Priority', key: 'priority', width: 9 }, { header: 'Status', key: 'status', width: 10 },
    { header: 'Duration', key: 'duration', width: 10 }, { header: 'Skip reason', key: 'skip', width: 40 }, { header: 'Defect ID', key: 'defect', width: 14 }, { header: 'Defect Status', key: 'defectStatus', width: 14 },
  ]);
  const failures = wb.addWorksheet('Failures');
  styled(failures, [
    { header: 'Module', key: 'module', width: 20 }, { header: 'Execution ID', key: 'run', width: 22 }, { header: 'Test Case ID', key: 'id', width: 14 }, { header: 'Test Case Name', key: 'name', width: 44 },
    { header: 'Failure Reason', key: 'reason', width: 44 }, { header: 'Expected Result', key: 'expected', width: 40 }, { header: 'Actual Result', key: 'actual', width: 40 },
    { header: 'Error Message', key: 'message', width: 60 }, { header: 'Defect ID', key: 'defect', width: 14 }, { header: 'Defect Status', key: 'defectStatus', width: 14 },
  ]);
  const evidence = wb.addWorksheet('Evidence');
  evidence.columns = [{ header: 'Test Case', key: 'id', width: 34 }, { header: 'Screenshot', key: 'img', width: 40 }];
  evidence.getRow(1).font = { bold: true };
  let imageRow = 2;
  const STATUS = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', blocked: 'Blocked', notrun: 'Not Run' };

  for (const run of runs) {
    for (const t of run.tests) {
      const defect = t.status === 'failed' ? book.forTest(run.moduleId, t) : null;
      cases.addRow({ module: run.moduleName, run: run.id, id: t.id, name: t.scenario ?? t.title, priority: t.priority ?? '', status: STATUS[t.status] ?? t.status, duration: span(t.durationMs), skip: t.skipReason ?? '', defect: defect?.id ?? '', defectStatus: defect ? (defect.statusLabel ?? 'Not set') : '' });
    }
    for (const { test: t, defect } of failureRows(run, book)) {
      failures.addRow({ module: run.moduleName, run: run.id, id: t.id, name: t.scenario ?? t.title, reason: t.failure?.reason ?? NOT_CAPTURED, expected: expectedOf(t), actual: actualOf(t), message: (t.failure?.message ?? NOT_CAPTURED).slice(0, 4000), defect: defect?.id ?? '', defectStatus: defect ? (defect.statusLabel ?? 'Not set') : '' });
      for (const image of imagesOf(run, t)) {
        const id = wb.addImage({ buffer: readFileSync(image.path), extension: image.contentType === 'image/jpeg' ? 'jpeg' : 'png' });
        evidence.getCell(imageRow, 1).value = `${t.id} (${run.id})`;
        evidence.getRow(imageRow).height = 300;
        evidence.addImage(id, { tl: { col: 1, row: imageRow - 1 }, ext: { width: 180, height: 390 } });
        imageRow += 1;
      }
    }
  }
  wrapAll(cases);
  wrapAll(failures);
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TestNova';
  wb.created = new Date();
  return wb;
}

async function runExcel(run) {
  const book = defectBook();
  const wb = newWorkbook();
  const sheet = wb.addWorksheet('Summary');
  const c = counts(run);
  sheet.columns = [{ width: 26 }, { width: 44 }];
  const rows = [
    ['Project', projectName()], ['Module Name', run.moduleName], ['Execution ID', run.id], ['Execution Date and Time', when(run.startedAt)], ['Result', RUN_LABEL[run.status] ?? run.status],
    ['Total Test Cases', c.total], ['Passed Test Cases', c.passed], ['Failed Test Cases', c.failed], ['Skipped Test Cases', c.skipped + c.blocked], ['Not Run Test Cases', c.notrun],
    ['Execution Duration', span(run.durationMs)], ['Defects', defectIdsOf(run, book).join(', ') || 'None'], ['Environment', run.build?.version ?? '—'], ['Browser', run.device ?? '—'],
  ];
  for (const r of rows) sheet.addRow(r).getCell(1).font = { bold: true };
  const defects = runDefects(run, book);
  addTestCaseSheet(wb, runTestRows(run));
  addDefectSheet(wb, defectRows(defects));
  addDefectScreenshots(wb, defects);
  addRunDetails(wb, [run], book);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function consolidatedExcel() {
  const book = defectBook();
  const rows = consolidated();
  const wb = newWorkbook();
  const sheet = wb.addWorksheet('Summary');
  styled(sheet, [
    { header: 'Module', key: 'name', width: 24 }, { header: 'Execution ID', key: 'execution', width: 22 }, { header: 'Execution Date and Time', key: 'when', width: 24 }, { header: 'Result', key: 'result', width: 16 },
    { header: 'Total', key: 'total', width: 8 }, { header: 'Passed', key: 'passed', width: 8 }, { header: 'Failed', key: 'failed', width: 8 }, { header: 'Skipped', key: 'skipped', width: 8 },
    { header: 'Not Run', key: 'notrun', width: 8 }, { header: 'Defects', key: 'defects', width: 8 }, { header: 'Duration', key: 'duration', width: 10 },
  ]);
  for (const { module, run } of rows) sheet.addRow(moduleRow(module, run, book));
  const defects = book.all().sort(byId);
  addTestCaseSheet(wb, consolidatedTestRows(rows));
  addDefectSheet(wb, defectRows(defects));
  addDefectScreenshots(wb, defects);
  addRunDetails(wb, rows.map((r) => r.run).filter(Boolean), book);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The defect sheet on its own: every defect of the project, then their screenshots. */
async function defectSheet() {
  const defects = defectBook().all().sort(byId);
  const wb = newWorkbook();
  addDefectSheet(wb, defectRows(defects), 'Defect Sheet');
  addDefectScreenshots(wb, defects);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── the QA report (qa-report.mjs + qa-render.mjs) ───────────────────────────
// The consolidated report, each execution's summary report and workbook, and the defect sheet all
// come from the one report model, so they agree with each other and with the dashboard's report
// page. The detailed execution PDF above stays: it is the engineers' technical record (steps, stack
// traces, the full log), not a stakeholder report.
const qaPdf = async (runId) => reportPdf(await buildQaReport(pid, { runId }));
const qaExcel = async (runId) => reportExcel(await buildQaReport(pid, { runId }));

return {
  runPdf: (run, detailed) => (detailed ? runPdf(run, true) : qaPdf(run.id)),
  runExcel: (run) => qaExcel(run.id),
  consolidatedPdf: () => qaPdf(null),
  consolidatedExcel: () => qaExcel(null),
  defectSheet: async () => registerExcel(await buildQaReport(pid)),
  hasExecutions,
  // the previous layouts, kept for anyone who scripted against them
  legacy: { runExcel, consolidatedPdf, consolidatedExcel, defectSheet },
};
}
