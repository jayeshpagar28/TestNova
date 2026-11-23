> ## Platform binding
>
> This pipeline targets a **web application** driven by **Playwright Test** (TypeScript) in
> Chromium, Firefox and WebKit. Live exploration uses the **playwright-test MCP** server
> (`.mcp.json`, installed by `npx playwright init-agents --loop=claude`), whose `browser_*` tools
> drive a real page set up from `tests/seed.spec.ts`.
>
> Every project has its own workspace, `projects/<id>/`, and every agent runs with that folder as its
> working directory: all paths below are relative to it. The project under test is `project.json` (name, URL, environment, browsers, roles)
> with its knowledge sources in `knowledge/`. **Credentials are in this workspace's `.env` on this PC
> only** (`TEST_USERNAME` / `TEST_PASSWORD`, and `TEST_<ROLE>_USERNAME` / `_PASSWORD` per role).
> Never copy a credential value into any file you write, any log line, or any report. Refer to it by
> its variable name.
>
> The pipeline has 8 stages; each one is a Claude agent in `.claude/agents/`:
>
> | Stage | Agent | Output |
> |---|---|---|
> | 1 | `ba-explorer` (BA Agent) | `qa/01-user-story/` |
> | 2 | `knowledge-base-builder` (BA Agent 2.0) | `qa/00-knowledge-base/knowledge-base.{md,json}` |
> | 3 | `test-planner` | `qa/03-test-plan/<module>-test-plan.md` |
> | 4 | `exploratory-tester` (Human-Like Testing Heuristics) | `qa/04-exploratory/` |
> | 5 | `test-generator` | `src/`, `tests/e2e/NN-<module>.spec.ts` |
> | 6 | `test-healer` | dashboard executions, `qa/05-healing/healing-log.md` |
> | 7 | `defect-analyst` | `qa/06-report/<project>-defects.{json,xlsx}` |
> | 8 | `qa-reporter` | `qa/06-report/<project>-test-report.{md,pdf,xlsx}` |
>
> The official `playwright-test-planner`, `-generator` and `-healer` agents are installed alongside
> and may be used as sub-steps, but the TestNova agents own the output paths and the rules below.

> ## Running safely, and resuming instead of starting over
>
> **Process safety.** Every agent runs inside the TestNova server's process tree. Never stop
> processes by name or all at once (`Get-Process node | Stop-Process`, `taskkill /IM …`, `pkill`,
> `killall`, `kill-port`): that kills the server, the dashboard and the MCP servers, and the stage
> fails with all its progress. Stop only a process you started, by its PID. These commands are
> refused by a guard.
>
> **Bounded runs.** Never run commands in the background and never wait with sleep loops. Every
> `playwright test` run carries `--global-timeout` (at most 900000), `--retries=0` and
> `--max-failures`; a run that hits its timeout is a result to record, not a reason to kill
> anything. Full-suite execution belongs to stage 6, through the TestNova runner.
>
> **Checkpoints.** Each stage keeps `qa/checkpoints/stage-<n>.json`: its tasks with status
> `pending | in-progress | done | failed` and each done task's output files. Write the file before
> your first output, write each output to disk as soon as it is produced, and update the checkpoint
> after every task. When a stage is resumed you get a **RESUME brief** (the checkpoint verified
> against the disk, the files present, what still fails validation, the last steps of the previous
> attempt): do not redo a done task whose files exist, finish an in-progress task's missing part
> only, then continue with the pending tasks.

# Step 0: Read the Knowledge Sources and Explore the Application

## Objective

Understand the application from two sides — what the documents say, and what the live application
actually does — and record both with evidence.

## Instructions

1. Read `project.json` and every file in `knowledge/`:
   - Uploaded documents (`.pdf .docx .xlsx .csv .md .txt`, images) — use the extracted text in
     `knowledge/extracted/` written by the Setup screen; read images directly.
   - Links (`links.json`) — the fetched copy in `knowledge/links/` when it was readable. A link marked
     **not readable** (login required) is a **[GAP]**, never a guess.
   - Notes (`notes.md`) — these are instructions from the project owner. Honour them: modules to skip
     are skipped, "don't delete real data" means no destructive action on records you did not create.
