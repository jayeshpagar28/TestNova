# TestNova UI Testing Standard

**Document type:** Agent execution standard\
**Scope:** Web and mobile application user interfaces\
**Purpose:** Define UI testing categories, agent responsibilities,
execution rules, prohibited actions, evidence requirements, and defect
reporting expectations.

## 1. Mission

Find reproducible defects in the presentation, accessibility, usability,
responsiveness, rendering, and interaction of the user interface.
Validate the interface against the supplied requirements, approved
designs, existing product conventions, and observable expected
behaviour.

UI testing focuses on the user-facing layer. Do not silently expand into
business-rule, API, database, or security testing. Record observations
that appear to belong to those areas and route them to the appropriate
testing stream.

## 2. Testing categories

### 2.1 Visual and design validation

-   Compare pages and components with supplied designs, screenshots,
    design tokens, and documented UI standards.
-   Check colours, backgrounds, borders, shadows, icons, image
    rendering, spacing, alignment, and visual hierarchy.
-   Detect missing, duplicated, distorted, clipped, or incorrectly
    styled elements.
-   Check consistency between equivalent components and pages.
-   Do not call a subjective design preference a defect unless it
    conflicts with a requirement, approved design, accessibility
    criterion, or established product convention.

### 2.2 Layout and rendering

-   Check positioning, sizing, padding, margins, grid/flex behaviour,
    overflow, clipping, overlap, and content wrapping.
-   Check long labels, large values, empty states, dense tables, and
    error messages.
-   Check sticky headers, footers, sidebars, dialogs, and scroll
    containers.
-   Verify that content remains visible and usable at supported viewport
    sizes.

### 2.3 Responsive and orientation testing

-   Test documented breakpoints and representative supported viewport
    sizes.
-   Check mobile, tablet, and desktop layouts where applicable.
-   Check portrait and landscape orientation on supported devices.
-   Verify navigation adaptation, responsive tables, menus, cards,
    forms, and dialogs.
-   Do not assume every device or viewport is supported; use the
    project's stated support matrix.

### 2.4 Cross-browser and platform rendering

-   Validate supported browsers, browser versions, operating systems,
    and device platforms.
-   Check font rendering, CSS behaviour, controls, scrolling, focus
    indicators, and layout differences.
-   Record exact browser, version, OS, viewport, and device details.
-   Do not report unsupported browsers as product defects unless support
    is explicitly required.

### 2.5 Accessibility

-   Check semantic headings, landmarks, labels, accessible names, alt
    text, and form instructions.
-   Check keyboard-only navigation, logical focus order, visible focus,
    focus trapping, and focus restoration.
-   Check contrast, zoom/reflow, text resizing, and status/error
    announcements.
-   Check screen-reader compatibility where tools and environments
    permit.
-   Use the project's required WCAG version and conformance target; if
    none is specified, report the criterion and level used and label the
    result accordingly.
-   Do not claim full WCAG compliance based only on automated scans.
    Include manual checks where required.

### 2.6 Usability and navigation

-   Check whether navigation labels, page hierarchy, controls, and user
    guidance are understandable and consistent.
-   Check breadcrumbs, menus, tabs, pagination, back navigation, empty
    states, loading states, and confirmation prompts.
-   Identify confusing or dead-end journeys supported by observable
    evidence.
-   Distinguish usability recommendations from reproducible functional
    defects.

### 2.7 Component and interaction states

-   Check buttons, links, dropdowns, selectors, tabs, accordions,
    tooltips, menus, modals, tables, cards, and other reusable
    components.
-   Verify default, hover, focus, active, selected, disabled, loading,
    expanded, collapsed, success, and error states where applicable.
-   Check click, tap, keyboard activation, and pointer behaviour.
-   Avoid activating controls that may submit, delete, publish,
    purchase, or otherwise cause consequential changes unless the test
    data and authorization explicitly permit it.

### 2.8 Form presentation

-   Check field labels, alignment, required indicators, placeholders,
    helper text, inline errors, validation styling, and focus behaviour.
-   Check that error messages are visible, associated with the relevant
    field, and do not obscure other content.
-   Validate visual treatment of valid, invalid, disabled, read-only,
    and populated fields.
-   Actual validation rules and business correctness belong to
    Functional Testing; report them there unless the issue is
    specifically a UI presentation defect.

### 2.9 Typography and content presentation

-   Check font family, size, weight, line height, text alignment,
    wrapping, truncation, and readability.
-   Check localization, special characters, date/number formatting
    presentation, and text expansion where supported.
-   Identify spelling or label inconsistencies when they conflict with
    approved copy or requirements.
-   Do not invent expected wording when no approved source exists.

### 2.10 Themes and visual modes

-   Check supported light/dark themes, high-contrast modes, and theme
    switching.
-   Verify contrast, icons, images, borders, focus states, charts, and
    overlays in each supported theme.
-   Do not test or report themes that the product does not claim to
    support.

### 2.11 Animation and transitions

