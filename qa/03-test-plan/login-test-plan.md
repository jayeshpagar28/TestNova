# Test Plan — Login

- **Module:** Login (`login`) — **Pages:** Login `/login`
- **Roles:** User (`.env` TEST_USERNAME / TEST_PASSWORD) — **Browsers:** chromium (only browser in project.json; Firefox/WebKit not in scope)
- **ACs covered:** AC-LOGIN-01 … AC-LOGIN-06 (plus BR-001…BR-010)
- **Assumptions:** Notes.md is empty (no restrictions). Cases marked `Assumption` rest on [NOT VERIFIED] claims or GAPs (GAP-001, 002, 003, 010, 011, 012, 013). Forgot Password / Forgot User ID / Activate Account send real mail: they are only checked for presence and never submitted. Test-type column: 1 Happy, 2 Negative, 3 State-aware, 4 CRUD, 5 Business rule, 6 Field validation, 7 UI state, 8 Audit, 9 Third-party, 10 Async/race, 11 Web conditions.

| ID | Title | Priority | Steps | Expected | Type | AC | Preconditions | Test Data |
|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-001 | Valid user signs in and lands on Home | Critical | 1. Open /login<br>2. Enter User Id and Password<br>3. Click Login | URL is /HOME; Home page is shown | 1-Happy Path | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-002 | Session persists after reload on Home | High | 1. Sign in<br>2. Reload /HOME | Still on /HOME, not redirected to /login | 1-Happy Path | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-003 | Enter key submits the login form | High | 1. Open /login<br>2. Fill User Id and Password<br>3. Press Enter in Password | Login succeeds, URL is /HOME | 1-Happy Path | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-004 | Both fields empty shows 'Enter User Id' | Critical | 1. Open /login<br>2. Click Login with both fields empty | 'Enter User Id' shown; stays on /login; no token request sent | 2-Negative | AC-LOGIN-01 | Signed out | none |
| TC-LOGIN-005 | User Id filled, password empty shows 'Enter password' | Critical | 1. Open /login<br>2. Enter User Id only<br>3. Click Login | 'Enter password' shown; stays on /login | 2-Negative | AC-LOGIN-02 | Signed out | TEST_USERNAME |
| TC-LOGIN-006 | Password filled, User Id empty shows 'Enter User Id' | High | 1. Open /login<br>2. Enter Password only<br>3. Click Login | 'Enter User Id' shown; stays on /login | 2-Negative | AC-LOGIN-01 | Signed out | TEST_PASSWORD |
| TC-LOGIN-007 | Wrong password via Enter shows generic toast | Critical | 1. Open /login<br>2. Enter valid User Id and a wrong password<br>3. Press Enter | Toast 'The credentials you entered are incorrect'; stays on /login | 2-Negative | AC-LOGIN-03 | Signed out | TEST_USERNAME, invalid password literal from test-data |
| TC-LOGIN-008 | Unknown User Id gives the same generic message | High | 1. Enter a non-existent User Id and any password<br>2. Press Enter | Same toast as wrong password; message does not say which field is wrong | 5-Business Rule | AC-LOGIN-03 | Signed out | invalid user from test-data |
| TC-LOGIN-009 | Server 400 on bad credentials is shown in plain language | Medium | 1. Submit wrong credentials<br>2. Inspect network and UI | oauth2/token returns 400; UI shows only the friendly toast, no raw JSON/stack | 2-Negative | AC-LOGIN-03 | Signed out | invalid user from test-data |
| TC-LOGIN-010 | Email format validation on User Id (Assumption, CONFLICT) | Low | 1. Enter 'abc' (not an email) as User Id and any password<br>2. Click Login | Document expects a format error; live app is expected to give the credentials toast. Record actual | 2-Negative | BR-003 | Assumption: GAP-010 conflict | invalid user from test-data |
| TC-LOGIN-011 | Password is masked | High | 1. Type text in Password<br>2. Inspect field | Field type is password; characters shown as dots | 6-Field Validation | AC-LOGIN-06 | Signed out | TEST_PASSWORD |
| TC-LOGIN-012 | Password visibility toggle (Assumption) | Low | 1. Type in Password<br>2. Click the visibility icon if present<br>3. Click again | Value revealed then masked again; icon has an accessible name | 6-Field Validation | AC-LOGIN-06 | Assumption: GAP-001 | TEST_PASSWORD |
| TC-LOGIN-013 | Leading/trailing spaces in User Id are handled | Medium | 1. Enter ' TEST_USERNAME ' with surrounding spaces and valid password<br>2. Click Login | Either trimmed and logged in, or generic error; no server error. Record behaviour | 6-Field Validation | BR-001 | Signed out | TEST_USERNAME with spaces |
| TC-LOGIN-014 | Very long input (500+ chars) is handled | Medium | 1. Paste 500 chars into User Id and Password<br>2. Click Login | No crash or 5xx; generic error or maxlength limit; layout intact | 6-Field Validation | BR-001, BR-002 | Signed out | generated string |
| TC-LOGIN-015 | Special/Unicode characters, SQL and script text are safe | High | 1. Enter `' OR 1=1 --` as User Id and `<script>alert(1)</script>` as Password<br>2. Submit<br>3. Repeat with Unicode text | Rejected with generic message; no script runs; no 5xx; input not reflected unescaped | 11-Web Conditions | BR-008 | Assumption: GAP-013 | injection strings |
| TC-LOGIN-016 | Login button is disabled/guarded during request | High | 1. Slow the token call with a route delay<br>2. Click Login<br>3. Try to click again | Button disabled or loader shown while pending; only one token request | 3-State-Aware | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-017 | Form recovers after a failed login without reload | High | 1. Submit wrong credentials<br>2. Correct the password<br>3. Click Login | Button re-enabled after error; second attempt succeeds | 3-State-Aware | AC-LOGIN-03 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-018 | Double-click on Login sends one token request | High | 1. Fill valid credentials<br>2. Double-click Login<br>3. Inspect network | One oauth2/token request (or one session); no duplicate or error | 10-Async/Race | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-019 | Navigate away while login is pending | Medium | 1. Delay the token call<br>2. Click Login<br>3. Open /login in the same tab again | No broken state; either signed in or on a clean login page | 10-Async/Race | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-020 | Logout from avatar menu | Critical | 1. Sign in<br>2. Click avatar<br>3. Choose Logout | Redirected to /login; toast 'Success: Logout Successfully' | 1-Happy Path | AC-LOGIN-05 | Signed in | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-021 | After logout /HOME cannot be opened | Critical | 1. Log out<br>2. Open /HOME directly | Redirected to /login | 5-Business Rule | AC-LOGIN-05, BR-007 | Logged out | none |
| TC-LOGIN-022 | Each protected URL redirects to /login when signed out | High | 1. With no session open /MY_PROFILE, /NOTIFICATIONS, /ABOUT_US in turn | Each redirects to /login, no data shown | 2-Negative | BR-007 | No session | none |
| TC-LOGIN-023 | Browser Back after logout does not show protected content | High | 1. Sign in and go to /HOME<br>2. Log out<br>3. Press Back | Login page or redirect to /login; no protected data visible | 11-Web Conditions | AC-LOGIN-05 | Signed in | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-024 | Session cleared mid-flow redirects to login | High | 1. Sign in, open /NOTIFICATIONS<br>2. Clear cookies and storage<br>3. Click a nav item | Redirect to /login; no raw 401 shown | 11-Web Conditions | BR-007 | Signed in | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-025 | Logout in one tab, other tab acts on stale session | Medium | 1. Sign in in tab A, open tab B on /HOME<br>2. Log out in A<br>3. Click a nav item in B | B redirects to /login gracefully | 10-Async/Race | BR-007 | Signed in | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-026 | Back after successful login | Medium | 1. Sign in<br>2. Press Back | No resubmitted login, no stale form with password; app stays usable (Assumption on target page) | 11-Web Conditions | AC-LOGIN-04 | Assumption | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-027 | Refresh on /login keeps the page and clears fields | Low | 1. Type in fields<br>2. Reload | Login page loads; password not retained | 11-Web Conditions | AC-LOGIN-06 | Signed out | none |
| TC-LOGIN-028 | Signed-in user opening /login (Assumption) | Low | 1. Sign in<br>2. Open /login directly | Redirected to /HOME or login page shown; record behaviour, no error | 2-Negative | AC-LOGIN-04 | Assumption: not documented | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-029 | No credentials or tokens in the URL | High | 1. Sign in and watch URL through redirects<br>2. Submit failed login | No username/password/token in any URL or query string | 11-Web Conditions | BR-009 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-030 | Password not written to console or request logs (Assumption) | Medium | 1. Sign in with console and network open<br>2. Inspect console and URLs | Password not logged to console; not in URL. Payload only in token POST body | 11-Web Conditions | BR-009 | Assumption: BR-009 not verified | TEST_PASSWORD |
| TC-LOGIN-031 | Login failures leave an audit trail (Assumption) | Low | 1. Submit a failed login<br>2. Look for any activity/audit view | Not exposed to User role: record as GAP; no case fails | 8-Audit | BR-008 | Assumption: GAP-003 | none |
| TC-LOGIN-032 | Forgot Password, Forgot User ID, Activate Account links are present (Assumption) | Medium | 1. Open /login<br>2. Locate the three links<br>3. Click Forgot Password once, do not submit anything | Links visible and keyboard reachable; no mail sent; record what happens | 9-Third-Party | GAP-002 | Assumption: flows send real mail | none |
| TC-LOGIN-033 | Entered User Id survives a failed attempt | Low | 1. Enter User Id and wrong password<br>2. Submit | User Id still filled; password handling recorded | 7-UI State | AC-LOGIN-03 | Signed out | TEST_USERNAME |
| TC-LOGIN-034 | Offline during login shows a plain error | High | 1. Go offline<br>2. Click Login with valid credentials<br>3. Go online and retry | Friendly error, no crash; retry succeeds | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-035 | Token API returns 500 | High | 1. Route oauth2/token to 500<br>2. Click Login | Plain-language error; no raw response; button re-enabled | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-036 | Login on slow network | Medium | 1. Throttle to slow 3G<br>2. Sign in | Loader/disabled state shown; login completes | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-037 | Keyboard-only sign in | High | 1. Tab through the form<br>2. Type credentials<br>3. Press Enter | Logical tab order; focus visible; login works | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-038 | axe WCAG 2 A/AA scan of /login | High | 1. Open /login<br>2. Run axe (wcag2a, wcag2aa) | No critical/serious violations; every input has a label | 11-Web Conditions | AC-LOGIN-06 | Signed out | none |
| TC-LOGIN-039 | Validation and toast errors are announced and labelled | Medium | 1. Trigger 'Enter User Id'<br>2. Inspect error association and toast role | Error tied to field or live region; contrast acceptable | 11-Web Conditions | AC-LOGIN-01 | Signed out | none |
| TC-LOGIN-040 | Login on mobile 390x844 | High | 1. Set viewport 390x844<br>2. Open /login and sign in | No clipping or overlap; sign in works | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-041 | Login on tablet 820x1180 | Medium | 1. Set viewport 820x1180<br>2. Open /login and sign in | Layout intact; sign in works | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-042 | Login on desktop 1440x900 | Medium | 1. Set viewport 1440x900<br>2. Open /login and sign in | Layout intact; sign in works | 11-Web Conditions | AC-LOGIN-04 | Signed out | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-043 | Critical login flow on every configured browser | High | 1. Run TC-LOGIN-001, 007, 020 on chromium | Same results; record browser differences (only chromium configured) | 11-Web Conditions | AC-LOGIN-04 | project.json browsers | TEST_USERNAME / TEST_PASSWORD |
| TC-LOGIN-044 | Login page content vs document (Assumption, CONFLICT) | Low | 1. Open /login<br>2. Compare labels and links to US_001 | Record 'User Id' vs 'Email', Home vs Dashboard, extra links (GAP-010/011/012) | 5-Business Rule | BR-003 | Assumption: stakeholder decision pending | none |

## Coverage

| AC | Cases |
|---|---|
| AC-LOGIN-01 | TC-LOGIN-004, 006, 039 |
| AC-LOGIN-02 | TC-LOGIN-005 |
| AC-LOGIN-03 | TC-LOGIN-007, 008, 009, 017, 033 |
| AC-LOGIN-04 | TC-LOGIN-001, 002, 003, 016, 018, 034, 035, 037, 040 |
| AC-LOGIN-05 | TC-LOGIN-020, 021, 023 |
| AC-LOGIN-06 | TC-LOGIN-011, 012, 027, 038 |

Not coverable: password policy, locked/inactive accounts, session timeout length, other roles (GAP-003, GAP-004), and the real mail flows (GAP-002).
