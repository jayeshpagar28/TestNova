/**
 * The QA report (qa-report.mjs) as a PDF and an Excel workbook. Presentation only: every figure,
 * sentence and link comes from the report model, so the PDF, the workbook and the dashboard agree.
 *
 * PDF: portrait A4, printed by the installed Chrome (playwright-core). Header and footer on every
 * page (project, report date, report id, page x of y); tables never split a row across pages;
 * screenshots at full column width with numbered captions.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dmy } from './formats.mjs';
import { NOT_PROVIDED, NO_COVERAGE, NO_EVIDENCE } from './qa-report.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const { chromium } = require('playwright-core');

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const txt = (v) => esc(v).replace(/\n/g, '<br>');
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : NOT_PROVIDED);
const pctText = (v) => (v == null ? '—' : `${v}%`);
const duration = (ms) => {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

// ── the status colours, the same everywhere ──────────────────────────────────
export const TONES = {
  green: { fg: '#0b6b3a', bg: '#e3f4ea', xfg: 'FF0B6B3A', xbg: 'FFE3F4EA' },
  red: { fg: '#a1192f', bg: '#fbe5e8', xfg: 'FFA1192F', xbg: 'FFFBE5E8' },
  orange: { fg: '#8a4a00', bg: '#fdeed8', xfg: 'FF8A4A00', xbg: 'FFFDEED8' },
  grey: { fg: '#4a4f5c', bg: '#eceef2', xfg: 'FF4A4F5C', xbg: 'FFECEEF2' },
  blue: { fg: '#1f3a93', bg: '#e3eafc', xfg: 'FF1F3A93', xbg: 'FFE3EAFC' },
};
export const toneOf = (value) => {
  const v = String(value ?? '');
  if (/^(Passed|Resolved|Closed|Completed – all)/.test(v)) return 'green';
  if (/^(Failed|Open|Reopened|Not ready|Completed – issues|Partially executed – issues|P0|Critical)/.test(v)) return 'red';
  if (/^(In Progress|Retest|Pending|Conditional|Release only|Partially executed – no|Passed with gaps|Skipped|P1|High)/.test(v)) return 'orange';
  if (/^(Not Executed|Not Provided|Not resolved|Coverage Not|Evidence Not|Testing not)/.test(v)) return 'grey';
  return 'blue';
};
const badge = (value, tone = toneOf(value)) => `<span class="badge" style="color:${TONES[tone].fg};background:${TONES[tone].bg}">${esc(value)}</span>`;

const CSS = `
@page{size:A4;margin:20mm 14mm 18mm 14mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:10pt/1.5 "Segoe UI",Arial,sans-serif;color:#1d2230;margin:0}
h1{font-size:24pt;font-weight:600;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:15pt;font-weight:600;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #2f3a8f;color:#1b2266;break-after:avoid}
h3{font-size:11.5pt;font-weight:600;margin:16px 0 6px;break-after:avoid;color:#1b2266}
h4{font-size:10pt;font-weight:600;margin:10px 0 4px;break-after:avoid}
p{margin:0 0 8px}
.brand{color:#2f3a8f;letter-spacing:.24em;font-size:9pt;font-weight:700;margin:0 0 18px}
.muted{color:#5d6475}.small{font-size:8.5pt}
.section{break-before:page}
.lead{font-size:11pt;line-height:1.6;background:#f4f6fb;border-left:4px solid #2f3a8f;padding:10px 14px;border-radius:4px;margin:10px 0 14px}
table{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:9pt}
th,td{border:1px solid #d6d9e2;padding:5px 7px;vertical-align:top;text-align:left;overflow-wrap:break-word;word-break:normal;hyphens:manual}
table.fixed{table-layout:fixed}.nw{white-space:nowrap}
thead th{background:#2f3a8f;color:#fff;font-weight:600}
thead{display:table-header-group}
tr{break-inside:avoid}
td.num,th.num{text-align:right;white-space:nowrap}
table.kv th{width:30%;background:#f1f3f8;color:#1d2230;font-weight:600}
table.zebra tbody tr:nth-child(even) td{background:#f8f9fc}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-weight:600;font-size:8.5pt;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px}
.card{border:1px solid #d6d9e2;border-radius:8px;padding:8px 10px;break-inside:avoid}
.card b{display:block;font-size:17pt;font-weight:600;line-height:1.2}
.card span{font-size:8.5pt;color:#5d6475}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:4px 0 2px;background:#eceef2}
.bar i{display:block;height:100%}
.legend{display:flex;gap:14px;font-size:8.5pt;color:#5d6475;margin-bottom:10px}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.block{border:1px solid #d6d9e2;border-radius:8px;padding:10px 12px;margin:0 0 12px;break-inside:avoid}
.block.tall{break-inside:auto}
.block-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:6px}
.block-head b{font-size:10.5pt}
.callout{border-radius:6px;padding:9px 12px;margin:8px 0 12px;break-inside:avoid}
.callout.warn{background:#fdeed8;border:1px solid #f0c98a}
.callout.bad{background:#fbe5e8;border:1px solid #eab0b9}
.callout.ok{background:#e3f4ea;border:1px solid #a6d9b9}
.callout.info{background:#e3eafc;border:1px solid #b3c3ef}
figure{margin:8px 0 14px;break-inside:avoid}
figure img{display:block;max-width:100%;max-height:190mm;border:1px solid #d6d9e2;border-radius:4px}
figure.narrow img{max-width:60%}
figcaption{font-size:8.5pt;color:#40475a;margin-top:4px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6fb;border-radius:4px;padding:6px 8px;font:8pt/1.4 Consolas,monospace;margin:4px 0 8px}
ul{margin:4px 0 10px;padding-left:18px}li{margin:2px 0}
.toc td{border:none;padding:2px 0}
`;

/** A horizontal stacked bar of the four test outcomes. */
function outcomeBar(c) {
  const total = c.total || 1;
  const part = (n, tone) => (n ? `<i style="width:${(n / total) * 100}%;background:${TONES[tone].fg}"></i>` : '');
  return `<div class="bar" role="img" aria-label="${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped, ${c.notExecuted} not executed">${part(c.passed, 'green')}${part(c.failed, 'red')}${part(c.skipped, 'orange')}${part(c.notExecuted, 'grey')}</div>`;
}
const legend = `<div class="legend"><span><i style="background:${TONES.green.fg}"></i>Passed</span><span><i style="background:${TONES.red.fg}"></i>Failed</span><span><i style="background:${TONES.orange.fg}"></i>Skipped</span><span><i style="background:${TONES.grey.fg}"></i>Not executed</span></div>`;

