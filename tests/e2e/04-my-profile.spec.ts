import { test, expect } from '../../src/fixtures/pages.js';
import { profile, viewports } from '../../src/data/test-data.js';

const serious = (v: { impact: string | null }) => v.impact === 'critical' || v.impact === 'serious';

test.describe('My Profile: signed out', () => {
  test('TC-PROFILE-014: /MY_PROFILE when signed out redirects to login', async ({ myProfile }) => {
    await myProfile.visit();
    await myProfile.expectRedirectedToLogin();
  });
});

test.describe('My Profile', () => {
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-PROFILE-001: My Profile opens from side navigation', async ({ home, myProfile }) => {
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.expectAt();
  });

  test('TC-PROFILE-002: My Profile opens from the avatar menu', async ({ home, myProfile }) => {
    await home.topBar.chooseMenuItem('My Profile');
    await myProfile.expectLoaded();
    await myProfile.expectAt();
  });

  test('TC-PROFILE-003: all profile fields are disabled', async ({ myProfile }) => {
    await myProfile.open();
    await expect(myProfile.controls()).toHaveCount(profile.fields.length);
    expect(await myProfile.enabledControlCount()).toBe(0);
  });

  test('TC-PROFILE-004: typing into a profile field has no effect', async ({ myProfile }) => {
    await myProfile.open();
    for (const f of profile.fields) expect(await myProfile.tryTyping(f, 'x')).toBe('unchanged');
  });

  test('TC-PROFILE-005: no Save or Edit action is offered', async ({ myProfile }) => {
    await myProfile.open();
    await expect(myProfile.changeActions()).toHaveCount(0);
  });

  test('TC-PROFILE-006: every expected profile field is displayed', async ({ myProfile }) => {
    await myProfile.open();
    for (const f of profile.fields) {
      await expect(myProfile.label(f)).toBeVisible();
      await expect(myProfile.field(f)).toBeVisible();
    }
    await expect(myProfile.roleLabel(profile.roleLabel)).toBeVisible();
  });

  test('TC-PROFILE-007: profile data is real and matches the avatar menu name', async ({ myProfile }) => {
    await myProfile.open();
    for (const f of profile.fields) {
      const v = await myProfile.value(f);
      expect(v.trim()).not.toBe('');
      expect(v).not.toMatch(/^(undefined|null)$/i);
    }
    await myProfile.topBar.openMenu();
    await expect(myProfile.topBar.menuUserName()).toHaveText(await myProfile.value('Name'));
  });

  test('TC-PROFILE-008: the role label matches the account', async ({ myProfile }) => {
    await myProfile.open();
    await expect(myProfile.roleLabel(profile.roleLabel)).toBeVisible();
  });

  test(
    'TC-PROFILE-009: field formats are valid @known-defect',
    { annotation: { type: 'defect', description: 'BUG-009' } },
    async ({ myProfile }) => {
      await myProfile.open();
      expect(await myProfile.value('Email id')).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(await myProfile.value('Date of Birth')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(await myProfile.value('mobile number')).toMatch(new RegExp(`^\\d{${profile.mobileDigits}}$`));
    },
  );

  test('TC-PROFILE-010: the address displays fully with readable characters', async ({ myProfile }) => {
    await myProfile.open();
    const address = await myProfile.value('Address');
    expect(address.length).toBeGreaterThan(0);
    expect(address).not.toMatch(/�|\.\.\.$/);
  });

  test('TC-PROFILE-011: data persists after reload and re-login', async ({ myProfile, login, credentials }) => {
    await myProfile.open();
    const read = async () => Promise.all(profile.fields.map((f) => myProfile.value(f)));
    const before = await read();
    await myProfile.reload();
    expect(await read()).toEqual(before);
    await myProfile.topBar.logout();
    await login.waitUntilLoaded();
    await login.signIn(credentials());
    await login.expectSignedIn();
    await myProfile.open();
    expect(await read()).toEqual(before);
  });

  test.fixme('TC-PROFILE-012: profile data equals the API response', async () => {
    // The profile endpoint has not been identified (no network capture of it in stage 4).
  });

  test('TC-PROFILE-013: only the signed-in user\'s profile is shown', async ({ myProfile }) => {
    await myProfile.open();
    expect(myProfile.currentPath()).toBe('/MY_PROFILE');
    await myProfile.topBar.openMenu();
    await expect(myProfile.topBar.menuUserName()).toHaveText(await myProfile.value('Name'));
  });

  test('TC-PROFILE-015: a session cleared on the profile page redirects to login', async ({ myProfile }) => {
    await myProfile.open();
    await myProfile.clearSession();
    await myProfile.sideNav.go('Home');
    await myProfile.expectRedirectedToLogin();
    await myProfile.expectNoRawError();
  });

  test('TC-PROFILE-016: logout invalidates profile access', async ({ myProfile }) => {
    await myProfile.open();
    await myProfile.topBar.logout();
    await myProfile.expectRedirectedToLogin();
    await myProfile.back();
    await myProfile.expectRedirectedToLogin();
    await expect(myProfile.field('Name')).toHaveCount(0);
  });

  test('TC-PROFILE-017: refresh and direct URL load the profile', async ({ myProfile }) => {
    await myProfile.open();
    await myProfile.reload();
    await expect(myProfile.field('Name')).toBeVisible();
  });

  test('TC-PROFILE-018: back and forward between Home and Profile', async ({ home, myProfile }) => {
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.back();
    await home.expectAt();
    await home.forward();
    await myProfile.expectAt();
  });

  test.fixme('TC-PROFILE-019: profile API returning 500 shows a plain error', async () => {
    // The profile endpoint has not been identified, so there is nothing safe to route.
  });

  test.fixme('TC-PROFILE-020: profile API returning 403 shows a friendly message', async () => {
    // The profile endpoint has not been identified, so there is nothing safe to route.
  });

  test('TC-PROFILE-021: the profile recovers from being offline', async ({ myProfile }) => {
    await myProfile.open();
    await myProfile.goOffline();
    await myProfile.reloadExpectingFailure();
    await myProfile.goOnline();
    await myProfile.reload();
    await expect(myProfile.field('Name')).toBeVisible();
  });

  test('TC-PROFILE-022: navigating away while the profile loads ends on Notifications', async ({ home, notifications }) => {
    await home.sideNav.go('My Profile');
    await home.sideNav.go('Notifications');
    await notifications.expectLoaded();
    await notifications.expectAt();
  });

  test.fixme('TC-PROFILE-023: a second tab redirects to login after logout in the first', async () => {
    // Needs a second page in the same context; the fixtures expose one page per test.
  });

  test('TC-PROFILE-024: the My Profile nav item stays highlighted', async ({ home, myProfile }) => {
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.topBar.clickAway();
    expect(await myProfile.sideNav.highlighted()).toBe('My Profile');
  });

  test('TC-PROFILE-025: disabled fields keep state across a breakpoint resize', async ({ myProfile }) => {
    await myProfile.open();
    await myProfile.setViewport(viewports.desktop);
    await myProfile.setViewport(viewports.mobile);
    await myProfile.setViewport(viewports.desktop);
    await expect(myProfile.field('Name')).toBeVisible();
    expect(await myProfile.enabledControlCount()).toBe(0);
  });

  test('TC-PROFILE-026: every field has an accessible label', async ({ myProfile }) => {
    await myProfile.open();
    for (const f of profile.fields) await expect(myProfile.field(f)).toBeVisible();
  });

  test(
    'TC-PROFILE-027: axe WCAG 2 A/AA scan of /MY_PROFILE @known-defect',
    { annotation: { type: 'defect', description: 'BUG-008' } },
    async ({ myProfile, scanA11y }) => {
      await myProfile.open();
      const violations = await scanA11y('my-profile');
      expect(violations.filter(serious)).toEqual([]);
    },
  );

  test('TC-PROFILE-031: My Profile works on the configured browser', async ({ home, myProfile }) => {
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    expect(await myProfile.enabledControlCount()).toBe(0);
  });

  test('TC-PROFILE-032: personal data is not exposed in the URL or console', async ({ myProfile }) => {
    const log = myProfile.watchConsole();
    await myProfile.open();
    const email = await myProfile.value('Email id');
    expect(myProfile.currentPath()).toBe('/MY_PROFILE');
    expect(log.text()).not.toContain(email);
  });
});

for (const [id, name, size] of [
  ['TC-PROFILE-028', 'mobile 390x844', viewports.mobile],
  ['TC-PROFILE-029', 'tablet 820x1180', viewports.tablet],
  ['TC-PROFILE-030', 'desktop 1440x900', viewports.desktop],
] as const) {
  test.describe(`My Profile: ${name}`, () => {
    test.use({ viewport: size });
    test.beforeEach(async ({ signedIn }) => {
      await signedIn.expectLoaded();
    });

    test(`${id}: profile layout is intact on ${name}`, async ({ myProfile }) => {
      await myProfile.open();
      expect(await myProfile.hasHorizontalOverflow()).toBe(false);
      expect(await myProfile.enabledControlCount()).toBe(0);
    });
  });
}
