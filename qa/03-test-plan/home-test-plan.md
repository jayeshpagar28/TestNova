# Test Plan — Home

- **Module:** Home (`home`) — **Pages:** Home `/HOME` (also shell: top bar, side navigation, avatar menu)
- **Roles:** User (TEST_USERNAME / TEST_PASSWORD) — **Browsers:** chromium
- **ACs covered:** AC-HOME-01, AC-HOME-02, AC-HOME-03 (BR for nav via /admin/sidemenu/list)
- **Assumptions:** No requirements exist for Home content (GAP-005, 006, 008, 009). Cases on alerts, badges, Savings Application, Change Password and Change Language are `Assumption`. Notes.md is empty; to be safe no case submits a Savings Application, changes the password, or changes the language permanently. Test types: 1 Happy, 2 Negative, 3 State-aware, 4 CRUD, 5 Business rule, 6 Field validation, 7 UI state, 8 Audit, 9 Third-party, 10 Async/race, 11 Web conditions.

| ID | Title | Priority | Steps | Expected | Type | AC | Preconditions | Test Data |
|---|---|---|---|---|---|---|---|---|
| TC-HOME-001 | Home loads after sign-in with top bar, side nav and alerts | Critical | 1. Sign in<br>2. Observe /HOME | Top bar, side nav, 'Alerts & Internal Updates' with All/Important tabs and 'Savings Application' button are visible | 1-Happy Path | AC-HOME-01 | Signed in as User | TEST_USERNAME / TEST_PASSWORD |
| TC-HOME-002 | Side navigation reaches every page | Critical | 1. Click My Profile<br>2. Click Notifications<br>3. Click About Us<br>4. Click Home | URLs are /MY_PROFILE, /NOTIFICATIONS, /ABOUT_US, /HOME with matching page content | 1-Happy Path | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-003 | Avatar menu lists the expected items | High | 1. Click avatar | Menu shows user name, My Profile, Change Password, Change Language, Logout | 1-Happy Path | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-HOME-004 | Avatar menu My Profile opens the profile page | Medium | 1. Click avatar<br>2. Click My Profile | URL is /MY_PROFILE | 1-Happy Path | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-HOME-005 | Logout from the avatar menu | High | 1. Click avatar<br>2. Click Logout | Redirect to /login with logout toast | 1-Happy Path | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-HOME-006 | /HOME without a session redirects to login | Critical | 1. With no session open /HOME | Redirect to /login | 2-Negative | AC-HOME-03 | No session | none |
| TC-HOME-007 | Side menu shows only role-permitted items | High | 1. Sign in as User<br>2. Read side nav entries | Exactly Home, My Profile, Notifications, About Us (from sidemenu API) | 5-Business Rule | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-008 | Side menu comes from the API, not static | Medium | 1. Capture /admin/sidemenu/list response<br>2. Compare with menu labels | Labels and routes match the response | 4-CRUD | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-009 | Alerts list shows real data (Assumption) | High | 1. Open /HOME<br>2. Read alerts under All | Items have real text/dates, not placeholders; or an explicit empty state | 4-CRUD | GAP-006 | Assumption: no doc | TEST_USERNAME |
| TC-HOME-010 | Switching All / Important tabs (Assumption) | Medium | 1. Click Important<br>2. Click All | Active tab highlighted; list changes accordingly; no error | 7-UI State | GAP-006 | Assumption | TEST_USERNAME |
| TC-HOME-011 | Active tab persists after clicking elsewhere | Low | 1. Select Important<br>2. Click blank area / open and close avatar menu | Important stays selected | 7-UI State | GAP-006 | Assumption | TEST_USERNAME |
| TC-HOME-012 | Active nav item is highlighted and stays so | Medium | 1. Click Notifications<br>2. Click elsewhere on page<br>3. Go Back | Active item highlighted correctly each time | 7-UI State | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-013 | Alerts and Notification badges are consistent (Assumption) | Medium | 1. Read badge counts on /HOME<br>2. Open /NOTIFICATIONS and read Unread count | Badge value matches unread total, or difference is explained. Do not mark as read | 5-Business Rule | GAP-006 | Assumption | TEST_USERNAME |
| TC-HOME-014 | Savings Application button opens its flow, then cancel (Assumption) | Medium | 1. Click Savings Application<br>2. Observe, then cancel/back without saving | A form or page opens; leaving it creates no application | 3-State-Aware | GAP-005 | Assumption: not clicked before; do not submit | TEST_USERNAME |
| TC-HOME-015 | Savings Application double-click opens once (Assumption) | Medium | 1. Double-click Savings Application | One view/dialog opens; no duplicate or error | 10-Async/Race | GAP-005 | Assumption | TEST_USERNAME |
| TC-HOME-016 | Change Password dialog opens and cancels without saving (Assumption) | Medium | 1. Click avatar then Change Password<br>2. Submit empty<br>3. Cancel | Required-field errors; Cancel closes with no password change. Never submit a new password | 6-Field Validation | GAP-008 | Assumption: write action not approved | TEST_USERNAME |
| TC-HOME-017 | Change Language lists languages from the API (Assumption) | Low | 1. Click avatar then Change Language<br>2. Read options<br>3. Close without selecting | Options are populated, not empty; closing changes nothing | 6-Field Validation | GAP-008 | Assumption | TEST_USERNAME |
| TC-HOME-018 | Rapid clicks on avatar and nav items | Low | 1. Click avatar five times<br>2. Click Notifications three times quickly | Menu toggles cleanly; one navigation; no console error | 10-Async/Race | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-HOME-019 | Navigating away during page load | Low | 1. Click About Us<br>2. Immediately click My Profile | Ends on /MY_PROFILE with full content, no broken state | 10-Async/Race | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-020 | Session cleared mid-flow on Home | High | 1. On /HOME clear cookies/storage<br>2. Click Notifications | Redirect to /login, no raw 401 | 11-Web Conditions | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-HOME-021 | Refresh keeps /HOME and the session | High | 1. Reload /HOME | Home renders again; side nav present | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-022 | Back/forward through nav pages | Medium | 1. Visit Home, Profile, Notifications<br>2. Press Back twice, then Forward | URL and highlighted nav item track each step | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-023 | Direct URL to /HOME signed in | Medium | 1. Sign in<br>2. Open /HOME typed in the address bar | Page loads directly | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-024 | Side menu API returns 500 | High | 1. Route /admin/sidemenu/list to 500<br>2. Reload /HOME | Plain-language error or fallback; no blank white page or raw error | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-025 | API returns 401 mid-session | Medium | 1. Route sidemenu to 401<br>2. Reload | Redirect to /login, no raw 401 | 11-Web Conditions | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-HOME-026 | Offline while navigating | Medium | 1. Go offline<br>2. Click Notifications<br>3. Go online and retry | Clear error; recovers after reconnect | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-027 | Home on slow network | Low | 1. Throttle to slow 3G<br>2. Sign in | Loading indicators; content eventually shown; no timeouts | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-028 | Home content inside a frame (Assumption) | Medium | 1. Inspect /HOME DOM for iframes<br>2. Interact with alert tabs | Controls reachable by role/name; note frame handling for automation | 11-Web Conditions | GAP-009 | Assumption: GAP-009 | TEST_USERNAME |
| TC-HOME-029 | Alert text rendered safely (Assumption) | Medium | 1. Review alert items for markup | Text shown as text, no script execution | 11-Web Conditions | GAP-006 | Assumption | TEST_USERNAME |
| TC-HOME-030 | Keyboard operation of nav, tabs and avatar menu | High | 1. Tab through top bar, side nav, tabs<br>2. Open avatar menu with Enter<br>3. Close with Escape | Logical focus order, visible focus, Escape closes menu | 11-Web Conditions | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-HOME-031 | axe WCAG 2 A/AA scan of /HOME | High | 1. Run axe on /HOME | No critical/serious violations; icon buttons (avatar, bell) have accessible names | 11-Web Conditions | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-HOME-032 | Home on mobile 390x844 | High | 1. Set 390x844<br>2. Sign in, open nav | Side nav collapses to a menu; open menu stays usable; nothing clipped | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-033 | Home on tablet 820x1180 | Medium | 1. Set 820x1180<br>2. Open /HOME | Layout intact, nav reachable | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-034 | Home on desktop 1440x900 | Medium | 1. Set 1440x900<br>2. Open /HOME | Full layout, no overlap | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-035 | Nav/tab state survives crossing a breakpoint | Medium | 1. Select Important tab at 1440 wide<br>2. Resize to 390 wide and back | Selected tab and current page remain | 7-UI State | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-HOME-036 | Home critical flow on every configured browser | High | 1. Run TC-HOME-001, 002, 003 on chromium | Same results; note browser differences | 11-Web Conditions | AC-HOME-01 | project.json browsers | TEST_USERNAME |
| TC-HOME-037 | Alert view history/audit is not exposed (Assumption) | Low | 1. Look for any activity log on Home | If absent, record GAP; no data change | 8-Audit | GAP-006 | Assumption | TEST_USERNAME |
| TC-HOME-038 | Digilocker/third-party links in alerts (Assumption) | Low | 1. If an alert links externally, check it opens safely without acting | Link opens in new tab or same tab as designed; no data sent. Otherwise record GAP | 9-Third-Party | GAP-006 | Assumption | TEST_USERNAME |

## Coverage

| AC | Cases |
|---|---|
| AC-HOME-01 | TC-HOME-001, 002, 007, 008, 012, 019, 021, 022, 023, 024, 026, 027, 032–036 |
| AC-HOME-02 | TC-HOME-003, 004, 005, 018, 030, 031 |
| AC-HOME-03 | TC-HOME-006, 020, 025 |

Not coverable: meaning of badges, Important tab, View All, Savings Application, Change Password and Language outcomes (GAP-005/006/008); no documented requirements.
