import { test, expect } from '../../src/fixtures/pages.js';
import { inputs, invalid, messages, pendingMs, protectedRoutes, routes, viewports } from '../../src/data/test-data.js';

const serious = (v: { impact: string | null }) => v.impact === 'critical' || v.impact === 'serious';

test.describe('Login: signed out', () => {
  test.beforeEach(async ({ login }) => {
    await login.open();
  });

  test('TC-LOGIN-001: valid user signs in and lands on Home', async ({ login, home, credentials }) => {
    await login.signIn(credentials());
    await login.expectSignedIn();
    await home.expectLoaded();
  });

  test('TC-LOGIN-002: session persists after reload on Home', async ({ login, home, credentials }) => {
    await login.signIn(credentials());
    await home.waitUntilLoaded();
    await home.reload();
    await home.expectAt();
  });

  test('TC-LOGIN-003: Enter key submits the login form', async ({ login, credentials }) => {
    await login.signInWithEnter(credentials());
    await login.expectSignedIn();
  });

  test('TC-LOGIN-004: both fields empty shows Enter User Id', async ({ login }) => {
    const tokens = login.tokenCalls();
    await login.submit();
    await expect(login.validation(messages.userIdRequired)).toBeVisible();
    await login.expectStillOnLogin();
    expect(tokens.count()).toBe(0);
  });

  test('TC-LOGIN-005: User Id filled, password empty shows Enter password', async ({ login, credentials }) => {
    await login.fill(credentials().username, '');
    await login.submit();
    await expect(login.validation(messages.passwordRequired)).toBeVisible();
    await login.expectStillOnLogin();
  });

  test('TC-LOGIN-006: password filled, User Id empty shows Enter User Id', async ({ login, credentials }) => {
    await login.fill('', credentials().password);
    await login.submit();
    await expect(login.validation(messages.userIdRequired)).toBeVisible();
    await login.expectStillOnLogin();
  });

  test(
    'TC-LOGIN-007: wrong password via Enter shows generic toast @known-defect',
    { annotation: { type: 'defect', description: 'BUG-001' } },
    async ({ login, toast, credentials }) => {
      await login.fill(credentials().username, invalid.password);
      await login.submitWithEnter();
      await toast.expectMessage(messages.credentialsIncorrect);
      await login.expectStillOnLogin();
    },
  );

  test(
    'TC-LOGIN-008: unknown User Id gives the same generic message @known-defect',
    { annotation: { type: 'defect', description: 'BUG-001' } },
    async ({ login, toast, credentials }) => {
      await login.fill(invalid.username, invalid.password);
      await login.submitWithEnter();
      const unknownUser = await toast.text();
      expect(unknownUser).toContain(messages.credentialsIncorrect);
      await toast.close();
      await toast.waitUntilHidden();
      await login.fill(credentials().username, invalid.password);
      await login.submitWithEnter();
      expect(await toast.text()).toBe(unknownUser);
    },
  );

  test('TC-LOGIN-009: server 400 on bad credentials is shown in plain language', async ({ login, toast }) => {
    const status = await login.signInCapturingStatus(invalid);
    expect(status).toBe(400);
    await expect(toast.message(/\S/)).toBeVisible();
    expect(await login.bodyText()).not.toMatch(/\{\s*"|invalid_grant|exception|stack/i);
  });

  test('TC-LOGIN-010: User Id is not format-validated as an email', async ({ login, toast }) => {
    await login.fill(inputs.notAnEmail, invalid.password);
    await login.submit();
    await toast.expectMessage(messages.credentialsIncorrect);
    await expect(login.emailFormatError).toHaveCount(0);
  });

  test('TC-LOGIN-011: password is masked', async ({ login, credentials }) => {
    await login.password.fill(credentials().password);
    expect(await login.passwordInputType()).toBe('password');
  });

  test(
    'TC-LOGIN-012: password visibility toggle is operable and named @known-defect',
    { annotation: [{ type: 'defect', description: 'BUG-002' }, { type: 'defect', description: 'BUG-008' }] },
    async ({ login, credentials }) => {
      await login.password.fill(credentials().password);
      await expect(login.passwordToggle()).toHaveAccessibleName(/show|hide|password|visib/i);
      expect(await login.isLinkFocusable(login.passwordToggle())).toBe(true);
      const [shown, hidden] = await login.toggleVisibility();
      expect(shown).toBe('text');
      expect(hidden).toBe('password');
    },
  );

  test('TC-LOGIN-013: spaces around the User Id are handled', async ({ login, credentials }) => {
    const c = credentials();
    const status = await login.signInCapturingStatus({ username: ` ${c.username} `, password: c.password });
    expect(status).toBeLessThan(500);
    await login.expectSignedIn();
  });

  test('TC-LOGIN-014: very long input is handled without a server error', async ({ login }) => {
    const status = await login.signInCapturingStatus({ username: inputs.long, password: inputs.long });
    expect(status).toBeLessThan(500);
    await login.expectStillOnLogin();
  });

  test('TC-LOGIN-015: special, script and SQL text are rejected safely', async ({ login, toast }) => {
    const dialogs = login.watchDialogs();
    const status = await login.signInCapturingStatus({ username: inputs.sqlInjection, password: inputs.script });
    expect(status).toBeLessThan(500);
    await toast.expectMessage(/\S/);
    await login.expectStillOnLogin();
    expect(dialogs.count()).toBe(0);
    expect(await login.bodyText()).not.toContain(inputs.script);
    await toast.close();
    const unicodeStatus = await login.signInCapturingStatus({ username: inputs.unicode, password: inputs.unicode });
    expect(unicodeStatus).toBeLessThan(500);
    await login.expectStillOnLogin();
  });

  test('TC-LOGIN-016: login is guarded while the request is pending', async ({ login, credentials }) => {
    await login.delayToken(pendingMs);
    const tokens = login.tokenCalls();
    await login.fill(credentials().username, credentials().password);
    await login.submit();
    await login.loginButton.click({ force: true, noWaitAfter: true }).catch(() => undefined);
    await login.expectSignedIn();
    expect(tokens.count()).toBe(1);
  });

  test('TC-LOGIN-017: the form recovers after a failed login without reload', async ({ login, toast, credentials }) => {
    await login.fill(credentials().username, invalid.password);
    await login.submit();
    await toast.expectMessage(/\S/);
    await expect(login.loginButton).toBeEnabled();
    await login.signIn(credentials());
    await login.expectSignedIn();
  });

  test('TC-LOGIN-018: double-click on Login sends one token request', async ({ login, credentials }) => {
    const tokens = login.tokenCalls();
    await login.fill(credentials().username, credentials().password);
    await login.doubleClickLogin();
    await login.expectSignedIn();
    expect(tokens.count()).toBe(1);
  });

  test('TC-LOGIN-019: navigating away while login is pending leaves a clean state', async ({ login, credentials }) => {
    await login.delayToken(pendingMs);
    await login.signIn(credentials());
    await login.visitProtected(routes.login);
    await login.expectOn(/\/(login|HOME)$/i);
  });

  test('TC-LOGIN-021: after logout /HOME cannot be opened', async ({ login, home, credentials }) => {
    await login.signIn(credentials());
    await home.waitUntilLoaded();
    await home.topBar.logout();
    await login.expectOn(/\/login/i);
    await login.visitProtected(routes.home);
    await login.expectOn(/\/login/i);
  });

  test('TC-LOGIN-022: each protected URL redirects to /login when signed out', async ({ login }) => {
    for (const path of protectedRoutes) {
      await login.visitProtected(path);
      await login.expectOn(/\/login/i);
    }
  });

  test('TC-LOGIN-027: refresh on /login keeps the page and clears the fields', async ({ login, credentials }) => {
    await login.fill(credentials().username, credentials().password);
    await login.reload();
    expect(await login.passwordValue()).toBe('');
  });

  test('TC-LOGIN-029: no credentials or tokens appear in any URL', async ({ login, credentials }) => {
    const c = credentials();
    const urls = login.urlTracker();
    await login.signIn({ username: c.username, password: invalid.password });
    await login.toast.expectMessage(/\S/);
    await login.signIn(c);
    await login.expectSignedIn();
    for (const u of urls.urls()) {
      expect(u).not.toContain(encodeURIComponent(c.password));
      expect(u).not.toContain(encodeURIComponent(c.username));
      expect(u).not.toMatch(/[?&](token|password|pwd)=/i);
    }
  });

  test('TC-LOGIN-030: the password is not written to the console', async ({ login, credentials }) => {
    const c = credentials();
    const log = login.consoleTracker();
    await login.signIn(c);
    await login.expectSignedIn();
    expect(log.text()).not.toContain(c.password);
  });

  test.fixme('TC-LOGIN-031: login failures leave an audit trail', async () => {
    // No audit view is exposed to the User role (GAP-003); nothing to automate.
  });

  test(
    'TC-LOGIN-032: Forgot Password, Forgot User ID and Activate Account links are present and keyboard reachable @known-defect',
    { annotation: { type: 'defect', description: 'BUG-002' } },
    async ({ login }) => {
      for (const link of [login.forgotUserId, login.forgotPassword, login.activateAccount]) {
        await expect(link).toBeVisible();
        expect(await login.isLinkFocusable(link)).toBe(true);
      }
    },
  );

  test('TC-LOGIN-033: the entered User Id survives a failed attempt', async ({ login, credentials }) => {
    const c = credentials();
    await login.fill(c.username, invalid.password);
    await login.submit();
    await login.toast.expectMessage(/\S/);
    expect(await login.userIdValue()).toBe(c.username);
  });

  test('TC-LOGIN-034: offline during login keeps the form and recovers when online', async ({ login, credentials }) => {
    await login.fill(credentials().username, credentials().password);
    await login.goOffline();
    await login.submit();
    await login.expectStillOnLogin();
    await login.goOnline();
    await login.submit();
    await login.expectSignedIn();
  });

  test('TC-LOGIN-035: token API returning 500 shows a plain error and re-enables Login', async ({ login, credentials }) => {
    await login.failToken(500);
    await login.signIn(credentials());
    await login.expectStillOnLogin();
    await expect(login.loginButton).toBeEnabled();
    expect(await login.bodyText()).not.toMatch(/forced failure|\{\s*"/i);
  });

  test('TC-LOGIN-036: login completes on a slow network', async ({ login, credentials }) => {
    await login.delayToken(pendingMs);
    await login.signIn(credentials());
    await login.expectSignedIn();
  });

  test(
    'TC-LOGIN-037: keyboard-only sign in has a logical tab order @known-defect',
    { annotation: { type: 'defect', description: 'BUG-002' } },
    async ({ login, credentials }) => {
      await login.focusUserId();
      const order = await login.tabOrder(5);
      expect(order.join('|')).toMatch(/Forgot User ID/);
      expect(order.join('|')).toMatch(/Forgot Password/);
      await login.reload();
      await login.signInByKeyboard(credentials());
      await login.expectSignedIn();
    },
  );

  test('TC-LOGIN-038: axe WCAG 2 A/AA scan of /login', async ({ scanA11y }) => {
    const violations = await scanA11y('login');
    expect(violations.filter(serious)).toEqual([]);
  });

  test(
    'TC-LOGIN-039: validation errors are tied to their field @known-defect',
    { annotation: { type: 'defect', description: 'BUG-008' } },
    async ({ login }) => {
      await login.submit();
      await expect(login.validation(messages.userIdRequired)).toBeVisible();
      await expect(login.userId).toHaveAccessibleDescription(new RegExp(messages.userIdRequired));
    },
  );

  test('TC-LOGIN-044: login page content matches the observed application', async ({ login, home, credentials }) => {
    await expect(login.userId).toBeVisible();
    await expect(login.password).toBeVisible();
    await expect(login.forgotUserId).toBeVisible();
    await expect(login.forgotPassword).toBeVisible();
    await expect(login.activateAccount).toBeVisible();
    await login.signIn(credentials());
    await home.expectLoaded();
  });
});

test.describe('Login: signed in', () => {
  test.beforeEach(async ({ signedIn }) => {
    await signedIn.expectLoaded();
  });

  test('TC-LOGIN-020: logout from the avatar menu', async ({ home, login, toast }) => {
    await home.topBar.logout();
    await login.expectOn(/\/login/i);
    await toast.expectMessage(messages.logoutSuccess);
  });

  test('TC-LOGIN-023: Back after logout does not show protected content', async ({ home, login }) => {
    await home.topBar.logout();
    await login.expectOn(/\/login/i);
    await login.goBackNoWait();
    await login.expectOn(/\/login/i);
    expect(await login.storedToken()).toBeNull();
  });

  test(
    'TC-LOGIN-024: a session cleared mid-flow redirects to login without a logout toast @known-defect',
    { annotation: { type: 'defect', description: 'BUG-005' } },
    async ({ home, notifications, toast, login }) => {
      await home.sideNav.go('Notifications');
      await notifications.expectLoaded();
      await notifications.clearSession();
      await notifications.sideNav.go('Home');
      await login.expectOn(/\/login/i);
      await toast.expectNoMessage(messages.logoutSuccess);
    },
  );

  test.fixme('TC-LOGIN-025: logout in one tab, the other tab acts on a stale session', async () => {
    // Needs a second browser page in the same context; the fixtures expose one page per test.
  });

  test('TC-LOGIN-026: Back after a successful login keeps the app usable', async ({ login }) => {
    await login.goBackNoWait();
    await login.expectOn(/\/(login|HOME)$/i);
    expect(await login.bodyText()).not.toContain('undefined');
  });

  test('TC-LOGIN-028: a signed-in user opening /login is sent to Home', async ({ login }) => {
    await login.visitProtected(routes.login);
    await login.expectOn(/\/HOME$/i);
  });

  test('TC-LOGIN-043: the critical login flow works on the configured browser', async ({ home, login }) => {
    await home.expectLoaded();
    await home.topBar.logout();
    await login.expectOn(/\/login/i);
  });
});

for (const [id, name, size] of [
  ['TC-LOGIN-040', 'mobile 390x844', viewports.mobile],
  ['TC-LOGIN-041', 'tablet 820x1180', viewports.tablet],
  ['TC-LOGIN-042', 'desktop 1440x900', viewports.desktop],
] as const) {
  test.describe(`Login: ${name}`, () => {
    test.use({ viewport: size });

    test(`${id}: login works on ${name}`, async ({ login, home, credentials }) => {
      await login.open();
      expect(await login.hasHorizontalOverflow()).toBe(false);
      await login.signIn(credentials());
      await home.expectLoaded();
    });
  });
}
