/**
 * The two readable formats TestNova uses everywhere a person reads test cases or defects: the
 * Excel and PDF reports, the stage 7 defect sheet, and the tables the pipeline's agents write.
 *
 *   Test cases  Test Case ID | TC Created Date | Module | Test Title | Description |
 *               Test Steps / Steps to Reproduce | Test Data | Expected Result | Actual Result | Status
 *   Defects     Defect ID | Date | Module | Title | Description | Test Data / Required Info |
 *               Status | Screenshot / STR | Priority | Severity
 *
 * Every cell comes from a real source (test plan, execution, defect record). A value nobody
 * recorded reads "Not recorded"; nothing is made up. Credentials are never written: test data
 * names the .env variable, as the plans do.
 */
import { basename } from 'node:path';

export const TEST_CASE_COLUMNS = [
  { header: 'Test Case ID', key: 'id', width: 16, pdf: 8, nowrap: true },
  { header: 'TC Created Date', key: 'created', width: 14, pdf: 6.5, nowrap: true },
  { header: 'Module', key: 'module', width: 18, pdf: 7.5 },
  { header: 'Test Title', key: 'title', width: 38, pdf: 11 },
  { header: 'Description', key: 'description', width: 44, pdf: 13 },
  { header: 'Test Steps / Steps to Reproduce', key: 'steps', width: 46, pdf: 14 },
  { header: 'Test Data', key: 'testData', width: 30, pdf: 9 },
  { header: 'Expected Result', key: 'expected', width: 40, pdf: 12 },
  { header: 'Actual Result', key: 'actual', width: 40, pdf: 12 },
  { header: 'Status', key: 'status', width: 11, pdf: 7, nowrap: true },
];

export const DEFECT_COLUMNS = [
  { header: 'Defect ID', key: 'id', width: 12, pdf: 6.5, nowrap: true },
  { header: 'Date', key: 'date', width: 13, pdf: 7, nowrap: true },
  { header: 'Module', key: 'module', width: 18, pdf: 7.5 },
  { header: 'Title', key: 'title', width: 38, pdf: 11 },
  { header: 'Description', key: 'description', width: 52, pdf: 19 },
  { header: 'Test Data / Required Info', key: 'testData', width: 40, pdf: 14 },
  { header: 'Status', key: 'status', width: 13, pdf: 6.5, nowrap: true },
  { header: 'Screenshot / STR', key: 'str', width: 52, pdf: 17 },
  { header: 'Priority', key: 'priority', width: 10, pdf: 5.5, nowrap: true },
  { header: 'Severity', key: 'severity', width: 10, pdf: 5.5, nowrap: true },
];

