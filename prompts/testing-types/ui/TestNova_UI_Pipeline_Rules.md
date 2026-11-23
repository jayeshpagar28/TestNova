# TestNova UI Testing — Pipeline Rules

Applies when the run's testing type is **UI Testing**. Read together with
`TestNova_UI_Testing_Standard.md` (the standard) in this folder. Precedence: the standard, then
these rules, then `prompts/master-prompt.md` for formats, evidence tags, checkpoints and safety
(see `../README.md`). Master-prompt Step 2's coverage list does not apply: plan only UI categories.

## 1. Inputs and defaults (standard §9)

| Standard input | TestNova source | Default when the project gives none |
|---|---|---|
| Application URL, environment | `project.json` | — (required) |
| Module inventory, roles | `qa/00-knowledge-base/knowledge-base.json` (modules with `skip: false`), `project.json` roles | — |
| Requirements, acceptance criteria | knowledge base `acceptanceCriteria` (types UI, Responsive), `qa/01-user-story/` | Only the references in section 5 |
| Designs, design system, approved copy | `knowledge/` uploads and links (Figma, style guides, screenshots) | None: expected looks come only from the app's established convention, WCAG and the universal rules (section 5). Say so in the plan header |
| Supported browsers | `project.json` `browsers` | Others are **not tested** (standard 2.4) |
| Supported viewports, orientations | A support matrix stated in the knowledge sources | Representative set, labelled "representative, not a declared support matrix": 1440×900 desktop, 820×1180 tablet, 390×844 mobile portrait; 844×390 mobile landscape on Tier 1 pages only |
| WCAG version and target | Knowledge sources or notes | WCAG 2.1 level AA, labelled "TestNova default target (not specified by the project)" |
| Themes | What the application offers: a theme switcher, an accessibility panel (Normal / Dark / High contrast…), a response to `prefers-color-scheme`, `forced-colors` | Only themes the app demonstrably offers (standard 2.10). A site that ignores `prefers-color-scheme` has no dark theme to test |
| Test accounts, data boundaries | `project.json` roles, `.env` variable names, `knowledge/notes.md` | Read-only use of existing data; create only what reaching a UI state requires |
| Excluded pages, routes, actions | `knowledge/notes.md` | None excluded; consequential actions are never activated (standard 2.7) |

## 2. Applicability map

The `Type` column of every case is one of these codes. A row marked **Not tested** is never
planned and is always listed in the plan header and the report's limitations with its reason.

| Code | Standard section | In TestNova | How, or why not |
|---|---|---|---|
| UI-2.1 | Visual and design validation | Partial | Side-by-side with supplied designs or screenshots where they exist; otherwise consistency between equivalent components and pages. Pixel-exact design comparison is not available |
| UI-2.2 | Layout and rendering | Yes | Screenshots plus DOM probes: horizontal overflow (`scrollWidth > clientWidth`), overlapping bounding boxes of interactive elements, clipped text, hidden-but-required content |
| UI-2.3 | Responsive and orientation | Yes, emulated | Viewport emulation in desktop browser engines. Real devices: **not tested** (none available); results say "emulated" |
| UI-2.4 | Cross-browser and platform | Partial | The `project.json` browsers as Playwright's bundled Chromium, Firefox and WebKit on this PC's OS. Other OSs, real Safari, real mobile browsers and older versions: **not tested** |
| UI-2.5 | Accessibility | Partial | axe scan (WCAG 2.0/2.1 A/AA rules) per page and theme, plus manual checks: keyboard-only operation, focus order, visible focus, focus trap and restoration in dialogs, accessible names (accessibility snapshot), heading outline including inside every popup, landmarks, zoom 200% / 320 px reflow, error announcements (`role="alert"`/`aria-live`). Screen-reader testing: **not tested** (no assistive technology in the pipeline). Never claim conformance |
| UI-2.6 | Usability and navigation | Observations | Recommendations only, unless a journey is a reproducible dead end or blocks the user (then a defect) |
| UI-2.7 | Component and interaction states | Yes | Default, hover, focus, active, selected, disabled, loading, expanded/collapsed, success, error. Never activate a submit, delete, publish or purchase without disposable data |
| UI-2.8 | Form presentation | Yes | Labels, required markers, helper text, inline error placement and association (`aria-describedby`), field states. Whether a validation **rule** is right is Functional: record it as an incidental observation |
| UI-2.9 | Typography and content | Yes | Computed font family, size, weight, line height across equivalent elements; truncation and wrapping; spelling and wording only against an approved source |
| UI-2.10 | Themes and visual modes | Yes | Every theme from section 1: contrast, icons, focus, borders, overlays in each |
| UI-2.11 | Animation and transitions | Partial | `prefers-reduced-motion` emulation; clipping or incomplete rendering seen in screenshots. Frame-level flicker cannot be observed reliably: observation only |
| UI-2.12 | UI states and content conditions | Yes | Loading, empty, populated, error and offline states (`browser_route`, `browser_network_state_set`), permission-limited views by role, long and short content, missing images |
| — | Native mobile apps | **Not tested** | TestNova tests web applications only |

