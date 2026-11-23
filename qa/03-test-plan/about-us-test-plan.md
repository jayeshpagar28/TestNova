# Test Plan — About Us

- **Module:** About Us (`about-us`) — **Pages:** About Us `/ABOUT_US`
- **Roles:** User (TEST_USERNAME / TEST_PASSWORD) — **Browsers:** chromium
- **ACs covered:** none defined in the knowledge base (read-only static page). Cases are derived from the observed sections (Key Capabilities, Powerful Features, Platform Benefits); see Coverage.
- **Assumptions:** Every content expectation is `Assumption` since no requirement exists (GAP-005). The page is read-only, so no data is changed. Test types: 1 Happy, 2 Negative, 5 Business rule, 7 UI state, 10 Async/race, 11 Web conditions.

| ID | Title | Priority | Steps | Expected | Type | AC | Preconditions | Test Data |
|---|---|---|---|---|---|---|---|---|
| TC-ABOUT-001 | About Us opens from side navigation | Critical | 1. Sign in<br>2. Click About Us | URL is /ABOUT_US; page heading and content shown | 1-Happy Path | AC-HOME-01 | Signed in as User | TEST_USERNAME / TEST_PASSWORD |
| TC-ABOUT-002 | Key Capabilities, Powerful Features and Platform Benefits sections are present | High | 1. Open /ABOUT_US<br>2. Read section headings | The three sections are visible with non-empty text | 1-Happy Path | none (Assumption) | Assumption: observed in exploration only | TEST_USERNAME |
| TC-ABOUT-003 | Page content is read-only | Medium | 1. Open /ABOUT_US<br>2. Look for inputs/buttons that change data | No editable fields or data-changing actions | 5-Business Rule | none (Assumption) | Assumption | TEST_USERNAME |
| TC-ABOUT-004 | Content has no placeholder text or broken images | Medium | 1. Scroll the whole page<br>2. Check images/icons load | No lorem ipsum, 'undefined', or broken images; eKYC mentioned as capability | 1-Happy Path | none (Assumption) | Assumption | TEST_USERNAME |
| TC-ABOUT-005 | Direct URL /ABOUT_US when signed out | High | 1. With no session open /ABOUT_US | Redirect to /login | 2-Negative | AC-HOME-03 | No session | none |
| TC-ABOUT-006 | Direct URL /ABOUT_US when signed in | Medium | 1. Sign in<br>2. Open /ABOUT_US by address | Page loads | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-ABOUT-007 | Refresh keeps the page and session | High | 1. Reload /ABOUT_US | Same page after reload | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-ABOUT-008 | Back/forward between About Us and Home | Medium | 1. Home, then About Us<br>2. Back, then Forward | URL and nav highlight follow history | 11-Web Conditions | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-ABOUT-009 | Nav item stays highlighted on About Us | Low | 1. Open About Us<br>2. Scroll and click blank area | About Us stays active | 7-UI State | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-ABOUT-010 | Session cleared on About Us | High | 1. Open /ABOUT_US<br>2. Clear cookies/storage<br>3. Click Home | Redirect to /login, no raw 401 | 11-Web Conditions | AC-HOME-03 | Signed in | TEST_USERNAME |
| TC-ABOUT-011 | Page load fails (5xx on content API) | Medium | 1. Route page API calls to 500<br>2. Open /ABOUT_US | Plain-language error, shell still usable | 11-Web Conditions | none (Assumption) | Assumption: page may be fully static | TEST_USERNAME |
| TC-ABOUT-012 | Offline then reload | Low | 1. Go offline<br>2. Reload<br>3. Go online and reload | Browser/offline message, then page recovers | 11-Web Conditions | none | Signed in | TEST_USERNAME |
| TC-ABOUT-013 | Rapid navigation Home / About Us | Low | 1. Click About Us and Home alternately 5 times quickly | Final page matches last click; no console errors | 10-Async/Race | AC-HOME-01 | Signed in | TEST_USERNAME |
| TC-ABOUT-014 | Keyboard reading order and focus | Medium | 1. Tab through the page | Focus visible; no keyboard trap | 11-Web Conditions | none | Signed in | TEST_USERNAME |
| TC-ABOUT-015 | axe WCAG 2 A/AA scan | High | 1. Run axe on /ABOUT_US | No critical/serious violations; heading order sensible; contrast OK | 11-Web Conditions | none | Signed in | TEST_USERNAME |
| TC-ABOUT-016 | Mobile 390x844 layout | High | 1. Set 390x844<br>2. Open /ABOUT_US, scroll | Content stacks, no horizontal scroll, no clipping | 11-Web Conditions | none | Signed in | TEST_USERNAME |
| TC-ABOUT-017 | Tablet 820x1180 layout | Medium | 1. Set 820x1180<br>2. Open /ABOUT_US | Layout intact | 11-Web Conditions | none | Signed in | TEST_USERNAME |
| TC-ABOUT-018 | Desktop 1440x900 layout | Medium | 1. Set 1440x900<br>2. Open /ABOUT_US | Layout intact | 11-Web Conditions | none | Signed in | TEST_USERNAME |
| TC-ABOUT-019 | About Us on every configured browser | Medium | 1. Run TC-ABOUT-001, 002 on chromium | Same result; record differences | 11-Web Conditions | none | project.json browsers | TEST_USERNAME |

## Coverage

No AC is defined for About Us in the knowledge base. Navigation to the page is covered through AC-HOME-01 (TC-ABOUT-001, 006–009, 013) and session protection through AC-HOME-03 (TC-ABOUT-005, 010). Content cases carry no AC because none exists; they are Assumptions pending stakeholder documents (GAP-005).
