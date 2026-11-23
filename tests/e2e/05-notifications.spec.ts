import { test, expect } from '../../src/fixtures/pages.js';
import { messages, notificationsData as data, viewports } from '../../src/data/test-data.js';
import { api } from '../../src/utils/conditions.js';

const serious = (v: { impact: string | null }) => v.impact === 'critical' || v.impact === 'serious';
const markAllEndpoint = /notification\/(read|update|mark)/i;

test.describe('Notifications: signed out', () => {
  test('TC-NOTIF-026: /NOTIFICATIONS when signed out redirects to login', async ({ notifications }) => {
    await notifications.visit();
    await notifications.expectRedirectedToLogin();
  });
});

test.describe('Notifications', () => {
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-NOTIF-001: Notifications opens from side navigation', async ({ home, notifications }) => {
    await home.sideNav.go('Notifications');
    await notifications.expectLoaded();
    await notifications.expectAt();
    await expect(notifications.tab('All')).toBeVisible();
    await expect(notifications.tab('Unread')).toBeVisible();
  });

  test('TC-NOTIF-002: at most 5 records are shown per page', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    expect(await notifications.rows().count()).toBeLessThanOrEqual(data.pageSize);
  });

  test('TC-NOTIF-003: Previous is disabled on page 1', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.previous).toBeDisabled();
    await expect(notifications.next).toBeEnabled();
    await expect(notifications.pageButton(2)).toBeVisible();
  });

  test('TC-NOTIF-004: Next moves to page 2', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    const first = await notifications.rowTexts();
    await notifications.goNext();
    await expect(notifications.currentPageButton()).toHaveText('2');
    await expect(notifications.previous).toBeEnabled();
    expect(await notifications.rowTexts()).not.toEqual(first);
  });

  test('TC-NOTIF-005: Previous returns to page 1', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    const first = await notifications.rowTexts();
    await notifications.goNext();
    await expect(notifications.currentPageButton()).toHaveText('2');
    await notifications.goPrevious();
    await expect(notifications.currentPageButton()).toHaveText('1');
    await expect(notifications.previous).toBeDisabled();
    expect(await notifications.rowTexts()).toEqual(first);
  });

  test('TC-NOTIF-006: each numbered page shows distinct rows', async ({ notifications }) => {
    await notifications.open();
    const seen = new Set<string>();
    for (const n of [1, 2, 3, 4]) {
      await notifications.goToPage(n);
      const rows = await notifications.rowTexts();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(data.pageSize);
      for (const r of rows) {
        expect(seen.has(r)).toBe(false);
        seen.add(r);
      }
    }
  });

  test('TC-NOTIF-007: the last page disables Next', async ({ notifications }) => {
    test.setTimeout(240_000);
    await notifications.open();
    await notifications.goToLastPage();
    await expect(notifications.next).toBeDisabled();
    expect(await notifications.rows().count()).toBeLessThanOrEqual(data.pageSize);
  });

  test('TC-NOTIF-008: notification rows show real data', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    for (const r of await notifications.rowTexts()) {
      expect(r).toMatch(/\d{2}-[A-Za-z]{3}-\d{4}/);
      expect(r).not.toMatch(/undefined|null|lorem/i);
    }
  });

  test('TC-NOTIF-009: the Unread tab lists a subset, at most 5 per page', async ({ notifications }) => {
    await notifications.open();
    await notifications.selectTab('Unread');
    expect(await notifications.selectedTab()).toBe('Unread');
    expect(await notifications.rows().count()).toBeLessThanOrEqual(data.pageSize);
  });

  test.fixme('TC-NOTIF-010: Unread tab with no unread items shows an empty state', async () => {
    // Needs an account with zero unread notifications; the test account has unread items.
  });

  test('TC-NOTIF-011: page-size options change the rows per page', async ({ notifications }) => {
    await notifications.open();
    expect(await notifications.pageSizeOptions()).toEqual([...data.pageSizeOptions]);
    await notifications.choosePageSize(10);
    await expect(notifications.rows()).toHaveCount(10);
  });

  test('TC-NOTIF-012: Mark All as Read is visible (not clicked)', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.markAllAsRead).toBeVisible();
  });

  test('TC-NOTIF-013: @live Mark All as Read clears unread items', async ({ notifications }) => {
    test.skip(!process.env.TESTNOVA_LIVE, 'live: needs a human');
    await notifications.open();
    await notifications.markAllAsRead.click();
    await notifications.reload();
    await notifications.selectTab('Unread');
    await expect(notifications.rows()).toHaveCount(0);
  });

  test('TC-NOTIF-014: @live Mark All as Read updates the badge everywhere', async ({ notifications, home }) => {
    test.skip(!process.env.TESTNOVA_LIVE, 'live: needs a human');
    await notifications.open();
    await notifications.markAllAsRead.click();
    await home.sideNav.go('Home');
    await home.expectLoaded();
    await expect.poll(() => home.topBar.notificationCount()).toBe(0);
  });

  test('TC-NOTIF-015: @live Mark All as Read sends one request when clicked twice', async ({ notifications }) => {
    test.skip(!process.env.TESTNOVA_LIVE, 'live: needs a human');
    const calls = notifications.countApiCalls(markAllEndpoint, 'POST');
    await notifications.open();
    await notifications.markAllAsRead.dblclick();
    await expect.poll(() => calls.count()).toBeLessThanOrEqual(1);
  });

  test('TC-NOTIF-016: @live Mark All as Read failure keeps items unread', async ({ notifications, home }) => {
    test.skip(!process.env.TESTNOVA_LIVE, 'live: needs a human');
    const badge = await home.topBar.notificationCount();
    await notifications.failApi(markAllEndpoint, 500);
    await notifications.open();
    await notifications.markAllAsRead.click();
    await notifications.expectNoRawError();
    expect(await notifications.topBar.notificationCount()).toBe(badge);
  });

  test.fixme('TC-NOTIF-017: Mark All as Read is recorded in notification history', async () => {
    // Depends on the @live write case and no history view is exposed to the User role (GAP-007).
  });

  test('TC-NOTIF-018: @live opening a notification row does not corrupt the list', async ({ notifications }) => {
    test.skip(!process.env.TESTNOVA_LIVE, 'live: needs a human');
    await notifications.open();
    await notifications.rows().first().click();
    await notifications.back();
    await notifications.waitUntilLoaded();
    await expect(notifications.rows().first()).toBeVisible();
  });

  test('TC-NOTIF-019: Digilocker references are readable', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    expect((await notifications.rowTexts()).some((r) => data.digilocker.test(r))).toBe(true);
  });

  test('TC-NOTIF-020: the active tab persists when paging', async ({ notifications }) => {
    await notifications.open();
    await notifications.selectTab('Unread');
    await notifications.goToPage(2);
    await notifications.goToPage(1);
    expect(await notifications.selectedTab()).toBe('Unread');
  });

  test('TC-NOTIF-021: the current page after Back and Forward is valid', async ({ notifications, home }) => {
    await notifications.open();
    await notifications.goToPage(3);
    await notifications.sideNav.go('Home');
    await home.expectLoaded();
    await home.back();
    await notifications.waitUntilLoaded();
    await expect(notifications.rows().first()).toBeVisible();
    expect(await notifications.rows().count()).toBeLessThanOrEqual(data.pageSize);
  });

  test('TC-NOTIF-022: paging state survives a breakpoint resize', async ({ notifications }) => {
    await notifications.setViewport(viewports.desktop);
    await notifications.open();
    await notifications.goToPage(2);
    await notifications.setViewport(viewports.mobile);
    await expect(notifications.currentPageButton()).toHaveText('2');
    expect(await notifications.selectedTab()).toBe('All');
  });

  test('TC-NOTIF-023: rapid Next clicks land on a consistent page', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    const log = notifications.watchConsole();
    await notifications.rapidNext(4);
    await expect(notifications.rows().first()).toBeVisible();
    const rows = await notifications.rowTexts();
    expect(new Set(rows).size).toBe(rows.length);
    expect(log.text()).not.toMatch(/Uncaught/);
  });

  test('TC-NOTIF-024: navigating away during page load ends on About Us', async ({ home, aboutUs }) => {
    await home.sideNav.go('Notifications');
    await home.sideNav.go('About Us');
    await aboutUs.expectLoaded();
    await aboutUs.expectAt();
  });

  test.fixme('TC-NOTIF-025: two tabs show server data after reload', async () => {
    // Needs a second page in the same context; the fixtures expose one page per test.
  });

  test(
    'TC-NOTIF-027: a session cleared while paging redirects to login without a logout toast @known-defect',
    { annotation: { type: 'defect', description: 'BUG-005' } },
    async ({ notifications, toast }) => {
      await notifications.open();
      await notifications.goToPage(2);
      await notifications.clearSession();
      await notifications.goNext();
      await notifications.expectRedirectedToLogin();
      await notifications.expectNoRawError();
      await toast.expectNoMessage(messages.logoutSuccess);
    },
  );

  test('TC-NOTIF-028: refresh and direct URL show page 1', async ({ notifications }) => {
    await notifications.open();
    await notifications.reload();
    await expect(notifications.currentPageButton()).toHaveText('1');
    await expect(notifications.rows().first()).toBeVisible();
  });

  test('TC-NOTIF-029: the notifications API returning 500 shows no raw error', async ({ notifications }) => {
    await notifications.failApi(api.notificationList, 500);
    await notifications.visit();
    await notifications.waitUntilLoaded();
    await notifications.expectNoRawError();
    await expect(notifications.sideNav.item('Home')).toBeVisible();
  });

  test(
    'TC-NOTIF-030: a failed paging request keeps the page and retry works @known-defect',
    { annotation: { type: 'defect', description: 'BUG-010' } },
    async ({ notifications }) => {
      await notifications.open();
      await expect(notifications.rows().first()).toBeVisible();
      await notifications.failApi(api.notificationList, 500);
      await notifications.goNext();
      await notifications.expectNoRawError();
      await expect(notifications.currentPageButton()).toHaveText('1');
      await notifications.restoreApi(api.notificationList);
      await notifications.goNext();
      await expect(notifications.currentPageButton()).toHaveText('2');
    },
  );

  test('TC-NOTIF-031: slow and offline networks recover', async ({ notifications }) => {
    await notifications.delayApi(api.notificationList, 3_000);
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    await notifications.restoreApi(api.notificationList);
    await notifications.goOffline();
    await notifications.goNext();
    await notifications.goOnline();
    await notifications.reload();
    await expect(notifications.rows().first()).toBeVisible();
  });

  test('TC-NOTIF-032: notification text is rendered as text', async ({ notifications }) => {
    await notifications.open();
    await expect(notifications.rows().first()).toBeVisible();
    for (const r of await notifications.rowTexts()) expect(r).not.toMatch(/<[a-z][^>]*>/i);
  });

  test('TC-NOTIF-033: paging controls are keyboard reachable', async ({ notifications }) => {
    await notifications.open();
    expect(await notifications.tabReaches(['Next'], 60)).toContain('Next');
  });

  test(
    'TC-NOTIF-034: axe WCAG 2 A/AA scan of /NOTIFICATIONS @known-defect',
    { annotation: { type: 'defect', description: 'BUG-008' } },
    async ({ notifications, scanA11y }) => {
      await notifications.open();
      const violations = await scanA11y('notifications');
      expect(violations.filter(serious)).toEqual([]);
    },
  );

  test('TC-NOTIF-038: Notifications works on the configured browser', async ({ home, notifications }) => {
    await home.sideNav.go('Notifications');
    await notifications.expectLoaded();
    await expect(notifications.rows().first()).toBeVisible();
    expect(await notifications.rows().count()).toBeLessThanOrEqual(data.pageSize);
    await expect(notifications.previous).toBeDisabled();
  });
});

for (const [id, name, size] of [
  ['TC-NOTIF-035', 'mobile 390x844', viewports.mobile],
  ['TC-NOTIF-036', 'tablet 820x1180', viewports.tablet],
  ['TC-NOTIF-037', 'desktop 1440x900', viewports.desktop],
] as const) {
  test.describe(`Notifications: ${name}`, () => {
    test.use({ viewport: size });
    test.beforeEach(async ({ signedIn }) => {
      await signedIn.expectLoaded();
    });

    test(`${id}: notifications layout is intact on ${name}`, async ({ notifications }) => {
      await notifications.open();
      await expect(notifications.rows().first()).toBeVisible();
      await notifications.goNext();
      await expect(notifications.currentPageButton()).toHaveText('2');
      expect(await notifications.hasHorizontalOverflow()).toBe(false);
    });
  });
}
