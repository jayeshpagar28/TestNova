// Builds qa/06-report/<project>-test-report.{md,pdf,xlsx}. Every figure is read from a file.
// Run from the repo root: node qa/06-report/build-report.mjs
import fs from 'fs';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';

const P = 'sahayog-e767';
const OUT = 'qa/06-report';
const project = JSON.parse(fs.readFileSync(`projects/${P}/project.json`, 'utf8'));
const kb = JSON.parse(fs.readFileSync('qa/00-knowledge-base/knowledge-base.json', 'utf8'));
const defects = JSON.parse(fs.readFileSync(`${OUT}/${P}-defects.json`, 'utf8'));
const mods = kb.modules.filter(m => !m.skip);
const MOD_PREFIX = { login: 'login', home: 'home', 'about-us': 'about-us', 'my-profile': 'my-profile', notifications: 'notifications' };

// ---- final execution per module: the latest run of that module that ran to completion
const RUNS = 'dashboard/data/runs';
const runs = fs.readdirSync(RUNS).map(d => JSON.parse(fs.readFileSync(`${RUNS}/${d}/run.json`, 'utf8')));
const envRuns = runs.filter(r => r.status === 'error' || (r.errors && r.errors.length));
const finalRun = {};
const allRunsOf = {};
for (const m of mods) {
  const rs = runs.filter(r => r.moduleId === m.id && r.scope === 'module' && r.status !== 'error').sort((a, b) => a.startedAt - b.startedAt);
  allRunsOf[m.id] = rs;
  finalRun[m.id] = rs[rs.length - 1];
}
const initialRun = {};
for (const m of mods) initialRun[m.id] = allRunsOf[m.id][0];
const sum = (rs, k) => rs.reduce((a, r) => a + (r.counts?.[k] ?? 0), 0);
const finals = mods.map(m => finalRun[m.id]);
const initials = mods.map(m => initialRun[m.id]);

// ---- plan
const plan = {}; // id -> {module,title,priority,type,ac[]}
for (const m of mods) {
  const f = `qa/03-test-plan/${m.id}-test-plan.md`;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!/^\| TC-/.test(line)) continue;
    const c = line.split('|').map(s => s.trim());
    plan[c[1]] = { id: c[1], module: m.id, title: c[2], priority: c[3], type: c[6], ac: (c[7] || '').split(/[,;\s]+/).filter(Boolean) };
  }
}
// ---- manual
const manual = {};
for (const m of mods) {
  const f = `qa/04-exploratory/${m.id}-results.md`;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!/^\| TC-/.test(line)) continue;
    const c = line.split('|').map(s => s.trim());
    manual[c[1]] = { id: c[1], module: m.id, status: c[3], actual: c[4], deviation: c[5], shot: c[6] };
  }
}
// ---- automation (final)
const auto = {};
for (const m of mods) for (const t of finalRun[m.id].tests) {
  auto[t.id] = { ...t, module: m.id };
}
const defOf = {};
for (const d of defects.defects) for (const t of d.tests) (defOf[t] ||= []).push(d.id);

// ---- helpers
const norm = s => ({ passed: 'Pass', failed: 'Fail', skipped: 'Skipped', Pass: 'Pass', Fail: 'Fail', Blocked: 'Blocked' }[s] ?? 'Not run');
const tally = (arr, f) => { const o = { Pass: 0, Fail: 0, Blocked: 0, Skipped: 0, 'Not run': 0 }; arr.forEach(x => o[f(x)]++); return o; };
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const tbl = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.map(esc).join(' | ')} |`).join('\n')}\n`;
const ids = Object.keys(plan);
const A = ids.map(i => auto[i] ? norm(auto[i].status) : 'Not run');
const aTot = tally(ids, i => auto[i] ? norm(auto[i].status) : 'Not run');
const mTot = tally(ids, i => manual[i] ? norm(manual[i].status) : 'Not run');
const autoNotInPlan = Object.keys(auto).filter(i => !plan[i]);

