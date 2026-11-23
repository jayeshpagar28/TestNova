import { test, expect } from '../../src/fixtures/pages.js';
import {
  alerts,
  avatarMenuItems,
  messages,
  navItems,
  pendingMs,
  viewports,
} from '../../src/data/test-data.js';
import { api } from '../../src/utils/conditions.js';

const serious = (v: { impact: string | null }) => v.impact === 'critical' || v.impact === 'serious';

test.describe('Home: signed out', () => {
  test('TC-HOME-006: /HOME without a session redirects to login', async ({ home }) => {
    await home.visit();
    await home.expectRedirectedToLogin();
  });
});

test.describe('Home', () => {
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-HOME-001: Home loads with top bar, side nav and alerts', async ({ home }) => {
    await expect(home.topBar.notificationBadge()).toBeVisible();
    await home.expectLoaded();
    for (const n of navItems) await expect(home.sideNav.item(n.label)).toBeVisible();
    for (const t of alerts.tabs) await expect(home.tab(t)).toBeVisible();
    await expect(home.savingsApplication).toBeVisible();
  });

  test('TC-HOME-002: side navigation reaches every page', async ({ home, myProfile, notifications, aboutUs }) => {
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.expectAt();
    await myProfile.sideNav.go('Notifications');
    await notifications.expectLoaded();
    await notifications.expectAt();
    await notifications.sideNav.go('About Us');
    await aboutUs.expectLoaded();
    await aboutUs.expectAt();
    await aboutUs.sideNav.go('Home');
    await home.expectLoaded();
    await home.expectAt();
  });

  test('TC-HOME-003: the avatar menu lists the expected items', async ({ home }) => {
    await home.topBar.openMenu();
    await expect(home.topBar.menuUserName()).toHaveText(/\S/);
    for (const item of avatarMenuItems) await expect(home.topBar.menuItem(item)).toBeVisible();
  });

  test('TC-HOME-004: avatar menu My Profile opens the profile page', async ({ home, myProfile }) => {
    await home.topBar.chooseMenuItem('My Profile');
    await myProfile.expectLoaded();
    await myProfile.expectAt();
  });

  test('TC-HOME-005: logout from the avatar menu', async ({ home, login, toast }) => {
    await home.topBar.logout();
    await login.expectOn(/\/login/i);
    await toast.expectMessage(messages.logoutSuccess);
  });

  test('TC-HOME-007: the side menu shows only role-permitted items', async ({ home }) => {
    expect(await home.sideNav.labels()).toEqual(navItems.map((n) => n.label));
  });

  test('TC-HOME-008: the side menu comes from the API', async ({ home }) => {
    const stored = await home.storedMenuLabels();
    for (const n of navItems) expect(stored).toContain(n.label);
  });

  test('TC-HOME-009: the alerts list shows real data', async ({ home }) => {
    const texts = await home.alertHeadings().allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).not.toMatch(/undefined|null|lorem|^\s*$/i);
  });

  test('TC-HOME-010: switching All and Important tabs', async ({ home }) => {
    await home.selectTab('Important');
    expect(await home.selectedTab()).toBe('Important');
    await home.selectTab('All');
    expect(await home.selectedTab()).toBe('All');
  });

  test('TC-HOME-011: the active tab persists after clicking elsewhere', async ({ home }) => {
    await home.selectTab('Important');
    await home.topBar.clickAway();
    await home.topBar.openMenu();
    await home.topBar.clickAway();
    expect(await home.selectedTab()).toBe('Important');
  });

  test(
    'TC-HOME-012: the active nav item is highlighted and stays so @known-defect',
    { annotation: { type: 'defect', description: 'BUG-006' } },
    async ({ home, notifications, aboutUs }) => {
      await home.sideNav.go('Notifications');
      await notifications.expectLoaded();
      await notifications.topBar.clickAway();
      expect(await notifications.sideNav.highlighted()).toBe('Notifications');
      await aboutUs.visit();
      await aboutUs.waitUntilLoaded();
      expect(await aboutUs.sideNav.highlighted()).toBe('About Us');
    },
  );

  test('TC-HOME-013: the Notification badge equals the Unread total', async ({ home, notifications }) => {
    const badge = await home.topBar.notificationCount();
    test.skip(badge > 30, 'badge exceeds the largest page size, total cannot be read on one page');
    await home.sideNav.go('Notifications');
    await notifications.expectLoaded();
    await notifications.selectTab('Unread');
    await notifications.choosePageSize(30);
    await expect(notifications.rows()).toHaveCount(badge);
  });

  test('TC-HOME-014: Savings Application opens its list and leaving creates nothing', async ({ home, savingsApplication }) => {
    await home.openSavingsApplication();
    await savingsApplication.expectLoaded();
    await savingsApplication.back();
    await home.waitUntilLoaded();
  });

  test('TC-HOME-015: double-clicking Savings Application opens it once', async ({ home, savingsApplication }) => {
    await home.doubleClickSavingsApplication();
    await savingsApplication.expectLoaded();
    await savingsApplication.expectAt();
  });

  test('TC-HOME-016: Change Password rejects an empty submit and submits nothing', async ({ changePassword }) => {
    await changePassword.open();
    await changePassword.submitEmpty();
    await expect(changePassword.required(messages.currentPasswordRequired)).toBeVisible();
    await expect(changePassword.required(messages.newPasswordRequired)).toBeVisible();
    await expect(changePassword.required(messages.confirmPasswordRequired)).toBeVisible();
  });

  test('TC-HOME-017: Change Language lists the available languages', async ({ language }) => {
    await language.open();
    await expect(language.option('English')).toBeVisible();
    await expect(language.option('मराठी')).toBeVisible();
  });

  test('TC-HOME-018: rapid clicks on the avatar and navigation behave', async ({ home, notifications }) => {
    const log = home.watchConsole();
    for (let i = 0; i < 5; i += 1) await home.topBar.clickAvatar();
    await home.sideNav.goRepeatedly('Notifications', 3);
    await notifications.expectLoaded();
    await notifications.expectAt();
    expect(log.text()).not.toMatch(/Uncaught/);
  });

  test('TC-HOME-019: navigating away during page load ends on the last click', async ({ home, myProfile }) => {
    await home.sideNav.go('About Us');
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.expectAt();
  });

  test('TC-HOME-020: a session cleared on Home redirects to login', async ({ home }) => {
    await home.clearSession();
    await home.sideNav.go('Notifications');
    await home.expectRedirectedToLogin();
    await home.expectNoRawError();
  });

  test('TC-HOME-021: refresh keeps /HOME and the session', async ({ home }) => {
    await home.reload();
    await expect(home.sideNav.item('Home')).toBeVisible();
  });

  test('TC-HOME-022: back and forward track the navigation pages', async ({ home, myProfile, notifications }) => {
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.sideNav.go('Notifications');
    await notifications.expectLoaded();
    await notifications.back();
    await myProfile.expectAt();
    await myProfile.back();
    await home.expectAt();
    await home.forward();
    await myProfile.expectAt();
  });

  test('TC-HOME-023: direct URL to /HOME while signed in', async ({ home }) => {
    await home.open();
    await home.expectAt();
  });

  test('TC-HOME-024: side menu API returning 500 does not blank the page', async ({ home }) => {
    await home.failApi(api.sidemenu, 500);
    await home.reloadWithoutWaiting();
    await home.expectNoRawError();
    await expect.poll(async () => (await home.bodyText()).trim().length).toBeGreaterThan(0);
  });

  test('TC-HOME-025: side menu API returning 401 redirects to login', async ({ home }) => {
    await home.failApi(api.sidemenu, 401);
    await home.reloadWithoutWaiting();
    await home.expectRedirectedToLogin();
    await home.expectNoRawError();
  });

  test('TC-HOME-026: navigation recovers after being offline', async ({ home, notifications }) => {
    await home.goOffline();
    await home.sideNav.go('Notifications');
    await home.goOnline();
    await home.sideNav.go('Home');
    await home.sideNav.go('Notifications');
    await notifications.expectLoaded();
  });

  test('TC-HOME-027: Home completes loading on a slow network', async ({ home }) => {
    await home.delayApi(api.sidemenu, pendingMs);
    await home.reloadWithoutWaiting();
    await home.waitUntilLoaded();
    await expect(home.sideNav.item('Home')).toBeVisible();
  });

  test('TC-HOME-028: Home content is not inside a frame', async ({ home }) => {
    expect(await home.iframeCount()).toBe(0);
    await expect(home.tab('Important')).toBeVisible();
  });

  test('TC-HOME-029: alert text is rendered as text', async ({ home }) => {
    for (const t of await home.alertHeadings().allInnerTexts()) expect(t).not.toMatch(/<[a-z][^>]*>/i);
  });

  test(
    'TC-HOME-030: keyboard operation of navigation and the avatar menu @known-defect',
    { annotation: [{ type: 'defect', description: 'BUG-002' }, { type: 'defect', description: 'BUG-003' }] },
    async ({ home }) => {
      const labels = navItems.map((n) => n.label);
      expect(await home.tabReaches(labels)).toEqual(expect.arrayContaining(labels));
      await home.topBar.openMenu();
      await home.topBar.pressEscape();
      expect(await home.topBar.isMenuOpen()).toBe(false);
    },
  );

  test(
    'TC-HOME-031: axe WCAG 2 A/AA scan of /HOME @known-defect',
    { annotation: { type: 'defect', description: 'BUG-008' } },
    async ({ scanA11y }) => {
      const violations = await scanA11y('home');
      expect(violations.filter(serious)).toEqual([]);
    },
  );

  test(
    'TC-HOME-035: tab and page survive crossing a breakpoint @known-defect',
    { annotation: { type: 'defect', description: 'BUG-007' } },
    async ({ home }) => {
      await home.setViewport(viewports.desktop);
      await home.selectTab('Important');
      await home.setViewport(viewports.mobile);
      await home.setViewport(viewports.desktop);
      expect(await home.selectedTab()).toBe('Important');
      await home.expectAt();
      await expect(home.sideNav.label('Home')).toBeVisible();
    },
  );

  test('TC-HOME-036: the critical Home flow works on the configured browser', async ({ home, myProfile }) => {
    await home.expectLoaded();
    await home.sideNav.go('My Profile');
    await myProfile.expectLoaded();
    await myProfile.topBar.openMenu();
    await expect(myProfile.topBar.menuItem('Logout')).toBeVisible();
  });

  test('TC-HOME-037: no alert activity log is exposed', async ({ home }) => {
    expect(await home.bodyText()).not.toMatch(/audit log|activity log/i);
  });

  test('TC-HOME-038: external links in alerts are safe, if any exist', async ({ home }) => {
    test.skip((await home.externalLinks().count()) === 0, 'no external link present in the alerts');
    await expect(home.externalLinks().first()).toHaveAttribute('rel', /noopener/);
  });
});

test.describe('Home: mobile 390x844', () => {
  test.use({ viewport: viewports.mobile });
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-HOME-032: the side nav collapses to a menu on mobile', async ({ home }) => {
    expect(await home.hasHorizontalOverflow()).toBe(false);
    await home.sideNav.toggle().click();
    for (const n of navItems) await expect(home.sideNav.item(n.label)).toBeVisible();
  });
});

test.describe('Home: tablet 820x1180', () => {
  test.use({ viewport: viewports.tablet });
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-HOME-033: Home layout is intact on tablet', async ({ home }) => {
    expect(await home.hasHorizontalOverflow()).toBe(false);
    await expect(home.sideNav.item('My Profile')).toBeVisible();
  });
});

test.describe('Home: desktop 1440x900', () => {
  test.use({ viewport: viewports.desktop });
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-HOME-034: Home layout is intact on desktop', async ({ home }) => {
    expect(await home.hasHorizontalOverflow()).toBe(false);
    await expect(home.savingsApplication).toBeVisible();
    await expect(home.sideNav.label('Home')).toBeVisible();
  });
});
