# Exploratory results — Home

- **URL:** https://sahyogagentweb.drutam.in:9634/HOME · **Environment:** QA · **Build:** not exposed · **Browser:** Chromium · **Viewports:** 1280x720, 390x844, 820x1180, 1440x900 · **Date:** 2026-11-04 · **Role:** User (TEST_USERNAME)
- Tool limits as in login-results.md (no route/offline/throttle/axe/second tab).

| Test Case ID | Test Name | Status | Actual Result | Deviation | Screenshot |
|---|---|---|---|---|---|
| TC-HOME-001 | Home loads with top bar, nav, alerts | Pass | Top bar (date, Alerts 1, Notification 15, avatar N), nav, "Alerts & Internal Updates" All/Important, View All, Savings Application | — | |
| TC-HOME-002 | Side nav reaches every page | Pass | /MY_PROFILE, /NOTIFICATIONS, /ABOUT_US, /HOME with matching content | — | |
| TC-HOME-003 | Avatar menu items | Pass | Name, My Profile, Change Password, Change Language, Logout | — | evidence/home/US002_AC-HOME-02_avatar-menu.png |
| TC-HOME-004 | Avatar My Profile opens profile | Blocked | Not run | | |
| TC-HOME-005 | Logout from avatar menu | Pass | /login + "Success: Logout Successfully" | — | |
| TC-HOME-006 | /HOME without session | Pass | Redirect to /login | — | |
| TC-HOME-007 | Side menu role items | Pass | Exactly Home, My Profile, Notifications, About Us | — | |
| TC-HOME-008 | Side menu from API | Pass | /admin/sidemenu/list 200; stored masterMenuList entries match labels and paths | — | |
| TC-HOME-009 | Alerts real data | Pass | One alert with real title and date 18-09-2025 | — | |
| TC-HOME-010 | All / Important tabs | Pass | Important highlighted, showed the same single alert; no error | Cannot tell Important from All with this data | |
| TC-HOME-011 | Active tab persists after clicks | Blocked | Not run | | |
| TC-HOME-012 | Active nav item highlighted and stays | Fail | Highlight comes from stored `selectedMenuIndex`, not URL: after a direct URL load the previous item stays highlighted | BUG-006 | evidence/about-us/BUG-006_stale-nav-highlight.png |
| TC-HOME-013 | Badges consistent | Pass | Notification badge 15 equals Unread tab total (3 pages of 5). Alerts badge 1 equals alert count | Alerts badge disappears on other pages after a full load (BUG-004) | |
| TC-HOME-014 | Savings Application opens, then leave | Pass | Opened /UNPOSTED application list (Pending/Submitted/Re-Assigned/Decisioned, New Application button); nothing created; Back returned to /HOME | Route not in side menu; real applicant data visible | |
| TC-HOME-015 | Savings Application double-click | Blocked | Not run (page opens a real application list) | | |
| TC-HOME-016 | Change Password page, empty submit | Pass | It is a page /CHANGE_PASSWORD, not a dialog. Empty submit: "Enter current password", "Enter new password", "Enter confirm password". No Cancel control. No password submitted | Plan assumed dialog with Cancel (plan corrected). All three fields have the identical accessible name "Password" (BUG-008) | |
| TC-HOME-017 | Change Language options | Pass | Page /LANGUAGE "Choose Your Language": English, मराठी (lang/list 200). Nothing selected | — | evidence/home/US002_AC-HOME-02_change-language.png |
| TC-HOME-018 | Rapid clicks avatar/nav | Blocked | Not run | | |
| TC-HOME-019 | Navigate away during load | Blocked | Not run | | |
| TC-HOME-020 | Session cleared on Home | Blocked | Covered on Notifications (TC-LOGIN-024, BUG-005) | | |
| TC-HOME-021 | Refresh keeps /HOME | Pass | Direct load of /HOME while signed in rendered the shell | — | |
| TC-HOME-022 | Back/forward through nav pages | Blocked | Only Back from /UNPOSTED to /HOME done; full sequence not run | | |
| TC-HOME-023 | Direct URL /HOME signed in | Pass | /login while signed in redirected to /HOME; page renders | — | |
| TC-HOME-024 | Side menu API 500 | Blocked | Environment: no route tool | | |
| TC-HOME-025 | API 401 mid-session | Blocked | Environment: no route tool | | |
| TC-HOME-026 | Offline navigation | Blocked | Environment: no offline tool | | |
| TC-HOME-027 | Slow network | Blocked | Environment: no throttle | | |
| TC-HOME-028 | Content in a frame | Pass | No iframes in DOM (snapshot "f1" prefix is page frame ref). Controls are reachable by text | Plan assumption wrong, corrected | |
| TC-HOME-029 | Alert text safe | Pass | Alert rendered as plain text | Only one benign alert available | |
| TC-HOME-030 | Keyboard operation | Fail | Tab cycles only between "Savings Application" and the unnamed sidebar toggle; nav items, tabs, avatar, bell, View All never receive focus. Escape does not close the avatar menu | BUG-002, BUG-003 | .playwright-mcp page capture (menu still open) |
| TC-HOME-031 | axe scan of /HOME | Blocked | Environment: axe unavailable. Manual: no h1, nav items are li without role, unnamed buttons (BUG-008) | | |
| TC-HOME-032 | Home on mobile | Pass | Nav collapses to a hamburger, drawer opens and lists 4 items, no overflow | Drawer stays open after choosing an item (BUG-007, seen on Notifications) | evidence/home/US002_AC-HOME-01_mobile-390.png |
| TC-HOME-033 | Home on tablet | Pass | Icon-only collapsed nav, layout intact | Icons have no labels/tooltips text (BUG-008) | evidence/about-us/US002_AC-HOME-01_tablet-820.png |
| TC-HOME-034 | Home on desktop 1440 | Pass | Layout intact | After a mobile open/close the sidebar stayed collapsed at 1440 (BUG-007) | |
| TC-HOME-035 | State survives breakpoint | Fail | Sidebar collapsed state (`isCollapsed` in localStorage) persisted after growing back to desktop; selected tab not retested | BUG-007 | evidence/about-us/BUG-006_stale-nav-highlight.png |
| TC-HOME-036 | Critical flow on configured browsers | Pass | Chromium only: 001, 002, 003 pass | — | |
| TC-HOME-037 | Alert audit not exposed | Pass | No activity log exposed (GAP recorded) | — | |
| TC-HOME-038 | External links in alerts | Blocked | No external link present | | |

## Findings
BUG-002, BUG-003, BUG-004, BUG-006, BUG-007, BUG-008 (see summary.md).

## Console / network signals
All application calls 200 (sidemenu/list requested twice per load; notification/list 5 calls on /UNPOSTED path). No uncaught errors. Console logs `#REQ` with userId.

## Totals: Pass 22 · Fail 3 · Blocked 13 (38 cases)