2. Open the application with the playwright-test MCP (`planner_setup_page`, then `browser_*`).
   Walk every reachable page: navigation, forms, tables, dialogs, roles. Use `browser_snapshot`
   (the accessibility tree) as the primary record; take a screenshot only where it adds evidence.
3. Exercise the real paths: submit forms empty, enter invalid data, cancel, go back, refresh.

## Evidence rules

- Every statement is backed by something you read or observed. Cite the source: a document and
  section, a link, or a page URL and element.
- Anything you inferred but did NOT verify in the live application is tagged **[NOT VERIFIED]**.
- Anything the application does not expose — server rules, validation you cannot trigger, states
  you cannot reach, pages behind a login you do not have — is tagged **[GAP]** with what you would
  need to confirm it.
- Where a document and the live application disagree, record both and tag **[CONFLICT]**.
- Never invent acceptance criteria to fill out a template. A short, true story beats a long,
  speculative one.

## Output

`qa/01-user-story/US_0NN_{Module}.md`, one per functional area, plus
`qa/01-user-story/evidence/{module-slug}/*.png`.

---

# Step 1: Read and Analyze the User Story — the Knowledge Base

## Objective

Read the user stories from Step 0 and derive all testing requirements. Do not assume a fixed
module scope — let the evidence define what must be tested. The result is the **knowledge base**,
which drives every later stage and the dashboard.

> **Input:** `qa/01-user-story/US_0NN_{Module}.md` — every behavioural claim evidence-tagged.
> Carry the story's `[NOT VERIFIED]` items forward as explicitly-blocked coverage, and keep its
> `[GAP]` items out of the AC set until a stakeholder has signed them off.

## Extract and Derive the Following

### 1. Story Identity
- Story ID, Title, Module name
- Business objective in plain language

### 2. Application Context
- URL and environment: from `project.json` — never hardcode them
- Browsers in scope: from `project.json`
- Roles: from `project.json`; credentials are `.env` variable names only

### 3. Entities and Operations
Identify every data entity. For each, which CRUD operations apply:
- Create — is there a form or flow to add this entity?
- Read — is there a view, list, or dashboard displaying this entity?
- Update — is there an edit or bulk update flow?
- Delete — is there a remove, retire, or disconnect action?

### 4. State Transitions
Identify all states the feature moves through.

### 5. Business Rules
Extract all conditional logic.

### 6. Integrations
Third-party services, payment gateways, SSO, email/OTP, file storage, analytics.

### 7. Acceptance Criteria
List every AC. Tag each with its type:
- Functional
- Non-Functional
- Business Rule
- UI
- Responsive — viewports, zoom, orientation of tablet/mobile layouts

## Output

`qa/00-knowledge-base/knowledge-base.md` and `qa/00-knowledge-base/knowledge-base.json`, whose
schema is defined in `.claude/agents/knowledge-base-builder.md`. The module list in the JSON is the
module list of the whole dashboard.

---

# Step 2: Create Test Plan

## Objective

Generate a complete test plan derived entirely from the knowledge base. The test plan must cover
what a senior human QA engineer and Principal QA Automation engineer would test — not just what is
explicitly written in the ACs.

## Instructions

Use the **test-planner agent** with the knowledge base as input. For each entity, AC, business
rule, and integration — generate test cases across all of the following test types.

## Test Type 1: Happy Path (Most Important)

For every primary user flow:
- Execute the flow end-to-end with valid data
- Verify the correct success state is reached
- Verify data persists after the action (reload the page, and sign in again where relevant)

## Test Type 2: Negative and Validation

- Submit forms with missing required fields — verify validation messages
- Submit with invalid data formats — verify field-level errors
- Attempt unauthorized actions — verify appropriate rejection (including direct URL access to a
  page the role must not see)
- Attempt operations with disconnected or missing dependencies — verify graceful failure messages

## Test Type 3: State-Aware UI Testing

For every button, form action, or interactive element:

- **During async operation** — Trigger the operation, then immediately attempt to interact with
  the same element. Verify it is disabled and non-clickable during processing.