function table(head, rows, { cls = 'zebra', num = [], widths = null } = {}) {
  return `<table class="${cls}${widths ? ' fixed' : ''}">${widths ? `<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>` : ''}<thead><tr>${head.map((h, i) => `<th class="${num.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${num.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const kv = (rows) => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;

/** "P1 (proposed by the defect analysis; recorded as High)". */
function classText(c) {
  if (c.pending) return `${esc(c.value)}${c.recorded ? ` <span class="muted small">(recorded as "${esc(c.recorded)}")</span>` : ''}`;
  const notes = [c.provisional ? 'proposed by the automated analysis, to be confirmed by QA' : null, !c.standard && c.recorded ? `recorded as ${c.recorded}` : null].filter(Boolean);
  return `${badge(c.value)}${notes.length ? ` <span class="muted small">(${esc(notes.join('; '))})</span>` : ''}`;
}

const figRefs = (evidence) => {
  const n = evidence.filter((e) => e.figure).map((e) => e.figure);
  return n.length ? `Figure${n.length === 1 ? '' : 's'} ${n.join(', ')}` : NO_EVIDENCE;
};

// ── the HTML ─────────────────────────────────────────────────────────────────
export function reportHtml(r) {
  const t = r.totals;
  const browsers = r.meta.browsers.length ? r.meta.browsers.map((b) => `${b.name} ${b.version ?? `<span class="muted">(version: ${esc(b.versionNote.charAt(0).toLowerCase() + b.versionNote.slice(1))})</span>`}`).join(', ') : NOT_PROVIDED;
  const problems = r.validation.filter((v) => v.level !== 'info');

  // page 1: what was tested, how it went, what to do
  const cover = `
  <p class="brand">TESTNOVA · QA TEST REPORT</p>
  <h1>${esc(r.meta.project.name)}</h1>
  <p class="muted">${esc(r.meta.scope === 'execution' ? `Execution report for ${r.modules[0]?.name ?? ''}` : 'Consolidated QA report across all modules')} · Generated ${esc(when(r.meta.generatedAt))}</p>
  ${kv([
    ['Report ID', esc(r.meta.reportId)], ['Project / application', esc(r.meta.project.name)], ['Application URL', esc(r.meta.project.url)], ['Testing environment', esc(r.meta.project.environment)],
    ['Application version / build', esc(r.meta.build)], ['Browser and version', browsers], ['Device', esc(r.meta.device)],
    ['Execution start', esc(when(r.meta.executionStart))], ['Execution end', esc(when(r.meta.executionEnd))], ['Report generated', esc(when(r.meta.generatedAt))],
    ['Test suite / execution', `${esc(r.meta.suite)}<br><span class="muted small">${esc(r.meta.executionIds.join(', ') || 'None')}</span>`],
  ])}
  ${problems.length ? `<div class="callout warn"><b>Data validation:</b> ${problems.length} issue${problems.length === 1 ? '' : 's'} found while checking the data behind this report. The figures use the per-test results; see Appendix B for each issue and its source.</div>` : '<div class="callout ok"><b>Data validation:</b> every check passed (Appendix B).</div>'}`;

  const s1 = `
  <section style="margin-top:18px"><h2>1. Executive Summary</h2>
  <p class="lead">${esc(r.summary)}</p>
  ${kv([
    ['Overall testing status', badge(r.overall.label, r.overall.tone)],
    ['QA recommendation', `${badge(r.recommendation.verdict, r.recommendation.tone)}<br>${esc(r.recommendation.text)}`],
    ['Modules tested', `${t.modulesExecuted} of ${t.modules}`],
    ['Total test cases', t.total], ['Passed', `${t.passed} (${pctText(t.passPct)})`], ['Failed', `${t.failed} (${pctText(t.failPct)})`], ['Skipped', t.skipped], ['Not executed', t.notExecuted],
    ['Unique defects', `${t.uniqueDefects} in the register · ${t.openDefects} open · ${t.defectsLinkedToFailures} behind the failures in this report`],
  ])}
  <p class="muted small">${esc(r.meta.definitions.passPct)} ${esc(r.meta.definitions.defects)}</p>
  </section>`;

  // section 2: the figures at a glance
  const pri = r.observations.outstanding.byPriority;
  const sevCounts = ['Critical', 'High', 'Medium', 'Low', 'Pending QA Classification'].map((s) => [s, r.register.filter((d) => d.severity.value === s).length]).filter(([, n]) => n);
  const statusCounts = r.observations.outstanding.byStatus;
  const s2 = `
  <section class="section"><h2>2. Overall Testing Summary</h2>
  <div class="cards">
    <div class="card"><b>${t.total}</b><span>Total test cases</span></div>
    <div class="card"><b style="color:${TONES.green.fg}">${t.passed}</b><span>Passed · ${pctText(t.passPct)}</span></div>
    <div class="card"><b style="color:${TONES.red.fg}">${t.failed}</b><span>Failed · ${pctText(t.failPct)}</span></div>
    <div class="card"><b style="color:${TONES.blue.fg}">${t.uniqueDefects}</b><span>Unique defects (${t.openDefects} open)</span></div>
    <div class="card"><b style="color:${TONES.orange.fg}">${t.skipped}</b><span>Skipped</span></div>
    <div class="card"><b style="color:${TONES.grey.fg}">${t.notExecuted}</b><span>Not executed</span></div>
    <div class="card"><b>${t.failedLinked}</b><span>Failures linked to a defect</span></div>
    <div class="card"><b style="color:${t.failedUnlinked ? TONES.red.fg : 'inherit'}">${t.failedUnlinked}</b><span>Failures not linked</span></div>
  </div>
  ${outcomeBar(t)}${legend}
  <p class="muted small">Failed test cases and defects are counted separately: several failed test cases can come from one defect, and one test case can be affected by several defects.</p>
  <h3>2.1 Module-wise summary</h3>
  ${table(['Module', 'Total cases', 'Passed', 'Failed', 'Skipped', 'Not executed', 'Pass %', 'Defects', 'Status'],
    r.modules.map((m) => [esc(m.name), m.total, m.passed, m.failed, m.skipped, m.notExecuted, pctText(m.passPct), m.defectIds.length, badge(m.status.label, m.status.tone)])
      .concat([[`<b>All modules</b>`, `<b>${t.total}</b>`, `<b>${t.passed}</b>`, `<b>${t.failed}</b>`, `<b>${t.skipped}</b>`, `<b>${t.notExecuted}</b>`, `<b>${pctText(t.passPct)}</b>`, `<b>${t.defectsLinkedToFailures}</b>`, '']]),
    { num: [1, 2, 3, 4, 5, 6, 7] })}
  <p class="muted small">"Defects" is the number of unique defects behind each module's failures. A defect that affects several modules is counted in each of them, so the module figures can add up to more than the overall unique count (${t.defectsLinkedToFailures}).</p>
  <h3>2.2 Defects by priority, severity and status</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
    <div>${table(['Priority (open)', 'Count'], pri.map(([k, n]) => [badge(k), n]), { num: [1] })}</div>
    <div>${table(['Severity (all)', 'Count'], sevCounts.map(([k, n]) => [badge(k), n]), { num: [1] })}</div>
    <div>${table(['Status', 'Count'], statusCounts.map(([k, n]) => [badge(k), n]), { num: [1] })}</div>
  </div>
  <h3>2.3 Accessibility coverage by theme</h3>
  ${r.accessibility.available
    ? `${table(['Theme', 'Test cases', 'Passed', 'Failed', 'Not tested', 'Defects'], r.accessibility.themes.map((x) => x.available
      ? [esc(x.label), x.tests, x.passed, x.failed, x.notTested, esc(x.defects.join(', ') || 'None')]
      : [esc(x.label), `<span class="muted">${NO_COVERAGE}</span>`, '—', '—', '—', '—']), { num: [1, 2, 3, 4] })}
       <p class="muted small">${esc(r.accessibility.basis)} ${r.accessibility.testCases} test case${r.accessibility.testCases === 1 ? '' : 's'} scanned in at least one theme (${r.accessibility.scans} scans). "Not tested" counts those test cases with no scan in that theme.</p>`
    : `<div class="callout info">${NO_COVERAGE}: the executions in this report kept no theme-specific accessibility scans.</div>`}
  <h3>2.4 Comparison with the previous execution</h3>
  ${r.comparison.available
    ? `${table(['Module', 'Previous execution', 'Pass %', 'This execution', 'Pass %', 'Change', 'Fixed tests', 'New failures'], r.comparison.modules.map((m) => [
      esc(m.name), `<span class="nw small">${esc(m.previous ?? '—')}</span>`, pctText(m.previousPassPct), `<span class="nw small">${esc(m.current)}</span>`, pctText(m.passPct),
      m.change == null ? '—' : `${m.change > 0 ? '+' : ''}${m.change} pts${m.sameCoverage === false ? ' *' : ''}`, esc(m.improved?.join(', ') || '—'), esc(m.regressed?.join(', ') || '—'),
    ]), { num: [2, 4, 5] })}
    ${r.comparison.modules.filter((m) => m.note && m.previous).map((m) => `<p class="muted small">* ${esc(m.name)}: ${esc(m.note)}</p>`).join('')}
    ${kv([['New defects', esc(r.comparison.defects.new.join(', ') || 'None')], ['No longer failing', esc(r.comparison.defects.resolved.join(', ') || 'None')], ['Reopened / failed retest', esc(r.comparison.defects.reopened.join(', ') || 'None')], ['Persistent', esc(r.comparison.defects.persistent.join(', ') || 'None')]])}
    <p class="muted small">${esc(r.comparison.note)}</p>`
    : `<p class="muted">${esc(r.comparison.note)}</p>`}
  </section>`;

  // section 3: one block per module
  const s3 = `
  <section class="section"><h2>3. Module-Wise Testing Summary</h2>
  ${r.modules.map((m) => `
    <div class="block">
      <div class="block-head"><b>${esc(m.name)}</b>${badge(m.status.label, m.status.tone)}</div>
      ${outcomeBar(m)}
      ${table(['Total', 'Passed', 'Failed', 'Skipped', 'Not executed', 'Pass %', 'Defects'], [[m.total, m.passed, m.failed, m.skipped, m.notExecuted, pctText(m.passPct), m.defectIds.length]], { num: [0, 1, 2, 3, 4, 5, 6] })}
      <p>${esc(m.explanation)}</p>
      ${m.defectIds.length ? `<p class="small"><b>Defects identified:</b> ${m.defectIds.map((id) => { const d = r.register.find((x) => x.id === id); return `${esc(id)}${d ? ` ${esc(d.title)}` : ''}`; }).join('; ')}</p>` : ''}
      <p class="muted small">Execution ${esc(m.executionId ?? 'none')}${m.executedAt ? ` · ${esc(when(m.executedAt))} · ${esc(duration(m.durationMs))}` : ''}</p>
    </div>`).join('')}
  </section>`;

  // section 4: the register
  const s4 = `
  <section class="section"><h2>4. Consolidated Defect Register</h2>
  <p>Every unique defect recorded for ${esc(r.meta.project.name)}, whatever its status. ${r.register.length} defect${r.register.length === 1 ? '' : 's'}; ${r.totals.openDefects} open.</p>
  ${table(['Defect ID', 'Module', 'Title', 'Status', 'Priority', 'Severity', 'Type', 'Failing test cases'], r.register.map((d) => [
    `<b class="nw">${esc(d.id)}</b>${d.aliases.length ? `<br><span class="muted small nw">also ${d.aliases.map(esc).join('<br>')}</span>` : ''}`, esc(d.module), esc(d.title), badge(d.status), badge(d.priority.value), badge(d.severity.value), esc(d.type),
    d.failingTests.length ? `<span class="small">${d.failingTests.map((x) => `<span class="nw">${esc(x)}</span>`).join('<br>')}</span>` : '—',
  ]), { widths: [13, 12, 23, 8, 8, 9, 12, 15] })}
  <p class="muted small">Priority and severity use the standard scales (Appendix C). Values the automated defect analysis proposed are marked as such until QA confirms them.</p>
  ${r.register.map((d) => `
    <div class="block tall">
      <div class="block-head"><b>${esc(d.id)} · ${esc(d.title)}</b>${badge(d.status)}</div>
      ${kv([
        ['Defect ID', `${esc(d.id)}${d.aliases.length ? ` <span class="muted">(earlier id ${esc(d.aliases.join(', '))})</span>` : ''}`], ['Date reported', esc(d.dateReported)], ['Store', esc(d.store)], ['Instance', esc(d.instance)], ['Module', esc(d.module)], ['Title', esc(d.title)],
        ['Description', txt(d.description)], ['Test data', txt(d.testData)], ['Steps to reproduce', txt(d.steps)], ['Expected result', txt(d.expected)], ['Actual result', txt(d.actual)],
        ['Status', badge(d.status)], ['Screenshot / STR', `${figRefs(d.evidence)}${d.evidence.some((e) => e.kind === 'video') ? ` · ${d.evidence.filter((e) => e.kind === 'video').length} screen recording(s)` : ''}`],
        ['Priority', classText(d.priority)], ['Severity', classText(d.severity)], ['Type', esc(d.type)], ['Developer assigned', esc(d.developer)], ['Resolved date', esc(d.resolvedDate)],
        ['Developer comment', txt(d.devComment)], ['QA comment', txt(d.qaComment)], ['Changes applied', txt(d.changes)],
        ['Test cases', esc(d.tests.join(', ') || '—')],
        ...(d.history.length ? [['Status history', d.history.map((h) => `${esc(dmy(h.at))}: ${h.to ? `${esc(h.from ?? '—')} → ${esc(h.to)}` : `updated ${esc(h.fields?.join(', '))}`} (${esc(h.by)})`).join('<br>')]] : []),
        ...(d.flags.length ? [['Needs attention', d.flags.map(esc).join('<br>')]] : []),
      ])}
    </div>`).join('')}
  </section>`;

  // section 5: failed tests
  const s5 = `
  <section class="section"><h2>5. Failed Test Case Details</h2>
  <p>${r.failures.length} test case${r.failures.length === 1 ? '' : 's'} failed. A failed test case is not automatically a new defect: each is linked to the defect behind it, or marked for investigation. The original automation error of each is in Appendix A.</p>
  ${r.failures.map((f, i) => `
    <div class="block">
      <div class="block-head"><b>${esc(f.id)} · ${esc(f.title)}</b>${badge('Failed')}</div>
      ${kv([
        ['Module', esc(f.module)], ['Test scenario', esc(f.scenario)], ['Test data', esc(f.testData)],
        ['What went wrong', esc(f.simple)], ['Expected behaviour', txt(f.expected)], ['Actual behaviour', txt(f.actual)],
        ['Business impact', `${esc(f.impact)}${f.impactBasis ? ` <span class="muted small">(based on the ${esc(f.impactBasis)})</span>` : ''}`],
        ['Associated defect', f.defectLinks.length ? f.defectLinks.map((l) => `<b>${esc(l.id)}</b> ${esc(l.title)} <span class="muted small">(${esc(l.label)})</span>`).join('<br>') : badge(f.defectNote, 'red')],
        ['Screenshot / evidence', `${figRefs(f.evidence)}${f.evidence.some((e) => e.kind === 'video') ? ` · screen recording kept with execution ${esc(f.executionId)}` : ''}`],
        ['Execution status', `Failed in ${esc(f.executionId)}${f.retried ? ' (also failed on retry)' : ''} · technical details: Appendix A.${i + 1}`],
        ...(f.unresolvedTags.length ? [['Note', `The test names ${esc(f.unresolvedTags.join(', '))}, which is not in the defect register.`]] : []),
        ...(f.analysis.length ? [['Earlier analysis', f.analysis.map(esc).join('<br>')]] : []),
      ])}
    </div>`).join('') || '<p class="muted">No test case failed.</p>'}
  </section>`;

  // section 6: evidence, grouped by defect
  const shown = new Set();
  const figureHtml = (f) => {
    const img = r.figures.find((x) => x.n === f.figure);
    if (!img || shown.has(img.n)) return f.figure ? `<p class="small muted">See Figure ${f.figure}.</p>` : '';
    shown.add(img.n);
    const data = readFileSync(img.path).toString('base64');
    return `<figure><img data-figure="${img.n}" alt="${esc(img.caption)}" src="data:${img.contentType ?? 'image/png'};base64,${data}"><figcaption><b>Figure ${img.n}.</b> ${esc(img.caption)}</figcaption></figure>`;
  };
  const others = (list) => {
    const items = list.filter((e) => e.kind !== 'image' || !e.figure);
    if (!items.length) return '';
    // many recordings of one test (one per page it opened) read as one line per test and kind
    const groups = new Map();
    for (const e of items) {
      const folder = e.file.replace(/\/[^/]+$/, '');
      const test = e.caption.match(/\b(TC-[\w-]+)/)?.[1] ?? '';
      const kind = e.kind === 'video' ? 'Screen recording' : e.kind === 'image' ? 'Earlier-attempt screenshot' : e.caption.replace(/ of TC-.*| \(.*$/, '');
      const key = `${kind}|${test}|${folder}`;
      groups.set(key, { kind, test, folder, files: [...(groups.get(key)?.files ?? []), e.file.split('/').pop()] });
    }
    return `<h4>Other evidence kept</h4><ul class="small">${[...groups.values()].map((g) => `<li>${esc(g.files.length === 1 ? g.kind : `${g.files.length} × ${g.kind.toLowerCase()}`)}${g.test ? ` of ${esc(g.test)}` : ''}: <span class="muted">${esc(g.folder)}/${g.files.length === 1 ? esc(g.files[0]) : ''}</span></li>`).join('')}</ul>`;
  };
  const unlinkedFailures = r.failures.filter((f) => !f.defectIds.length);
  const s6 = `
  <section class="section"><h2>6. Screenshots and Supporting Evidence</h2>
  <p>Screenshots are shown at full width with what they show. Screen recordings, step-by-step traces and network logs cannot be printed; they are listed with the file they are kept in, under the project's execution folder.</p>
  ${r.register.map((d) => `
    <h3>${esc(d.id)} · ${esc(d.title)}</h3>
    ${d.evidence.length ? d.evidence.filter((e) => e.kind === 'image' && e.figure).map(figureHtml).join('') + others(d.evidence) : `<p class="muted">${NO_EVIDENCE}.</p>`}`).join('')}
  ${unlinkedFailures.length ? `<h3>Failures not linked to a defect</h3>${unlinkedFailures.map((f) => `<h4>${esc(f.id)} · ${esc(f.title)}</h4>${f.evidence.length ? f.evidence.filter((e) => e.kind === 'image' && e.figure).map(figureHtml).join('') + others(f.evidence) : `<p class="muted">${NO_EVIDENCE}.</p>`}`).join('')}` : ''}
  </section>`;

  // section 7: observations and recommendation
  const o = r.observations;
  const list = (items, empty = 'None.') => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`);
  const s7 = `
  <section class="section"><h2>7. Final QA Observations and Recommendations</h2>
  <div class="callout ${r.recommendation.tone === 'green' ? 'ok' : r.recommendation.tone === 'red' ? 'bad' : r.recommendation.tone === 'grey' ? 'info' : 'warn'}">
    <b>QA recommendation: ${esc(r.recommendation.verdict)}.</b> ${esc(r.recommendation.text)}
    ${r.recommendation.reasons.length ? `<ul>${r.recommendation.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>
  <h3>7.1 Major issues (open, P0/P1 or Critical/High)</h3>
  ${list(o.majorIssues.map((d) => `<b>${esc(d.id)}</b> ${esc(d.title)} · ${esc(d.module)} · ${badge(d.priority)} ${badge(d.severity)}`))}
  <h3>7.2 Modules requiring attention</h3>
  ${list(o.modulesNeedingAttention.map((m) => `<b>${esc(m.name)}</b>: ${esc(m.reason)}`))}
  <h3>7.3 Outstanding defects</h3>
  <p>${o.outstanding.open} defect${o.outstanding.open === 1 ? ' is' : 's are'} open${o.outstanding.byPriority.length ? `: ${o.outstanding.byPriority.map(([p, n]) => `${n} ${p}`).join(', ')}` : ''}.</p>
  <h3>7.4 Accessibility observations</h3>
  ${list(o.accessibility.map(esc))}
  <h3>7.5 Areas requiring additional testing</h3>
  ${list(o.additionalTesting.map(esc))}
  </section>`;

  // appendices
  const appA = `
  <section class="section"><h2>Appendix A. Technical Details of Failures</h2>
  <p class="muted">The original automation errors, for developers and QA engineers.</p>
  ${r.failures.map((f, i) => `<h4>A.${i + 1} ${esc(f.id)} (${esc(f.module)}, ${esc(f.executionId)})</h4><pre>${esc((f.technical ?? 'Not recorded').slice(0, 1200))}${(f.technical ?? '').length > 1200 ? '\n… (the full text is in the Excel workbook, Technical Logs sheet)' : ''}</pre>${f.trace ? `<p class="small muted">Trace: ${esc(f.trace)}</p>` : ''}`).join('') || '<p class="muted">No failures.</p>'}
  </section>`;
  const appB = `
  <section class="section"><h2>Appendix B. Data Validation</h2>
  <p>Before the report is generated, its data is checked: module totals against the overall total; passed + failed + skipped + not executed against each total; unique defect ids; every defect reference; missing defect fields; possible duplicates; and every evidence file. Nothing is corrected silently: each finding is listed with its source.</p>
  ${r.validation.length ? table(['Level', 'Check', 'Finding', 'Source'], r.validation.map((v) => [badge(v.level === 'error' ? 'Error' : v.level === 'warning' ? 'Warning' : 'Info', v.level === 'error' ? 'red' : v.level === 'warning' ? 'orange' : 'blue'), esc(v.check), esc(v.message), `<span class="small">${esc(v.source)}</span>`])) : '<div class="callout ok">Every check passed.</div>'}
  <p class="muted small">Report fingerprint ${esc(r.meta.fingerprint)}: the dashboard, this PDF and the Excel workbook show the same fingerprint when they come from the same data.</p>
  </section>`;
  const appC = `
  <section class="section"><h2>Appendix C. Classification Scales</h2>
  <h3>Priority</h3>${table(['Level', 'Meaning'], r.appendix.priorities.map(([k, v]) => [badge(k), esc(v)]))}
  <h3>Severity</h3>${table(['Level', 'Meaning'], r.appendix.severities.map(([k, v]) => [badge(k), esc(v)]))}
  <h3>Older scales</h3>
  <p>Defects recorded on the older scales are shown on the standard ones as follows; the recorded value is kept and shown next to it.</p>
  ${table(['Recorded priority', 'Standard'], r.appendix.scales.priority.map(([a, b]) => [esc(a), esc(b)]))}
  ${table(['Recorded severity', 'Standard'], r.appendix.scales.severity.map(([a, b]) => [esc(a), esc(b)]))}
  <p class="muted small">Missing or unrecognised values read "Pending QA Classification"; nothing is derived from the test failure alone.</p>
  </section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.meta.project.name)} QA Test Report</title><style>${CSS}</style></head><body>${cover}${s1}${s2}${s3}${s4}${s5}${s6}${s7}${appA}${appB}${appC}</body></html>`;
}

export async function reportPdf(r) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(reportHtml(r), { waitUntil: 'load', timeout: 120_000 });
    // screenshots go into the PDF as high-quality JPEG: the same pixels, a fraction of the size
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img[data-figure]')) {
        await img.decode().catch(() => undefined);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        img.src = c.toDataURL('image/jpeg', 0.92);
      }
    });
    const head = (left, right) => `<div style="width:100%;font:7.5pt 'Segoe UI',Arial;color:#5d6475;padding:0 14mm;display:flex;justify-content:space-between"><span>${left}</span><span>${right}</span></div>`;
    return await page.pdf({
      format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: head(`TestNova QA Test Report · ${esc(r.meta.project.name)}`, `Report date ${esc(dmy(r.meta.generatedAt))}`),
      footerTemplate: head(esc(r.meta.reportId), 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'),
    });
  } finally {
    await browser.close();
  }
}