## 3. Scope and time budget

The point of a typed run is a shorter pipeline. Plan only what the standard needs, once.

- **Only UI cases.** No business-rule, persistence, calculation or security cases.
- **Modules:** every knowledge-base module with pages is in scope. A module with no pages of its
  own is out of scope with that reason.
- **Shared components once.** Header, footer, navigation, cookie banner, accessibility panel and
  other shared components are tested in the first module (by `order`) that shows them; later
  modules reference that case instead of repeating it (standard §6: do not report the same issue
  repeatedly).
- **Tiers:**
  - **Tier 1** (sign-in, home or dashboard, and each module's primary page; at most 2 pages per
    module): every project browser × every viewport × every theme.
  - **Tier 2** (all other pages): the first browser in `project.json`; desktop and mobile
    portrait; the default theme. Each additional theme gets one axe scan and contrast check.
- **Case budget:** at most 15 cases per module, at most 6 for a module that is static content
  only. One case may cover one category across several pages (for example "UI-2.2: no horizontal
  overflow at 390 px on every circulars page").
- **Priority:** Critical for anything that blocks a task for some users (keyboard trap, invisible
  control in a supported theme, content unreachable at a supported viewport); then High, Medium,
  Low as in section 5.

## 4. Stage rules

### Stage 3 — `ui-test-planner`

Writes, in this order:

1. `qa/03-test-plan/ui-inventory.md`: the inputs found (section 1, each with its source or "default"),
   pages per module with their tier, shared components and which module owns them, component
   states to check, themes offered and how each was detected, the viewport matrix, the WCAG
   target, design references, and the **Not tested** list from section 2.
2. `qa/03-test-plan/scope.json`:
   `{"testingType": "ui", "generatedAt": "<ISO>", "modules": [{"id": "<module-id>", "inScope": true, "reason": "…"}]}`
   with every knowledge-base module.
3. `qa/03-test-plan/<module-id>-test-plan.md` for every in-scope module, in the readable test case
   format of the master prompt (same headers), with:
   - Test Case ID `TC-UI-<MODULE>-NNN`;
   - Type: the code and name, e.g. `UI-2.2 Layout and rendering`;
   - Test Data: browser, viewport and theme of the case;
   - AC: the acceptance criterion, design reference or WCAG success criterion (e.g. `WCAG 2.1 SC 1.4.3`)
     that defines the expected result.
   The plan header lists browsers, viewports, themes, references and the module's Not tested items.

### Stage 4 — `ui-tester`

Executes the plans; writes `qa/04-exploratory/<module-id>-results.md` (the master prompt's results
table) and `qa/04-exploratory/summary.md` with: counts per module, a coverage table (category ×
module: covered / partial / not tested), provisional bugs (`BUG-NNN`, category, page, viewport,
theme, screenshot), observations, recommendations, and incidental observations for other streams.

### Stage 5 — `test-generator`

Automate the cases that are deterministic:
- layout probes (overflow, overlap, broken images: `naturalWidth === 0`), the heading outline and
  dialog semantics, visible focus, keyboard order: as page-object methods (Phase 2 adds shared
  helpers in `src/utils/ui-checks.ts`; use them when present);
- the `scanA11y` fixture once per theme the plan lists;
- viewports through `test.use({ viewport })` from `viewports` in test data.

Not automated, and marked `Manual only` in the spec's describe title: comparison with designs,
usability, typography review. Every UI test title carries the `@ui` tag. Screenshot comparison
(`toHaveScreenshot`) is not used to pass or fail a test in this version: a first run only records
baselines.

### Stage 6 — `test-healer`

The standard healing rules. In addition: an accessibility or layout probe that fails because the
page is wrong is an app defect (`@known-defect`), never a script to loosen. Probe thresholds and
axe impact filters are never relaxed.

### Stage 7 — `defect-analyst`

- Classify each finding: **defect** (confirmed, reproducible, evidence plus a reference from
  section 5), **observation** (suspected, intermittent, or incidental to another stream), or
  **recommendation** (usability, subjective, no reference). Observations go in `observations`,
  recommendations in `recommendations` of the defects JSON; neither is a defect.
- Defect `type`: `UI`, `Accessibility` or `Compatibility`; `category`: the UI code; `testingType`: `ui`.
- One underlying problem is one DEF, with every page, viewport, theme and browser listed in
  `testData` and every test in `tests`.

### Stage 8 — `qa-reporter`

A UI section with: the coverage table (category × module), browsers, viewports (emulated) and
themes covered, the WCAG target and the sentence "automated scans plus manual checks; this is not
a conformance claim", the Not tested list, and the recommendations.

## 5. Expected results, severity and evidence

**A UI defect needs a reference.** One of: a supplied design or approved copy; an acceptance
criterion; a WCAG success criterion; the application's established convention (at least two
other equivalent instances that differ from this one); or a **universal rule**: text or a control
clipped or hidden, elements overlapping, horizontal scrolling at a supported viewport, content or
a control unreachable by keyboard, a broken image or icon, raw placeholder text or translation
keys shown to users. Without a reference it is a recommendation.

