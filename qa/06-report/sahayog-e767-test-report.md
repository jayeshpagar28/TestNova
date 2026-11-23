# QA Test Report — Sahayog

- **Project:** Sahayog (`sahayog-e767`) · **Environment:** QA · **URL:** https://sahyogagentweb.drutam.in:9634/login
- **Browsers in scope (project.json):** chromium · **Role:** User (credentials are in `.env`; no value is recorded here)
- **App build:** not exposed by the application (run.json build version = "QA", no build code) · **Report date:** 2026-11-04
- **Sources:** knowledge base, 171 planned cases, exploratory results, final automation runs (EX-20261104-112238, EX-20261104-113334, EX-20261104-115909, EX-20261104-114312, EX-20261104-115503), healing log, defect log.

## 1. Executive summary

**Release view (30 seconds):** 13 application defects are open (all status "New", none retested). Automation finished with **142 passed, 13 failed, 16 skipped of 171** tests; every one of the 13 failures is a real application defect (0 failures are unexplained). No environment failure affected a final run.

- **What was tested:** 5 modules (Login, Home, About Us, My Profile, Notifications) on Chromium only, role User, 171 planned cases, 11 acceptance criteria.
- **Overall outcome:** not release-ready on accessibility and security grounds. Highest risks:
  1. **Security (DEF-001, High):** the login toast differs between a valid User Id with a wrong password and an unknown User Id, so valid accounts can be enumerated.
  2. **Accessibility (DEF-002, DEF-004, DEF-006, High):** keyboard users cannot reach navigation, tabs, avatar, bell or the Forgot links; critical axe violations (aria-allowed-attr, button-name, and on Notifications label) appear on every signed-in page, caused by the shared shell.
  3. **UI state:** stale side-nav highlight (DEF-010) and a paginator that shows page 2 over page-1 rows after a failed request, with no error shown (DEF-013).
- **Suite status vs. app status:** the suite is red, not green, so it is not masking a broken app. The reverse gap matters: **3 defects (DEF-008, DEF-009, DEF-011) have no failing automated assertion** (they were found manually, or the automated test stops at an earlier failure or checks something else). A green automated result does not clear them.
- **Manual failed, automation passed:** 5 cases (TC-LOGIN-024, TC-LOGIN-032, TC-LOGIN-037, TC-HOME-035, TC-NOTIF-027) failed in the exploratory pass while the matching automated test passed. Automation does not assert those problems (for example the "Success: Logout Successfully" toast on an expired session, DEF-009, and keyboard reachability on Login, DEF-002), so a green result on them does not mean the behaviour is correct.
- **Coverage limits:** only Chromium was in scope, so Firefox and WebKit are untested (—). 65 of 171 manual cases were blocked in the exploratory session (tooling not exposed, or writes not approved), and 16 automated tests are skipped. 11 of 11 ACs are linked to a test; 46 of 171 cases are linked only to a knowledge-base gap (GAP-xxx), not to an AC.

## 2. Test statistics

Definitions: **planned cases** come from the test plans (171). **Manual** is the exploratory result per case; **Automated** is the latest run of each module. Pass rate = passed ÷ tests that produced a verdict (pass + fail); the share of all planned cases is shown alongside.

### 2.1 Totals

| Layer | Planned | Pass | Fail | Blocked | Skipped | Not run | Pass rate (of executed) | Pass of all planned |
|---|---|---|---|---|---|---|---|---|
| Manual (exploratory) | 171 | 93 | 13 | 65 | — | 0 | 87.7% | 54.4% |
| Automated (final runs) | 171 | 142 | 13 | — | 16 | 0 | 91.6% | 83.0% |

Every automated test ID exists in a test plan.

### 2.2 Per module

| Module | Planned | Manual P/F/Blocked | Automated P/F/Skipped | Final run |
|---|---|---|---|---|
| Login | 44 | 27/7/10 | 38/4/2 | EX-20261104-112238 |
| Home | 38 | 22/3/13 | 34/3/1 | EX-20261104-113334 |
| About Us | 19 | 11/1/7 | 16/2/1 | EX-20261104-115909 |
| My Profile | 32 | 15/1/16 | 26/2/4 | EX-20261104-114312 |
| Notifications | 38 | 18/1/19 | 28/2/8 | EX-20261104-115503 |

