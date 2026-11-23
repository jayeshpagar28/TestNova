# US_001 — Login (authentication, session, logout)

Project: Sahayog [QA], https://sahyogagentweb.drutam.in:9634/login, Chromium. Role: User (`TEST_USERNAME` / `TEST_PASSWORD`).

## Business objective
Authenticate registered users and open the portal Home page; keep unauthenticated users out. [doc: US_001_Login.md §1-2]

## Actors / preconditions
- Registered, active user. Secondary: authentication service (`/sahyogUserManagementAPI/oauth2/token`). [doc §3-4], [page: /login network]
- The Email Service for Forgot Password is named in the doc [doc §3]; not exercised, see GAP-2.

## Pages and flows walked
| Flow | URL | Observed |
|---|---|---|
| Login page load | /login | Title "Drutam Origination"; heading "Let's You Sign In!"; fields "User Id", "Password"; links "Forgot User ID ?", "Forgot Password ?", "Activate Account"; button "Login"; logos "Bank Logo" and "Netwin Logo"; password toggle icon. [page: /login] |
| Blank submit | /login | Inline text "Enter User Id"; stays on /login. [page: /login] |
| User Id filled, password blank | /login | Inline text "Enter password"; stays on /login. [page: /login] |
| Wrong credentials (Enter key) | /login | Error toast "The credentials you entered are incorrect"; stays on /login; the password field keeps its value; POST oauth2/token returned 400. [page: /login] |
| Valid credentials | /login -> /HOME | Redirect to /HOME; alerts, notifications, side menu and user data requests return 200. [page: /HOME] |
| Logout | Profile avatar -> "Logout" | Redirect to /login with toast "Success: Logout Successfully". [page] |
| Direct URL after logout | /HOME | Redirected to /login. [page] |

## Acceptance criteria (Given/When/Then — verified only)
- AC-1 Given the login page, when "Login" is clicked with both fields empty, then "Enter User Id" is shown and no session is created. [page: /login]
- AC-2 Given a User Id and an empty password, when "Login" is clicked, then "Enter password" is shown. [page: /login]
- AC-3 Given wrong credentials, when submitted by the Enter key, then the toast "The credentials you entered are incorrect" appears and the user remains on /login. It does not say which field was wrong. [page: /login] (covers BR-008, BR-010)
- AC-4 Given valid credentials, when "Login" is clicked, then the user lands on /HOME. [page: /HOME] (BR-006)
- AC-5 Given a signed-in user, when "Logout" is chosen from the profile menu, then the user returns to /login and /HOME can no longer be opened directly. [page] (BR-007)
- AC-6 The password field is masked after text is typed, shown as dots. [page: screenshot login-password-filled.png] (BR-004)

## Business rules from the document and their status
BR-001 and BR-002: verified, see AC-1 and AC-2. BR-004 is verified at the screenshot level. BR-006, BR-007 and BR-010: verified. BR-008: partially verified, see AC-3. BR-003, BR-005 and BR-009 are covered under [NOT VERIFIED] below.

## Observations
- OBS-1: After the blank-password submit, the "Enter password" message stayed visible while a value was typed into the field. Cleanup on typing was not confirmed. [page: login-password-filled.png]
- OBS-2: The console prints "Token: undefined" on the login and home pages, and prints the signed-in user id and role level in a request log on /HOME. No password was seen in the console. [page: console]
- OBS-3: Console error "Failed to load resource ... 400" for oauth2/token on the wrong-credentials attempt. It is expected for a rejected login, and the UI explained it with the toast.
- OBS-4: Clicking "Forgot Password ?" with the fields filled produced no visible change (no dialog, no navigation, URL unchanged). [page: /login]

## [CONFLICT]
- CONFLICT-1: The doc calls the first field "Email ID", with an "email" format rule (BR-003, Scenario 12), but the live label is "User Id". [doc §6, §9] vs [page: /login]
- CONFLICT-2: The doc says a successful login opens the "Dashboard". The live app lands on /HOME ("Alerts & Internal Updates", "Savings Application" button) and no page titled Dashboard was seen. [doc §1] vs [page: /HOME]
- CONFLICT-3: The doc lists Branding/Footer/Copyright and a "Forgot Password" link only. The live page also has "Forgot User ID ?" and "Activate Account", and the viewport showed no copyright text (only "Powered By"). [doc §6] vs [page: /login]
- CONFLICT-4: The doc says validation messages for the email field and a mandatory email. Live validation is "Enter User Id" (an email-format error was not observed). [doc §8] vs [page]

## [NOT VERIFIED]
- BR-003 invalid email format message (Scenario 12): not tried.
- BR-005 (authentication only after client validation): inferred from AC-1/2 and the network log showing no token call on blank submit. Only the invalid-credentials call was observed.
- BR-009 password never logged: only the console was checked; the network payload was not inspected.
- Password visibility toggle behaviour (Scenario 14, LP_TS001_TC_04).
- SQL injection, XSS, long input, whitespace, rapid clicks, offline, refresh during authentication, multi-tab, zoom/responsive.
- Browser-back restriction after login/logout, token/localStorage content, CSRF.
- Session timeout.
- Keyboard Tab order (Scenario 4).

## [GAP]
- GAP-1: The password toggle could not be clicked and the input `type` could not be read. Evaluate and coordinate-click tools were denied in this unattended run (permission mode). Need permission for those tools, or a rerun with them allowed.
- GAP-2: The Forgot Password / Forgot User ID / Activate Account flows were not completed. The only click on "Forgot Password ?" showed no change, and the email service or reset page needs a deliberate test with a mailbox, which would send real mail.
- GAP-3: Locked or inactive account behaviour, password policy, session timeout length: no such accounts or settings were available.
- GAP-4: Only one role (User) exists. The role label on /MY_PROFILE reads "Branch Origination Officer"; other roles' access is unknown.
- GAP-5: The doc's "Reusable Components" and LP_TS001_TC_0x traceability are test names, not app behaviour.

## Other note
The source doc embeds a username and password in plain text. They are not copied here; use `.env` TEST_USERNAME/TEST_PASSWORD.