- **After error** — Verify the element re-enables correctly and the UI recovers without a reload.
- **After success** — Verify the element reflects the completed state.

Examples of state patterns to always test:
- Action buttons during background refresh or sync processes
- Connect/Disconnect buttons during in-progress connections
- Save buttons during API write operations
- Delete buttons during pending deletions

## Test Type 4: Full CRUD Coverage

For every entity:

**Create**
- Use valid data → verify record appears in the relevant list/view
- Verify all form fields are present, visible, and populated from the API (not empty dropdowns,
  not static defaults)
- Verify auto-filled values are dynamic and appropriate

**Read**
- Verify list/table shows real data, not placeholder or mock content
- Verify all expected columns and fields are visible
- Verify sorting, filtering, search and pagination where present
- Verify data matches what was created or configured

**Update**
- Edit a record → verify changes persist after a page reload
- Bulk update (if applicable) → verify all selected records are updated
- Verify import flows process requests completely, not just trigger a loader

**Delete**
- Delete each deletable entity (only records the test created — see the notes) → verify:
  - No server errors are returned (check the network panel)
  - The record is removed from all relevant views
  - Third-party systems receive the delete request correctly
  - No orphaned data remains

## Test Type 5: Business Rule Enforcement

For every business rule:
- Set up the exact precondition described in the rule
- Trigger the event that should activate the rule
- Verify the system enforces the rule immediately — not on next login or reload
- Verify the enforced state is consistent across all modules and views

## Test Type 6: Form Field Deep Validation

For every form and modal:
- Verify every dropdown is populated from the API — not empty, not hardcoded
- Verify every field that should exist based on the business context is visible
- Verify field interdependencies — selecting a value in one field filters or populates dependent fields
- Verify auto-filled fields use dynamic values, not static defaults
- Verify submitting with an empty required dropdown shows a validation error, not a silent failure
- Verify maxlength, trimming of whitespace, and special/Unicode characters

## Test Type 7: UI State Persistence

- Expand every collapsible menu, drawer item, or accordion — verify it stays expanded after
  clicking elsewhere on the page
- Resize the viewport across a layout breakpoint — verify state survives the re-layout
- Verify selected/highlighted states persist after subsequent interactions
- Verify active tab persists after data loads or a sub-action completes
- Verify that navigating away and returning (and browser back) preserves the expected UI state

## Test Type 8: Audit and Data Recording

For every operation that should generate a record:
- Execute the operation
- Navigate to the relevant audit log, history, or activity section
- Verify the record exists with the correct status, amount, timestamp, and metadata
- Verify failed operations are also logged — not just successes
- Verify activity logs show real user actions, not placeholder data

## Test Type 9: Third-Party Integration (If Applicable)

## Test Type 10: Async and Race Condition Testing

- Trigger an async operation, then immediately attempt the same action again — verify
  double-submission is prevented
- Trigger an operation, then navigate away before it completes — verify no broken state results
- Delete a record, then immediately attempt to create one with the same identifier — verify
  correct handling
- Trigger a state change, then immediately navigate to a section that depends on that state —
  verify consistency
- Open the same record in two tabs, change it in one — verify the other handles the stale state

## Test Type 11: Web Conditions

These are where web defects cluster beyond the functional flows. A plan without them is incomplete.

- **Browsers** — each flow on every browser in `project.json` (Chromium, Firefox, WebKit);
  record browser-specific differences
- **Responsive viewports** — mobile (390×844), tablet (820×1180), desktop (1440×900): layout,
  navigation menu collapse, tables overflow, nothing clipped or overlapping
- **Session expiry** — expired or cleared session mid-flow: redirect to login, no data loss
  where the app promises it, no raw 401 shown to the user; logout invalidates the session
- **Back / refresh** — browser back after submit (no double submission, no stale form), refresh
  on every page (deep link survives), forward/back through a multi-step flow
- **Network failure** — offline mid-action, slow 3G, a failing API (4xx/5xx, routed with
  `page.route`) — the UI must show a plain-language error and recover
- **Accessibility** — axe scan of every page (WCAG 2 A/AA), keyboard-only operation, visible
  focus, labels on every control, colour contrast. A missing accessible name is a real defect
  and it degrades every locator