### 2.3 Per test type

| Test type | Planned | Manual P/F/Blocked | Automated P/F/Skipped |
|---|---|---|---|
| 1-Happy Path | 18 | 14/0/4 | 17/0/1 |
| 10-Async/Race | 13 | 2/0/11 | 9/0/4 |
| 11-Web Conditions | 71 | 32/5/34 | 61/7/3 |
| 2-Negative | 14 | 13/1/0 | 13/1/0 |
| 3-State-Aware | 8 | 5/0/3 | 7/0/1 |
| 4-CRUD | 10 | 7/0/3 | 7/0/3 |
| 5-Business Rule | 11 | 9/1/1 | 9/1/1 |
| 6-Field Validation | 9 | 7/2/0 | 7/2/0 |
| 7-UI State | 11 | 2/3/6 | 9/2/0 |
| 8-Audit | 3 | 1/0/2 | 1/0/2 |
| 9-Third-Party | 3 | 1/1/1 | 2/0/1 |

### 2.4 Per browser

| Browser | Automated tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| chromium | 171 | 142 | 13 | 16 |
| firefox | — | — | — | — |
| webkit | — | — | — | — |

Firefox and WebKit are not listed in `project.json`, so nothing was run on them. Browser-specific differences are unknown.

## 3. Manual (exploratory) results

Chromium, role User, viewports 1280×720, 390×844, 820×1180, 1440×900. Per case results are in `qa/04-exploratory/<module>-results.md`.

| Module | Planned | Pass | Fail | Blocked |
|---|---|---|---|---|
| Login | 44 | 27 | 7 | 10 |
| Home | 38 | 22 | 3 | 13 |
| About Us | 19 | 11 | 1 | 7 |
| My Profile | 32 | 15 | 1 | 16 |
| Notifications | 38 | 18 | 1 | 19 |

**Failed manual cases**

| Case | Title | Actual | Deviation | Defect |
|---|---|---|---|---|
| TC-LOGIN-007 | Wrong password via Enter shows generic toast | Toast "Error: The password you entered is incorrect" (oauth2/token 400) for a valid User Id | Expected generic "The credentials you entered are incorrect"; reveals the account exists (BUG-001) | DEF-001 |
| TC-LOGIN-008 | Unknown User Id gives the same generic message | Unknown id gave "The credentials you entered are incorrect"; valid id + wrong password gave a different message | Messages differ so user ids can be enumerated (BUG-001) | DEF-001 |
| TC-LOGIN-012 | Password visibility toggle (Assumption) | Icon exists but is a plain div with no role, no accessible name, tabindex -1; not keyboard operable. Mouse click not exercised | Toggle unusable by keyboard/AT (BUG-002, BUG-008) | DEF-003 |
| TC-LOGIN-024 | Session cleared mid-flow redirects to login | After clearing storage, clicking Next gave notification/list 401 and a redirect to /login, but the page showed toast "Success: Logout Successfully" | Misleading success toast for an expired session (BUG-005) | DEF-009 |
| TC-LOGIN-032 | Forgot Password, Forgot User ID, Activate Account links are present (Assumption) | All three present (not submitted) but are `a` elements without href; keyboard Tab skips them | Not keyboard reachable (BUG-002) | DEF-002 |
| TC-LOGIN-037 | Keyboard-only sign in | Tab order: User Id, Password, Login only; links and password toggle unreachable. Enter submits. Focus ring not inspected visually | BUG-002 | DEF-002 |
| TC-LOGIN-039 | Validation and toast errors are announced and labelled | Toast has role alert; inline errors ("Enter User Id") are plain divs, not tied to the field (no aria-describedby/invalid) | BUG-008 | DEF-003 |
| TC-HOME-012 | Active nav item is highlighted and stays so | Highlight comes from stored `selectedMenuIndex`, not URL: after a direct URL load the previous item stays highlighted | BUG-006 | DEF-010 |
| TC-HOME-030 | Keyboard operation of nav, tabs and avatar menu | Tab cycles only between "Savings Application" and the unnamed sidebar toggle; nav items, tabs, avatar, bell, View All never receive focus. Escape does not close the avatar menu | BUG-002, BUG-003 | DEF-002, DEF-007 |
| TC-HOME-035 | Nav/tab state survives crossing a breakpoint | Sidebar collapsed state (`isCollapsed` in localStorage) persisted after growing back to desktop; selected tab not retested | BUG-007 | see summary.md |
| TC-ABOUT-009 | Nav item stays highlighted on About Us | After direct load the Notifications item was highlighted while on About Us; correct only after a click | BUG-006 | DEF-010 |
| TC-PROFILE-009 | Field formats are valid | Email and DOB valid; mobile number is only 8 digits | Indian mobile numbers are 10 digits; looks truncated or bad data (BUG-009, Low) | DEF-012 |
| TC-NOTIF-027 | Session cleared while paging | Next after clearing storage: notification/list 401, redirect to /login, no raw 401, but toast "Success: Logout Successfully" | BUG-005. Also nav labels disappeared from the shell before redirect | DEF-009 |

