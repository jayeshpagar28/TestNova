# US_002 — Home, Navigation, Profile, Notifications, About Us

Project: Sahayog [QA]. Role: User (`TEST_USERNAME`). Not described by any provided document: [GAP] no document covers these pages. Everything below is from the live app.

## Objective
[NOT VERIFIED] (inferred): give a signed-in bank staff user a landing page, notifications and account information. The About Us page describes the product as a customer onboarding and loan origination tool. [page: /ABOUT_US]

## Pages walked
- /HOME: top bar (date 04/11/2026, "Alerts" badge 1, "Notification" badge 15, avatar "Profile"); side nav Home / My Profile / Notifications / About Us; section "Alerts & Internal Updates" with tabs All / Important, "View All", one item "Mandatory Scrutiny Process for All New Applications" dated 18-09-2025; button "Savings Application". Screenshot evidence/home/home.png. The "Savings Application" button was not clicked (it may start a real application).
- /MY_PROFILE: heading "Profile", role "Branch Origination Officer"; Name, Gender, Date of Birth, mobile number, Email id, Address, all disabled (read-only) textboxes. Screenshot evidence/my-profile/my-profile.png.
- /NOTIFICATIONS: tabs All / Unread, "Mark All as Read" (not clicked, it changes data), list of Digilocker submission notifications with timestamps, a "Showing 5 records" page-size control, pages 1-4 ... and Previous (disabled) / Next. Screenshot evidence/notifications/notifications.png.
- /ABOUT_US: static marketing content (Key Capabilities: Customer Profiling, Document Collection, eKYC, Application Submission; Powerful Features; Platform Benefits). Screenshot evidence/about-us/about-us.png.
- Profile menu (avatar): name, My Profile, Change Password, Change Language, Logout. Change Password and Change Language were not opened.

## Acceptance criteria (verified)
- AC-1 Given a signed-in user, when the nav items are clicked, then the URL changes to /HOME, /MY_PROFILE, /NOTIFICATIONS and /ABOUT_US respectively.
- AC-2 Given the My Profile page, then every profile field is disabled (not editable).
- AC-3 Given Notifications, then at most 5 records show per page and Previous is disabled on page 1.
- AC-4 Given the avatar is clicked, then the menu lists My Profile, Change Password, Change Language, Logout.
- AC-5 Given the page is /HOME with no session, then the user is redirected to /login (see US_001 AC-5).

## Observations
- Console on /HOME: no errors. Network on /HOME: all application calls returned 200 (side menu list was requested twice).
- The home page content sits inside an iframe-like frame in the snapshot (refs prefixed f1); locators will need a frame-aware approach. [NOT VERIFIED] cause.
- The nav shows 4 items for this role; the "Savings Application" entry and the "Branch Origination Officer" role suggest more functions exist for other roles.

## [NOT VERIFIED]
- Meaning of the Alerts badge (1) vs the Notification badge (15); the Important tab filter; View All; the page-size options; pages 2-4; the Unread tab; Mark All as Read; Change Password; Change Language; the Savings Application flow; the nav collapse button; responsive layout.

## [GAP]
- No requirements document for Home, Profile, Notifications, About Us, Change Password, Change Language or the Savings Application journey.
- The side menu comes from `/admin/sidemenu/list`; other roles may see other items, and no other credentials exist.
- Writes (Mark All as Read, Change Password, application creation) were skipped to avoid altering real data, because the notifications reference real applicant names.
