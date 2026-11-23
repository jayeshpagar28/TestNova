# Exploratory results — About Us

- **URL:** https://sahyogagentweb.drutam.in:9634/ABOUT_US · **Environment:** QA · **Build:** not exposed · **Browser:** Chromium · **Viewports:** 1280x720, 390x844, 820x1180, 1440x900 · **Date:** 2026-11-04 · **Role:** User

| Test Case ID | Test Name | Status | Actual Result | Deviation | Screenshot |
|---|---|---|---|---|---|
| TC-ABOUT-001 | Opens from side nav | Pass | URL /ABOUT_US, H1 "About Us" | — | |
| TC-ABOUT-002 | Three sections present | Pass | H3 Key Capabilities, H2 Powerful Features, "Built for Adaptability"/H3 Platform Benefits, non-empty text | — | |
| TC-ABOUT-003 | Read-only | Pass | 0 inputs; only the unnamed sidebar button | — | |
| TC-ABOUT-004 | No placeholder/broken images | Pass | No lorem/undefined/null; images load; eKYC listed | — | |
| TC-ABOUT-005 | Signed out direct URL | Pass | Redirect to /login | — | |
| TC-ABOUT-006 | Signed in direct URL | Pass | Page loads | — | |
| TC-ABOUT-007 | Refresh keeps page | Pass | Full load of /ABOUT_US kept session and page | — | |
| TC-ABOUT-008 | Back/forward with Home | Blocked | Not run | | |
| TC-ABOUT-009 | Nav stays highlighted on About Us | Fail | After direct load the Notifications item was highlighted while on About Us; correct only after a click | BUG-006 | evidence/about-us/BUG-006_stale-nav-highlight.png |
| TC-ABOUT-010 | Session cleared on About Us | Blocked | Equivalent shown on Notifications (BUG-005) | | |
| TC-ABOUT-011 | Content API 5xx | Blocked | Environment: no route tool | | |
| TC-ABOUT-012 | Offline then reload | Blocked | Environment: no offline tool | | |
| TC-ABOUT-013 | Rapid navigation | Blocked | Not run | | |
| TC-ABOUT-014 | Keyboard reading order | Blocked | Not run on this page (see BUG-002 on shell) | | |
| TC-ABOUT-015 | axe scan | Blocked | Environment: axe unavailable | | |
| TC-ABOUT-016 | Mobile 390x844 | Pass | No horizontal overflow, nothing past the right edge | — | |
| TC-ABOUT-017 | Tablet 820x1180 | Pass | Two-column cards, icon-only nav, intact | — | evidence/about-us/US002_AC-HOME-01_tablet-820.png |
| TC-ABOUT-018 | Desktop 1440x900 | Pass | Layout intact, 4-column features | — | |
| TC-ABOUT-019 | Configured browsers | Pass | Chromium only; 001, 002 pass | — | |

## Console / network: no errors. Totals: Pass 11 · Fail 1 · Blocked 7 (19 cases)