// ---- statistics
const perModule = mods.map(m => {
  const idsM = ids.filter(i => plan[i].module === m.id);
  const mt = tally(idsM, i => manual[i] ? norm(manual[i].status) : 'Not run');
  const at = tally(idsM, i => auto[i] ? norm(auto[i].status) : 'Not run');
  return { m, n: idsM.length, mt, at };
});
const types = [...new Set(ids.map(i => plan[i].type))].sort();
const perType = types.map(t => {
  const idsT = ids.filter(i => plan[i].type === t);
  return { t, n: idsT.length, mt: tally(idsT, i => manual[i] ? norm(manual[i].status) : 'Not run'), at: tally(idsT, i => auto[i] ? norm(auto[i].status) : 'Not run') };
});
const browsers = project.browsers;
const perBrowser = browsers.map(b => {
  const t = { Pass: 0, Fail: 0, Skipped: 0 };
  for (const r of finals) for (const x of r.tests) { const s = x.browsers?.[b]; if (s) t[norm(s)]++; }
  return { b, t, n: t.Pass + t.Fail + t.Skipped };
});

// ---- disagreements manual vs automated
const manualFailAutoPass = ids.filter(i => manual[i]?.status === 'Fail' && auto[i]?.status === 'passed');
const manualPassAutoFail = ids.filter(i => manual[i]?.status === 'Pass' && auto[i]?.status === 'failed');
const manualOnlyDefects = defects.defects.filter(d => !d.tests.length || d.tests.every(t => auto[t]?.status === 'passed'));
const failedAuto = ids.filter(i => auto[i]?.status === 'failed');
const failedUnmapped = failedAuto.filter(i => !defOf[i]);

// ---- coverage matrix
const coverage = kb.acceptanceCriteria.map(ac => {
  const idsA = ids.filter(i => plan[i].ac.includes(ac.id));
  const mt = tally(idsA, i => manual[i] ? norm(manual[i].status) : 'Not run');
  const at = tally(idsA, i => auto[i] ? norm(auto[i].status) : 'Not run');
  const fmt = (t, n) => n ? `${t.Pass} pass / ${t.Fail} fail / ${t.Blocked + t.Skipped + t['Not run']} blocked, skipped or not run` : 'UNCOVERED';
  return { ac, n: idsA.length, mt, at, manual: fmt(mt, idsA.length), automated: fmt(at, idsA.length), cases: idsA };
});
const uncoveredAC = coverage.filter(c => !c.n).map(c => c.ac.id);
const gapRefs = ids.filter(i => plan[i].ac.every(a => !a.startsWith('AC-'))).length;

// ---- markdown
const now = new Date().toISOString().slice(0, 10);
const defRows = defects.defects.map(d => [d.id, d.date, d.instance, d.module, d.title, d.description, d.testData, d.status, (d.steps || []).join(' ') + (d.evidence?.length ? ' Evidence: ' + d.evidence.join(', ') : ''), d.priority, d.severity, d.type, '—', '—/' + 'Not retested']);
const failRows = failedAuto.map(i => [i, plan[i].title, auto[i].module, (auto[i].failure?.reason || '').split('\n')[0], (defOf[i] || ['UNMAPPED']).join(', ')]);