export const TEST_STATUSES = ['Passed', 'Failed', 'Blocked', 'Skipped', 'Not Run'];
export const DEFECT_STATUS_OPTIONS = ['New', 'Assigned', 'Open', 'In Progress', 'Fixed', 'Resolved', 'Ready for QA', 'Retest', 'Closed', 'Reopened', 'Deferred'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const SEVERITIES = ['Blocker', 'Critical', 'Major', 'Minor', 'Trivial'];

const NOT_RECORDED = 'Not recorded';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 05-Nov-2026. Accepts a Date, epoch ms or an ISO / YYYY-MM-DD string; '' when there is none. */
export function dmy(value) {
  if (value == null || value === '') return '';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** "1. a<br>2. b", ["a", "b"] or "a\nb" as numbered lines: 1. a / 2. b. */
export function numbered(steps) {
  const lines = (Array.isArray(steps) ? steps : String(steps ?? '').split(/<br\s*\/?>|\r?\n/i))
    .map((s) => String(s).trim().replace(/^(\d+[.)]|[-*•])\s*/, ''))
    .filter(Boolean);
  return lines.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

/** Test titles come from spec names ("valid user signs in"); a sheet reads better capitalised. */
const sentence = (s) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : NOT_RECORDED);

const STATUS_LABEL = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', blocked: 'Blocked', notrun: 'Not Run', pending: 'Not Run', running: 'Not Run' };

/**
 * What a test case is for, in a sentence: the plan's Description column when it has one, else the
 * part of the test title after the scenario, else what the plan says about it (type, AC,
 * preconditions). Never a guess.
 */
function describe(test) {
  if (test.planDescription) return test.planDescription;
  if (test.description) return test.description;
  const parts = [];
  const type = test.type?.replace(/^\d+\s*[-.]\s*/, '');
  if (type) parts.push(`${type} test`);
  if (test.ac && !/^none\b/i.test(test.ac)) parts.push(`covers ${test.ac}`);
  let text = parts.join(', ');
  if (test.preconditions && !/^none\b/i.test(test.preconditions)) text += `${text ? '. ' : ''}Precondition: ${test.preconditions}`;
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : NOT_RECORDED;
}

/**
 * A failure in words a reader understands: the linked defect's own "actual" (written for people),
 * else what the check received against what it expected, else the check that failed. The raw
 * error stays in the reports' Failures sheet.
 */
export function failedActual(failure, defect) {
  if (defect?.actual) return defect.actual;
  const real = (v) => v != null && v !== '' && v !== 'null' && v !== 'undefined';
  if (real(failure?.actual) && real(failure?.expected)) return `The page gave ${failure.actual} where ${failure.expected} was expected.`;
  if (failure?.actual === 'null') return `The expected value was not found on the page${real(failure?.expected) ? ` (expected ${failure.expected})` : ''}.`;
  const check = (failure?.reason ?? failure?.message ?? '').split('\n')[0].replace(/^Error:\s*/, '').replace(/\s*\/\/.*$/, '').trim();
  return check ? `The automated check failed (${check}). The error is in the Failures sheet.` : 'Failed (no detail captured).';
}

/** What the execution saw, in words a reader understands. */
function actualOf(result, defect) {
  if (!result) return 'Not executed yet';
  switch (result.status) {
    case 'passed': return 'As expected';
    case 'failed': return failedActual(result.failure, defect);
    case 'skipped':
    case 'blocked': return result.skipReason ? `Not executed: ${result.skipReason}` : 'Not executed';
    default: return 'Not executed';
  }
}

/**
 * One test case row. `test` is the catalogue entry with its test plan fields, `result` its outcome
 * in an execution (or null when it has never run), `defect` the defect linked to its failure.
 */
export function testCaseRow({ test, moduleName, result = null, defect = null }) {
  return {
    id: test.id,
    created: dmy(test.created),
    module: moduleName,
    title: sentence(test.scenario ?? test.title),
    description: describe(test),
    steps: test.steps ? numbered(test.steps) : NOT_RECORDED,
    testData: test.testData || NOT_RECORDED,
    // the plan's expectation is written for people; an assertion's literal value is the fallback
    expected: test.expected ?? result?.expectedResult ?? result?.failure?.expected ?? NOT_RECORDED,
    actual: actualOf(result, defect),
    status: result ? (STATUS_LABEL[result.status] ?? result.status) : 'Not Run',
  };
}

/** One defect row. `moduleName` maps the record's module id to the name people know. */
export function defectRow(d, moduleName = (m) => m) {
  const description = [d.description, d.expected && `Expected: ${d.expected}`, d.actual && `Actual: ${d.actual}`].filter(Boolean).join('\n\n');
  const info = [d.testData, d.tests?.length && `Test cases: ${d.tests.join(', ')}`, d.executions?.length && `Executions: ${d.executions.join(', ')}`].filter(Boolean).join('\n');
  const steps = d.steps?.length ? `Steps to reproduce:\n${numbered(d.steps)}` : '';
  const shots = (d.evidence ?? []).filter((e) => /\.(png|jpe?g|webp)$/i.test(e)).map((e) => basename(e));
  const str = [steps, shots.length && `Screenshots:\n${shots.join('\n')}`].filter(Boolean).join('\n\n');
  return {
    id: d.id,
    date: dmy(d.date ?? d.createdAt),
    module: d.module ? moduleName(d.module) : NOT_RECORDED,
    title: d.title || NOT_RECORDED,
    description: description || NOT_RECORDED,
    testData: info || NOT_RECORDED,
    status: d.statusLabel ?? d.status ?? 'New',
    str: str || NOT_RECORDED,
    priority: d.priority || NOT_RECORDED,
    severity: d.severity || NOT_RECORDED,
  };
}

// ── Excel ───────────────────────────────────────────────────────────────────
const FILL = {
  green: 'FFC6EFCE', red: 'FFFFC7CE', darkRed: 'FFE6A1A8', orange: 'FFFFD8A8', yellow: 'FFFFEB9C', grey: 'FFE7E9EE', blue: 'FFD6E4FF',
};
const FONT = { green: 'FF006100', red: 'FF9C0006', darkRed: 'FF6B0010', orange: 'FF8A4B00', yellow: 'FF7A5B00', grey: 'FF4A4F5C', blue: 'FF1F3A93' };

function colour(sheet, column, rows, map) {
  const letter = sheet.getColumn(column).letter;
  const ref = `${letter}2:${letter}${Math.max(rows + 1, 2)}`;
  sheet.addConditionalFormatting({
    ref,
    rules: Object.entries(map).map(([value, tone], i) => ({
      type: 'cellIs', operator: 'equal', priority: i + 1, formulae: [`"${value}"`],
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: FILL[tone] } }, font: { color: { argb: FONT[tone] }, bold: true } },
    })),
  });
}

