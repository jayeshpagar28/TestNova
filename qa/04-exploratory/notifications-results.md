# Exploratory results — Notifications

- **URL:** https://sahyogagentweb.drutam.in:9634/NOTIFICATIONS · **Environment:** QA · **Build:** not exposed · **Browser:** Chromium · **Viewports:** 1280x720, 390x844 · **Date:** 2026-11-04 · **Role:** User
- Safety: **Mark All as Read** was never clicked and no notification row was opened (real applicants, notes.md empty). The one write-risk cases are Blocked.

| Test Case ID | Test Name | Status | Actual Result | Deviation | Screenshot |
|---|---|---|---|---|---|
| TC-NOTIF-001 | Opens from side nav | Pass | /NOTIFICATIONS, tabs All/Unread, list | — | |
| TC-NOTIF-002 | At most 5 per page | Pass | 5 rows on page 1 | — | |
| TC-NOTIF-003 | Previous disabled on page 1 | Pass | Previous disabled; Next and 1 2 3 4 … offered | — | |
| TC-NOTIF-004 | Next to page 2 | Pass | 5 different rows, page 2 highlighted, Previous enabled | — | |
| TC-NOTIF-005 | Previous returns to page 1 | Blocked | Not run | | |
| TC-NOTIF-006 | Click numbered pages | Pass | Page 3 shows 5 distinct rows and highlight; pages walked sequentially via Next | Plan said pages 1-4; there are 84 pages | |
| TC-NOTIF-007 | Last page disables Next | Pass | Page 84 has 1 row and Next disabled (416 notifications at 5 per page) | — | |
| TC-NOTIF-008 | Rows show real data | Pass | Each row: initial avatar, title, text, timestamp; real applicant names | — | |
| TC-NOTIF-009 | Unread tab | Pass | Unread has 3 pages of 5 (15 items = badge) | Active tab shown only by colour; inactive tab text very low contrast | evidence/notifications/US002_AC-NOTIF-01_unread-tab.png |
| TC-NOTIF-010 | Empty Unread state | Blocked | Needs account with 0 unread | | |
| TC-NOTIF-011 | Page-size options | Pass | Options 5, 10, 20, 30; choosing 10 gave 10 rows and 2 pages; Escape closed the dropdown | — | |
| TC-NOTIF-012 | Mark All as Read visible | Pass | Visible, not clicked | It is plain text (no button role) (BUG-008) | |
| TC-NOTIF-013 | @live Mark All clears unread | Blocked | Write action, no approval | | |
| TC-NOTIF-014 | @live badges update | Blocked | Depends on 013 | | |
| TC-NOTIF-015 | @live button during request | Blocked | Write action | | |
| TC-NOTIF-016 | @live API failure | Blocked | Write action; no route tool | | |
| TC-NOTIF-017 | @live audit entry | Blocked | Depends on 013 | | |
| TC-NOTIF-018 | Opening a row | Blocked | Not clicked: may mark real notification as read | | |
| TC-NOTIF-019 | Digilocker text | Pass | Text readable and consistent; no external link followed | — | |
| TC-NOTIF-020 | Active tab persists when paging | Blocked | Not run | | |
| TC-NOTIF-021 | Page after Back/Forward | Blocked | Not run | | |
| TC-NOTIF-022 | Paging state across resize | Blocked | Not run | | |
| TC-NOTIF-023 | Rapid Next clicks | Pass | 83 rapid Next clicks (250 ms) ended consistently on page 84 with correct rows | Not a true click burst | |
| TC-NOTIF-024 | Navigate away during load | Blocked | Not run | | |
| TC-NOTIF-025 | Two tabs | Blocked | Environment: single tab | | |
| TC-NOTIF-026 | Signed out | Pass | Redirect to /login | — | |
| TC-NOTIF-027 | Session cleared while paging | Fail | Next after clearing storage: notification/list 401, redirect to /login, no raw 401, but toast "Success: Logout Successfully" | BUG-005. Also nav labels disappeared from the shell before redirect | |
| TC-NOTIF-028 | Refresh and direct URL | Pass | Direct load shows page 1, 5 rows (page number is not kept on reload) | — | |
| TC-NOTIF-029 | Notifications API 500 | Blocked | Environment: no route tool | | |
| TC-NOTIF-030 | Paging request fails | Blocked | Environment: no route tool | | |
| TC-NOTIF-031 | Offline and slow | Blocked | Environment: no offline/throttle | | |
| TC-NOTIF-032 | Safe rendering | Pass | Text only, no markup shown | — | |
| TC-NOTIF-033 | Keyboard operation | Blocked | Not run on this page | | |
| TC-NOTIF-034 | axe scan | Blocked | Environment: axe unavailable | | |
| TC-NOTIF-035 | Mobile 390x844 | Pass | No overflow; list readable. Drawer stayed open over content after choosing Notifications until toggled | BUG-007 | evidence/notifications/US002_AC-NOTIF-01_mobile-390.png |
| TC-NOTIF-036 | Tablet | Blocked | Not run | | |
| TC-NOTIF-037 | Desktop | Pass | Layout intact | — | |
| TC-NOTIF-038 | Configured browsers | Pass | Chromium: 001, 002, 003 pass | — | |

## Console / network: all notification/list calls 200 except the intentional cleared-session 401. No uncaught errors.
## Totals: Pass 18 · Fail 1 · Blocked 19 (38 cases)
