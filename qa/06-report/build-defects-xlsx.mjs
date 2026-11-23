// Builds qa/06-report/sahayog-e767-defects.json and .xlsx from stage 6 runs + stage 4/5 notes.
import fs from 'fs';
import ExcelJS from 'exceljs';

const P = 'sahayog-e767', DATE = '2026-11-04', INSTANCE = 'QA';
const RUNS = 'dashboard/data/runs';
const FINAL = { login: 'EX-20261104-112238', home: 'EX-20261104-113334', 'about-us': 'EX-20261104-115909', 'my-profile': 'EX-20261104-114312', notifications: 'EX-20261104-115503' };
const MOD_OF = { LOGIN: 'login', HOME: 'home', ABOUT: 'about-us', PROFILE: 'my-profile', NOTIF: 'notifications' };

const runs = {};
for (const [m, id] of Object.entries(FINAL)) runs[m] = JSON.parse(fs.readFileSync(`${RUNS}/${id}/run.json`, 'utf8'));
// first screenshot (or a11y json) of a test in its final run
function ev(testId, re = /screenshot/) {
  const m = MOD_OF[testId.split('-')[1]];
  const t = runs[m].tests.find(x => x.id === testId);
  const e = t?.evidence.find(x => re.test(x.name));
  return e ? `dashboard/data/runs/${FINAL[m]}/evidence/${e.file}` : null;
}
const exec = ids => [...new Set(ids.map(t => FINAL[MOD_OF[t.split('-')[1]]]))];
const mk = (o) => ({
  date: DATE, instance: INSTANCE, status: 'New', classification: 'app-defect',
  tests: o.tests || [], executions: o.tests ? exec(o.tests) : [], ...o,
});

const chromiumNote = 'Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded).';
const axeNote = 'Role: User; Chromium desktop; signed in; axe-core scan of the page; same violations on every page, so the problem is in the shared shell.';
const axePages = ['TC-HOME-031', 'TC-ABOUT-015', 'TC-PROFILE-027', 'TC-NOTIF-034'];

