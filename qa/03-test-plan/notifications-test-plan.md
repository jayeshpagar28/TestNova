# Test Plan — Notifications

- **Module:** Notifications (`notifications`) — **Pages:** Notifications `/NOTIFICATIONS`
- **Roles:** User (TEST_USERNAME / TEST_PASSWORD) — **Browsers:** chromium
- **ACs covered:** AC-NOTIF-01 (BR-012)
- **Assumptions:** Notifications reference real applicants (Digilocker submissions). **Mark All as Read changes real data** and notes.md is empty, so every case that clicks it is tagged `@live`, is Assumption-based (GAP-007) and runs only with explicit approval for the test account; all other cases are read-only. No case deletes anything. Test types: 1 Happy, 2 Negative, 3 State-aware, 4 CRUD, 5 Business rule, 7 UI state, 8 Audit, 9 Third-party, 10 Async/race, 11 Web conditions.

| ID | Title | Priority | Steps | Expected | Type | AC | Preconditions | Test Data |
|---|---|---|---|---|---|---|---|---|
| TC-NOTIF-001 | Notifications page opens from side navigation | Critical | 1. Sign in<br>2. Click Notifications | URL is /NOTIFICATIONS; list and All/Unread tabs shown | 1-Happy Path | AC-HOME-01 | Signed in as User | TEST_USERNAME / TEST_PASSWORD |
| TC-NOTIF-002 | At most 5 records are shown per page | Critical | 1. Open /NOTIFICATIONS<br>2. Count rows on page 1 | 5 or fewer rows | 5-Business Rule | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-003 | Previous is disabled on page 1 | Critical | 1. Open /NOTIFICATIONS<br>2. Check Previous | Previous is disabled; Next and page numbers offered | 3-State-Aware | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-004 | Next moves to page 2 | High | 1. Click Next (or page 2) | Page 2 shows a different set of up to 5 rows; Previous now enabled | 1-Happy Path | AC-NOTIF-01 | Signed in; more than 5 records | TEST_USERNAME |
| TC-NOTIF-005 | Previous returns to page 1 | High | 1. Go to page 2<br>2. Click Previous | Page 1 rows shown; Previous disabled again | 3-State-Aware | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-006 | Click each numbered page | Medium | 1. Click pages 1 to 4 in turn | Each shows up to 5 rows; current page highlighted; no overlap or gaps between pages | 4-CRUD | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-007 | Last page disables Next (Assumption) | Medium | 1. Navigate to the last page | Next disabled; last page may hold fewer than 5 rows | 3-State-Aware | AC-NOTIF-01 | Assumption: GAP-007 | TEST_USERNAME |
| TC-NOTIF-008 | Notification rows show real data | High | 1. Read rows on page 1 | Each row has text/date; mentions applicants/Digilocker; no placeholder | 4-CRUD | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-009 | Unread tab lists only unread items (Assumption) | High | 1. Click Unread tab<br>2. Compare with All | Subset of All; rows marked unread; at most 5 per page | 5-Business Rule | GAP-007 | Assumption | TEST_USERNAME |
| TC-NOTIF-010 | Unread tab with no unread items shows empty state (Assumption) | Low | 1. Open Unread when none unread | Friendly empty message, no error | 4-CRUD | GAP-007 | Assumption: needs account with 0 unread | TEST_USERNAME |
| TC-NOTIF-011 | Page-size options (Assumption) | Low | 1. Look for a page-size control<br>2. Change size if present | Rows per page follow the choice; default 5 | 6-Field Validation | AC-NOTIF-01 | Assumption: GAP-007 | TEST_USERNAME |
| TC-NOTIF-012 | Mark All as Read button is visible and enabled state is correct | Medium | 1. Open /NOTIFICATIONS<br>2. Inspect the button without clicking | Button visible; enabled when unread exist | 3-State-Aware | GAP-007 | Signed in | TEST_USERNAME |
| TC-NOTIF-013 | @live Mark All as Read clears unread items (Assumption) | High | 1. Note unread count<br>2. Click Mark All as Read<br>3. Open Unread tab<br>4. Reload | Unread tab empty after reload; all rows read; count zero | 4-CRUD | GAP-007 | Assumption: write action, single-use, approval needed | TEST_USERNAME |
| TC-NOTIF-014 | @live Mark All as Read updates badges everywhere (Assumption) | High | 1. After TC-NOTIF-013 check top bar badges on /HOME | Notification badge consistent (zero/cleared) at once without re-login | 5-Business Rule | GAP-007 | Assumption: runs after 013 | TEST_USERNAME |
| TC-NOTIF-015 | @live Mark All as Read button during request and after | Medium | 1. Delay the API<br>2. Click Mark All as Read twice quickly<br>3. Observe | Button disabled while pending; one request; re-enabled or disabled after success | 10-Async/Race | GAP-007 | Assumption: write action | TEST_USERNAME |
| TC-NOTIF-016 | @live Mark All as Read API failure | Medium | 1. Route the update call to 500<br>2. Click Mark All as Read | Plain-language error; items stay unread; button recovers | 3-State-Aware | GAP-007 | Assumption: request is blocked, no data changes | TEST_USERNAME |
| TC-NOTIF-017 | Mark All as Read is recorded in notification history (Assumption) | Low | 1. After TC-NOTIF-013 look for any activity record | If exposed, entry exists with timestamp; else record GAP | 8-Audit | GAP-007 | Assumption | TEST_USERNAME |
| TC-NOTIF-018 | Opening a notification row (Assumption) | Medium | 1. Click a row, if clickable<br>2. Go back | Detail or link opens; opening does not corrupt the list; check whether it marks as read | 1-Happy Path | GAP-007 | Assumption: may mark as read | TEST_USERNAME |
| TC-NOTIF-019 | Digilocker references in notifications (Assumption) | Low | 1. Read Digilocker-related text<br>2. Do not follow external links that act | Text is readable and consistent; no data sent to Digilocker | 9-Third-Party | GAP-007 | Assumption | TEST_USERNAME |
| TC-NOTIF-020 | Active tab persists when paging | Medium | 1. Select Unread<br>2. Move to page 2 and back | Unread tab stays active and page state follows | 7-UI State | GAP-007 | Assumption | TEST_USERNAME |
| TC-NOTIF-021 | Current page after Back and Forward | Medium | 1. Go to page 3<br>2. Open Home<br>3. Press Back | Page returns to a valid state (page 1 or 3); no error. Record which | 7-UI State | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-022 | Paging state survives a breakpoint resize | Low | 1. Go to page 2 at 1440 wide<br>2. Resize to 390 wide | Page 2 and tab remain | 7-UI State | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-023 | Rapid Next clicks | Medium | 1. Click Next four times quickly | Lands on a consistent page, no duplicate rows, no console error | 10-Async/Race | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-024 | Navigate away during page load | Low | 1. Click Notifications<br>2. Immediately click About Us | Ends on About Us, no broken state | 10-Async/Race | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-025 | Stale data across two tabs | Low | 1. Open page in tabs A and B<br>2. Reload A after changes elsewhere (read only)<br>3. Reload B | Both show server data after reload | 10-Async/Race | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-026 | /NOTIFICATIONS signed out | Critical | 1. With no session open /NOTIFICATIONS | Redirect to /login | 2-Negative | AC-HOME-03 | No session | none |
| TC-NOTIF-027 | Session cleared while paging | High | 1. Open page 2<br>2. Clear cookies/storage<br>3. Click Next | Redirect to /login, no raw 401 | 11-Web Conditions | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-NOTIF-028 | Refresh and direct URL | High | 1. Open /NOTIFICATIONS by address<br>2. Reload | List loads with page 1 | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-029 | Notifications API returns 500 | High | 1. Route notifications API to 500<br>2. Open page | Plain-language error, not empty list shown as success; shell usable | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-030 | Paging request fails mid-way | Medium | 1. Open page 1<br>2. Route next-page call to 500<br>3. Click Next<br>4. Unroute and retry | Error shown; current page kept; retry works | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-031 | Offline and slow network | Medium | 1. Slow 3G, open page<br>2. Go offline, click Next<br>3. Go online | Loader while loading; error offline; recovers | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-032 | Notification text rendered safely | Medium | 1. Review rows for markup or raw HTML | Text only; no script execution | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-033 | Keyboard operation of tabs, paging and Mark All as Read | High | 1. Tab to tabs and pagination<br>2. Activate with Enter/Space (do not press Mark All as Read) | Logical order, visible focus, controls operable | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-034 | axe WCAG 2 A/AA scan | High | 1. Run axe on /NOTIFICATIONS | No critical/serious violations; pagination controls have accessible names | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-035 | Mobile 390x844 layout | High | 1. Set 390x844<br>2. Open page and page through | List and pagination fit; table does not overflow clipped | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-036 | Tablet 820x1180 layout | Medium | 1. Set 820x1180<br>2. Open page | Layout intact | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-037 | Desktop 1440x900 layout | Medium | 1. Set 1440x900<br>2. Open page | Layout intact | 11-Web Conditions | AC-NOTIF-01 | Signed in | TEST_USERNAME |
| TC-NOTIF-038 | Notifications on every configured browser | Medium | 1. Run TC-NOTIF-001, 002, 003 on chromium | Same results; record differences | 11-Web Conditions | AC-NOTIF-01 | project.json browsers | TEST_USERNAME |

## Coverage

| AC | Cases |
|---|---|
| AC-NOTIF-01 | TC-NOTIF-002, 003, 004, 005, 006, 007, 008, 011, 021, 022, 023, 025, 028–031, 033–038 |

`@live` cases (013, 014, 015, 016) depend on approval to run Mark All as Read (GAP-007); until then they stay blocked. Unread tab, page sizes and pages 2–4 are Assumption cases (GAP-007).
