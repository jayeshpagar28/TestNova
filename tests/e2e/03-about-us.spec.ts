import { test, expect } from '../../src/fixtures/pages.js';
import { aboutUs as aboutData, viewports } from '../../src/data/test-data.js';

const serious = (v: { impact: string | null }) => v.impact === 'critical' || v.impact === 'serious';

test.describe('About Us: signed out', () => {
  test('TC-ABOUT-005: /ABOUT_US when signed out redirects to login', async ({ aboutUs }) => {
    await aboutUs.visit();
    await aboutUs.expectRedirectedToLogin();
  });
});

test.describe('About Us', () => {
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-ABOUT-001: About Us opens from side navigation', async ({ home, aboutUs }) => {
    await home.sideNav.go('About Us');
    await aboutUs.expectLoaded();
    await aboutUs.expectAt();
  });

  test('TC-ABOUT-002: the three content sections are present', async ({ aboutUs }) => {
    await aboutUs.open();
    for (const s of aboutData.sections) await expect(aboutUs.section(s)).toBeVisible();
    await expect(aboutUs.sectionItems().first()).toHaveText(/\S/);
  });

  test('TC-ABOUT-003: the page is read-only', async ({ aboutUs }) => {
    await aboutUs.open();
    await expect(aboutUs.editableControls()).toHaveCount(0);
  });

  test('TC-ABOUT-004: no placeholder text or broken images', async ({ aboutUs }) => {
    await aboutUs.open();
    await aboutUs.scrollToEnd();
    expect(await aboutUs.bodyText()).not.toMatch(/lorem ipsum|undefined|\bnull\b/i);
    expect(await aboutUs.brokenImages()).toBe(0);
    for (const c of aboutData.capabilities) await expect(aboutUs.sectionItems().filter({ hasText: c })).toHaveCount(1);
  });

  test('TC-ABOUT-006: direct URL while signed in', async ({ aboutUs }) => {
    await aboutUs.open();
    await aboutUs.expectAt();
  });

  test('TC-ABOUT-007: refresh keeps the page and session', async ({ aboutUs }) => {
    await aboutUs.open();
    await aboutUs.reload();
    await aboutUs.expectAt();
  });

  test('TC-ABOUT-008: back and forward between Home and About Us', async ({ home, aboutUs }) => {
    await home.sideNav.go('About Us');
    await aboutUs.expectLoaded();
    await aboutUs.back();
    await home.expectAt();
    await home.forward();
    await aboutUs.expectAt();
  });

  test(
    'TC-ABOUT-009: the About Us nav item is highlighted on direct load @known-defect',
    { annotation: { type: 'defect', description: 'BUG-006' } },
    async ({ aboutUs }) => {
      await aboutUs.open();
      await aboutUs.topBar.clickAway();
      expect(await aboutUs.sideNav.highlighted()).toBe('About Us');
    },
  );

  test('TC-ABOUT-010: a session cleared on About Us redirects to login', async ({ aboutUs }) => {
    await aboutUs.open();
    await aboutUs.clearSession();
    await aboutUs.sideNav.go('Home');
    await aboutUs.expectRedirectedToLogin();
    await aboutUs.expectNoRawError();
  });

  test.fixme('TC-ABOUT-011: page load fails when the content API returns 5xx', async () => {
    // The page appears fully static: no content API has been identified to route.
  });

  test('TC-ABOUT-012: offline then reload recovers', async ({ aboutUs }) => {
    await aboutUs.open();
    await aboutUs.goOffline();
    await aboutUs.reloadExpectingFailure();
    await aboutUs.goOnline();
    await aboutUs.reload();
    await aboutUs.expectLoaded();
  });

  test('TC-ABOUT-013: rapid navigation ends on the last click', async ({ home, aboutUs }) => {
    const log = aboutUs.watchConsole();
    for (let i = 0; i < 5; i += 1) {
      await home.sideNav.go('About Us');
      await home.sideNav.go('Home');
    }
    await home.sideNav.go('About Us');
    await aboutUs.expectLoaded();
    expect(log.text()).not.toMatch(/Uncaught/);
  });

  test('TC-ABOUT-014: keyboard focus moves and is not trapped', async ({ aboutUs }) => {
    await aboutUs.open();
    expect(await aboutUs.distinctFocusStops(10)).toBeGreaterThanOrEqual(1);
  });

  test(
    'TC-ABOUT-015: axe WCAG 2 A/AA scan @known-defect',
    { annotation: { type: 'defect', description: 'BUG-008' } },
    async ({ aboutUs, scanA11y }) => {
      await aboutUs.open();
      const violations = await scanA11y('about-us');
      expect(violations.filter(serious)).toEqual([]);
    },
  );

  test('TC-ABOUT-019: About Us works on the configured browser', async ({ aboutUs }) => {
    await aboutUs.open();
    for (const s of aboutData.sections) await expect(aboutUs.section(s)).toBeVisible();
  });
});

for (const [id, name, size] of [
  ['TC-ABOUT-016', 'mobile 390x844', viewports.mobile],
  ['TC-ABOUT-017', 'tablet 820x1180', viewports.tablet],
  ['TC-ABOUT-018', 'desktop 1440x900', viewports.desktop],
] as const) {
  test.describe(`About Us: ${name}`, () => {
    test.use({ viewport: size });
    test.beforeEach(async ({ signedIn }) => {
      await signedIn.expectLoaded();
    });

    test(`${id}: About Us layout is intact on ${name}`, async ({ aboutUs }) => {
      await aboutUs.open();
      await aboutUs.scrollToEnd();
      expect(await aboutUs.hasHorizontalOverflow()).toBe(false);
      await expect(aboutUs.section('Key Capabilities')).toBeVisible();
    });
  });
}