const defects = [
  mk({ id: 'DEF-001', module: 'login', title: 'Login reveals which User Ids exist (different message for wrong password)',
    description: 'BUG-001 (stage 4) reproduced in automation. For a valid User Id with a wrong password the login toast reads "The password you entered is incorrect" (POST /sahyogUserManagementAPI/oauth2/token → 400). An unknown User Id gives "The credentials you entered are incorrect". The difference lets an attacker enumerate valid accounts.',
    testData: `${chromiumNote} Needs one valid User Id and one unknown User Id; wrong password for both.`,
    priority: 'High', severity: 'Major', type: 'Security', signal: 'assertion', tests: ['TC-LOGIN-007', 'TC-LOGIN-008'],
    evidence: [ev('TC-LOGIN-007'), ev('TC-LOGIN-008'), 'qa/04-exploratory/evidence/login/BUG-001_400_user-enumeration-toast.png'],
    steps: ['1. Open /login.', '2. Enter a valid User Id and a wrong password; click Login.', '3. Note the toast text.', '4. Repeat with an unknown User Id.', '5. Compare the two messages.'],
    expected: 'Both cases show the same generic message "The credentials you entered are incorrect".', actual: 'Valid User Id + wrong password shows "The password you entered is incorrect"; unknown User Id shows the generic message.' }),
  mk({ id: 'DEF-002', module: 'login', title: 'Keyboard users cannot reach Forgot links, password toggle, nav items, tabs, avatar or bell',
    description: 'BUG-002 (stage 4). Forgot User ID / Forgot Password / Activate Account are <a> elements without href; the password toggle has tabindex -1; on Home, Tab cycles only between "Savings Application" and the sidebar toggle. Nav items (li/div without role), tabs, avatar, bell and View All never receive focus. Automation TC-HOME-030 fails on the keyboard assertion; TC-LOGIN-037 and TC-LOGIN-032 failed in manual testing.',
    testData: `${chromiumNote} Keyboard only, no mouse.`,
    priority: 'High', severity: 'Major', type: 'Accessibility', signal: 'assertion', tests: ['TC-HOME-030', 'TC-LOGIN-037', 'TC-LOGIN-032'],
    evidence: [ev('TC-HOME-030')],
    steps: ['1. Open /login and press Tab repeatedly: only User Id, Password and Login are reached.', '2. Sign in; on /HOME press Tab repeatedly.', '3. Watch which elements receive focus.'],
    expected: 'All interactive elements (links, toggle, nav, tabs, avatar, bell) are reachable and operable by keyboard.', actual: 'Focus cycles only between Savings Application and the sidebar toggle; the other controls are skipped.' }),
  mk({ id: 'DEF-003', module: 'login', title: 'Login: password toggle has no accessible name; validation error not tied to the field',
    description: 'BUG-008 (login part). The password visibility toggle is a plain div with an empty accessible name (TC-LOGIN-012: received ""). The inline "Enter User Id" error is not linked to the input, so the User Id input has no accessible description (TC-LOGIN-039).',
    testData: `${chromiumNote} Submit with User Id empty to see the inline error.`,
    priority: 'Medium', severity: 'Minor', type: 'Accessibility', signal: 'assertion', tests: ['TC-LOGIN-012', 'TC-LOGIN-039'],
    evidence: [ev('TC-LOGIN-012'), ev('TC-LOGIN-039')],
    steps: ['1. Open /login.', '2. Inspect the eye icon next to Password: no role, no name.', '3. Click Login with User Id empty; inspect the User Id input for aria-describedby / aria-invalid.'],
    expected: 'Toggle is a named button; the error is associated with the field.', actual: 'Toggle has an empty name; no association between error and input.' }),
  mk({ id: 'DEF-004', module: 'home', title: 'Critical axe violations on every signed-in page: aria-allowed-attr and button-name',
    description: 'BUG-008. axe-core reports aria-allowed-attr (critical) and button-name (critical, unnamed buttons such as the sidebar toggle) on Home, About Us, My Profile and Notifications. The set is identical on each page, so the cause is the shared layout. 8 scans (2 attempts per test) across 4 tests.',
    testData: axeNote, priority: 'High', severity: 'Critical', type: 'Accessibility', signal: 'a11y', tests: axePages,
    evidence: [ev('TC-HOME-031', /a11y/), ev('TC-ABOUT-015', /a11y/), ev('TC-PROFILE-027', /a11y/), ev('TC-NOTIF-034', /a11y/)],
    steps: ['1. Sign in as the User role.', '2. Open /HOME, /ABOUT_US, /MY_PROFILE, /NOTIFICATIONS in turn.', '3. Run an axe scan on each.'],
    expected: 'No critical or serious axe violations.', actual: 'aria-allowed-attr and button-name (critical) on all four pages.' }),
  mk({ id: 'DEF-005', module: 'home', title: 'Serious axe violation on every signed-in page: color-contrast (e.g. inactive tab text)',
    description: 'BUG-008. axe-core reports color-contrast (serious) on Home, About Us, My Profile and Notifications; the stage 4 review noted the low-contrast inactive tab as one source.',
    testData: axeNote, priority: 'Medium', severity: 'Major', type: 'Accessibility', signal: 'a11y', tests: axePages,
    evidence: [ev('TC-HOME-031', /a11y/), ev('TC-ABOUT-015', /a11y/), ev('TC-PROFILE-027', /a11y/), ev('TC-NOTIF-034', /a11y/)],
    steps: ['1. Sign in.', '2. Open each page and run an axe scan; read the color-contrast result.'],
    expected: 'Text meets WCAG AA contrast.', actual: 'color-contrast serious violation on all four pages.' }),
  mk({ id: 'DEF-006', module: 'notifications', title: 'Notifications page: unlabelled form control, invalid list structure, ARIA command without name',
    description: 'BUG-008 (notifications part). In addition to the shared violations, axe reports label (critical), aria-command-name (serious) and list (serious) on /NOTIFICATIONS. Mark All as Read and the tabs are plain text/divs rather than buttons/tabs.',
    testData: axeNote, priority: 'High', severity: 'Critical', type: 'Accessibility', signal: 'a11y', tests: ['TC-NOTIF-034'],
    evidence: [ev('TC-NOTIF-034', /a11y/), 'qa/04-exploratory/evidence/notifications/US002_AC-NOTIF-01_unread-tab.png'],
    steps: ['1. Sign in and open Notifications.', '2. Run an axe scan; see label, aria-command-name, list results.'],
    expected: 'Controls named and list markup valid.', actual: 'label (critical), aria-command-name and list (serious) reported.' }),
  mk({ id: 'DEF-007', module: 'home', title: 'Escape does not close the avatar menu',
    description: 'BUG-003 (stage 4, manual only; the automated assertion in TC-HOME-030 stops at the earlier keyboard failure, so Escape was not independently reached).',
    testData: `${chromiumNote} Desktop.`, priority: 'Low', severity: 'Minor', type: 'Functional', signal: 'assertion', tests: ['TC-HOME-030'],
    evidence: ['qa/04-exploratory/evidence/home/US002_AC-HOME-02_avatar-menu.png'],
    steps: ['1. Sign in, open /HOME.', '2. Click the avatar to open the menu.', '3. Press Escape.'],
    expected: 'Menu closes.', actual: 'Menu stays open.' }),
  mk({ id: 'DEF-008', module: 'home', title: 'Alerts badge missing after a full page load of other pages',
    description: 'BUG-004 (stage 4, manual only; not covered by an automated assertion). The Alerts badge shows on Home (count equals alert count) but is empty after a direct load of /NOTIFICATIONS or /ABOUT_US.',
    testData: `${chromiumNote} Direct URL load.`, priority: 'Low', severity: 'Minor', type: 'UI', signal: 'assertion', tests: [],
    evidence: ['qa/04-exploratory/home-results.md (TC-HOME-013)'],
    steps: ['1. Sign in; note the Alerts badge on Home.', '2. Load /NOTIFICATIONS directly (browser reload).', '3. Look at the Alerts badge.'],
    expected: 'Badge shows the same count on every page.', actual: 'Badge is empty.' }),
  mk({ id: 'DEF-009', module: 'login', title: 'Expired session redirects to /login with the toast "Success: Logout Successfully"',
    description: 'BUG-005 (stage 4, manual only). After the session/token is cleared, the next list call returns 401 (POST /sahyogAosAPI/aos/alert/get/list and /sahyogUserManagementAPI/admin/sidemenu/list) and the app redirects to /login. The user is shown a success toast for a logout they did not do. No raw 401 is shown. Automation tests TC-LOGIN-024 / TC-NOTIF-027 check the redirect and pass, so this wording is not asserted.',
    testData: `${chromiumNote} Clear localStorage on a signed-in page, then click Next/navigate.`,
    priority: 'Low', severity: 'Minor', type: 'Functional', signal: 'http-4xx', tests: ['TC-LOGIN-024', 'TC-NOTIF-027'],
    evidence: ['qa/04-exploratory/login-results.md (TC-LOGIN-024)', 'qa/04-exploratory/notifications-results.md (TC-NOTIF-027)'],
    steps: ['1. Sign in and open Notifications.', '2. Clear localStorage.', '3. Click Next.'],
    expected: 'Redirect to /login with a "session expired" message.', actual: 'Redirect with toast "Success: Logout Successfully".' }),
  mk({ id: 'DEF-010', module: 'home', title: 'Side-nav highlight is stale; follows stored menu index, not the URL',
    description: 'BUG-006 reproduced in automation. The active item comes from stored selectedMenuIndex; after a direct load of /ABOUT_US the Notifications item is highlighted until a click.',
    testData: `${chromiumNote} Direct URL load after having been on Notifications.`, priority: 'Medium', severity: 'Major', type: 'UI', signal: 'assertion', tests: ['TC-HOME-012', 'TC-ABOUT-009'],
    evidence: [ev('TC-HOME-012'), ev('TC-ABOUT-009'), 'qa/04-exploratory/evidence/about-us/BUG-006_stale-nav-highlight.png'],
    steps: ['1. Sign in and open Notifications.', '2. Load /ABOUT_US directly.', '3. Check the highlighted menu item.'],
    expected: 'About Us is highlighted.', actual: 'Notifications is highlighted (TC-HOME-012 read "Notifications"; TC-ABOUT-009 read no active item).' }),
  mk({ id: 'DEF-011', module: 'home', title: 'Sidebar state not reset: drawer stays open on mobile and desktop sidebar stays collapsed after resize',
    description: 'BUG-007 (stage 4, manual only). On 390px the drawer stays open over content after choosing an item; localStorage isCollapsed keeps the desktop sidebar collapsed after resizing back to 1440.',
    testData: 'Role: User; Chromium; viewports 390x844 and 1440 wide.', priority: 'Low', severity: 'Minor', type: 'UI', signal: 'assertion', tests: [],
    evidence: ['qa/04-exploratory/evidence/notifications/US002_AC-NOTIF-01_mobile-390.png'],
    steps: ['1. Set viewport 390x844, open the drawer, choose Notifications.', '2. Resize to 1440.'],
    expected: 'Drawer closes on selection; desktop layout restored.', actual: 'Drawer stays open; sidebar stays collapsed.' }),
  mk({ id: 'DEF-012', module: 'my-profile', title: 'Mobile number on the profile has 8 digits',
    description: 'BUG-009 reproduced in automation. TC-PROFILE-009 expects /^\\d{10}$/ and receives an 8-digit value. This may be bad test-account data rather than a formatting bug; filed as Low until the data owner confirms.',
    testData: `${chromiumNote} Profile of the User role.`, priority: 'Low', severity: 'Minor', type: 'Validation', signal: 'assertion', tests: ['TC-PROFILE-009'],
    evidence: [ev('TC-PROFILE-009'), 'qa/04-exploratory/evidence/my-profile/US002_AC-PROFILE-01_mobile-390.png'],
    steps: ['1. Sign in.', '2. Open My Profile.', '3. Read the Mobile Number.'],
    expected: '10-digit mobile number.', actual: '8-digit value shown.' }),
  mk({ id: 'DEF-013', module: 'notifications', title: 'Paginator shows page 2 while rows stay on page 1 after a 500 on Next',
    description: 'BUG-010 (stage 5). When POST /sahyogAosAPI/aos/app/notification/list returns 500 after clicking Next, the rows stay on page 1 but the paginator highlights page 2. The 500 was injected by the test; the defect is the state desync and the lack of any error message.',
    testData: `${chromiumNote} The notification list request is forced to return 500 on the Next click.`, priority: 'Medium', severity: 'Minor', type: 'Functional', signal: 'assertion', tests: ['TC-NOTIF-030'],
    evidence: [ev('TC-NOTIF-030')],
    steps: ['1. Open Notifications.', '2. Make notification/list return 500.', '3. Click Next.'],
    expected: 'Indicator stays on page 1; a retry reaches page 2.', actual: 'Rows on page 1, highlight on page 2.' }),
];