**Why 65 cases were blocked** (from `qa/04-exploratory/summary.md`): the exploratory session did not expose route, offline, throttling, second-tab or axe tools (environment, not defects); Mark All as Read and opening a notification were not run because they change real data and no approval exists in notes; the rest were not reached. Many of these were later exercised by automation (see section 4). Blocked cases are not counted as passes.

**Cases where manual and automated results disagree**

- Manual **Fail**, automated **Pass**: TC-LOGIN-024, TC-LOGIN-032, TC-LOGIN-037, TC-HOME-035, TC-NOTIF-027.
- Manual **Pass**, automated **Fail**: none.

## 4. Automation results

Runs went through the TestNova runner; each is a dashboard execution with screenshot, trace, video and web signals.

| Module | Initial run | Initial P/F/S | Final run | Final P/F/S |
|---|---|---|---|---|
| Login | EX-20261104-112238 | 38/4/2 | EX-20261104-112238 | 38/4/2 |
| Home | EX-20261104-112810 | 33/4/1 | EX-20261104-113334 | 34/3/1 |
| About Us | EX-20261104-113708 | 16/2/1 | EX-20261104-115909 | 16/2/1 |
| My Profile | EX-20261104-113921 | 25/3/4 | EX-20261104-114312 | 26/2/4 |
| Notifications | EX-20261104-114602 | 26/4/8 | EX-20261104-115503 | 28/2/8 |
| **Total** |  | 138/17/16 of 171 |  | 142/13/16 of 171 |

**Healing** (from `qa/05-healing/healing-log.md`): 4 script fixes (TC-HOME-010 missing wait; TC-PROFILE-011 incomplete precondition; TC-NOTIF-006 missing wait; TC-NOTIF-007 ambiguous locator) in page objects or arrange blocks. 5 further failures (TC-HOME-031, TC-ABOUT-015, TC-PROFILE-027, TC-NOTIF-034, TC-NOTIF-030) were app defects, so only metadata (`@known-defect`, defect annotation) was added. No assertion was weakened, deleted, skipped or marked fixme. The log records that Home was not re-run after the last About Us and Notifications changes; Login's only run is its final run.

**Failing tests in the final runs (all application defects)**