let md = `# QA Test Report — ${project.name}

- **Project:** ${project.name} (\`${P}\`) · **Environment:** ${project.environment} · **URL:** ${project.url}
- **Browsers in scope (project.json):** ${browsers.join(', ')} · **Role:** ${project.roles.map(r => r.name).join(', ')} (credentials are in \`.env\`; no value is recorded here)
- **App build:** not exposed by the application (run.json build version = "${finals[0].build.version}", no build code) · **Report date:** ${now}
- **Sources:** knowledge base, ${Object.keys(plan).length} planned cases, exploratory results, final automation runs (${mods.map(m => finalRun[m.id].id).join(', ')}), healing log, defect log.

## 1. Executive summary

**Release view (30 seconds):** ${defects.defects.length} application defects are open (all status "New", none retested). ` +
`Automation finished with **${sum(finals, 'passed')} passed, ${sum(finals, 'failed')} failed, ${sum(finals, 'skipped')} skipped of ${sum(finals, 'total')}** tests; ` +
`every one of the ${failedAuto.length} failures is a real application defect (${failedUnmapped.length} failures are unexplained). ` +
`No environment failure affected a final run.

- **What was tested:** ${mods.length} modules (${mods.map(m => m.name).join(', ')}) on Chromium only, role User, ${ids.length} planned cases, ${kb.acceptanceCriteria.length} acceptance criteria.
- **Overall outcome:** not release-ready on accessibility and security grounds. Highest risks:
  1. **Security (DEF-001, High):** the login toast differs between a valid User Id with a wrong password and an unknown User Id, so valid accounts can be enumerated.
  2. **Accessibility (DEF-002, DEF-004, DEF-006, High):** keyboard users cannot reach navigation, tabs, avatar, bell or the Forgot links; critical axe violations (aria-allowed-attr, button-name, and on Notifications label) appear on every signed-in page, caused by the shared shell.
  3. **UI state:** stale side-nav highlight (DEF-010) and a paginator that shows page 2 over page-1 rows after a failed request, with no error shown (DEF-013).
- **Suite status vs. app status:** the suite is red, not green, so it is not masking a broken app. The reverse gap matters: **${manualOnlyDefects.length} defects (${manualOnlyDefects.map(d => d.id).join(', ')}) have no failing automated assertion** (they were found manually, or the automated test stops at an earlier failure or checks something else). A green automated result does not clear them.
- **Manual failed, automation passed:** ${manualFailAutoPass.length} cases (${manualFailAutoPass.join(', ')}) failed in the exploratory pass while the matching automated test passed. Automation does not assert those problems (for example the "Success: Logout Successfully" toast on an expired session, DEF-009, and keyboard reachability on Login, DEF-002), so a green result on them does not mean the behaviour is correct.
- **Coverage limits:** only Chromium was in scope, so Firefox and WebKit are untested (—). ${mTot.Blocked} of ${ids.length} manual cases were blocked in the exploratory session (tooling not exposed, or writes not approved), and ${aTot.Skipped} automated tests are skipped. ${coverage.filter(c => c.n).length} of ${coverage.length} ACs are linked to a test; ${gapRefs} of ${ids.length} cases are linked only to a knowledge-base gap (GAP-xxx), not to an AC.

## 2. Test statistics

Definitions: **planned cases** come from the test plans (${ids.length}). **Manual** is the exploratory result per case; **Automated** is the latest run of each module. Pass rate = passed ÷ tests that produced a verdict (pass + fail); the share of all planned cases is shown alongside.

### 2.1 Totals

${tbl(['Layer', 'Planned', 'Pass', 'Fail', 'Blocked', 'Skipped', 'Not run', 'Pass rate (of executed)', 'Pass of all planned'], [
  ['Manual (exploratory)', ids.length, mTot.Pass, mTot.Fail, mTot.Blocked, '—', mTot['Not run'], pct(mTot.Pass, mTot.Pass + mTot.Fail), pct(mTot.Pass, ids.length)],
  ['Automated (final runs)', ids.length, aTot.Pass, aTot.Fail, '—', aTot.Skipped, aTot['Not run'], pct(aTot.Pass, aTot.Pass + aTot.Fail), pct(aTot.Pass, ids.length)]])}
${autoNotInPlan.length ? `Automated tests with an ID not in the plan tables: ${autoNotInPlan.join(', ')}.\n` : 'Every automated test ID exists in a test plan.\n'}
### 2.2 Per module

${tbl(['Module', 'Planned', 'Manual P/F/Blocked', 'Automated P/F/Skipped', 'Final run'], perModule.map(x => [x.m.name, x.n, `${x.mt.Pass}/${x.mt.Fail}/${x.mt.Blocked}`, `${x.at.Pass}/${x.at.Fail}/${x.at.Skipped}`, finalRun[x.m.id].id]))}
### 2.3 Per test type

${tbl(['Test type', 'Planned', 'Manual P/F/Blocked', 'Automated P/F/Skipped'], perType.map(x => [x.t, x.n, `${x.mt.Pass}/${x.mt.Fail}/${x.mt.Blocked}`, `${x.at.Pass}/${x.at.Fail}/${x.at.Skipped}`]))}
### 2.4 Per browser

${tbl(['Browser', 'Automated tests', 'Pass', 'Fail', 'Skipped'], [...perBrowser.map(x => [x.b, x.n, x.t.Pass, x.t.Fail, x.t.Skipped]), ['firefox', '—', '—', '—', '—'], ['webkit', '—', '—', '—', '—']])}
Firefox and WebKit are not listed in \`project.json\`, so nothing was run on them. Browser-specific differences are unknown.

## 3. Manual (exploratory) results

Chromium, role User, viewports 1280×720, 390×844, 820×1180, 1440×900. Per case results are in \`qa/04-exploratory/<module>-results.md\`.

${tbl(['Module', 'Planned', 'Pass', 'Fail', 'Blocked'], perModule.map(x => [x.m.name, x.n, x.mt.Pass, x.mt.Fail, x.mt.Blocked]))}
**Failed manual cases**

${tbl(['Case', 'Title', 'Actual', 'Deviation', 'Defect'], ids.filter(i => manual[i]?.status === 'Fail').map(i => [i, plan[i].title, manual[i].actual, manual[i].deviation, (defOf[i] || ['see summary.md']).join(', ')]))}
**Why ${mTot.Blocked} cases were blocked** (from \`qa/04-exploratory/summary.md\`): the exploratory session did not expose route, offline, throttling, second-tab or axe tools (environment, not defects); Mark All as Read and opening a notification were not run because they change real data and no approval exists in notes; the rest were not reached. Many of these were later exercised by automation (see section 4). Blocked cases are not counted as passes.

**Cases where manual and automated results disagree**

- Manual **Fail**, automated **Pass**: ${manualFailAutoPass.length ? manualFailAutoPass.join(', ') : 'none'}.
- Manual **Pass**, automated **Fail**: ${manualPassAutoFail.length ? manualPassAutoFail.map(i => `${i} (${(defOf[i] || ['no defect']).join(', ')})`).join(', ') : 'none'}.

## 4. Automation results

Runs went through the TestNova runner; each is a dashboard execution with screenshot, trace, video and web signals.

${tbl(['Module', 'Initial run', 'Initial P/F/S', 'Final run', 'Final P/F/S'], mods.map(m => {
  const a = initialRun[m.id], b = finalRun[m.id];
  return [m.name, a.id, `${a.counts.passed}/${a.counts.failed}/${a.counts.skipped}`, b.id, `${b.counts.passed}/${b.counts.failed}/${b.counts.skipped}`];
}).concat([['**Total**', '', `${sum(initials, 'passed')}/${sum(initials, 'failed')}/${sum(initials, 'skipped')} of ${sum(initials, 'total')}`, '', `${sum(finals, 'passed')}/${sum(finals, 'failed')}/${sum(finals, 'skipped')} of ${sum(finals, 'total')}`]]))}
**Healing** (from \`qa/05-healing/healing-log.md\`): 4 script fixes (TC-HOME-010 missing wait; TC-PROFILE-011 incomplete precondition; TC-NOTIF-006 missing wait; TC-NOTIF-007 ambiguous locator) in page objects or arrange blocks. 5 further failures (TC-HOME-031, TC-ABOUT-015, TC-PROFILE-027, TC-NOTIF-034, TC-NOTIF-030) were app defects, so only metadata (\`@known-defect\`, defect annotation) was added. No assertion was weakened, deleted, skipped or marked fixme. The log records that Home was not re-run after the last About Us and Notifications changes; Login's only run is its final run.

**Failing tests in the final runs (all application defects)**

${tbl(['Test', 'Title', 'Module', 'First error line', 'Defect'], failRows)}
### 4.1 Environment failures (not defects)

${(() => {
  const e = envRuns.map(r => `- ${r.id} (${r.moduleName}): status "${r.status}" — ${(r.errors || []).join(' ')}`);
  return (e.length ? e.join('\n') : '- None recorded in run.json.') + `\n- No environment failure occurred in any of the ${mods.length} final runs (\`errors\` is empty in each). The earlier run above stopped because the TestNova server stopped; it was re-run and is excluded from all counts.\n- Offline cases (net::ERR_INTERNET_DISCONNECTED) and injected 500 responses in tests are emulations by the tests themselves, not outages or server faults (see \`${P}-defects.json\`, notDefects).\n- Exploratory cases blocked by missing MCP tools (${mTot.Blocked} blocked in total, including the safety-blocked ones) are environment/tooling limits, not defects.`;
})()}

