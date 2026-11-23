# Test Plan — My Profile

- **Module:** My Profile (`my-profile`) — **Pages:** My Profile `/MY_PROFILE`
- **Roles:** User (TEST_USERNAME / TEST_PASSWORD) — **Browsers:** chromium
- **ACs covered:** AC-PROFILE-01 (BR-011)
- **Assumptions:** Profile is read-only (create/update/delete: no). Fields observed: name, gender, date of birth, mobile, email, address, role label ('Branch Origination Officer'). Expected values are compared to what the account shows, never stored in the plan. Test types: 1 Happy, 2 Negative, 4 CRUD (read), 5 Business rule, 6 Field validation, 7 UI state, 10 Async/race, 11 Web conditions.

| ID | Title | Priority | Steps | Expected | Type | AC | Preconditions | Test Data |
|---|---|---|---|---|---|---|---|---|
| TC-PROFILE-001 | My Profile opens from side navigation | Critical | 1. Sign in<br>2. Click My Profile | URL is /MY_PROFILE; profile form shown | 1-Happy Path | AC-HOME-01 | Signed in as User | TEST_USERNAME / TEST_PASSWORD |
| TC-PROFILE-002 | My Profile opens from the avatar menu | High | 1. Click avatar<br>2. Click My Profile | URL is /MY_PROFILE | 1-Happy Path | AC-HOME-02 | Signed in | TEST_USERNAME |
| TC-PROFILE-003 | All profile fields are disabled | Critical | 1. Open /MY_PROFILE<br>2. Check each field's disabled state | Name, gender, DOB, mobile, email, address (and any other field) are disabled | 5-Business Rule | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-004 | Typing into a profile field has no effect | High | 1. Click each field<br>2. Try typing | No text entered; no value change | 2-Negative | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-005 | No Save/Edit action is offered | Medium | 1. Look for Save, Edit, Update or Delete controls | None present (or any present is disabled) | 5-Business Rule | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-006 | Expected profile fields are all displayed | High | 1. Read all field labels | Name, gender, date of birth, mobile, email, address and role label are present | 4-CRUD | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-007 | Profile data is real, not placeholder | High | 1. Read values<br>2. Compare name with the avatar menu name | Values are non-empty; name matches avatar menu; no 'undefined'/'null' | 4-CRUD | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-008 | Role label matches the account | Medium | 1. Read role label | 'Branch Origination Officer' is shown (Assumption: test account's label) | 4-CRUD | AC-PROFILE-01 | Assumption: label observed once | TEST_USERNAME |
| TC-PROFILE-009 | Field formats are valid | Medium | 1. Check mobile, email, DOB values | Email looks like an email, mobile numeric, DOB readable date | 6-Field Validation | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-010 | Long address and special characters display fully | Low | 1. Read address field | Text not truncated unreadably; special characters render correctly | 6-Field Validation | AC-PROFILE-01 | Assumption: depends on account data | TEST_USERNAME |
| TC-PROFILE-011 | Data persists after reload and re-login | High | 1. Note displayed values<br>2. Reload<br>3. Log out and sign in<br>4. Reopen /MY_PROFILE | Same values every time | 1-Happy Path | AC-PROFILE-01 | Signed in | TEST_USERNAME / TEST_PASSWORD |
| TC-PROFILE-012 | Profile data comes from the API | Medium | 1. Capture the profile API response<br>2. Compare with display | Displayed values equal the response | 4-CRUD | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-013 | Profile of the signed-in user only | High | 1. Open /MY_PROFILE<br>2. Inspect requests for user identifiers | No other user's data is shown; identifier not editable in URL (Assumption: no id in URL) | 2-Negative | AC-PROFILE-01 | Assumption | TEST_USERNAME |
| TC-PROFILE-014 | /MY_PROFILE when signed out | Critical | 1. With no session open /MY_PROFILE | Redirect to /login | 2-Negative | AC-HOME-03 | No session | none |
| TC-PROFILE-015 | Session cleared on profile page | High | 1. Open /MY_PROFILE<br>2. Clear cookies/storage<br>3. Click Home | Redirect to /login, no raw 401, profile data not retained on screen | 11-Web Conditions | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-PROFILE-016 | Logout invalidates profile access | High | 1. Log out<br>2. Press Back | Login shown or redirect; no profile data visible | 11-Web Conditions | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-PROFILE-017 | Refresh and direct URL when signed in | High | 1. Open /MY_PROFILE by address<br>2. Reload | Profile loads each time | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-018 | Back/forward between Home and Profile | Medium | 1. Home, Profile<br>2. Back, Forward | History and nav highlight correct | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-019 | Profile API returns 500 | High | 1. Route profile API to 500<br>2. Open /MY_PROFILE | Plain-language error; no raw response; no empty form shown as if valid | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-020 | Profile API returns 403/404 | Medium | 1. Route profile API to 403<br>2. Open page | Friendly message, shell still works | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-021 | Offline and slow network | Medium | 1. Throttle slow 3G and open the page<br>2. Go offline, reload<br>3. Go online | Loader while pending; error offline; recovers | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-022 | Navigate away while the profile loads | Low | 1. Click My Profile<br>2. Immediately click Notifications | Ends on Notifications, no stale profile or error | 10-Async/Race | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-023 | Two tabs open on profile | Low | 1. Open profile in tabs A and B<br>2. Log out in A<br>3. Reload B | B redirects to /login | 10-Async/Race | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-PROFILE-024 | Nav highlight stays on My Profile | Low | 1. Open My Profile<br>2. Click in the page | My Profile stays active | 7-UI State | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-025 | Disabled fields keep state across a breakpoint resize | Low | 1. Open profile at 1440 wide<br>2. Resize to 390 and back | Values shown, fields still disabled | 7-UI State | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-026 | Keyboard and screen-reader labels | High | 1. Tab through the page<br>2. Inspect labels of each field | Each field has an accessible label; disabled fields readable; focus visible | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-027 | axe WCAG 2 A/AA scan | High | 1. Run axe on /MY_PROFILE | No critical/serious violations; contrast of disabled text noted | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-028 | Mobile 390x844 layout | High | 1. Set 390x844<br>2. Open profile | Fields stack, no clipping or horizontal scroll | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-029 | Tablet 820x1180 layout | Medium | 1. Set 820x1180<br>2. Open profile | Layout intact | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-030 | Desktop 1440x900 layout | Medium | 1. Set 1440x900<br>2. Open profile | Layout intact | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |
| TC-PROFILE-031 | Profile on every configured browser | Medium | 1. Run TC-PROFILE-001, 003 on chromium | Same result; record differences | 11-Web Conditions | AC-PROFILE-01 | project.json browsers | TEST_USERNAME |
| TC-PROFILE-032 | Profile data not exposed in URL or console | Medium | 1. Open profile with console and URL watched | No personal data in URL; no sensitive data logged | 11-Web Conditions | AC-PROFILE-01 | Signed in | TEST_USERNAME |

## Coverage

| AC | Cases |
|---|---|
| AC-PROFILE-01 | TC-PROFILE-003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 017, 019, 020, 021, 025, 026, 027, 028–032 |

Related ACs also touched: AC-HOME-01 (001, 018, 022, 024), AC-HOME-02 (002), AC-HOME-03 (014, 015, 016, 023).
Not coverable: edit of profile (not offered by the app); audit of profile views (not exposed).