- **Every theme** — list every theme the application offers (theme switcher, accessibility
  panel options such as Dark / High Contrast / Normal, `prefers-color-scheme` dark and light,
  Windows `forced-colors`). Run the axe scan, the colour-contrast check, focus visibility and a
  readability look in **each** theme, not only the default. A theme that merely "changes the
  background" has not been tested. Record in the plan which themes exist and which were covered
- **Semantic HTML and heading hierarchy** — on every page **and inside every dialog, popup,
  modal, drawer, accordion and tab panel (open each one)**:
  - exactly one `<h1>` per page, counted in the DOM, hidden dialogs included; a dialog's title is
    the next level under the section that opens it (e.g. a popup from an `<h2>` section uses `<h2>`
    or `<h3>`, never `<h1>`)
  - no skipped heading levels (h2 → h4); headings are real `<hN>` elements, not styled `<div>`s
  - a dialog has `role="dialog"`, `aria-modal`, and `aria-labelledby` pointing at its heading
  - landmarks (`header`, `nav`, `main`, `footer`), lists as `<ul>/<ol>` with only `<li>`
    children, buttons for actions and links for navigation, tables with `<th>`, images with `alt`
  These small markup details are UI defects in their own right, even when nothing looks wrong
- **Deep links and direct URL access** — signed in and signed out
- **Security basics** — no credentials or tokens in the URL, protected pages not reachable when
  signed out, input reflected safely (no script execution)

## Test Case Structure

Test cases are written in TestNova's **readable test case format**: anyone (a manager, a
developer, a new tester) must understand a row without asking. The same columns are used in the
test plan, the exploratory results, and every report:

| Test Case ID | TC Created Date | Module | Test Title | Description | Test Steps / Steps to Reproduce | Test Data | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|---|---|---|

| Column | What goes in it |
|---|---|
| Test Case ID | Unique ID (e.g., TC-{MODULE}-001), exactly as it will appear in the automated test title |
| TC Created Date | The date the case was written, DD-MMM-YYYY |
| Module | The module's knowledge-base name |
| Test Title | Short, plain words: what is being checked |
| Description | One or two plain sentences: what the case verifies and why it matters. No jargon, no locators |
| Test Steps / Steps to Reproduce | Numbered, specific actions a person could follow, separated by `<br>` |
| Test Data | Specific values, roles (by name and .env variable, never a value), or entities used |
| Expected Result | What a person observes when it works |
| Actual Result | `—` in the plan; what the application did, once executed |
| Status | `Not Run` in the plan; Pass / Fail / Blocked once executed |

The plan adds four planning columns after these: `Priority` (Critical / High / Medium / Low),
`Type` (one of the 11 types above), `AC` (the acceptance criteria covered) and `Preconditions`
(the system state required before execution).


```
qa/03-test-plan/{module-id}-test-plan.md
```

The dashboard parses this table by its headers, so it must be present with the headers above,
one row per case.

---

# Step 3: Perform Exploratory Testing

## Objective

Execute the test plan in a real browser through the **playwright-test MCP**, simulating a senior
human QA tester — not just a script runner.

## Instructions

Read the test plan from `qa/03-test-plan/{module-id}-test-plan.md`. Execute each scenario. After
scripted execution, apply the following heuristics on every page visited.

### Mandatory coverage rules

1. **Every branch is executed, never dropped.** For every choice or decision point, run every
   branch the story defines (Confirm, Cancel, close (×), Escape, back, double-click). A branch
   blocked by a defect is recorded as **Blocked by DEF-xxx** with the reason. Never mark a branch
   "deprioritised" or leave it off the results table.
2. **Record every dialog, toast and alert,** native or in-app, with its exact title, body text and
   buttons, then check it against the business rules.
3. **One ID, one result.** Each test ID (TC-xx-NNN) maps to exactly one exploratory result.
4. **Build and browser recorded per run.** Each results file states the URL, environment, app
   version or build if the app exposes one, browser and viewport.
5. **Every finding goes into the user story** under an "Automation / exploratory findings"
   section with the trigger, observed result, rule violated, related DEF ID, and why earlier
   testing missed it.