| Test | Title | Module | First error line | Defect |
|---|---|---|---|---|
| TC-LOGIN-007 | Wrong password via Enter shows generic toast | login | Error: expect(locator).toBeVisible() failed | DEF-001 |
| TC-LOGIN-008 | Unknown User Id gives the same generic message | login | Error: expect(received).toBe(expected) // Object.is equality | DEF-001 |
| TC-LOGIN-012 | Password visibility toggle (Assumption) | login | Error: expect(locator).toHaveAccessibleName(expected) failed | DEF-003 |
| TC-LOGIN-039 | Validation and toast errors are announced and labelled | login | Error: expect(locator).toHaveAccessibleDescription(expected) failed | DEF-003 |
| TC-HOME-012 | Active nav item is highlighted and stays so | home | Error: expect(received).toBe(expected) // Object.is equality | DEF-010 |
| TC-HOME-030 | Keyboard operation of nav, tabs and avatar menu | home | Error: expect(received).toBe(expected) // Object.is equality | DEF-002, DEF-007 |
| TC-HOME-031 | axe WCAG 2 A/AA scan of /HOME | home | Error: expect(received).toEqual(expected) // deep equality | DEF-004, DEF-005 |
| TC-ABOUT-009 | Nav item stays highlighted on About Us | about-us | Error: expect(received).toBe(expected) // Object.is equality | DEF-010 |
| TC-ABOUT-015 | axe WCAG 2 A/AA scan | about-us | Error: expect(received).toEqual(expected) // deep equality | DEF-004, DEF-005 |
| TC-PROFILE-009 | Field formats are valid | my-profile | Error: expect(received).toMatch(expected) | DEF-012 |
| TC-PROFILE-027 | axe WCAG 2 A/AA scan | my-profile | Error: expect(received).toEqual(expected) // deep equality | DEF-004, DEF-005 |
| TC-NOTIF-030 | Paging request fails mid-way | notifications | Error: expect(locator).toHaveText(expected) failed | DEF-013 |
| TC-NOTIF-034 | axe WCAG 2 A/AA scan | notifications | Error: expect(received).toEqual(expected) // deep equality | DEF-004, DEF-005, DEF-006 |

### 4.1 Environment failures (not defects)

- EX-20261104-112056 (Login): status "error" — The TestNova server stopped during this execution, so its remaining tests have no result.
- No environment failure occurred in any of the 5 final runs (`errors` is empty in each). The earlier run above stopped because the TestNova server stopped; it was re-run and is excluded from all counts.
- Offline cases (net::ERR_INTERNET_DISCONNECTED) and injected 500 responses in tests are emulations by the tests themselves, not outages or server faults (see `sahayog-e767-defects.json`, notDefects).
- Exploratory cases blocked by missing MCP tools (65 blocked in total, including the safety-blocked ones) are environment/tooling limits, not defects.

### 4.2 Script and test-data items (not defects)

- TC-HOME-010 — script: Missing wait while tab styles re-render; healed in src/pages/home.page.ts (stage 5). Passes now.
- TC-PROFILE-011 — script: Precondition incomplete: goto fired before re-login finished; healed in the spec arrange block.
- TC-NOTIF-006 — script: Missing wait for the row list to change after the page highlight moved; healed in notifications.page.ts.
- TC-NOTIF-007 — script: Ambiguous Next locator (3 matches); healed with exact: true.
- TC-LOGIN-007..017, 029, 033 — test-data: Web signals show POST oauth2/token 400 (14 events). These are the deliberate wrong-password / invalid-input cases; the UI shows a toast for each, so they are not swallowed errors. The wording difference is DEF-001.
- TC-LOGIN-024, TC-HOME-020/025, TC-ABOUT-010, TC-PROFILE-015, TC-NOTIF-027 — test-data: 401 signals come from tests that clear the session on purpose; the app redirects to /login. Only the toast wording is filed (DEF-009).
- TC-LOGIN-035, TC-HOME-024, TC-NOTIF-029 — test-data: 500 responses were injected by the tests (route mocks). They are not server faults; the app handled them without crashing. TC-NOTIF-030 desync is DEF-013.
- TC-LOGIN-034, TC-HOME-026, TC-NOTIF-031 — environment: net::ERR_INTERNET_DISCONNECTED is the offline emulation used by these tests, not a real outage.
- 16 skipped tests — test-data: Skipped / fixme since stage 3 (e.g. TC-PROFILE-012, no profile endpoint identified; Mark All as Read not approved to run). Not failures.
- Exploratory blocked cases (65) — environment: Stage 4 MCP session did not expose route, offline, axe and some tools. Covered later by automation. No defect raised.

## 5. Defect log

13 application defects, all "New", none assigned or retested. Severity and priority are from `sahayog-e767-defects.json`. Full columns, validation and colouring are in `sahayog-e767-defects.xlsx`.

