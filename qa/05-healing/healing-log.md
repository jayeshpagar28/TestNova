# Healing Log — Sahayog (sahayog-e767)

All runs went through the TestNova runner (`POST http://127.0.0.1:5581/api/runs`), one module at a time in
knowledge-base order. This replaces an earlier "BLOCKED" log from a session that had no PowerShell.

## Initial Results

| Module | Execution | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| login | EX-20261104-112238 | 44 | 38 | 4 | 2 |
| home | EX-20261104-112810 | 38 | 33 | 4 | 1 |
| about-us | EX-20261104-113708 | 19 | 16 | 2 | 1 |
| my-profile | EX-20261104-113921 | 32 | 25 | 3 | 4 |
| notifications | EX-20261104-114602 | 38 | 26 | 4 | 8 |
| **Total** | | **171** | **138** | **17** | **16** |

## Healing Log

| Test Case | Failure Type | Layer Fixed | File Modified | Fix Applied |
|---|---|---|---|---|
| TC-HOME-010 | Missing wait (tab styles read while the panel re-renders; returned null) | Page object | `src/pages/home.page.ts` | `selectedTab()` now polls up to 5 s until one tab is painted selected |
| TC-PROFILE-011 | Precondition incomplete (`goto` fired before the re-login finished, so the token call was aborted and the page stayed on /login) | Spec arrange block | `tests/e2e/04-my-profile.spec.ts` | Added `await login.expectSignedIn()` after `signIn` |
| TC-NOTIF-006 | Missing wait (page highlight moves before the rows are replaced, so the previous page's rows were read) | Page object | `src/pages/notifications.page.ts` | `goToPage()` waits for the row list to change after the highlight moves |
| TC-NOTIF-007 | Ambiguous locator (`Next` matched 3 elements: row buttons whose text contains "next 1 day") | Page object | `src/pages/notifications.page.ts` | `next` and `previous` locators use `exact: true` |
| TC-HOME-031, TC-ABOUT-015, TC-PROFILE-027, TC-NOTIF-034 | App defect (axe critical/serious violations, same set on every page) | Spec metadata only | `02-home`, `03-about-us`, `04-my-profile`, `05-notifications` specs | Added `@known-defect` and a `defect` annotation (BUG-008). Assertions untouched |
| TC-NOTIF-030 | App defect (see BUG-010) | Spec metadata only | `tests/e2e/05-notifications.spec.ts` | Added `@known-defect` and `defect` annotation BUG-010. Assertion untouched |

No assertion was weakened, deleted, skipped or `fixme`d.

## Final Results

Final run per module, after healing:

| Module | Execution | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| login | EX-20261104-112238 | 44 | 38 | 4 | 2 |
| home | EX-20261104-113334 | 38 | 34 | 3 | 1 |
| about-us | EX-20261104-115909 | 19 | 16 | 2 | 1 |
| my-profile | EX-20261104-114312 | 32 | 26 | 2 | 4 |
| notifications | EX-20261104-115503 | 38 | 28 | 2 | 8 |
| **Total** | | **171** | **142** | **13** | **16** |

All 13 remaining failures are real application defects. They keep their assertions and carry `@known-defect`.
Zero failures are unexplained. `npm run typecheck` passes.

## Execution ids per module

- login: EX-20261104-112238 (only run)
- home: EX-20261104-112810, EX-20261104-113334 (after fix)
- about-us: EX-20261104-113708, EX-20261104-115909 (after tagging)
- my-profile: EX-20261104-113921, EX-20261104-114312 (after fix)
- notifications: EX-20261104-114602, EX-20261104-115034 (after page-object fix), EX-20261104-115503 (after tagging)

Home was not re-run after the About Us and Notifications changes. The only shared file touched was
`notifications.page.ts`, which no other module uses.

## Known defects found (still failing, assertions intact)

| Bug | Test id | Observed | Expected |
|---|---|---|---|
| BUG-001 | TC-LOGIN-007 | Wrong password for a valid User Id gives "The password you entered is incorrect" (oauth2/token 400), not the generic toast | "The credentials you entered are incorrect" |
| BUG-001 | TC-LOGIN-008 | Unknown User Id and valid User Id + wrong password give different messages, so valid accounts can be enumerated | Same message for both |
| BUG-002, BUG-008 | TC-LOGIN-012 | Password visibility toggle is a plain div with no accessible name and is not keyboard reachable | Named, operable control |
| BUG-008 | TC-LOGIN-039 | "Enter User Id" error is not tied to the input (no accessible description) | Error associated with the field |
| BUG-006 | TC-HOME-012, TC-ABOUT-009 | Side-nav highlight is stale (shows Notifications while on About Us) until a click | Highlight follows the current page |
| BUG-002, BUG-003 | TC-HOME-030 | Nav and avatar menu not fully keyboard operable | Keyboard operable |
| BUG-008 | TC-HOME-031, TC-ABOUT-015, TC-PROFILE-027, TC-NOTIF-034 | axe: aria-allowed-attr and button-name (critical), color-contrast, ARIA command name (on Notifications) | No serious or critical violations |
| BUG-009 | TC-PROFILE-009 | Mobile number is 8 digits (`96193993`) | 10 digits |
| BUG-010 (new) | TC-NOTIF-030 | When the notification/list request returns 500 after clicking Next, the rows stay on page 1 but the paginator highlights page 2 (confirmed by probe: 500 response, unchanged rows, highlight "2") | Page indicator stays on 1 and no state desync; retry then reaches page 2 |

BUG-010 (Low/Medium, UI state): add to the stage-4 defect list.

## Notes and assumptions

- A throwaway probe spec was used for the investigations above. It was deleted afterwards and nothing from it is left in `tests/`.
- Skipped tests (16) are `test.fixme`/conditional skips from earlier stages (for example TC-PROFILE-012, no profile endpoint identified). They were not touched.
- No environment failures occurred; the app was reachable throughout.