function dropdown(sheet, column, rows, values) {
  const letter = sheet.getColumn(column).letter;
  for (let r = 2; r <= rows + 1; r += 1) {
    sheet.getCell(`${letter}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${values.join(',')}"`] };
  }
}

/** Header, frozen first row, filters, wrapping, borders: a sheet anyone can read and sort. */
function table(sheet, columns, rows) {
  sheet.columns = columns;
  for (const row of rows) sheet.addRow(row);
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F3A8F' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const border = { style: 'thin', color: { argb: 'FFD9DBE3' } };
  sheet.eachRow((row, i) => {
    if (i > 1) row.alignment = { wrapText: true, vertical: 'top' };
    row.eachCell((cell) => {
      cell.border = { top: border, left: border, bottom: border, right: border };
    });
  });
}

export function addTestCaseSheet(wb, rows, name = 'Test Cases') {
  const sheet = wb.addWorksheet(name);
  table(sheet, TEST_CASE_COLUMNS, rows);
  colour(sheet, 'status', rows.length, { Passed: 'green', Failed: 'red', Blocked: 'orange', Skipped: 'yellow', 'Not Run': 'grey' });
  return sheet;
}

export function addDefectSheet(wb, rows, name = 'Defects') {
  const sheet = wb.addWorksheet(name);
  table(sheet, DEFECT_COLUMNS, rows);
  colour(sheet, 'status', rows.length, { Fixed: 'green', Resolved: 'green', Closed: 'green', 'Ready for QA': 'blue', Retest: 'blue', 'In Progress': 'yellow', New: 'orange', Assigned: 'orange', Open: 'red', Reopened: 'red', Deferred: 'grey' });
  colour(sheet, 'priority', rows.length, { Critical: 'darkRed', High: 'orange', Medium: 'yellow', Low: 'green' });
  colour(sheet, 'severity', rows.length, { Blocker: 'darkRed', Critical: 'red', Major: 'orange', Minor: 'yellow', Trivial: 'green' });
  dropdown(sheet, 'status', rows.length, DEFECT_STATUS_OPTIONS);
  dropdown(sheet, 'priority', rows.length, PRIORITIES);
  dropdown(sheet, 'severity', rows.length, SEVERITIES);
  return sheet;
}

// ── HTML (PDF) ──────────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cell = (v) => esc(v).replace(/\n/g, '<br>');
const STATUS_CLASS = { Passed: 's-passed', Failed: 's-failed', Blocked: 's-blocked', Skipped: 's-blocked' };

/** A fixed-layout table: each column its share of the page; IDs, dates and statuses never wrap. */
function htmlTable(columns, rows, classOf = () => '') {
  const cols = columns.map((c) => `<col style="width:${c.pdf}%">`).join('');
  const head = columns.map((c) => `<th>${esc(c.header)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td class="${[c.nowrap ? 'nw' : '', classOf(c, r)].filter(Boolean).join(' ')}">${cell(r[c.key])}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="fmt"><colgroup>${cols}</colgroup><tr>${head}</tr>${body}</table>`;
}

export function testCaseTableHtml(rows) {
  if (!rows.length) return '<p class="muted">No test cases.</p>';
  return htmlTable(TEST_CASE_COLUMNS, rows, (c, r) => (c.key === 'status' ? (STATUS_CLASS[r.status] ?? '') : ''));
}

export function defectTableHtml(rows) {
  if (!rows.length) return '<p class="muted">No defect is linked.</p>';
  return htmlTable(DEFECT_COLUMNS, rows);
}