| Defect ID | Date | Instance | Module | Title | Description | Test Data / Required Info | Status | Screenshot / STR | Priority | Severity | Type | Developer Assigned | Resolved Date / Retested Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEF-001 | 2026-11-04 | QA | login | Login reveals which User Ids exist (different message for wrong password) | BUG-001 (stage 4) reproduced in automation. For a valid User Id with a wrong password the login toast reads "The password you entered is incorrect" (POST /sahyogUserManagementAPI/oauth2/token → 400). An unknown User Id gives "The credentials you entered are incorrect". The difference lets an attacker enumerate valid accounts. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Needs one valid User Id and one unknown User Id; wrong password for both. | New | 1. Open /login. 2. Enter a valid User Id and a wrong password; click Login. 3. Note the toast text. 4. Repeat with an unknown User Id. 5. Compare the two messages. Evidence: dashboard/data/runs/EX-20261104-112238/evidence/7-0-0-screenshot.png, dashboard/data/runs/EX-20261104-112238/evidence/9-0-0-screenshot.png, qa/04-exploratory/evidence/login/BUG-001_400_user-enumeration-toast.png | High | Major | Security | — | —/Not retested |
| DEF-002 | 2026-11-04 | QA | login | Keyboard users cannot reach Forgot links, password toggle, nav items, tabs, avatar or bell | BUG-002 (stage 4). Forgot User ID / Forgot Password / Activate Account are <a> elements without href; the password toggle has tabindex -1; on Home, Tab cycles only between "Savings Application" and the sidebar toggle. Nav items (li/div without role), tabs, avatar, bell and View All never receive focus. Automation TC-HOME-030 fails on the keyboard assertion; TC-LOGIN-037 and TC-LOGIN-032 failed in manual testing. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Keyboard only, no mouse. | New | 1. Open /login and press Tab repeatedly: only User Id, Password and Login are reached. 2. Sign in; on /HOME press Tab repeatedly. 3. Watch which elements receive focus. Evidence: dashboard/data/runs/EX-20261104-113334/evidence/31-0-0-screenshot.png | High | Major | Accessibility | — | —/Not retested |
| DEF-003 | 2026-11-04 | QA | login | Login: password toggle has no accessible name; validation error not tied to the field | BUG-008 (login part). The password visibility toggle is a plain div with an empty accessible name (TC-LOGIN-012: received ""). The inline "Enter User Id" error is not linked to the input, so the User Id input has no accessible description (TC-LOGIN-039). | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Submit with User Id empty to see the inline error. | New | 1. Open /login. 2. Inspect the eye icon next to Password: no role, no name. 3. Click Login with User Id empty; inspect the User Id input for aria-describedby / aria-invalid. Evidence: dashboard/data/runs/EX-20261104-112238/evidence/14-0-0-screenshot.png, dashboard/data/runs/EX-20261104-112238/evidence/36-0-0-screenshot.png | Medium | Minor | Accessibility | — | —/Not retested |
| DEF-004 | 2026-11-04 | QA | home | Critical axe violations on every signed-in page: aria-allowed-attr and button-name | BUG-008. axe-core reports aria-allowed-attr (critical) and button-name (critical, unnamed buttons such as the sidebar toggle) on Home, About Us, My Profile and Notifications. The set is identical on each page, so the cause is the shared layout. 8 scans (2 attempts per test) across 4 tests. | Role: User; Chromium desktop; signed in; axe-core scan of the page; same violations on every page, so the problem is in the shared shell. | New | 1. Sign in as the User role. 2. Open /HOME, /ABOUT_US, /MY_PROFILE, /NOTIFICATIONS in turn. 3. Run an axe scan on each. Evidence: dashboard/data/runs/EX-20261104-113334/evidence/33-0-0-a11y-home.json, dashboard/data/runs/EX-20261104-115909/evidence/16-0-0-a11y-about-us.json, dashboard/data/runs/EX-20261104-114312/evidence/28-0-0-a11y-my-profile.json, dashboard/data/runs/EX-20261104-115503/evidence/35-0-0-a11y-notifications.json | High | Critical | Accessibility | — | —/Not retested |
| DEF-005 | 2026-11-04 | QA | home | Serious axe violation on every signed-in page: color-contrast (e.g. inactive tab text) | BUG-008. axe-core reports color-contrast (serious) on Home, About Us, My Profile and Notifications; the stage 4 review noted the low-contrast inactive tab as one source. | Role: User; Chromium desktop; signed in; axe-core scan of the page; same violations on every page, so the problem is in the shared shell. | New | 1. Sign in. 2. Open each page and run an axe scan; read the color-contrast result. Evidence: dashboard/data/runs/EX-20261104-113334/evidence/33-0-0-a11y-home.json, dashboard/data/runs/EX-20261104-115909/evidence/16-0-0-a11y-about-us.json, dashboard/data/runs/EX-20261104-114312/evidence/28-0-0-a11y-my-profile.json, dashboard/data/runs/EX-20261104-115503/evidence/35-0-0-a11y-notifications.json | Medium | Major | Accessibility | — | —/Not retested |
| DEF-006 | 2026-11-04 | QA | notifications | Notifications page: unlabelled form control, invalid list structure, ARIA command without name | BUG-008 (notifications part). In addition to the shared violations, axe reports label (critical), aria-command-name (serious) and list (serious) on /NOTIFICATIONS. Mark All as Read and the tabs are plain text/divs rather than buttons/tabs. | Role: User; Chromium desktop; signed in; axe-core scan of the page; same violations on every page, so the problem is in the shared shell. | New | 1. Sign in and open Notifications. 2. Run an axe scan; see label, aria-command-name, list results. Evidence: dashboard/data/runs/EX-20261104-115503/evidence/35-0-0-a11y-notifications.json, qa/04-exploratory/evidence/notifications/US002_AC-NOTIF-01_unread-tab.png | High | Critical | Accessibility | — | —/Not retested |
| DEF-007 | 2026-11-04 | QA | home | Escape does not close the avatar menu | BUG-003 (stage 4, manual only; the automated assertion in TC-HOME-030 stops at the earlier keyboard failure, so Escape was not independently reached). | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Desktop. | New | 1. Sign in, open /HOME. 2. Click the avatar to open the menu. 3. Press Escape. Evidence: qa/04-exploratory/evidence/home/US002_AC-HOME-02_avatar-menu.png | Low | Minor | Functional | — | —/Not retested |
| DEF-008 | 2026-11-04 | QA | home | Alerts badge missing after a full page load of other pages | BUG-004 (stage 4, manual only; not covered by an automated assertion). The Alerts badge shows on Home (count equals alert count) but is empty after a direct load of /NOTIFICATIONS or /ABOUT_US. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Direct URL load. | New | 1. Sign in; note the Alerts badge on Home. 2. Load /NOTIFICATIONS directly (browser reload). 3. Look at the Alerts badge. Evidence: qa/04-exploratory/home-results.md (TC-HOME-013) | Low | Minor | UI | — | —/Not retested |
| DEF-009 | 2026-11-04 | QA | login | Expired session redirects to /login with the toast "Success: Logout Successfully" | BUG-005 (stage 4, manual only). After the session/token is cleared, the next list call returns 401 (POST /sahyogAosAPI/aos/alert/get/list and /sahyogUserManagementAPI/admin/sidemenu/list) and the app redirects to /login. The user is shown a success toast for a logout they did not do. No raw 401 is shown. Automation tests TC-LOGIN-024 / TC-NOTIF-027 check the redirect and pass, so this wording is not asserted. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Clear localStorage on a signed-in page, then click Next/navigate. | New | 1. Sign in and open Notifications. 2. Clear localStorage. 3. Click Next. Evidence: qa/04-exploratory/login-results.md (TC-LOGIN-024), qa/04-exploratory/notifications-results.md (TC-NOTIF-027) | Low | Minor | Functional | — | —/Not retested |
| DEF-010 | 2026-11-04 | QA | home | Side-nav highlight is stale; follows stored menu index, not the URL | BUG-006 reproduced in automation. The active item comes from stored selectedMenuIndex; after a direct load of /ABOUT_US the Notifications item is highlighted until a click. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Direct URL load after having been on Notifications. | New | 1. Sign in and open Notifications. 2. Load /ABOUT_US directly. 3. Check the highlighted menu item. Evidence: dashboard/data/runs/EX-20261104-113334/evidence/12-0-0-screenshot.png, dashboard/data/runs/EX-20261104-115909/evidence/9-0-0-screenshot.png, qa/04-exploratory/evidence/about-us/BUG-006_stale-nav-highlight.png | Medium | Major | UI | — | —/Not retested |
| DEF-011 | 2026-11-04 | QA | home | Sidebar state not reset: drawer stays open on mobile and desktop sidebar stays collapsed after resize | BUG-007 (stage 4, manual only). On 390px the drawer stays open over content after choosing an item; localStorage isCollapsed keeps the desktop sidebar collapsed after resizing back to 1440. | Role: User; Chromium; viewports 390x844 and 1440 wide. | New | 1. Set viewport 390x844, open the drawer, choose Notifications. 2. Resize to 1440. Evidence: qa/04-exploratory/evidence/notifications/US002_AC-NOTIF-01_mobile-390.png | Low | Minor | UI | — | —/Not retested |
| DEF-012 | 2026-11-04 | QA | my-profile | Mobile number on the profile has 8 digits | BUG-009 reproduced in automation. TC-PROFILE-009 expects /^\d{10}$/ and receives an 8-digit value. This may be bad test-account data rather than a formatting bug; filed as Low until the data owner confirms. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). Profile of the User role. | New | 1. Sign in. 2. Open My Profile. 3. Read the Mobile Number. Evidence: dashboard/data/runs/EX-20261104-114312/evidence/10-0-0-screenshot.png, qa/04-exploratory/evidence/my-profile/US002_AC-PROFILE-01_mobile-390.png | Low | Minor | Validation | — | —/Not retested |
| DEF-013 | 2026-11-04 | QA | notifications | Paginator shows page 2 while rows stay on page 1 after a 500 on Next | BUG-010 (stage 5). When POST /sahyogAosAPI/aos/app/notification/list returns 500 after clicking Next, the rows stay on page 1 but the paginator highlights page 2. The 500 was injected by the test; the defect is the state desync and the lack of any error message. | Role: User; Chromium (Playwright build), desktop 1280x720 unless stated; URL https://sahyogagentweb.drutam.in:9634; logged in as the User role (no credential recorded). The notification list request is forced to return 500 on the Next click. | New | 1. Open Notifications. 2. Make notification/list return 500. 3. Click Next. Evidence: dashboard/data/runs/EX-20261104-115503/evidence/30-0-0-screenshot.png | Medium | Minor | Functional | — | —/Not retested |