**Severity** (TestNova's scale; never Critical only because an issue is visually prominent):

| Severity | UI meaning |
|---|---|
| Critical | A primary task is impossible for some users: keyboard trap, invisible or unreachable control in a supported theme or viewport, content that cannot be read at all |
| High | A primary task is severely impaired, or a WCAG level A failure on a primary flow |
| Medium | A WCAG level AA failure, or a layout breakage with a workaround |
| Low | Cosmetic: alignment, spacing, inconsistent styling with no effect on use |

**Evidence** (standard §7): screenshot
`qa/04-exploratory/evidence/<module-id>/<TC-ID>_<width>x<height>_<theme>.png`, the DOM fact (element,
computed style or bounding box) in the Actual Result, browser, viewport, theme and date in the Test
Data, reproducibility (consistent / intermittent), and the reference. A suggested fix is written
after the facts, labelled "Suggested fix:". Do not screenshot pages showing real personal data;
use the test account's own data.

## 6. Completion (standard §8)

| Standard completion criterion | Where TestNova verifies it |
|---|---|
| In-scope pages and categories have recorded coverage | Stage 3 check: a plan per in-scope module; stage 4 summary coverage table |
| Critical viewports and platforms checked | Tier 1 rows in the plans and results |
| Interactive and accessibility states assessed | UI-2.5 and UI-2.7 cases per module |
| Findings evidence-backed, deduplicated, classified | Stage 7 defects JSON (defects, observations, recommendations) |
| Exclusions and limitations listed | `ui-inventory.md` Not tested list, carried into the stage 8 report |
| Execution summary and outstanding risks | Stage 8 report |