// ── Excel ────────────────────────────────────────────────────────────────────
const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F3A8F' } } };
const BORDER = { style: 'thin', color: { argb: 'FFD6D9E2' } };

function sheetTable(wb, name, columns, rows, { tones = {} } = {}) {
  const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.style }));
  for (const row of rows) sheet.addRow(row);
  const head = sheet.getRow(1);
  head.font = HEAD.font;
  head.fill = HEAD.fill;
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 32;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.eachRow((row, i) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
      if (i > 1) cell.alignment = { wrapText: true, vertical: 'top', ...(cell.alignment ?? {}) };
    });
  });
  // the status colours, as fills on the cells that carry a status
  for (const key of Object.keys(tones)) {
    const col = sheet.getColumn(key);
    col.eachCell((cell, i) => {
      if (i === 1 || cell.value == null || cell.value === '') return;
      const tone = TONES[tones[key](String(cell.value))];
      if (!tone) return;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.xbg } };
      cell.font = { bold: true, color: { argb: tone.xfg } };
    });
  }
  return sheet;
}

function keyValueSheet(wb, name, rows) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = [{ width: 34 }, { width: 110 }];
  for (const [k, v] of rows) {
    const row = sheet.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.alignment = { wrapText: true, vertical: 'top' };
  }
  return sheet;
}

