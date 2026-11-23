# Pending updates (the Edit/PowerShell tools were denied, so these could not be written to their target files)

Append the blocks below to the named files.

## qa/01-user-story/US_001_Login.md → "Automation / exploratory findings"
- BUG-001 (TC-LOGIN-007/008): valid User Id plus wrong password shows "The password you entered is incorrect"; unknown id shows "The credentials you entered are incorrect". Rule violated: BR-008 / AC-LOGIN-03 (generic message). Missed earlier: exploration only tried a non-existent id.
- BUG-002 (TC-LOGIN-032/037): Forgot User ID, Forgot Password, Activate Account and the password toggle are not keyboard reachable. Missed earlier: keyboard testing was blocked.
- BUG-005: cleared session redirects to /login with toast "Success: Logout Successfully".
- BUG-008: password toggle has no accessible name; inline errors are not tied to fields.
- Undocumented: password under 4 characters shows "Enter minimum 4 digit password"; maxlength 20 (password) and 100 (User Id).

## qa/01-user-story/US_002_Home_Navigation.md → "Automation / exploratory findings"
- BUG-002: nav items, tabs, avatar and bell cannot be reached with Tab (focus only cycles Savings Application and the sidebar toggle).
- BUG-003: Escape does not close the avatar menu.
- BUG-004: Alerts badge missing on pages after a full load.
- BUG-006: nav highlight follows stored selectedMenuIndex, not the URL.
- BUG-007: mobile drawer stays open after choosing an item; collapsed state persists at desktop.
- BUG-008: missing accessible names; low-contrast inactive tab.
- BUG-009: profile mobile number has 8 digits.
- Not run: Mark All as Read and opening a notification (would change real data).

## Test plan corrections
- login-test-plan.md: TC-LOGIN-007/008 expectation was right, the app is wrong. TC-LOGIN-010: no email-format rule; password under 4 chars gives "Enter minimum 4 digit password".
- home-test-plan.md: Change Password and Change Language are pages (/CHANGE_PASSWORD, /LANGUAGE) with no Cancel; Savings Application opens /UNPOSTED; no iframe exists (TC-HOME-028).
- notifications-test-plan.md: 84 pages at 5 per page (416 items); Unread total 15 (3 pages); page sizes 5, 10, 20, 30.
