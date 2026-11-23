# TestNova Functional Testing — Pipeline Rules

Applies when the run's testing type is **Functional Testing**. Read together with
`TestNova_Functional_Testing_Standard.md` (the standard) in this folder. Precedence: the standard,
then these rules, then `prompts/master-prompt.md` for formats, evidence tags, checkpoints and
safety (see `../README.md`). Master-prompt Step 2's coverage list does not apply: plan only
functional categories.

## 1. Inputs and defaults (standard §9)

| Standard input | TestNova source | Default when the project gives none |
|---|---|---|
| URL, environment, build/version | `project.json`; a build shown by the app | Build "Not exposed by the application" |
| Requirements, user stories, ACs, business rules | knowledge base (`acceptanceCriteria`, `businessRules`, `validations`, `flows`, `entities`), `qa/01-user-story/`, `knowledge/` | Only the universal rules in section 5; everything else is a `[GAP]` |
| Modules, roles, permissions | knowledge base `modules`, `roles`; `project.json` roles | — |
| API specifications, integrations | `knowledge/` uploads and links; knowledge base `integrations` | No contract testing; UI ↔ API consistency observed in the app's own traffic |
| Test accounts, sandbox credentials | `project.json` roles, `.env` variable names | — |
| Data setup and cleanup rules | `knowledge/notes.md` | Create only disposable records named with the prefix `TN-<yyyymmdd>-`; delete only those |
| Critical journeys, business priority | knowledge base `flows`, module `order`, notes | Sign-in and each module's primary flow are Critical |
| Existing test cases, defects, regression suites | `knowledge/` uploads; `qa/06-report/<project-id>-defects.json` if present | — |
| Excluded workflows, transaction restrictions | `knowledge/notes.md` | No real payments, messages to real people, or irreversible submissions; such flows are `@live` |

## 2. Applicability map

The `Type` column of every case is one of these codes. A row marked **Not tested** is never
planned and is always listed in the plan header and the report's limitations with its reason.

| Code | Standard section | In TestNova | How, or why not |
|---|---|---|---|
| FN-2.1 | Requirements and feature testing | Yes | `rules-matrix.md` maps every AC, rule, validation and flow to cases; untestable or ambiguous ones become `[GAP]` rows |
| FN-2.2 | Positive and negative testing | Yes | Safe, bounded inputs only; no malicious payloads |
| FN-2.3 | Field and input validation | Yes | Boundary values (min, max, ±1), one invalid value per equivalence class, required/optional, formats, cross-field rules, persistence or rejection after submit. Server-side consistency: Partial, by submitting the app's own form on a disposable record with a client-side constraint removed (`browser_evaluate` on the `required`/`maxlength` attribute), never by crafting requests |
| FN-2.4 | Business rules and calculations | Yes | Expected values computed independently and written into the case (inputs, formula, expected result) before execution |
| FN-2.5 | Workflow and end-to-end | Yes | Full journeys per role, alternate paths, cancel and resume; downstream effects only where visible in the application |
| FN-2.6 | CRUD and record lifecycle | Yes | Disposable records only; persistence after reload and after signing in again |
| FN-2.7 | State transition | Yes, through the UI | Valid and invalid transitions the UI offers; no forced states |
| FN-2.8 | Search, filter, sort, pagination | Yes | On existing data, read-only; no bulk seeding of data |
| FN-2.9 | Authentication and role behaviour | Yes | Login, logout, session expiry, menus and actions per role. Password reset and MFA: only when a test mailbox or OTP path exists, else `@live` / Not tested. Bypass attempts belong to Security |
| FN-2.10 | API and interface | Partial | Contract checks only for endpoints documented in the knowledge sources; otherwise the status and key fields of the app's own requests are checked against what the UI shows |
| FN-2.11 | Database and data integrity | **Not tested directly** | No database access. Persistence and integrity are verified through the application (reload, second view, second role, export) |
| FN-2.12 | Import, export, upload, download | Yes where present | Benign files only; downloaded files opened and checked (name, format, row count, key fields) |
| FN-2.13 | Integration and third-party | Partial | Observable effects only, sandbox only; real payments and messages are `@live` |
| FN-2.14 | Transaction and concurrency | Partial | Double submission, two tabs on one disposable record, cancel mid-operation; no load |
| FN-2.15 | Regression, smoke, sanity | Yes (stages 5–6) | Automated suite through the TestNova runner; Critical cases also tagged `@smoke` |
| FN-2.16 | Exploratory and error/recovery | Yes | Charter per module; failing or slow API simulated client-side with `browser_route` and offline with `browser_network_state_set` only |
| FN-2.17 | Installation, upgrade, configuration | **Not applicable** | A hosted web application; onboarding journeys, if any, are FN-2.5 |

## 3. Scope and time budget

- **Only functional cases.** No layout, theme, accessibility or visual cases; no security probing.
- **One configuration:** the first browser in `project.json`, a 1440×900 viewport, the default
  theme. Another browser only for a rule documented as browser-specific.
- **Modules:**
  - modules with flows, forms, rules, entities or data are in scope;
  - a module that is static content only is in scope for **smoke only** (at most 3 cases: the
    pages load, the links work, the content matches its source), with that reason in `scope.json`;
  - a module with nothing to test functionally is out of scope, with the reason.