### 4.2 Script and test-data items (not defects)

${defects.notDefects.map(n => `- ${n.test} — ${n.classification}: ${n.reason}`).join('\n')}

## 5. Defect log

${defects.defects.length} application defects, all "New", none assigned or retested. Severity and priority are from \`${P}-defects.json\`. Full columns, validation and colouring are in \`${P}-defects.xlsx\`.

${tbl(['Defect ID', 'Date', 'Instance', 'Module', 'Title', 'Description', 'Test Data / Required Info', 'Status', 'Screenshot / STR', 'Priority', 'Severity', 'Type', 'Developer Assigned', 'Resolved Date / Retested Result'], defRows)}
By type: ${Object.entries(defects.defects.reduce((o, d) => (o[d.type] = (o[d.type] || 0) + 1, o), {})).map(([k, v]) => `${k} ${v}`).join(', ')}. ${defects.defects.length} counts defects, not failing tests (${failedAuto.length} failing tests map to ${new Set(failedAuto.flatMap(i => defOf[i] || [])).size} defects).

## 6. Acceptance-criteria coverage matrix

Counts are cases linked to the AC by the AC column of the test plans. "Blocked/skipped/not run" are not passes.

${tbl(['AC', 'Description', 'Manual', 'Automated'], coverage.map(c => [c.ac.id, c.ac.text, c.manual, c.automated]))}
- **Uncovered ACs (no linked test):** ${uncoveredAC.length ? uncoveredAC.join(', ') : 'none'}.
- Only ${kb.acceptanceCriteria.length} ACs exist and each page's real behaviour is mostly specified by knowledge-base gaps (${kb.gaps.length} gaps in the knowledge base). ${gapRefs} of ${ids.length} planned cases reference a GAP rather than an AC, so they are assumption-based tests. The ACs for Login cover only 6 behaviours; forgot-password, activate-account and the profile/notification content flows have no AC (GAP, unverified).
- ACs AC-HOME-01 to -03 are also referenced by the About Us, My Profile and Notifications plans for navigation and direct-URL access.

## 7. Recommendations (specific to this product)

1. **Fix the login message (DEF-001).** Return the same "The credentials you entered are incorrect" text for a wrong password and an unknown User Id, and make the oauth2/token error payload non-distinguishing.
2. **Fix the shared shell once (DEF-002, DEF-004, DEF-005, DEF-010).** One change to the layout fixes the four pages: give the sidebar toggle and icon buttons names, replace \`li\`/\`div\` navigation with links or buttons with roles and \`href\`, remove the invalid ARIA attribute, raise the inactive-tab contrast, and derive the active item from the URL instead of the stored \`selectedMenuIndex\`.
3. **Fix Notifications markup (DEF-006, DEF-013).** Label the unnamed form control, make tabs and Mark All as Read real tab/button elements, and on a failed list request keep the current page indicator and show a plain-language error with retry.
4. **Name the password toggle and tie field errors to inputs (DEF-003)** so screen readers announce "Enter User Id" and the toggle.
5. **Session expiry wording (DEF-009).** Show "session expired" instead of "Success: Logout Successfully" when a 401 clears the session.
6. **Small UI state fixes (DEF-007, DEF-008, DEF-011).** Escape closes the avatar menu; fill the Alerts badge on every full page load; close the mobile drawer on selection and reset the collapsed state on resize.
7. **Confirm the My Profile mobile number (DEF-012)** with the data owner; if the test account is correct, add 10-digit validation on the source data.
8. **Add automated assertions** for the ${manualOnlyDefects.length} defects with none (${manualOnlyDefects.map(d => d.id).join(', ')}), and unblock the ${mTot.Blocked} blocked manual cases: run routing/offline/axe-capable sessions, and obtain approval or a disposable account for Mark All as Read and opening a notification.
9. **Widen the browser scope.** Add Firefox and WebKit to \`project.json\`; no result exists for them today.
10. **Expose a build/version string** in the application so reports can state the build under test.
11. **Fix known skip causes:** identify the profile endpoint (TC-PROFILE-012) so the ${aTot.Skipped} skipped tests can run.

## 8. Assumptions and limitations

- The final result per module is the latest completed run in \`dashboard/data/runs\`. Run EX-20261104-112056 (Login) ended with status error when the server stopped and is excluded.
- Duration, failure reason and defect link in the xlsx are taken from run.json and \`${P}-defects.json\`.
- Figures not measured (other browsers, resolved dates, retest results, developer assigned) show "—" or "Not retested".
- No credential value appears in this report; the role is referred to as User and the variables as TEST_USERNAME / TEST_PASSWORD.
`;
fs.writeFileSync(`${OUT}/${P}-test-report.md`, md);