## Human-Like Testing Heuristics

Apply these on every page, regardless of whether the test plan explicitly covers them.

### Interaction Heuristics
- Click every action button twice in rapid succession — check for double-submit or duplicate records
- Click buttons while loaders or spinners are active — verify they are disabled during processing
- Expand every collapsible menu or section — verify it stays expanded
- Hover every chart, table row and icon button — verify tooltips and details are correct, and
  that nothing essential is available on hover only (keyboard and touch users never see it)
- Operate every form by keyboard alone: Tab order, Enter to submit, Escape to close dialogs

### Data Heuristics
- Scan every dropdown — verify options are loaded from the API, not empty
- Scan every list and table — verify data is real, not placeholder or static
- Scan every form — verify all expected fields are present based on business context
- After every create, update, or delete action — reload the page and verify the change persisted

### State Heuristics
- After any access state change — navigate to every module and verify correct access control
- After any async operation — verify the triggering element returns to its default enabled state
- After any delete operation — verify the item is absent from all relevant views
- Use browser back and refresh after every submit

### Error Heuristics
- Trigger delete on every deletable entity — verify no raw stack traces or error codes are exposed
- Submit every form incomplete — verify field-level validation messages appear
- Trigger operations that call third-party APIs — verify errors are shown in plain language,
  not raw API responses
- After every flow, read `browser_console_messages` and `browser_network_requests` — a flow that
  "passed" while the page logged an uncaught exception or got a 5xx did not pass

## For Each Test Case Record

The plan's row in the readable test case format, now with what happened, plus two columns:

| Test Case ID | TC Created Date | Module | Test Title | Description | Test Steps / Steps to Reproduce | Test Data | Expected Result | Actual Result | Status  Deviation | Screenshot |

| Field | Capture |
|---|---|
| First eight columns | Copied from the test plan row |
| Actual Result | What the system did, in plain words. Never a restatement of the expected result |
| Status | Pass / Fail / Blocked (Blocked with the reason, e.g. Blocked by BUG-003) |
| Deviation | How it differed from expected (if any) |
| Screenshot | Filename |


```
qa/04-exploratory/evidence/{module-id}/
```

Capture screenshots for failed tests.

## Screenshot Naming Convention

```
{STORY_ID}_{AC_REF}_{ShortDescription}.png
```

For defects:
```
BUG-{NNN}_{HTTP_CODE_if_API}_{ShortDescription}.png
```

---

# Step 4: Generate Automation Scripts

## Objective

Convert all manual test cases into Playwright Test automation following the **Page Object Model
(POM) architecture** used across this project.

## Instructions

Use the **test-generator agent** (`.claude/agents/test-generator.md`). Input:
`qa/03-test-plan/{module-id}-test-plan.md` and `qa/04-exploratory/{module-id}-results.md`.

## POM Architecture Requirements

Use the Page Object Model established in `src/`. Read `src/pages/base.page.ts`,
`src/components/base.component.ts` and `src/fixtures/test.ts` first, and follow those conventions
exactly.

### Deriving Page Objects

| Knowledge-base Element | POM Output |
|---|---|
| Every distinct page (route) | One `src/pages/{name}.page.ts` extending `BasePage` |
| Every dialog, drawer, or multi-step modal flow | One `src/pages/{name}.page.ts`, or a component if it recurs |
| Header, sidebar, nav, toast, data table shared across pages | `src/components/{name}.component.ts` |
| Login page | `src/pages/login.page.ts` (reuse it if it exists) |
| Any page already modelled | Reuse it — check `src/pages/` first |

**Do not create a new page object if one already exists for that page.**

Every page object declares `protected readonly path` (its route, or `''`) and
`protected readonly identifier` unique to that page. A shared heading or layout element reports
a page as loaded when it is not, and the failure surfaces somewhere unrelated.

**Import paths** are relative and keep the `.js` extension (the project is ESM):
```typescript
// From tests/e2e/NN-{module}.spec.ts
import { test, expect } from '../../src/fixtures/pages.js';
import { users } from '../../src/data/test-data.js';
```

### Locator Rules

In order of preference:

