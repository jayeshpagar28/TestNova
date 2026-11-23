# TestNova Full Coverage Testing Standard

**Document type:** Agent execution standard\
**Scope:** Web applications tested through TestNova's AI Pipeline when no specific testing type is
selected ("Full Coverage (Current Behaviour)", the default)\
**Purpose:** Define what a Full Coverage run covers, at what depth, and which rules from the UI,
Functional and Security testing standards it applies, so that the default run is bounded and
never claims coverage it did not perform.

**Built from:** `ui/TestNova_UI_Testing_Standard.md`,
`functional/TestNova_Functional_Testing_Standard.md`,
`security/TestNova_Security_Testing_Standard.md`, and the pipeline instructions in
`prompts/master-prompt.md` (Step 2, test types 1–11).

## 1. Mission

Give a broad, single-pass picture of an application's quality: whether its features work, whether
its interface is usable and accessible, and whether it shows basic security hygiene, for every
module the knowledge base lists.

Full Coverage is **broader but shallower** than a typed run. It applies each standard's rules
(evidence, classification, prohibited actions) to everything it touches, but it does **not** apply
each standard's full category depth. A user who needs depth in one area selects that testing type.
Full Coverage is also the longest run; selecting a type is the way to shorten the pipeline.

`prompts/master-prompt.md` remains the execution instruction for Full Coverage runs. This standard
states the run's scope, its limits and the rules it shares with the typed standards.

## 2. Coverage

### 2.1 Functional coverage (from the Functional Testing Standard)

Covered at the depth of master-prompt test types 1, 2, 4, 5, 6, 8, 9 and 10:

-   Main flows end to end with valid data, and persistence after reload (Functional 2.5, 2.6).
-   Negative paths and field validation, including maxlength, trimming and special characters
    (Functional 2.2, 2.3).
-   Create, read, update and delete for every entity, on records the test created (Functional 2.6).
-   Business-rule enforcement: precondition, trigger, immediate and consistent enforcement
    (Functional 2.4).
-   Audit and history records where the application keeps them (Functional 2.6).
-   Observable effects of third-party integrations, without real payments or messages
    (Functional 2.13).
-   Double submission, navigation during async operations, two tabs on one record (Functional 2.14).
-   Back, refresh, session expiry and network failure as they affect data integrity
    (Functional 2.9, 2.16).

Not at full depth: independently calculated boundary sets for every calculation (2.4), full
transition tables (2.7), large-dataset search and pagination checks (2.8), import/export field
mapping (2.12), API contract testing (2.10). Database checks (2.11) and installation/upgrade
(2.17) are never performed by TestNova.

### 2.2 UI coverage (from the UI Testing Standard)

Covered at the depth of master-prompt test types 3, 7 and the web conditions of type 11:

-   Interaction states of buttons and form actions during and after async operations (UI 2.7).
-   UI state persistence: expanded menus, tabs, selections, back/return (UI 2.7, 2.12).
-   Responsive layouts at 390×844, 820×1180 and 1440×900 (UI 2.2, 2.3).
-   Every browser listed in `project.json` (UI 2.4).
-   Accessibility: axe scan (WCAG 2 A/AA rules) of every page, keyboard-only operation, visible
    focus, labels, colour contrast (UI 2.5).
-   **Every theme the application offers**, each scanned and checked for contrast and focus
    (UI 2.10).
-   Semantic HTML and heading hierarchy on every page **and inside every dialog, popup, modal,
    drawer, accordion and tab panel** (UI 2.5).

Not at full depth: comparison with supplied designs (2.1), typography and copy review (2.9),
animation and reduced motion (2.11), usability review (2.6). Screen-reader testing is never
performed by TestNova.

### 2.3 Security baseline (from the Security Testing Standard)

Full Coverage performs **passive and non-intrusive checks only**. It never sends injection
payloads, never tampers with requests, and never tests lockout or rate limits; those require the
Security testing type and its recorded authorization.

-   Protected pages are not reachable when signed out, and direct URLs a role must not see are
    refused (A01, as a functional permission check only).
-   No credentials or tokens in URLs; logout ends the session (A07, observation only).
-   User input is displayed back as text: ordinary text containing characters such as `< > " '`
    is entered only where a normal user would type it, and the page is checked to display it
    literally. No script, markup payload or proof string is used (A05 baseline).
-   Response headers, cookie attributes and HTTPS use are **observed**, not probed (A02, A04).
    Missing hardening headers are security recommendations, never defects.

Everything else in the Security Testing Standard (A01–A10 at depth, API security, supply chain,
authentication attacks) is **not tested** in a Full Coverage run and is reported as such.

## 3. Agent roles

Full Coverage uses the eight standard pipeline agents in `.claude/agents/` (ba-explorer,
knowledge-base-builder, test-planner, exploratory-tester, test-generator, test-healer,
defect-analyst, qa-reporter). The role splits suggested by the three typed standards (Visual &
Layout, Business Rules, Access Control, …) are capabilities inside these agents, not separate
agents.

## 4. Execution workflow

The eight stages of `prompts/master-prompt.md`, unchanged: read sources and explore (1), build the
knowledge base (2), plan (3), execute by hand (4), automate (5), execute and heal (6), analyse
defects (7), report (8).

## 5. Do

-   Use requirements, acceptance criteria, approved designs and the application's established
    conventions as the source of expected behaviour (all three standards).
-   Record a gap when expected behaviour is undocumented; never invent it (Functional 5, 6).
-   Use dedicated, authorized test accounts and disposable records only.
-   Verify persisted outcomes, not only success messages (Functional 6).
-   Test every theme the product offers and every popup's markup, not only the default view.
-   Classify every finding as a **confirmed defect**, an **observation** (suspected, intermittent
    or outside the run's depth) or a **recommendation** (usability, hardening, subjective).
-   Report what was not tested, and why.

## 6. Don't

-   Do not test production environments or modify production data.
-   Do not send malicious payloads, fuzz, scan, brute-force or tamper with requests (Security 7).
-   Do not delete or overwrite shared records, or trigger real payments or messages.
-   Do not change application code, configuration or data to make a test pass.
-   Do not call a subjective preference a defect without a valid reference (UI 2.1).
-   Do not claim WCAG conformance from automated scans, full regression from a subset, or that
    the system is secure because nothing was found (all three standards).
-   Do not report the same underlying issue once per page; one defect, all instances listed.
-   Do not expose credentials, tokens or personal data in screenshots, logs or reports.

## 7. Evidence and defect reporting

As defined in `prompts/master-prompt.md` (Steps 3, 6 and 7) and the defect-analyst agent:
readable test case format, provisional `BUG-NNN` in stage 4, `DEF-NNN` in stage 7, TestNova's
P0–P3 priority and Critical/High/Medium/Low severity scales, numbered steps, expected and actual
result, screenshot evidence, and the classification of every failure as app defect, script,
environment or test data.

## 8. Completion criteria

A Full Coverage run is complete when every knowledge-base module (not skipped) has a test plan,
exploratory results, automated specs and an executed run newer than its code; defects are
classified; the QA report states its coverage and lists every area not tested (section 2) as a
limitation.

## 9. Configuration inputs

`project.json` (URL, environment, browsers, roles), the knowledge sources in `knowledge/`
(documents, links, notes), the test logins in the project's `.env`, and the knowledge base built
in stage 2.
