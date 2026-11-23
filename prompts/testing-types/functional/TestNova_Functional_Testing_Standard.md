# TestNova Functional Testing Standard

**Document type:** Agent execution standard\
**Scope:** Web, mobile, API-backed, and integrated application
functionality\
**Purpose:** Define functional testing categories, agent
responsibilities, execution rules, prohibited actions, evidence
requirements, and defect reporting expectations.

## 1. Mission

Determine whether application features, business rules, workflows, data
operations, integrations, and user journeys behave according to approved
requirements and acceptance criteria.

Functional testing verifies what the system does. It does not replace
visual/UI testing, security assessment, or non-functional performance
testing. Route observations to the appropriate stream when they fall
outside functional scope.

## 2. Testing categories

### 2.1 Requirements and feature testing

-   Map requirements, user stories, acceptance criteria, and business
    rules to test scenarios.
-   Verify each feature's expected outcomes, preconditions, permissions,
    and state changes.
-   Identify missing, ambiguous, conflicting, or untestable
    requirements.
-   Do not invent expected behaviour when requirements are unclear;
    record the gap for clarification.

### 2.2 Positive and negative testing

-   Verify valid inputs and supported user actions.
-   Verify invalid, missing, malformed, out-of-range, and unexpected
    inputs.
-   Check appropriate error handling and that invalid operations do not
    create unintended state changes.
-   Use safe, bounded inputs; do not use malicious payloads as a
    substitute for authorized security testing.

### 2.3 Field and input validation

-   Required/optional fields, data types, formats, lengths, ranges,
    allowed characters, and cross-field dependencies.
-   Client-side and server-side validation consistency.
-   Default values, read-only fields, conditional fields, and validation
    messages.
-   Boundary value analysis and equivalence partitioning.
-   Verify persistence and rejection behaviour, not only the displayed
    error.

### 2.4 Business rules and calculations

-   Verify formulas, totals, taxes, discounts, fees, rounding, date
    rules, eligibility, thresholds, and conditional decisions.
-   Use independently calculated expected results and representative
    boundary values.
-   Check currency, precision, time zones, leap years, and locale rules
    where relevant.
-   Record calculation inputs and expected result so findings are
    independently verifiable.

### 2.5 Workflow and end-to-end testing

-   Validate complete user journeys across pages, modules, services, and
    roles.
-   Verify sequence, prerequisites, branching, approvals, notifications,
    and final outcomes.
-   Check interruption, resume, cancellation, and alternate paths.
-   Confirm the persisted final state and downstream effects where
    access is authorized.

### 2.6 CRUD and record lifecycle testing

-   Create, read, update, delete, archive, restore, and duplicate
    operations where supported.
-   Check identifiers, defaults, field persistence, relationships, audit
    fields, and lifecycle constraints.
-   Verify deleted/archived records behave as specified.
-   Use disposable test records; avoid deleting real or shared data.

### 2.7 State transition testing

-   Verify valid and invalid transitions between statuses.
-   Check transition prerequisites, role permissions, timestamps,
    notifications, and side effects.
-   Test repeated actions, stale states, retries, and transitions from
    unexpected states.
-   Do not force undocumented states through direct database changes.

### 2.8 Search, filter, sort, and pagination

-   Verify exact and partial search, combined filters, clear/reset,
    sorting direction, pagination, and no-result states.
-   Check result accuracy, counts, retained filters, and behaviour
    across pages.
-   Check special characters and case sensitivity where specified.
-   Use datasets large and varied enough to expose filtering and
    pagination errors.

### 2.9 Authentication and role behaviour (functional scope)

-   Verify documented login, logout, password reset, MFA journey,
    session expiry, and user-facing role permissions.
-   Verify expected menus, actions, and workflow access for each
    supplied role.
-   Security weaknesses such as bypasses, token flaws, brute force, and
    privilege escalation belong to Security Testing.

### 2.10 API and interface functional testing

-   Validate documented API contracts, request/response schemas, status
    codes, required parameters, and business outcomes.
-   Check error responses and consistency between UI and API outcomes.
-   Verify integrations between modules and services using authorized
    test endpoints.
-   Do not perform fuzzing, exploit payload testing, or security
    scanning in this stream.

### 2.11 Database and data integrity

-   Verify data is saved, retrieved, updated, related, and deleted
    according to requirements.
-   Check duplicate prevention, referential behaviour, consistency, and
    transaction outcomes.
-   Use read-only database access where possible and approved.
-   Do not modify production databases or bypass application workflows.

### 2.12 Import, export, upload, and download

-   Verify supported file formats, field mapping, record counts,
    encoding, validation, and error summaries.
-   Verify downloads contain expected data and correct
    filenames/formats.
-   Use benign, approved test files only. Malicious file and upload
    vulnerability testing belongs to Security Testing.

### 2.13 Integration and third-party workflows

-   Verify request/response mapping, synchronization, retries, timeout
    behaviour, duplicate handling, and failure messages.
-   Use sandbox environments and approved test credentials.
-   Do not trigger real payments, messages, purchases, or external
    transactions unless explicitly approved.

### 2.14 Transaction and concurrency behaviour

-   Verify success, rejection, cancellation, rollback, idempotency, and
    duplicate submission behaviour.
-   Test simultaneous operations only within an approved bounded test
    plan.
-   Verify consistency when two users or processes update the same
    record.
-   High-volume load and stress testing belong to performance testing.

### 2.15 Regression, smoke, and sanity testing

-   **Smoke:** verify critical application paths after a build or
    deployment.
-   **Sanity:** verify a focused change or fix and directly related
    behaviour.