1. `this.byRole('button', 'Save')` — role and accessible name
2. `this.byLabel('Email')` — form controls by their label
3. `this.byTestId('save-btn')` — when the app exposes `data-testid`
4. `this.byText('Save')` — last resort, breaks on every copy change

Never CSS/XPath chains on generated class names. Verify every locator against the live page
(`browser_snapshot` / `browser_generate_locator`) before writing it. Never guess.

### Spec File Rules

Spec files must:
- Be named `tests/e2e/NN-{module-id}.spec.ts`, NN being the module's run order
- Import `test` from `src/fixtures/pages.js` — never from `@playwright/test` directly
- Interact only through page-object fixtures — **never contain a raw locator**
- Put the TC ID first in every test title: `TC-LOGIN-001: a valid user reaches the dashboard`
- Tag known app defects `@known-defect` in the title with the DEF id in an annotation, and
  single-use or real-data tests `@live`
- Contain only `test()` blocks with arrange / act / assert structure
- Keep each test independent, and establish their own starting state in `beforeEach`
- Take all data from `src/data/test-data.ts` (or a workbook sheet via `src/data/data-sheet.ts`)
  — no literals, no hardcoded credentials

```typescript
// ✅ Correct spec structure
import { test, expect } from '../../src/fixtures/pages.js';
import { defaultUser, invalid } from '../../src/data/test-data.js';

test.describe('Login', () => {
  test.beforeEach(async ({ login }) => {
    await login.open();
  });

  test('TC-LOGIN-001: a valid user reaches the dashboard', async ({ login, home, credentials }) => {
    const user = credentials();          // skips with a reason when .env has none
    await login.signIn(user);
    await home.expectLoaded();
  });

  test('TC-LOGIN-002: a wrong password is rejected with a message', async ({ login }) => {
    await login.signIn({ username: defaultUser.username, password: invalid.password });
    expect(await login.errorText()).toMatch(/invalid|incorrect/i);
  });
});
```

### Session Handling

Authenticated suites reuse a signed-in session through `storageState`: a worker-scoped fixture in
`src/fixtures/` signs in once per role through `LoginPage` and saves `.auth/<role>.json`
(git-ignored); specs that need a session declare `test.use({ role: '<key>' })`. Session-expiry
tests clear cookies/storage explicitly rather than relying on a timeout.

### State-Aware Assertions in POM

Page objects expose state-check methods for elements that have disabled/loading states:

```typescript
// In CheckoutPage
async isSubmitEnabled(): Promise<boolean> {
  return this.submitButton.isEnabled();
}

// In spec
await checkout.submitOrder();
expect(await checkout.isSubmitEnabled()).toBe(false);
```

## General Script Requirements

- Use web-first assertions and explicit state waits — never `waitForTimeout`, never `networkidle`
- Assert both the UI outcome and persistence (verify after a reload where applicable)
- Include inline comments on intent, not mechanics
- Cover element disabled states during async operations, not just final outcomes
- Use TypeScript strict types — no `any`, no untyped parameters
- Network-failure cases use `page.route` inside a page-object method, never in the spec
- `npm run typecheck` must pass

## Save Structure

```
tests/e2e/
  01-{module-id}.spec.ts
  02-{module-id}.spec.ts
src/pages/
  {new-page}.page.ts            ← Only if genuinely new; otherwise reuse existing
src/components/
  {shared-ui}.component.ts      ← UI shared across pages
src/fixtures/pages.ts           ← every page object registered as a fixture
src/data/test-data.ts           ← module data
```

> **Page Objects own the UI. Spec files own the intent. Fixtures own the session and the browser.
> Nothing crosses boundaries.**

---

# Step 5: Execute and Heal Automation Tests

## Objective

Run the automation and heal failures — while strictly preserving the POM boundaries during every
fix.

## Instructions

Run every module through the **TestNova runner** (the dashboard API, `POST /api/run`), so each run
is a real dashboard execution with evidence (screenshot, trace.zip, video, web signals). Use the
**test-healer agent** (`.claude/agents/test-healer.md`) to analyse and fix failures.

## POM-Aware Healing Rules

