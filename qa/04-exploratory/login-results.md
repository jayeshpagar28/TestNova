# Exploratory results — Login

- **URL:** https://sahyogagentweb.drutam.in:9634/login · **Environment:** QA · **App build:** not exposed in UI (static bundle main.6c370f65.js) · **Browser:** Chromium (Playwright MCP) · **Viewports:** 1280x720 default, 390x844, 820x1180, 1440x900 · **Date:** 2026-11-04 · **Role:** User (TEST_USERNAME / TEST_PASSWORD from .env, values not recorded)
- Environment limits: the MCP session did not expose `browser_route`, `browser_network_state_set`, throttling, a second tab or axe, so route/offline/slow/two-tab/axe cases are **Blocked (environment: tool unavailable)**, not app defects. Cases marked "Blocked — not run" were not executed in this run.

| Test Case ID | Test Name | Status | Actual Result | Deviation | Screenshot |
|---|---|---|---|---|---|
| TC-LOGIN-001 | Valid user signs in and lands on Home | Pass | Valid sign-in reached /HOME with shell and alerts | — | |
| TC-LOGIN-002 | Session persists after reload on Home | Pass | Full page load of protected URLs while signed in kept the session (token in localStorage) | — | |
| TC-LOGIN-003 | Enter key submits the form | Pass | Enter in User Id/Password submitted; reached /HOME | — | |
| TC-LOGIN-004 | Both empty shows 'Enter User Id' | Pass | "Enter User Id" shown; stayed on /login; no token request | — | |
| TC-LOGIN-005 | Password empty shows 'Enter password' | Pass | "Enter password" shown | — | |
| TC-LOGIN-006 | User Id empty shows 'Enter User Id' | Pass | "Enter User Id" shown, password kept | — | |
| TC-LOGIN-007 | Wrong password shows generic toast | Fail | Toast "Error: The password you entered is incorrect" (oauth2/token 400) for a valid User Id | Expected generic "The credentials you entered are incorrect"; reveals the account exists (BUG-001) | evidence/login/BUG-001_400_user-enumeration-toast.png |
| TC-LOGIN-008 | Unknown User Id gives same message | Fail | Unknown id gave "The credentials you entered are incorrect"; valid id + wrong password gave a different message | Messages differ so user ids can be enumerated (BUG-001) | evidence/login/BUG-001_400_user-enumeration-toast.png |
| TC-LOGIN-009 | Server 400 shown in plain language | Pass | oauth2/token 400; UI shows only the friendly toast, no JSON | Console logs "Failed to load resource 400" and "#ERROR" for each failed login (expected noise) | |
| TC-LOGIN-010 | Email format validation (CONFLICT) | Pass | "abc" gives no format error; same credentials toast. Undocumented rule found: password under 4 chars gives "Enter minimum 4 digit password" | Document/plan said format error: no such rule (plan corrected) | |
| TC-LOGIN-011 | Password is masked | Pass | input type=password, maxlength 20 (User Id maxlength 100) | — | |
| TC-LOGIN-012 | Password visibility toggle | Fail | Icon exists but is a plain div with no role, no accessible name, tabindex -1; not keyboard operable. Mouse click not exercised | Toggle unusable by keyboard/AT (BUG-002, BUG-008) | |
| TC-LOGIN-013 | Spaces around User Id | Pass | Value with leading/trailing spaces was trimmed and login succeeded | — | |
| TC-LOGIN-014 | Very long input | Pass | 500+ char values (set programmatically) returned 400, no 5xx, no crash | maxlength attribute not enforced for pasted/programmatic values; server rejects | |
| TC-LOGIN-015 | Special/script/SQL text safe | Pass | `' OR 1=1 --` and script text returned 400, generic toast, no script executed, input not reflected, no 5xx | Unicode variant not run | |
| TC-LOGIN-016 | Login button guarded during request | Blocked | Environment: cannot delay token call (browser_route not available) | | |
| TC-LOGIN-017 | Form recovers after failed login | Pass | After several failed attempts the button stayed enabled and a correct attempt succeeded without reload | — | |
| TC-LOGIN-018 | Double-click Login sends one request | Pass | Double-click produced one oauth2/token POST (200) | — | |
| TC-LOGIN-019 | Navigate away while login pending | Blocked | Environment: cannot delay the call | | |
| TC-LOGIN-020 | Logout from avatar menu | Pass | Redirected to /login, toast "Success / Logout Successfully", token removed from storage | — | |
| TC-LOGIN-021 | After logout /HOME not reachable | Pass | /HOME redirected to /login | — | |
| TC-LOGIN-022 | Protected URLs redirect when signed out | Pass | /MY_PROFILE, /NOTIFICATIONS, /ABOUT_US, /HOME each redirected to /login | — | |
| TC-LOGIN-023 | Back after logout shows no protected content | Pass | Back stayed on /login, token absent | — | |
| TC-LOGIN-024 | Session cleared mid-flow | Fail | After clearing storage, clicking Next gave notification/list 401 and a redirect to /login, but the page showed toast "Success: Logout Successfully" | Misleading success toast for an expired session (BUG-005) | |
| TC-LOGIN-025 | Logout in one tab, other tab stale | Blocked | Environment: single page only in this session | | |
| TC-LOGIN-026 | Back after successful login | Blocked | Not run | | |
| TC-LOGIN-027 | Refresh on /login clears fields | Blocked | Not run | | |
| TC-LOGIN-028 | Signed-in user opens /login | Pass | Redirected to /HOME, no error | — | |
| TC-LOGIN-029 | No credentials/tokens in URL | Pass | URLs seen (/login, /HOME, redirects) had no query string or credentials | — | |
| TC-LOGIN-030 | Password not logged | Pass | Console never printed the password; "#REQ" log prints the user id (userId) and roleLevel | Minor info exposure in console, noted | |
| TC-LOGIN-031 | Failed logins leave audit trail | Blocked | GAP: no audit view for User role | | |
| TC-LOGIN-032 | Forgot Password / User ID / Activate Account links | Fail | All three present (not submitted) but are `a` elements without href; keyboard Tab skips them | Not keyboard reachable (BUG-002) | |
| TC-LOGIN-033 | User Id survives failed attempt | Pass | User Id kept; password field also kept its value | Password retained after failure, recorded | |
| TC-LOGIN-034 | Offline during login | Blocked | Environment: browser_network_state_set not available | | |
| TC-LOGIN-035 | Token API returns 500 | Blocked | Environment: browser_route not available | | |
| TC-LOGIN-036 | Login on slow network | Blocked | Environment: no throttling tool | | |
| TC-LOGIN-037 | Keyboard-only sign in | Fail | Tab order: User Id, Password, Login only; links and password toggle unreachable. Enter submits. Focus ring not inspected visually | BUG-002 | |
| TC-LOGIN-038 | axe scan of /login | Blocked | Environment: axe not available; manual checks only (see BUG-008) | | |
| TC-LOGIN-039 | Errors announced and labelled | Fail | Toast has role alert; inline errors ("Enter User Id") are plain divs, not tied to the field (no aria-describedby/invalid) | BUG-008 | |
| TC-LOGIN-040 | Login on mobile 390x844 | Pass | No horizontal overflow or clipped controls. Sign-in itself not repeated at this size | — | |
| TC-LOGIN-041 | Login on tablet 820x1180 | Pass | No overflow. Sign-in not repeated | — | |
| TC-LOGIN-042 | Login on desktop 1440x900 | Pass | Layout intact | — | |
| TC-LOGIN-043 | Critical flow on configured browsers | Pass | Only Chromium configured; 001 and 020 pass, 007 fails (BUG-001) | — | |
| TC-LOGIN-044 | Page content vs document | Pass | Labels "User Id", "Password"; heading "Let's You Sign In!"; landing is Home; extra links present | Recorded CONFLICT items with US_001 | |

## Findings
- BUG-001 Medium Security: distinct toast for valid user + wrong password reveals valid accounts.
- BUG-002 High Accessibility: Forgot User ID / Forgot Password / Activate Account / password toggle unreachable by keyboard.
- BUG-005 Low: expired session shows "Logout Successfully".
- BUG-008 Medium Accessibility: toggle without name; validation messages not associated with fields.
- Observation: JWT stored in localStorage (`token`).

## Console / network signals
- Each failed login: console error "Failed to load resource 400" + app log "#ERROR". No uncaught page errors, no 5xx. "Token: undefined" logged on every load.
- oauth2/token: 400 on bad credentials, 200 on good.

## Totals: Pass 27 · Fail 7 · Blocked 10 (44 cases)
