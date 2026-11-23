# TestNova — Automation Dashboard

*Redefining Automation Through Intelligent AI.*

The dashboard for this repo's mobilewright suite. It drives the existing runners
(`scripts/run-ordered.mjs`, `mobilewright test`) rather than reimplementing them.

## Run it

```bash
npm run dashboard:install   # once
npm run dashboard           # API on 127.0.0.1:5181 + page on http://localhost:5180
```

Colleagues on the same network can open `http://<this PC's IP>:5180` to look. Only this PC can
start runs or change defects; the API refuses anyone else.

## What is real

| Part | Source |
|---|---|
| Modules, test ids, titles, `@known-defect` ids | `tests/e2e/*.spec.ts`, read by `scripts/build-catalogue.mjs` |
| Priority, expected result, steps | the `qa/03-test-plan/*.md` tables. Tests with no plan entry show a blank, never a guess |
| Module pages: statuses, failures, evidence, history | executions run from the page and stored in `dashboard/data/runs/` |
| Defects and their status | `qa/06-report/*-defects.json` and the Defect Sheet workbook. Defects created, linked or re-statused on the dashboard go to `dashboard/data/defects.json`; the QA records are never rewritten |
| Reports (PDF, Excel, detailed, consolidated) | stored executions only. A module with no execution is reported as Not Run |
| Main dashboard page (KPIs, modules, trend, leaderboard, causes, latest run) | stored executions, from `GET /api/dashboard`. Each test counts as its latest real result; a test never executed (or skipped) is *Not executed*, and a figure nothing has measured shows a dash. The trend has one bar per execution, showing the whole suite right after it. Failure causes are *Known defect* (a defect is linked) or *Needs triage*; nothing is guessed |
| Opened without the server (the shared single file) | generated sample data, marked *Sample results* |
| Run Regression | real: all 16 modules on the phone, one execution each (see below) |

## Module pages (`#/modules/<id>`)

- **Run Module** runs `run-ordered.mjs --only <module>`, so the module gets the same device-state
  step as in a full regression (reinstall before Quick Deposit, enrol before Profile, hard reset for
  First-Run Sign-In). Those modules ask for confirmation first. One execution at a time: one phone.
- **Run one test** with the ▶ on its row (selected with `--grep` on its title).
- Results stream in through `server/reporter.mjs`, a custom reporter that also copies each test's
  attachments (failure screenshot, view tree, logcat, crashes) into the execution's folder.
- A skipped test whose reason or title says *blocked* is shown as Blocked.
- Single-use (live) tests skip in these runs: they need `npm run test:<suite>:live` and an OTP.

## Full regression

**Run Regression** (top bar, or the card in the menu) asks for confirmation, then runs every module in
run order, each as `run-ordered.mjs --only <module>`: the same device steps as `npm run test:ordered`
(hard reset before First-Run Sign-In, reinstall before Quick Deposit, enrol before Profile).

- Each module is a normal execution, so its page, history and reports fill in as it finishes.
  The regression itself is recorded in `data/regressions/RG-<time>.json`.
- A failing module does not stop the regression. **Stop regression** ends the current module and
  marks the rest Not run. If the phone disconnects, the remaining modules are marked Not run too.
- While it runs, single module runs are refused; only the hosting PC can start or stop it.
- On the dashboard a regression is one bar in the trend and one entry in Latest Run Summary.
- **Regression Testing** in the menu (`#/regression`, or `#/regression/<RG-id>` for an earlier one)
  opens the Regression Execution page: the regression flow, live progress and counts, the test now
  executing, every test case grouped by module with its live status, failure reason and defect, and
  the defects identified. It updates itself from the server's live events; no refresh is needed.
  Starting a regression opens this page.

## Test case and defect formats

Every place a person reads test cases or defects uses the same columns (`server/formats.mjs`):
the Excel and PDF reports, the **Download Defect Sheet** file, the stage 7 defect sheet, the test
detail panel, and the tables the pipeline's agents write (test plans, exploratory results).

- **Test cases:** Test Case ID | TC Created Date | Module | Test Title | Description |
  Test Steps / Steps to Reproduce | Test Data | Expected Result | Actual Result | Status
- **Defects:** Defect ID | Date | Module | Title | Description | Test Data / Required Info | Status |
  Screenshot / STR | Priority | Severity

Excel sheets have coloured Status/Priority/Severity cells, dropdowns, filters and a frozen header;
PDFs are landscape so the ten columns fit. The stage 7 sheet is built by TestNova from the defect
JSON, not by the agent, so it cannot drift from this layout.

## Multiple projects

TestNova holds any number of projects side by side. Each is an independent workspace,
`projects/<id>/`, created from `scaffold/` when the project is saved on the Setup screen:

```
projects/<id>/
  project.json, .env           its settings and its own test logins
  knowledge/                   its knowledge sources
  pipeline.json, logs/         its AI Pipeline (all 8 stages, run from stage 1 for a new project)
  qa/, src/, tests/            its pipeline outputs, Page Object Model and specs, on its own
                               copy of the framework (playwright.config.ts, tsconfig.json, src/utils)
  data/runs, data/regressions  its executions and regressions; data/defects.json its defect edits
  catalogue.json               its modules and tests
projects/active.json           the project a new page opens on
```

- **Project Setup → Add another project** (or **New project** in the sidebar's project switcher)
  opens an empty form; saving it creates a new project and switches the dashboard to it. The
  project that was open is not touched.
- The **project switcher** at the top of the sidebar changes the project for every page: dashboard,
  modules, regression, history, defects, reports and the AI Pipeline all show that project only.
  The choice is kept per browser, so two people can look at different projects at once.
- The API scopes every call with `?project=<id>` (default: `projects/active.json`).
- Each project runs one execution at a time and one pipeline stage at a time; different projects
  run independently. The pipeline's agents and Playwright work inside the project's workspace,
  so one project's outputs can never overwrite another's.
- `npx playwright test` at the repository root runs the default project (`TESTNOVA_PROJECT=<id>`
  picks another); `npm run typecheck` checks the scaffold.

## Layout

```
dashboard/
  scripts/build-catalogue.mjs   spec files + test plans -> web/src/data/catalogue.json (generated, git-ignored)
  scripts/dev.mjs               npm run dashboard: API + Vite together
  server/index.mjs              HTTP API and live updates (server-sent events)
  server/runner.mjs             starts, watches and stops executions and full regressions
  server/reporter.mjs           mobilewright reporter -> events file + evidence
  server/store.mjs              executions, defects, the module page's view
  server/reports.mjs            PDF (installed Chrome via playwright-core) and Excel (exceljs)
  data/                         executions, evidence, dashboard defect changes (git-ignored)
  web/                          Vite + React + TypeScript + Tailwind v4 + Motion + d3
```

`TESTNOVA_DATA` moves the data folder; `TESTNOVA_TEST_CONFIG` makes the runner execute that
Playwright config instead of `run-ordered.mjs` (used to test the pipeline without a phone).

Animations honour the OS *reduce motion* setting.