// Reconciliation of stage-4 provisional bugs
const reconcile = {
  'BUG-001': 'DEF-001', 'BUG-002': 'DEF-002', 'BUG-003': 'DEF-007', 'BUG-004': 'DEF-008', 'BUG-005': 'DEF-009',
  'BUG-006': 'DEF-010', 'BUG-007': 'DEF-011', 'BUG-008': 'DEF-003, DEF-004, DEF-005, DEF-006', 'BUG-009': 'DEF-012', 'BUG-010': 'DEF-013',
};
for (const d of defects) { const b = Object.entries(reconcile).filter(([, v]) => v.split(', ').includes(d.id)).map(([k]) => k); d.provisional = b; }

const notDefects = [
  { test: 'TC-HOME-010', classification: 'script', reason: 'Missing wait while tab styles re-render; healed in src/pages/home.page.ts (stage 5). Passes now.' },
  { test: 'TC-PROFILE-011', classification: 'script', reason: 'Precondition incomplete: goto fired before re-login finished; healed in the spec arrange block.' },
  { test: 'TC-NOTIF-006', classification: 'script', reason: 'Missing wait for the row list to change after the page highlight moved; healed in notifications.page.ts.' },
  { test: 'TC-NOTIF-007', classification: 'script', reason: 'Ambiguous Next locator (3 matches); healed with exact: true.' },
  { test: 'TC-LOGIN-007..017, 029, 033', classification: 'test-data', reason: 'Web signals show POST oauth2/token 400 (14 events). These are the deliberate wrong-password / invalid-input cases; the UI shows a toast for each, so they are not swallowed errors. The wording difference is DEF-001.' },
  { test: 'TC-LOGIN-024, TC-HOME-020/025, TC-ABOUT-010, TC-PROFILE-015, TC-NOTIF-027', classification: 'test-data', reason: '401 signals come from tests that clear the session on purpose; the app redirects to /login. Only the toast wording is filed (DEF-009).' },
  { test: 'TC-LOGIN-035, TC-HOME-024, TC-NOTIF-029', classification: 'test-data', reason: '500 responses were injected by the tests (route mocks). They are not server faults; the app handled them without crashing. TC-NOTIF-030 desync is DEF-013.' },
  { test: 'TC-LOGIN-034, TC-HOME-026, TC-NOTIF-031', classification: 'environment', reason: 'net::ERR_INTERNET_DISCONNECTED is the offline emulation used by these tests, not a real outage.' },
  { test: '16 skipped tests', classification: 'test-data', reason: 'Skipped / fixme since stage 3 (e.g. TC-PROFILE-012, no profile endpoint identified; Mark All as Read not approved to run). Not failures.' },
  { test: 'Exploratory blocked cases (65)', classification: 'environment', reason: 'Stage 4 MCP session did not expose route, offline, axe and some tools. Covered later by automation. No defect raised.' },
];
const notes = [
  'No uncaught page errors, no failed requests (besides emulated offline), and no navigation over the 5 s threshold appeared in any final-run web-signals file.',
  'The 4xx/5xx signals in passed tests were caused by the tests themselves (see notDefects); no unexplained 4xx or real 5xx was seen.',
  'Final run per module used: ' + Object.entries(FINAL).map(([k, v]) => `${k}=${v}`).join(', ') + '.',
  'Manual-only defects (DEF-007, 008, 009, 011) rest on stage 4 notes and screenshots, not on a failing automated assertion.',
];

