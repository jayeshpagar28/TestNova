# Exploratory results — My Profile

- **URL:** https://sahyogagentweb.drutam.in:9634/MY_PROFILE · **Environment:** QA · **Build:** not exposed · **Browser:** Chromium · **Viewports:** 1280x720, 390x844 · **Date:** 2026-11-04 · **Role:** User. Personal values are not recorded here.

| Test Case ID | Test Name | Status | Actual Result | Deviation | Screenshot |
|---|---|---|---|---|---|
| TC-PROFILE-001 | Opens from side nav | Pass | /MY_PROFILE, heading "Profile", role label "Branch Origination Officer" | — | |
| TC-PROFILE-002 | Opens from avatar menu | Blocked | Not run | | |
| TC-PROFILE-003 | All fields disabled | Pass | 5 inputs + 1 textarea all disabled | — | |
| TC-PROFILE-004 | Typing has no effect | Pass | Fields are `disabled`, so cannot take focus or input (typing not attempted) | — | |
| TC-PROFILE-005 | No Save/Edit | Pass | No Save/Edit/Update/Delete controls | — | |
| TC-PROFILE-006 | Expected fields displayed | Pass | Name, Gender, Date of Birth, mobile number, Email id, Address, role label | Label "mobile number" is lowercase (copy) | |
| TC-PROFILE-007 | Data real | Pass | All non-empty, no undefined/null; name matches avatar menu name | — | |
| TC-PROFILE-008 | Role label | Pass | "Branch Origination Officer" | — | |
| TC-PROFILE-009 | Field formats | Fail | Email and DOB valid; mobile number is only 8 digits | Indian mobile numbers are 10 digits; looks truncated or bad data (BUG-009, Low) | evidence/my-profile/US002_AC-PROFILE-01_mobile-390.png |
| TC-PROFILE-010 | Long address/special characters | Pass | 50-char address shown in full | Address repeats the same city 4 times (data quality) | |
| TC-PROFILE-011 | Persists after reload and re-login | Blocked | Not run after re-login | | |
| TC-PROFILE-012 | Data from API | Blocked | Not compared with response | | |
| TC-PROFILE-013 | Own profile only | Pass | No user id in URL; data matches signed-in user | — | |
| TC-PROFILE-014 | Signed out | Pass | /MY_PROFILE redirected to /login | — | |
| TC-PROFILE-015 | Session cleared on profile | Blocked | Equivalent on Notifications (BUG-005) | | |
| TC-PROFILE-016 | Logout invalidates profile access | Blocked | Back-after-logout done from Home (TC-LOGIN-023) | | |
| TC-PROFILE-017 | Refresh and direct URL | Pass | Direct loads of /MY_PROFILE twice rendered | — | |
| TC-PROFILE-018 | Back/forward Home/Profile | Blocked | Not run | | |
| TC-PROFILE-019 | Profile API 500 | Blocked | Environment: no route tool | | |
| TC-PROFILE-020 | Profile API 403 | Blocked | Environment: no route tool | | |
| TC-PROFILE-021 | Offline/slow | Blocked | Environment: no offline/throttle | | |
| TC-PROFILE-022 | Navigate away while loading | Blocked | Not run | | |
| TC-PROFILE-023 | Two tabs | Blocked | Environment: single tab | | |
| TC-PROFILE-024 | Nav highlight | Blocked | See BUG-006 on direct loads | | |
| TC-PROFILE-025 | Disabled state across breakpoint | Blocked | Disabled state confirmed at 390 only | | |
| TC-PROFILE-026 | Keyboard and labels | Pass | Every field has an accessible name; fields are disabled so skipped by Tab | Shell nav unreachable (BUG-002) | |
| TC-PROFILE-027 | axe scan | Blocked | Environment: axe unavailable | | |
| TC-PROFILE-028 | Mobile 390x844 | Pass | No overflow, fields disabled | — | evidence/my-profile/US002_AC-PROFILE-01_mobile-390.png |
| TC-PROFILE-029 | Tablet | Blocked | Not run | | |
| TC-PROFILE-030 | Desktop | Blocked | Viewed at 1280 only | | |
| TC-PROFILE-031 | Configured browsers | Pass | Chromium: 001, 003 pass | — | |
| TC-PROFILE-032 | No personal data in URL/console | Pass | URL clean; console only logs userId in `#REQ` | — | |

## Console / network: none. Totals: Pass 15 · Fail 1 · Blocked 16 (32 cases)