| Failure Type | Fix Location | Never Fix In |
|---|---|---|
| Locator broken or changed | `src/pages/{name}.page.ts` | spec files |
| Action method incomplete or wrong | `src/pages/{name}.page.ts` — update the method | spec files |
| Missing wait for async element | `src/pages/{name}.page.ts` — wait inside the action method | spec `beforeEach` |
| Shared component locator changed | `src/components/{name}.component.ts` | individual page objects |
| Auth/session failure | `src/fixtures/` — the auth fixture | spec `beforeEach` |
| Page identifier ambiguous (reports loaded when it is not) | `src/pages/{name}.page.ts` | spec files |
| Click intercepted by an overlay / cookie banner | the page object or component that owns the overlay | spec files |
| Dialog left open by an earlier step | the page object or component that opened it | spec files |
| Import path broken | spec or page object — fix the relative path, keep `.js` | other files |
| Test precondition incomplete | spec `beforeEach` or the arrange block | page objects |
| **Environment failure — app down, DNS, VPN, 502 from a proxy, browser crash** | **nothing — this is not a code defect** | everywhere |

## Healing Process Per Failure

1. **Read the evidence before forming a theory.** Every failed test attaches a screenshot,
   `trace.zip`, video and `web-signals` (console errors, 4xx/5xx). The error-context snapshot and
   the trace show what was actually on the page when the locator missed.
2. **Identify the failure layer.**
3. **Trace to the correct file** — spec → fixture → page object → component.
4. **Apply the fix in the right layer.**
5. **Check for cross-spec impact** — if the page object is shared, re-run the other specs.
6. **Re-run the affected module** through the runner to confirm.

## What the Healer Must Never Do

- ❌ **Weaken, loosen, or delete an assertion to make a test pass.** If the app's behaviour is
  wrong, the test stays red, is tagged `@known-defect`, and the defect is filed. Relaxing an
  assertion converts a real defect into a green run and an empty defect log — the worst outcome
  this pipeline can produce.
- ❌ Add a raw locator or a direct `page.*` call inside a spec file
- ❌ Hardcode URLs, credentials, or test data inline during a fix
- ❌ Duplicate a locator across page objects instead of fixing it once in the shared component
- ❌ Use a fixed sleep (`waitForTimeout`) as a fix for timing issues
- ❌ Modify a page object method in a way that fixes one spec but silently breaks another
- ❌ Mark a test `fixme`/`skip` to hide a failure that is an app defect
- ❌ **"Fix" an environment failure in code.** Report it as environment, never as an app defect.

## Output

`qa/05-healing/healing-log.md`:

**Initial Results** `Total: | Passed: | Failed:`

**Healing Log**

| Test Case | Failure Type | Layer Fixed | File Modified | Fix Applied |
|---|---|---|---|---|

**Final Results** `Total: | Passed: | Failed:`

---

# Step 6: Defect Analysis

## Objective

Classify every failure and capture the defects that never surface as a failed assertion: errors
the page logs, requests that fail, pages that are slow, and accessibility violations.

## Classification

Each failure is exactly one of:

| Class | Meaning | Becomes |
|---|---|---|
| App defect | The application is wrong | A defect (DEF-NNN) |
| Script | The test is wrong and the healer could not fix it | A healing item, not a defect |
| Environment | App down, network, browser crash, proxy | An environment note, not a defect |
| Test data | Data missing, used up, or in the wrong state | A data note, not a defect |

## Signals — from every test's `web-signals` and `a11y-*` attachments

| Signal | Category |
|---|---|
| Uncaught page error (`pageerror`) | Application error — High at least |
| `console.error` from the app's own scripts | Application error |
| 5xx response | Server error — Critical if on a primary flow |
| 4xx response the UI did not explain to the user | Swallowed error |
| Navigation slower than the threshold (5 s default) | Performance |
| axe violation, impact critical/serious | Accessibility |
| Action taken, nothing changed on the page, nothing logged | Swallowed error |

For each flagged item record:
- The signal and its excerpt (URL, status, message)
- The page and action that triggered it
- Whether the UI gave the user any indication at all
- Evidence filename: `BUG-{NNN}_{SIGNAL}_{ShortDescription}.png`

**A test that passed while the page threw an uncaught exception or received a 5xx did not pass.**