By type: Security 1, Accessibility 5, Functional 3, UI 3, Validation 1. 13 counts defects, not failing tests (13 failing tests map to 10 defects).

## 6. Acceptance-criteria coverage matrix

Counts are cases linked to the AC by the AC column of the test plans. "Blocked/skipped/not run" are not passes.

| AC | Description | Manual | Automated |
|---|---|---|---|
| AC-LOGIN-01 | Clicking Login with both fields empty shows 'Enter User Id' and creates no session. | 2 pass / 1 fail / 0 blocked, skipped or not run | 2 pass / 1 fail / 0 blocked, skipped or not run |
| AC-LOGIN-02 | User Id filled and password empty shows 'Enter password'. | 1 pass / 0 fail / 0 blocked, skipped or not run | 1 pass / 0 fail / 0 blocked, skipped or not run |
| AC-LOGIN-03 | Wrong credentials via Enter key show toast 'The credentials you entered are incorrect', user stays on /login, message does not name the wrong field. | 3 pass / 2 fail / 0 blocked, skipped or not run | 3 pass / 2 fail / 0 blocked, skipped or not run |
| AC-LOGIN-04 | Valid credentials land the user on /HOME. | 9 pass / 1 fail / 6 blocked, skipped or not run | 16 pass / 0 fail / 0 blocked, skipped or not run |
| AC-LOGIN-05 | Logout returns to /login with toast and /HOME can no longer be opened directly. | 3 pass / 0 fail / 0 blocked, skipped or not run | 3 pass / 0 fail / 0 blocked, skipped or not run |
| AC-LOGIN-06 | Password field is masked (dots) after typing. | 1 pass / 1 fail / 2 blocked, skipped or not run | 3 pass / 1 fail / 0 blocked, skipped or not run |
| AC-HOME-01 | Nav items change the URL to /HOME, /MY_PROFILE, /NOTIFICATIONS, /ABOUT_US. | 15 pass / 3 fail / 11 blocked, skipped or not run | 27 pass / 2 fail / 0 blocked, skipped or not run |
| AC-HOME-02 | Avatar menu lists My Profile, Change Password, Change Language, Logout. | 2 pass / 1 fail / 4 blocked, skipped or not run | 5 pass / 2 fail / 0 blocked, skipped or not run |
| AC-HOME-03 | /HOME without a session redirects to /login. | 4 pass / 1 fail / 6 blocked, skipped or not run | 10 pass / 0 fail / 1 blocked, skipped or not run |
| AC-PROFILE-01 | Every profile field is disabled (not editable). | 13 pass / 1 fail / 9 blocked, skipped or not run | 18 pass / 2 fail / 3 blocked, skipped or not run |
| AC-NOTIF-01 | At most 5 records per page; Previous disabled on page 1. | 13 pass / 0 fail / 10 blocked, skipped or not run | 20 pass / 2 fail / 1 blocked, skipped or not run |