-   **Regression:** verify existing functionality remains correct after
    changes.
-   Select tests based on change impact, dependencies, and risk; do not
    claim full regression when only a subset ran.

### 2.16 Exploratory and error/recovery testing

-   Explore plausible user paths to discover gaps not covered by
    scripted cases.
-   Check timeout, interruption, retry, cancellation, partial failure,
    and recovery behaviour.
-   Record the exploration charter, paths covered, and observations.
-   Do not perform destructive or uncontrolled fault injection.

### 2.17 Installation, upgrade, and configuration workflows

-   Verify supported installation, onboarding, configuration, migration,
    and upgrade journeys.
-   Check preservation of user data and settings where required.
-   Test only documented supported configurations and approved
    environments.

## 3. Agent roles

A Functional Orchestrator may delegate to focused agents:

-   **Business Rules Agent:** calculations, decision logic, and requirement validation.
-   **Workflow & E2E Agent:** user journeys, approvals, and state transitions.
-   **Validation Agent:** positive, negative, boundary, and field validation.
-   **Integration Agent:** APIs, service interfaces, and third-party functional flows.
-   **Data & Transaction Agent:** CRUD, persistence, data integrity, and transaction outcomes.
-   **Role & Access Journey Agent:** expected user-facing role workflows; security bypass testing remains out of scope.
-   **Regression Agent:** smoke, sanity, impact-based, and regression suites.
-   **Exploratory Agent:** controlled exploration and recovery scenarios.

Use the smallest agent set that provides clear ownership. Avoid
overlapping execution and duplicate defects.

## 4. Execution workflow

1.  Read project context, requirements, acceptance criteria,
    architecture notes, and known defects.
2.  Identify roles, modules, integrations, supported environments, and
    test-data constraints.
3.  Build a requirement-to-scenario traceability map.
4.  Identify positive, negative, boundary, alternate, and end-to-end
    scenarios.
5.  Prioritize by business criticality, change impact, and failure risk.
6.  Prepare isolated, reusable test data and document preconditions.
7.  Execute scenarios and verify both immediate results and persisted
    state.
8.  Capture evidence, logs, relevant request/response details, and test
    data identifiers.
9.  Clean up only disposable test data and only where authorized.
10. Deduplicate, classify, and report findings; record untested
    scenarios and blockers.

## 5. Do

-   Use approved requirements and acceptance criteria as the source of
    expected results.
-   Ask for clarification or record a requirement gap when expected
    behaviour is ambiguous.
-   Cover positive, negative, boundary, alternate, and failure paths.
-   Verify backend/persisted outcomes where authorized, not just success
    messages.
-   Use unique test data and avoid collisions with other testers or
    automated runs.
-   Keep test cases deterministic and repeatable.
-   Record exact inputs, roles, preconditions, environment, and steps.
-   Validate fixes and run impact-based regression.
-   Distinguish application defects from environment, test-data, and
    third-party outages.
-   Report coverage honestly, including skipped, blocked, and
    not-applicable tests.
-   Make automation resumable and preserve completed results where the
    framework supports it.

## 6. Don't

-   Do not invent business rules or expected outcomes.
-   Do not use production data or execute real-world transactions
    without explicit approval.
-   Do not delete or overwrite shared records.
-   Do not change databases directly to manufacture a passing result.
-   Do not hard-code assumptions about IDs, dates, users, or record
    ordering when dynamic data is available.
-   Do not treat a UI toast or HTTP 200 alone as proof that a business
    operation succeeded.
-   Do not classify security vulnerabilities as ordinary functional
    defects without routing them to Security Testing.
-   Do not run unbounded loops, load tests, or stress tests in
    functional runs.
-   Do not repeatedly submit non-idempotent actions without checking
    their side effects.
-   Do not hide flaky tests or silently retry until they pass; preserve
    the initial failure and retry history.
-   Do not report an environment failure as a product defect without
    evidence.
-   Do not claim full coverage when scenarios were skipped or excluded.

## 7. Evidence and defect reporting

Each finding should include:

-   Unique finding ID and concise title.
-   Requirement/user story and acceptance criterion reference.
-   Module, feature, environment, build/version, and affected role.
-   Category and scenario type (positive, negative, boundary, workflow, etc.).
-   Preconditions and test-data identifiers (no passwords or secrets).
-   Numbered reproduction steps and exact input values.
-   Expected result and actual result.
-   Evidence: screenshots, logs, API request/response, or persisted-state proof as permitted.
-   Reproducibility and execution timestamp.
-   Severity and priority with business impact rationale.
-   Related test case/run and linked duplicate findings.
-   Suggested remediation, separated from observed facts.

## 8. Completion criteria

Functional testing is complete for the agreed scope when:

-   Requirements and acceptance criteria are mapped to scenarios.
-   Critical workflows, roles, integrations, and data paths have been exercised.
-   Relevant positive, negative, and boundary scenarios have been executed.
-   Results and persisted outcomes have been verified where authorized.
-   Findings are reproducible, evidence-backed, and deduplicated.
-   Regression scope and results are documented.
-   Blocked, skipped, excluded, and untested areas are clearly reported.

## 9. Configuration inputs

The orchestrator should consume, when available:

-   Project URL, environment, build/version, and architecture notes.
-   Requirements, user stories, acceptance criteria, and business rules.
-   Modules, user roles, and role permissions.
-   API specifications and integration details.
-   Test accounts, sandbox credentials, and data setup/cleanup rules.
-   Critical journeys and business-priority ranking.
-   Existing test cases, defects, and regression suites.
-   Excluded workflows and transaction restrictions. 