## Output

`qa/06-report/{project-id}-defects.json` (read by the dashboard). TestNova builds
`qa/06-report/{project-id}-defects.xlsx` from it in the readable defect format of Step 7's
Consolidated Defect Sheet; the agent does not write the sheet.

---

# Step 7: Generate QA Test Report

## Objective

Produce a complete QA execution report.

## Save Report

```
qa/06-report/{project-id}-test-report.md
qa/06-report/{project-id}-test-report.pdf
qa/06-report/{project-id}-test-report.xlsx
```

You write the `.md` narrative only. TestNova's report engine builds the `.pdf`, the `.xlsx` and
`{project-id}-qa-report.json` (figures, defect register, failed test details, evidence, theme
coverage, validation) from the executions and the defect log, the same engine as the dashboard's
QA Report page. Generate it with `node ../../dashboard/scripts/qa-report.mjs {project-id}` and take
every figure from the JSON.

> Not `test-results/` — the runner treats that as its own output directory and clears it between
> runs, so a report written there is deleted by the next execution.

## Report Structure

### Executive Summary
What was tested, overall outcome, key risks identified.

### Test Statistics
- Total test cases (manual + automated)
- Pass / Fail / Blocked counts per test type and per browser

### Manual Test Results
- Per-AC results with observations and screenshots

### Automation Results
- Initial run, healing activities, final run
- Environment failures listed separately from defects — never inflate the defect count with flake

### Test Case Results

One row per test case, in the readable test case format (its result is the latest execution of
its module):

| Test Case ID | TC Created Date | Module | Test Title | Description | Test Steps / Steps to Reproduce | Test Data | Expected Result | Actual Result | Status |

### Defect Log

In the readable defect format:

| Defect ID | Date | Module | Title | Description | Test Data / Required Info | Status | Screenshot / STR | Priority | Severity |

### Coverage Matrix

| AC | Description | Manual | Automated |
|---|---|---|---|

### Recommendations
Derived from test results — list specific improvements to the product, not generic advice.

> The **Consolidated Defect Sheet** (`qa/06-report/{project-id}-defects.xlsx`) is built by
> TestNova from the defect JSON, so it always has the same readable layout as the dashboard's
> reports. One row per defect, these columns in this exact order:
>
> | Defect ID | Date | Module | Title | Description | Test Data / Required Info | Status | Screenshot / STR | Priority | Severity |
>
> ### Column Guidelines
>
> **Defect ID** — Unique defect identifier (e.g., DEF-001).
>
> **Date** — Date when the defect was logged, DD-MMM-YYYY.
>
> **Module** — Functional module, by its knowledge-base name.
>
> **Title** — Short, plain-words title a non-tester understands.
>
> **Description** — What is wrong, where, and why it matters, then the expected and the actual
> behaviour.
>
> **Test Data / Required Info**
> * User role (by name — **never** the credential values)
> * Browser and version, viewport
> * URL and app version if exposed
> * Preconditions, and the test cases and executions that found it
> * Any required test data
>
> **Status** — New, Assigned, Open, In Progress, Fixed, Resolved, Ready for QA, Retest, Closed,
> Reopened, Deferred
>
> **Screenshot / STR** — Numbered Steps to Reproduce, then the screenshot file names (the
> screenshots themselves are embedded in the sheet's Defect Screenshots tab).
>
> **Priority** — Critical, High, Medium, Low
>
> **Severity** — Blocker, Critical, Major, Minor, Trivial
>
> ### Formatting (applied by TestNova)
>
> * Bold coloured header, frozen first row, filters, wrapped text, set column widths.
> * Dates as **DD-MMM-YYYY**.
> * Colours: **Status** Fixed/Resolved/Closed green, New/Assigned orange, Open/Reopened red,
>   In Progress yellow; **Priority** Critical dark red, High orange, Medium yellow, Low green;
>   **Severity** Blocker dark red, Critical red, Major orange, Minor yellow, Trivial green.
> * Dropdowns for **Status**, **Priority** and **Severity**.
>
> The sheet is the master defect tracker for each regression or retesting cycle, ready for QA,
> developers and project managers.