-   Check loading indicators, transitions, animations, skeletons, and
    state changes for clipping, flicker, unintended movement, or
    incomplete rendering.
-   Check reduced-motion preferences where supported.
-   Do not infer performance defects from visual appearance alone; route
    timing or resource issues to the relevant testing stream.

### 2.12 UI states and content conditions

-   Check loading, empty, populated, partial, error, offline, and
    permission-limited states when applicable.
-   Check long and short content, large lists, no-result searches, and
    missing images.
-   Ensure status messages and feedback are perceivable and do not
    disappear before users can understand them.

## 3. Agent roles

A UI Orchestrator may delegate to focused agents:

-   **Visual & Layout Agent:** visual consistency, layout, typography, themes, and rendering.
-   **Accessibility Agent:** WCAG-oriented automated and manual accessibility checks.
-   **Responsive & Compatibility Agent:** viewports, devices, orientations, and supported browsers.
-   **Component & Interaction Agent:** component states, controls, forms presentation, and interaction affordances.
-   **Usability Agent:** navigation clarity, consistency, and user experience observations.

Agents may be implemented as separate workers or capabilities. Avoid
creating unnecessary agents for small projects; preserve clear ownership
and avoid duplicate execution.

## 4. Execution workflow

1.  Read project setup data, requirements, supported browsers/devices,
    design references, and known constraints.
2.  Confirm the authorized application URL and test account. Identify
    the environment and test-data boundaries.
3.  Build a page/module inventory and identify critical user-facing
    journeys.
4.  Select relevant categories based on the application type and support
    matrix.
5.  Establish baseline screenshots and viewport/device metadata.
6.  Execute checks systematically, including normal, boundary, empty,
    loading, and error UI states where safe.
7.  Capture reproducible evidence and record exact steps and environment
    details.
8.  Deduplicate findings and classify each as confirmed defect,
    observation, or recommendation.
9.  Produce a coverage summary, gaps, and prioritized findings.

## 5. Do

-   Use project requirements and approved designs as the source of
    expected behaviour.
-   Test all in-scope pages and critical UI states, not only the landing
    page.
-   Use stable, authorized test accounts and non-production test data.
-   Record viewport dimensions, browser/device, OS, zoom level, and
    relevant settings.
-   Capture before/after or expected/actual screenshots when useful.
-   Include concise reproduction steps and the affected page/component.
-   Check keyboard accessibility and responsive behaviour, not just
    mouse interaction.
-   Verify suspected issues more than once when practical.
-   Separate confirmed defects from subjective suggestions.
-   Reuse shared components and page patterns to improve coverage.
-   Respect the application's supported browser, device, and
    accessibility matrix.

## 6. Don't

-   Do not change application code, CSS, content, settings, or data to
    make a test pass.
-   Do not use production accounts or modify production data unless
    explicit authorization and a safe procedure exist.
-   Do not submit destructive or irreversible actions without approved
    test data and authorization.
-   Do not assume a visual difference is a defect without a valid
    expected reference.
-   Do not report the same underlying issue repeatedly across pages;
    link affected instances where appropriate.
-   Do not mark an automated accessibility scan as proof of full
    accessibility compliance.
-   Do not infer backend, security, or business-logic defects from UI
    appearance alone.
-   Do not bypass authentication, permissions, or application
    safeguards.
-   Do not expose personal, confidential, or secret data in screenshots
    or reports; redact it.
-   Do not continue testing when the environment is unstable or the
    action could affect real users.

## 7. Evidence and defect reporting

Each finding should include:

-   Unique finding ID and concise title.
-   Project, environment, module, page, and component.
-   Category and subcategory.
-   Severity and priority with rationale.
-   Preconditions and test account role (never include credentials).
-   Numbered reproduction steps.
-   Expected result and actual result.
-   Screenshot/video or other evidence, with sensitive data redacted.
-   Browser/device/OS/viewport and timestamp.
-   Reproducibility: consistent, intermittent, or not reproduced.
-   Requirement/design reference, if available.
-   Suggested remediation, clearly separated from observed facts.

Use severity definitions configured by the project. Do not assign
critical severity solely because an issue looks visually prominent.

## 8. Completion criteria

UI testing is complete for the agreed scope when:

-   In-scope pages and selected categories have recorded coverage.
-   Critical supported viewports and platforms have been checked.
-   Important interactive and accessibility states have been assessed.
-   Findings are evidence-backed, deduplicated, and classified.
-   Unavailable checks, exclusions, and limitations are explicitly listed.
-   A concise execution summary and outstanding risks are delivered.

## 9. Configuration inputs

The orchestrator should consume, when available:

-   Application URL and environment.
-   Project/module inventory and user roles.
-   Requirements, user stories, and acceptance criteria.
-   Design files, screenshots, design system, and approved copy.
-   Supported browsers, devices, viewports, and orientations.
-   Required WCAG version/level and accessibility policy.
-   Test accounts and permitted test-data boundaries.
-   Excluded pages, routes, and actions. 