fs.mkdirSync('qa/06-report', { recursive: true });
const clean = defects.map(d => ({ ...d, evidence: d.evidence.filter(Boolean) }));
fs.writeFileSync(`qa/06-report/${P}-defects.json`, JSON.stringify({ project: P, generatedAt: new Date().toISOString(), defects: clean, notDefects, notes }, null, 2));

// ---------- xlsx ----------
const STATUS = ['New', 'Assigned', 'Open', 'In Progress', 'Fixed', 'Ready for QA', 'Retest', 'Closed', 'Reopened', 'Deferred'];
const PRIO = ['Critical', 'High', 'Medium', 'Low'];
const SEV = ['Blocker', 'Critical', 'Major', 'Minor', 'Trivial'];
const TYPE = ['Functional', 'UI', 'API', 'Performance', 'Security', 'Regression', 'Validation', 'Enhancement', 'Integration', 'Compatibility', 'Accessibility'];
const RETEST = ['Pass', 'Fail', 'Partially Fixed', 'Reopened', 'Not Retested'];
const cols = ['Defect ID', 'Date', 'Instance', 'Module', 'Title', 'Description', 'Test Data / Required Info', 'Status', 'Screenshot / STR', 'Priority', 'Severity', 'Type', 'Retested Result', 'Developer Assigned', 'Resolved Date', 'Developer Comment', 'QA Comment', 'Changes Applied'];
const widths = [11, 13, 10, 15, 40, 60, 45, 12, 60, 11, 11, 14, 14, 16, 14, 25, 25, 25];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Defects', { views: [{ state: 'frozen', ySplit: 1 }] });
const rows = clean.map(d => [
  d.id, new Date(d.date + 'T00:00:00Z'), d.instance, d.module, d.title,
  d.description + (d.provisional.length ? `\n(Stage 4 id: ${d.provisional.join(', ')})` : ''),
  d.testData, d.status,
  `Evidence:\n${d.evidence.join('\n') || 'n/a'}\n\nSteps:\n${d.steps.join('\n')}\n\nExpected: ${d.expected}\nActual: ${d.actual}`,
  d.priority, d.severity, d.type, 'Not Retested', '', null, '', '', '',
]);
ws.addTable({ name: 'DefectTable', ref: 'A1', headerRow: true, style: { theme: 'TableStyleMedium2', showRowStripes: true },
  columns: cols.map(c => ({ name: c, filterButton: true })), rows });