- **Case budget:** at most 20 cases per module. Boundary analysis per validated field: min, max,
  min−1, max+1 and one invalid class; more only when a rule defines more boundaries.
- **Priority** by business criticality (standard §4.5): Critical for sign-in and each primary flow,
  High for business rules and calculations, Medium for alternate paths and validation, Low for the rest.

## 4. Stage rules

### Stage 3 — `functional-test-planner`

Writes, in this order:

1. `qa/03-test-plan/rules-matrix.md`: one row per AC, business rule, validation and flow from the
   knowledge base: id, module, statement, source, verified (yes / `[NOT VERIFIED]`), the test case
   ids covering it, or `[GAP]` with what is needed. Then the Not tested list from section 2.
2. `qa/03-test-plan/scope.json`:
   `{"testingType": "functional", "generatedAt": "<ISO>", "modules": [{"id": "<module-id>", "inScope": true, "depth": "full|smoke", "reason": "…"}]}`
   with every knowledge-base module.
3. `qa/03-test-plan/<module-id>-test-plan.md` for every in-scope module, in the readable test case
   format of the master prompt (same headers), with:
   - Test Case ID `TC-FN-<MODULE>-NNN`;
   - Type: the code and name, e.g. `FN-2.4 Business rules and calculations`;
   - Test Data: the exact values, and for calculations the inputs and the independently computed
     expected value;
   - AC: the AC / BR / validation id the case verifies;
   - Preconditions: `Assumption` when it tests a `[NOT VERIFIED]` claim.

### Stage 4 — `functional-tester`

Executes the plans; writes `qa/04-exploratory/<module-id>-results.md` and
`qa/04-exploratory/summary.md` with counts per module, traceability status (rule → passed / failed /
blocked / not run), provisional bugs (`BUG-NNN`, category, rule broken), requirement gaps found,
observations, and incidental observations for other streams. Persisted state is verified for every
create, update and delete (reload; for key flows, sign in again).

### Stage 5 — `test-generator`

- Automate every case except `@live` ones; Critical cases also get `@smoke`; every title carries
  `@functional`.
- Disposable data names come from `src/data/test-data.ts` with a run-unique suffix, never literals.
- Assert the persisted outcome after a reload, not only the toast or the HTTP status (standard §6).
- Calculations assert the independently computed value from the plan's Test Data.

### Stage 6 — `test-healer`

The standard healing rules. In addition: the first failure and every retry stay in the record
(standard §6: never retry silently until a test passes); a flaky test is reported as flaky with
its history, not healed by adding retries.

### Stage 7 — `defect-analyst`

- A **defect** cites where its expected behaviour comes from (AC, BR, validation id, document
  section) or a universal rule from section 5. Without one it is an **observation**
  ("Requirement gap: expected behaviour not documented").
- Defect `type`: `Functional`, `Validation`, `Integration`, `Navigation` or `API`; `category`: the
  FN code; `testingType`: `functional`.
- A suspected security weakness is never filed as a functional defect: it goes to `observations`
  with "route to Security testing" (standard §6).

### Stage 8 — `qa-reporter`

A functional section with: the traceability table (AC / rule → tested, passed, failed, blocked, not
run), requirement gaps, the regression scope statement ("N of M cases ran; this is not a full
regression" whenever cases were skipped or blocked), and the Not tested list.

## 5. Expected results, severity and evidence

**Universal rules** (no document needed): data entered and confirmed is lost or changed without
the user doing it; a crash, uncaught page error or HTTP 5xx on a user action; an arithmetic result
that is wrong for its own displayed inputs; an action reported as successful that did not happen
(standard §6: a toast or an HTTP 200 alone is not proof).

**Severity** by business impact (TestNova's scale):

| Severity | Functional meaning |
|---|---|
| Critical | A core business operation is blocked, or produces a wrong financial or legal outcome, or data is lost or corrupted |
| High | An important function fails with no workaround, or a calculation is wrong on a secondary path |
| Medium | A function partly fails or a workaround exists; a validation accepts invalid data without harm |
| Low | Minor deviation with no effect on outcomes |

**Evidence** (standard §7): the requirement reference; exact inputs and the disposable record id;
screenshots before and after; for the operation, the request method, URL path, status and the
key response fields with tokens and personal data redacted, in
`qa/04-exploratory/evidence/<module-id>/<TC-ID>_request.txt`; reproducibility (reproduced twice, or
once with the request as evidence). A suggested fix is written after the facts, labelled
"Suggested fix:".

## 6. Completion (standard §8)

| Standard completion criterion | Where TestNova verifies it |
|---|---|
| Requirements and ACs mapped to scenarios | `rules-matrix.md`; stage 3 check |
| Critical workflows, roles, integrations, data paths exercised | Critical cases in the stage 4 results |
| Positive, negative, boundary scenarios executed | FN-2.2 / FN-2.3 cases per module |
| Persisted outcomes verified | Stage 4 results; automated persistence assertions |
| Findings reproducible, evidence-backed, deduplicated | Stage 7 defects JSON |
| Regression scope documented | Stage 8 regression scope statement |
| Blocked, skipped, excluded, untested areas reported | Stage 8 report, from `scope.json` and the Not tested list |