- **Uncovered ACs (no linked test):** none.
- Only 11 ACs exist and each page's real behaviour is mostly specified by knowledge-base gaps (13 gaps in the knowledge base). 46 of 171 planned cases reference a GAP rather than an AC, so they are assumption-based tests. The ACs for Login cover only 6 behaviours; forgot-password, activate-account and the profile/notification content flows have no AC (GAP, unverified).
- ACs AC-HOME-01 to -03 are also referenced by the About Us, My Profile and Notifications plans for navigation and direct-URL access.

## 7. Recommendations (specific to this product)

1. **Fix the login message (DEF-001).** Return the same "The credentials you entered are incorrect" text for a wrong password and an unknown User Id, and make the oauth2/token error payload non-distinguishing.
2. **Fix the shared shell once (DEF-002, DEF-004, DEF-005, DEF-010).** One change to the layout fixes the four pages: give the sidebar toggle and icon buttons names, replace `li`/`div` navigation with links or buttons with roles and `href`, remove the invalid ARIA attribute, raise the inactive-tab contrast, and derive the active item from the URL instead of the stored `selectedMenuIndex`.
3. **Fix Notifications markup (DEF-006, DEF-013).** Label the unnamed form control, make tabs and Mark All as Read real tab/button elements, and on a failed list request keep the current page indicator and show a plain-language error with retry.
4. **Name the password toggle and tie field errors to inputs (DEF-003)** so screen readers announce "Enter User Id" and the toggle.
5. **Session expiry wording (DEF-009).** Show "session expired" instead of "Success: Logout Successfully" when a 401 clears the session.
6. **Small UI state fixes (DEF-007, DEF-008, DEF-011).** Escape closes the avatar menu; fill the Alerts badge on every full page load; close the mobile drawer on selection and reset the collapsed state on resize.
7. **Confirm the My Profile mobile number (DEF-012)** with the data owner; if the test account is correct, add 10-digit validation on the source data.
8. **Add automated assertions** for the 3 defects with none (DEF-008, DEF-009, DEF-011), and unblock the 65 blocked manual cases: run routing/offline/axe-capable sessions, and obtain approval or a disposable account for Mark All as Read and opening a notification.
9. **Widen the browser scope.** Add Firefox and WebKit to `project.json`; no result exists for them today.
10. **Expose a build/version string** in the application so reports can state the build under test.
11. **Fix known skip causes:** identify the profile endpoint (TC-PROFILE-012) so the 16 skipped tests can run.

## 8. Assumptions and limitations

- The final result per module is the latest completed run in `dashboard/data/runs`. Run EX-20261104-112056 (Login) ended with status error when the server stopped and is excluded.
- Duration, failure reason and defect link in the xlsx are taken from run.json and `sahayog-e767-defects.json`.
- Figures not measured (other browsers, resolved dates, retest results, developer assigned) show "—" or "Not retested".
- No credential value appears in this report; the role is referred to as User and the variables as TEST_USERNAME / TEST_PASSWORD.