cols.forEach((_, i) => { ws.getColumn(i + 1).width = widths[i]; });
ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
const n = rows.length + 1;
for (let r = 2; r <= n; r++) {
  ws.getRow(r).alignment = { vertical: 'top', wrapText: true };
  ws.getCell(r, 2).numFmt = 'DD-MMM-YYYY';
  ws.getCell(r, 15).numFmt = 'DD-MMM-YYYY';
  for (const [c, list] of [[8, STATUS], [10, PRIO], [11, SEV], [12, TYPE], [13, RETEST]])
    ws.getCell(r, c).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`] };
}
const fill = (argb, white) => ({ type: 'pattern', pattern: 'solid', bgColor: { argb }, fgColor: { argb } });
const rule = (col, text, argb, white) => ({ type: 'expression', formulae: [`$${col}2="${text}"`], style: { fill: fill(argb), font: { color: { argb: white ? 'FFFFFFFF' : 'FF000000' }, bold: true } } });
const cf = (col, rules) => ws.addConditionalFormatting({ ref: `${col}2:${col}${n}`, rules: rules.map(r => ({ ...r, priority: 1 })) });
cf('H', [rule('H', 'Fixed', 'FFC6EFCE'), rule('H', 'Open', 'FFFFC7CE'), rule('H', 'Reopened', 'FFFFC7CE'), rule('H', 'In Progress', 'FFFFEB9C')]);
cf('J', [rule('J', 'Critical', 'FF8B0000', true), rule('J', 'High', 'FFFFA500'), rule('J', 'Medium', 'FFFFFF00'), rule('J', 'Low', 'FF92D050')]);
cf('K', [rule('K', 'Blocker', 'FF8B0000', true), rule('K', 'Critical', 'FFFF0000', true), rule('K', 'Major', 'FFFFA500'), rule('K', 'Minor', 'FFFFFF00'), rule('K', 'Trivial', 'FF92D050')]);
await wb.xlsx.writeFile(`qa/06-report/${P}-defects.xlsx`);

const count = (k) => clean.reduce((a, d) => (a[d[k]] = (a[d[k]] || 0) + 1, a), {});
console.log('defects', clean.length, 'severity', count('severity'), 'module', count('module'), 'priority', count('priority'));
console.log('notDefects', notDefects.reduce((a, d) => (a[d.classification] = (a[d.classification] || 0) + 1, a), {}));
console.log('missing evidence:', defects.filter(d => d.evidence.some(e => !e)).map(d => d.id));