const STATUS_TONE = (v) => toneOf(v);

export async function reportExcel(r) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TestNova';
  wb.created = new Date(r.meta.generatedAt);
  const t = r.totals;
  // Excel dates carry no time zone: write the local wall-clock time the PDF shows, and say which zone
  const local = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  const zone = new Date(r.meta.generatedAt).toLocaleString("en-GB", { timeZoneName: "short" }).split(" ").pop();
  const date = (ms) => (ms ? local(ms) : NOT_PROVIDED);

  // 1. Executive Summary
  const exec = keyValueSheet(wb, 'Executive Summary', [
    ['Report ID', r.meta.reportId], ['Project / application', r.meta.project.name], ['Application URL', r.meta.project.url], ['Testing environment', r.meta.project.environment],
    ['Application version / build', r.meta.build], ['Browser and version', r.meta.browsers.map((b) => `${b.name} ${b.version ?? `(version ${b.versionNote})`}`).join(', ') || NOT_PROVIDED],
    ['Device', r.meta.device], [`Execution start (${zone})`, date(r.meta.executionStart)], [`Execution end (${zone})`, date(r.meta.executionEnd)], [`Report generated (${zone})`, date(r.meta.generatedAt)],
    ['Test suite / execution', `${r.meta.suite} (${r.meta.executionIds.join(', ')})`], ['', ''],
    ['Summary', r.summary], ['Overall testing status', r.overall.label], ['QA recommendation', `${r.recommendation.verdict}. ${r.recommendation.text}`],
    ...r.recommendation.reasons.map((x, i) => [i ? '' : 'Reasons', x]), ['', ''],
    ['Total modules tested', `${t.modulesExecuted} of ${t.modules}`], ['Total test cases', t.total], ['Passed test cases', t.passed], ['Failed test cases', t.failed],
    ['Skipped test cases', t.skipped], ['Not executed test cases', t.notExecuted], ['Pass %', t.passPct == null ? '—' : t.passPct / 100], ['Failure %', t.failPct == null ? '—' : t.failPct / 100],
    ['Total unique defects', t.uniqueDefects], ['Open defects', t.openDefects], ['Defects behind the failures', t.defectsLinkedToFailures], ['Failures not linked to a defect', t.failedUnlinked],
    ['', ''], ['Definitions', `${r.meta.definitions.passPct} ${r.meta.definitions.defects}`], ['Data validation', `${r.validation.filter((v) => v.level !== 'info').length} issue(s); see the Data Validation sheet.`],
    ['Report fingerprint', r.meta.fingerprint],
  ]);
  exec.eachRow((row) => {
    const v = row.getCell(2).value;
    if (v instanceof Date) row.getCell(2).numFmt = 'dd-mmm-yyyy hh:mm';
    if (['Pass %', 'Failure %'].includes(row.getCell(1).value) && typeof v === 'number') row.getCell(2).numFmt = '0.0%';
    if (row.getCell(1).value === 'Overall testing status' || row.getCell(1).value === 'QA recommendation') {
      const tone = TONES[row.getCell(1).value === 'QA recommendation' ? r.recommendation.tone : r.overall.tone];
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.xbg } };
      row.getCell(2).font = { bold: true, color: { argb: tone.xfg } };
    }
  });

  // 2. Module Summary
  const mods = sheetTable(wb, 'Module Summary', [
    { header: 'Module', key: 'name', width: 26 }, { header: 'Total Cases', key: 'total', width: 11 }, { header: 'Passed', key: 'passed', width: 9 }, { header: 'Failed', key: 'failed', width: 9 },
    { header: 'Skipped', key: 'skipped', width: 9 }, { header: 'Not Executed', key: 'notExecuted', width: 12 }, { header: 'Pass %', key: 'passPct', width: 9 }, { header: 'Defects', key: 'defects', width: 9 },
    { header: 'Status', key: 'status', width: 18 }, { header: 'Defect IDs', key: 'ids', width: 40 }, { header: 'Execution ID', key: 'run', width: 22 }, { header: `Executed (${zone})`, key: 'at', width: 20 }, { header: 'Summary', key: 'explanation', width: 80 },
  ], [
    ...r.modules.map((m) => ({ name: m.name, total: m.total, passed: m.passed, failed: m.failed, skipped: m.skipped, notExecuted: m.notExecuted, passPct: m.passPct == null ? null : Math.round(m.passPct * 10) / 1000, defects: m.defectIds.length, status: m.status.label, ids: m.defectIds.join(', '), run: m.executionId ?? 'Not executed', at: m.executedAt ? local(m.executedAt) : null, explanation: m.explanation })),
    { name: 'All modules', total: t.total, passed: t.passed, failed: t.failed, skipped: t.skipped, notExecuted: t.notExecuted, passPct: t.passPct == null ? null : Math.round(t.passPct * 10) / 1000, defects: t.defectsLinkedToFailures, status: r.overall.label, ids: '', run: '', at: null, explanation: 'Unique defects across all modules (a defect affecting several modules counts once here).' },
  ], { tones: { status: STATUS_TONE } });
  mods.getColumn('passPct').numFmt = '0.0%';
  mods.getColumn('at').numFmt = 'dd-mmm-yyyy hh:mm';
  mods.lastRow.font = { bold: true };

  // 3. Defect Register
  const reg = sheetTable(wb, 'Defect Register', [
    { header: 'Defect ID', key: 'id', width: 11 }, { header: 'Earlier IDs', key: 'aliases', width: 12 }, { header: 'Date Reported', key: 'date', width: 13 }, { header: 'Store', key: 'store', width: 13 },
    { header: 'Instance', key: 'instance', width: 11 }, { header: 'Module', key: 'module', width: 20 }, { header: 'Title', key: 'title', width: 40 }, { header: 'Description', key: 'description', width: 60 },
    { header: 'Test Data', key: 'testData', width: 40 }, { header: 'Steps to Reproduce', key: 'steps', width: 50 }, { header: 'Expected Result', key: 'expected', width: 36 }, { header: 'Actual Result', key: 'actual', width: 36 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Screenshot/STR', key: 'str', width: 50 }, { header: 'Priority', key: 'priority', width: 12 }, { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Type', key: 'type', width: 15 }, { header: 'Developer Assigned', key: 'developer', width: 18 }, { header: 'Resolved Date', key: 'resolved', width: 14 }, { header: 'Developer Comment', key: 'dev', width: 30 },
    { header: 'QA Comment', key: 'qa', width: 30 }, { header: 'Changes Applied', key: 'changes', width: 30 }, { header: 'Test Cases', key: 'tests', width: 30 }, { header: 'Failing Now', key: 'failing', width: 28 },
    { header: 'Priority as Recorded', key: 'priorityRecorded', width: 14 }, { header: 'Severity as Recorded', key: 'severityRecorded', width: 14 }, { header: 'Classified By', key: 'by', width: 16 }, { header: 'Status History', key: 'history', width: 40 },
  ], r.register.map((d) => ({
    id: d.id, aliases: d.aliases.join(', '), date: d.dateReported, store: d.store, instance: d.instance, module: d.module, title: d.title, description: d.description, testData: d.testData,
    steps: d.steps, expected: d.expected, actual: d.actual, status: d.status,
    str: d.evidence.length ? d.evidence.map((e) => `${e.figure ? `Figure ${e.figure}: ` : ''}${e.caption} [${e.file}]`).join('\n') : NO_EVIDENCE,
    priority: d.priority.value, severity: d.severity.value, type: d.type, developer: d.developer, resolved: d.resolvedDate, dev: d.devComment, qa: d.qaComment, changes: d.changes,
    tests: d.tests.join(', '), failing: d.failingTests.join(', ') || '—', priorityRecorded: d.priority.recorded ?? '', severityRecorded: d.severity.recorded ?? '',
    by: d.classifiedBy === 'Defect analysis' ? 'Automated analysis (QA to confirm)' : d.classifiedBy ?? PENDING(), history: d.history.map((h) => `${dmy(h.at)} ${h.to ? `${h.from ?? '—'} → ${h.to}` : `updated ${h.fields?.join(', ')}`} (${h.by})`).join('\n'),
  })), { tones: { status: STATUS_TONE, priority: STATUS_TONE, severity: STATUS_TONE } });
  reg.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];

  // 4. Failed Test Cases
  sheetTable(wb, 'Failed Test Cases', [
    { header: 'Test Case ID', key: 'id', width: 15 }, { header: 'Module', key: 'module', width: 20 }, { header: 'Test Case Title', key: 'title', width: 36 }, { header: 'Test Scenario', key: 'scenario', width: 40 },
    { header: 'Test Data', key: 'testData', width: 26 }, { header: 'Expected Result', key: 'expected', width: 36 }, { header: 'Actual Result', key: 'actual', width: 40 }, { header: 'Failure Explanation', key: 'simple', width: 50 },
    { header: 'Business Impact', key: 'impact', width: 40 }, { header: 'Associated Defect ID', key: 'defect', width: 22 }, { header: 'Defect Link Basis', key: 'basis', width: 34 },
    { header: 'Screenshot/Evidence', key: 'evidence', width: 50 }, { header: 'Execution Status', key: 'status', width: 12 }, { header: 'Execution ID', key: 'run', width: 22 }, { header: 'Retried', key: 'retried', width: 9 },
  ], r.failures.map((f) => ({
    id: f.id, module: f.module, title: f.title, scenario: f.scenario, testData: f.testData, expected: f.expected, actual: f.actual, simple: f.simple, impact: f.impact,
    defect: f.defectIds.join(', ') || f.defectNote, basis: f.defectLinks.map((l) => `${l.id}: ${l.label}`).join('\n'),
    evidence: f.evidence.length ? f.evidence.map((e) => `${e.figure ? `Figure ${e.figure}: ` : ''}${e.caption} [${e.file}]`).join('\n') : NO_EVIDENCE,
    status: 'Failed', run: f.executionId, retried: f.retried ? 'Yes' : 'No',
  })), { tones: { status: STATUS_TONE, defect: (v) => (v.startsWith('Defect Not Linked') ? 'red' : null) } });

  // 5. Accessibility Coverage
  sheetTable(wb, 'Accessibility Coverage', [
    { header: 'Theme', key: 'label', width: 24 }, { header: 'Test Cases', key: 'tests', width: 11 }, { header: 'Passed', key: 'passed', width: 9 }, { header: 'Failed', key: 'failed', width: 9 },
    { header: 'Not Tested', key: 'notTested', width: 11 }, { header: 'Defects', key: 'defects', width: 40 }, { header: 'Basis', key: 'basis', width: 80 },
  ], r.accessibility.themes.map((x) => (x.available
    ? { label: x.label, tests: x.tests, passed: x.passed, failed: x.failed, notTested: x.notTested, defects: x.defects.join(', ') || 'None', basis: r.accessibility.basis }
    : { label: x.label, tests: NO_COVERAGE, passed: '—', failed: '—', notTested: '—', defects: '—', basis: r.accessibility.available ? 'No scan in this theme.' : 'No theme-specific scans were recorded.' })));

  // 6. Technical Logs
  const logs = sheetTable(wb, 'Technical Logs', [
    { header: 'Kind', key: 'kind', width: 14 }, { header: 'Execution ID', key: 'run', width: 22 }, { header: 'Module', key: 'module', width: 20 }, { header: 'Test Case ID', key: 'id', width: 15 }, { header: 'Detail', key: 'detail', width: 120 },
  ], [
    ...r.appendix.technical.map((x) => ({ kind: 'Failure', run: x.executionId, module: x.module, id: x.id, detail: x.technical.slice(0, 30000) })),
    ...r.appendix.logs.flatMap((l) => [
      ...l.errors.map((e) => ({ kind: 'Execution error', run: l.executionId, module: l.module, id: '', detail: e })),
      ...(l.log.length ? [{ kind: 'Log (last lines)', run: l.executionId, module: l.module, id: '', detail: l.log.join('\n').slice(0, 30000) }] : []),
    ]),
  ]);
  logs.getColumn('detail').font = { name: 'Consolas', size: 9 };

  // supporting sheets: every test case, comparison, validation, the screenshots themselves
  sheetTable(wb, 'All Test Cases', [
    { header: 'Test Case ID', key: 'id', width: 15 }, { header: 'Module', key: 'module', width: 20 }, { header: 'Test Case Title', key: 'title', width: 40 }, { header: 'Scenario', key: 'scenario', width: 44 },
    { header: 'Priority', key: 'priority', width: 10 }, { header: 'Test Data', key: 'testData', width: 26 }, { header: 'Steps', key: 'steps', width: 44 }, { header: 'Expected Result', key: 'expected', width: 36 },
    { header: 'Actual Result', key: 'actual', width: 40 }, { header: 'Status', key: 'status', width: 13 }, { header: 'Defect IDs', key: 'defects', width: 22 }, { header: 'Execution ID', key: 'run', width: 22 },
  ], r.testCases.map((c) => ({ id: c.id, module: c.module, title: c.title, scenario: c.scenario, priority: c.priority ?? NOT_PROVIDED, testData: c.testData, steps: c.steps, expected: c.expected, actual: c.actual ?? '', status: c.status, defects: c.defectIds.join(', '), run: c.executionId ?? 'Not executed' })), { tones: { status: STATUS_TONE } });

  sheetTable(wb, 'Execution Comparison', [
    { header: 'Module', key: 'name', width: 24 }, { header: 'Previous Execution', key: 'previous', width: 22 }, { header: 'Previous Pass %', key: 'prev', width: 14 }, { header: 'This Execution', key: 'current', width: 22 },
    { header: 'Pass %', key: 'pct', width: 10 }, { header: 'Change (pts)', key: 'change', width: 12 }, { header: 'Fixed Tests', key: 'fixed', width: 30 }, { header: 'New Failures', key: 'broke', width: 30 }, { header: 'Note', key: 'note', width: 60 },
  ], [
    ...r.comparison.modules.map((m) => ({ name: m.name, previous: m.previous ?? '—', prev: m.previousPassPct == null ? '—' : m.previousPassPct / 100, current: m.current, pct: m.passPct == null ? '—' : m.passPct / 100, change: m.change ?? '—', fixed: m.improved?.join(', ') || '', broke: m.regressed?.join(', ') || '', note: m.note ?? '' })),
    {}, { name: 'New defects', previous: r.comparison.defects.new.join(', ') || 'None' }, { name: 'No longer failing', previous: r.comparison.defects.resolved.join(', ') || 'None' },
    { name: 'Reopened / failed retest', previous: r.comparison.defects.reopened.join(', ') || 'None' }, { name: 'Persistent', previous: r.comparison.defects.persistent.join(', ') || 'None' }, { name: 'Note', previous: r.comparison.note },
  ]).getColumn('prev').numFmt = '0.0%';
  wb.getWorksheet('Execution Comparison').getColumn('pct').numFmt = '0.0%';

  sheetTable(wb, 'Data Validation', [
    { header: 'Level', key: 'level', width: 10 }, { header: 'Check', key: 'check', width: 22 }, { header: 'Finding', key: 'message', width: 110 }, { header: 'Source', key: 'source', width: 40 },
  ], r.validation.length ? r.validation.map((v) => ({ ...v, level: v.level[0].toUpperCase() + v.level.slice(1) })) : [{ level: 'Info', check: 'All', message: 'Every check passed.', source: '' }],
  { tones: { level: (v) => (v === 'Error' ? 'red' : v === 'Warning' ? 'orange' : 'blue') } });

  const shots = wb.addWorksheet('Evidence');
  shots.columns = [{ header: 'Figure', key: 'n', width: 9 }, { header: 'Caption', key: 'caption', width: 60 }, { header: 'Defects', key: 'defects', width: 18 }, { header: 'Screenshot', key: 'img', width: 90 }];
  Object.assign(shots.getRow(1), { font: HEAD.font, fill: HEAD.fill });
  let row = 2;
  for (const f of r.figures) {
    const ext = /jpe?g/.test(f.contentType ?? f.path) ? 'jpeg' : 'png';
    const image = wb.addImage({ buffer: readFileSync(f.path), extension: ext });
    shots.getCell(row, 1).value = f.n;
    shots.getCell(row, 2).value = f.caption;
    shots.getCell(row, 3).value = (f.defectIds ?? []).join(', ');
    for (const c of [1, 2, 3]) shots.getCell(row, c).alignment = { wrapText: true, vertical: 'top' };
    shots.getRow(row).height = 280;
    shots.addImage(image, { tl: { col: 3, row: row - 1 }, ext: { width: 620, height: 349 } });
    row += 1;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PENDING = () => 'Pending QA Classification';

/** The defect register on its own (the stage 7 defect sheet and the "Defect Sheet" download). */
export async function registerExcel(r) {
  const full = await reportExcel(r);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(full);
  for (const ws of [...wb.worksheets]) if (!['Defect Register', 'Evidence'].includes(ws.name)) wb.removeWorksheet(ws.id);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Write a project's QA report files: <out>/<id>-test-report.pdf and .xlsx, and <id>-qa-report.json
 * (the model, evidence paths relative to the workspace). Used by pipeline stage 8 and
 * `npm run qa-report`; the dashboard serves the same files on demand.
 */
export async function writeQaReport(pid, { out = null, runId = null } = {}) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join, relative, sep } = await import('node:path');
  const { buildQaReport } = await import('./qa-report.mjs');
  const { workspaceDir } = await import('./workspace.mjs');
  const ws = workspaceDir(pid);
  const dir = out ?? join(ws, 'qa', '06-report');
  const report = await buildQaReport(pid, { runId });
  mkdirSync(dir, { recursive: true });
  const stem = runId ? `${pid}-${runId}` : pid;
  const pdf = join(dir, `${stem}-test-report.pdf`);
  const xlsx = join(dir, `${stem}-test-report.xlsx`);
  const json = join(dir, `${stem}-qa-report.json`);
  writeFileSync(pdf, await reportPdf(report));
  writeFileSync(xlsx, await reportExcel(report));
  const rel = (p) => relative(ws, p).split(sep).join('/');
  const relEvidence = (list) => list.map((e) => ({ ...e, path: rel(e.path) }));
  writeFileSync(json, JSON.stringify({
    ...report,
    figures: report.figures.map((f) => ({ ...f, path: rel(f.path) })),
    failures: report.failures.map((f) => ({ ...f, evidence: relEvidence(f.evidence) })),
    register: report.register.map((d) => ({ ...d, evidence: relEvidence(d.evidence) })),
  }, null, 1));
  return { report, files: [pdf, xlsx, json] };
}
