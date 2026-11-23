# Exploratory testing summary — Sahayog [QA]

Chromium, role User, 2026-11-04. 171 cases in 5 modules. Credentials were read from `.env` only to type them; no value is recorded.

| Module | Total | Pass | Fail | Blocked |
|---|---|---|---|---|
| login | 44 | 27 | 7 | 10 |
| home | 38 | 22 | 3 | 13 |
| about-us | 19 | 11 | 1 | 7 |
| my-profile | 32 | 15 | 1 | 16 |
| notifications | 38 | 18 | 1 | 19 |
| **Total** | **171** | **93** | **13** | **65** |

## Blocked, and why (not app defects)
- **Environment — tool not exposed in this MCP session:** `browser_route` (API 4xx/5xx, delayed calls), `browser_network_state_set` (offline), network throttling, a second tab, axe scan, `browser_run_code_unsafe` and coordinate clicks (permission denied). Affects the 500/401/offline/slow/two-tab/axe cases in every module.
- **Safety:** Mark All as Read (TC-NOTIF-013..017) and opening a notification row (018) were not run because they change real data and notes.md gives no approval.
- **Not run:** a number of lower-priority cases that were not reached. They are marked "Not run" in each results file, not passed.

## Provisional bug list
| ID | Module | Title | Signal | Severity | Screenshot |
|---|---|---|---|---|---|
| BUG-001 | login | Different toast for valid User Id + wrong password reveals valid accounts | oauth2/token 400; toast "The password you entered is incorrect" vs "The credentials you entered are incorrect" | Medium (Security) | evidence/login/BUG-001_400_user-enumeration-toast.png |
| BUG-002 | login, home | Navigation, tabs, avatar, bell, Forgot links and password toggle cannot be reached with the keyboard (Tab cycles only Savings Application and the sidebar toggle on Home) | Tab focus recorder; `a` without href, `li`/`div` without role | High (Accessibility) | none (keyboard order) |
| BUG-003 | home | Escape does not close the avatar menu | Menu still open after Escape | Low | evidence/home/US002_AC-HOME-02_avatar-menu.png |
| BUG-004 | home, notifications | Alerts badge count shows on Home but is missing after a full page load of other pages | Snapshot shows empty Alerts badge on /NOTIFICATIONS and /ABOUT_US | Low | none |
| BUG-005 | login, notifications | Expired/cleared session redirects to /login with toast "Success: Logout Successfully" | notification/list 401 then toast | Low | none |
| BUG-006 | home, about-us | Active nav item comes from stored `selectedMenuIndex`, not the URL; wrong item highlighted after direct load | Notifications highlighted on /ABOUT_US | Medium | evidence/about-us/BUG-006_stale-nav-highlight.png |
| BUG-007 | home, notifications | Sidebar state not reset: drawer stays open after choosing an item on mobile and `isCollapsed` keeps the desktop sidebar collapsed after resizing | localStorage `isCollapsed` | Low | evidence/notifications/US002_AC-NOTIF-01_mobile-390.png |
| BUG-008 | login, home, notifications | Missing accessible names/semantics: password toggle, sidebar toggle, icon-only tablet nav, three "Password" fields with the same name on Change Password, Mark All as Read and tabs not buttons/tabs, inline validation text not tied to fields, low-contrast inactive tab | Snapshot/DOM | Medium (Accessibility) | evidence/notifications/US002_AC-NOTIF-01_unread-tab.png |
| BUG-009 | my-profile | Mobile number has 8 digits | Field value length | Low (data/validation) | evidence/my-profile/US002_AC-PROFILE-01_mobile-390.png |

## Other observations (not filed)
- JWT kept in localStorage (`token`); `#REQ` console log prints the user id on every load.
- Undocumented rules: password under 4 characters shows "Enter minimum 4 digit password"; password maxlength 20, User Id maxlength 100.
- Notification list has 416 items (84 pages at 5 per page); plan assumed 4 pages.
- Savings Application opens /UNPOSTED, a route not in the side menu; Change Password and Change Language are pages (/CHANGE_PASSWORD, /LANGUAGE), not dialogs.
- Plan corrections made in the login, home and notifications test plans.