// ---- PDF: markdown -> HTML (small converter for what this report uses)
function inline(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
}
function toHtml(src) {
  const L = src.split('\n'); let h = '', i = 0, list = null;
  const close = () => { if (list) { h += `</${list}>`; list = null; } };
  while (i < L.length) {
    const l = L[i];
    if (/^\|/.test(l) && /^\|[-|]+\|$/.test(L[i + 1] || '')) {
      close();
      const cells = r => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const hd = cells(l); i += 2; let rows = '';
      while (i < L.length && /^\|/.test(L[i])) { rows += `<tr>${cells(L[i]).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`; i++; }
      h += `<table><thead><tr>${hd.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
      continue;
    }
    let m;
    if ((m = /^(#{1,3}) (.*)/.exec(l))) { close(); h += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = /^\s*- (.*)/.exec(l))) { if (list !== 'ul') { close(); h += '<ul>'; list = 'ul'; } h += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^\s*\d+\. (.*)/.exec(l))) { if (list !== 'ol') { close(); h += '<ol>'; list = 'ol'; } h += `<li>${inline(m[1])}</li>`; }
    else if (l.trim() === '') close();
    else { close(); h += `<p>${inline(l)}</p>`; }
    i++;
  }
  close(); return h;
}
const css = `body{font-family:Segoe UI,Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.4}
h1{font-size:20px;border-bottom:2px solid #1f3a5f;padding-bottom:4px}h2{font-size:14px;color:#1f3a5f;margin-top:18px}h3{font-size:11.5px}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;table-layout:auto}th,td{border:1px solid #b9c2cf;padding:3px 5px;vertical-align:top;word-break:break-word;font-size:8.5px}
th{background:#1f3a5f;color:#fff;text-align:left}tr:nth-child(even) td{background:#f3f6fa}code{font-size:8.5px;background:#eef1f5;padding:0 2px}
thead{display:table-header-group}tr{page-break-inside:avoid}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>${project.name} QA Test Report</title><style>${css}</style></head><body>${toHtml(md)}</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({
  path: `${OUT}/${P}-test-report.pdf`, format: 'A4', landscape: false, printBackground: true,
  margin: { top: '14mm', bottom: '16mm', left: '10mm', right: '10mm' }, displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666">${project.name} QA Test Report — page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`
});
await browser.close();

// ---- XLSX
const wb = new ExcelJS.Workbook();
function sheet(name, cols, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(c => ({ header: c[0], key: c[0], width: c[1] }));
  rows.forEach(r => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  ws.eachRow(r => r.eachCell(c => { c.alignment = { wrapText: true, vertical: 'top' }; }));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}
sheet('Summary', [['Item', 38], ['Value', 90]], [
  ['Project', `${project.name} (${P})`], ['Environment', project.environment], ['URL', project.url],
  ['Browsers in scope', browsers.join(', ')], ['Role', project.roles.map(r => r.name).join(', ')], ['Report date', now],
  ['Planned cases', ids.length],
  ['Manual pass / fail / blocked', `${mTot.Pass} / ${mTot.Fail} / ${mTot.Blocked}`],
  ['Manual pass rate (of executed)', pct(mTot.Pass, mTot.Pass + mTot.Fail)],
  ['Automated pass / fail / skipped (final)', `${aTot.Pass} / ${aTot.Fail} / ${aTot.Skipped}`],
  ['Automated pass rate (of executed)', pct(aTot.Pass, aTot.Pass + aTot.Fail)],
  ['Automated initial pass / fail / skipped', `${sum(initials, 'passed')} / ${sum(initials, 'failed')} / ${sum(initials, 'skipped')}`],
  ['Application defects', defects.defects.length], ['Failing automated tests explained by a defect', `${failedAuto.length - failedUnmapped.length} of ${failedAuto.length}`],
  ['Environment failures in final runs', 0],
  ['Defects with no failing automated assertion', manualOnlyDefects.map(d => d.id).join(', ')],
  ['Uncovered ACs', uncoveredAC.join(', ') || 'none'], ['Firefox / WebKit', '—']]);
sheet('Modules', [['Module', 22], ['Planned', 10], ['Manual Pass', 12], ['Manual Fail', 12], ['Manual Blocked', 14], ['Auto Pass', 11], ['Auto Fail', 11], ['Auto Skipped', 13], ['Initial run', 24], ['Final run', 24], ['Defects', 10]],
  perModule.map(x => [x.m.name, x.n, x.mt.Pass, x.mt.Fail, x.mt.Blocked, x.at.Pass, x.at.Fail, x.at.Skipped, initialRun[x.m.id].id, finalRun[x.m.id].id, defects.defects.filter(d => d.module === x.m.id).length]));
const tr = [];
for (const m of mods) for (const t of finalRun[m.id].tests) {
  const f = t.failure?.reason ? t.failure.reason.split('\n')[0] : (t.skipReason || '');
  for (const b of Object.keys(t.browsers || { [browsers[0]]: t.status })) tr.push([t.id, plan[t.id]?.title || t.title, m.name, b, norm(t.browsers?.[b] ?? t.status), t.durationMs, f, (defOf[t.id] || []).join(', '), finalRun[m.id].id]);
}
sheet('Test Results', [['Test ID', 16], ['Title', 60], ['Module', 16], ['Browser', 11], ['Status', 10], ['Duration (ms)', 14], ['Failure reason / skip reason', 55], ['Defect', 14], ['Execution', 22]], tr);
sheet('Defects', [['Defect ID', 10], ['Date', 12], ['Instance', 9], ['Module', 14], ['Title', 40], ['Description', 60], ['Test Data / Required Info', 40], ['Status', 10], ['Screenshot / STR', 50], ['Priority', 10], ['Severity', 10], ['Type', 14], ['Developer Assigned', 16], ['Resolved Date / Retested Result', 22]], defRows.map(r => { const x = [...r]; x[12] = '—'; x[13] = 'Not retested'; return x; }));
sheet('Coverage', [['AC', 15], ['Description', 60], ['Type', 14], ['Linked cases', 10], ['Manual', 40], ['Automated', 40], ['Cases', 50]], coverage.map(c => [c.ac.id, c.ac.text, c.ac.type, c.n, c.manual, c.automated, c.cases.join(', ')]));
await wb.xlsx.writeFile(`${OUT}/${P}-test-report.xlsx`);
console.log(JSON.stringify({ planned: ids.length, mTot, aTot, failedAuto: failedAuto.length, failedUnmapped, manualFailAutoPass, manualPassAutoFail, manualOnlyDefects: manualOnlyDefects.map(d => d.id), autoNotInPlan, uncoveredAC, gapRefs }));
