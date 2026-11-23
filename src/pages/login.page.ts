import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';
import { Toast } from '../components/toast.component.js';
import {
  api,
  clearBrowserSession,
  countRequests,
  delayRequests,
  failRequests,
  setOffline,
  trackConsole,
  trackUrls,
} from '../utils/conditions.js';
import type { User } from '../data/test-data.js';

export class LoginPage extends BasePage {
  protected readonly path = '/login';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: /Sign In!/ });

  readonly toast: Toast;
  readonly userId: Locator = this.page.getByRole('textbox', { name: 'User Id' });
  readonly password: Locator = this.page.getByRole('textbox', { name: 'Password' });
  readonly loginButton: Locator = this.page.getByRole('button', { name: 'Login' });
  readonly forgotUserId: Locator = this.page.getByText('Forgot User ID ?');
  readonly forgotPassword: Locator = this.page.getByText('Forgot Password ?');
  readonly activateAccount: Locator = this.page.getByText('Activate Account');

  constructor(page: Page) {
    super(page);
    this.toast = new Toast(page);
  }

  /** An email-format error, which the live app does not show (CONFLICT with the document). */
  readonly emailFormatError: Locator = this.page.getByText(/valid email/i);

  /** The visibility icon is an unnamed element right after the password input. */
  passwordToggle(): Locator {
    return this.password.locator('xpath=following-sibling::*[1]');
  }

  validation(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  async fill(userId: string, password: string): Promise<void> {
    await this.userId.fill(userId);
    await this.password.fill(password);
  }

  async submit(): Promise<void> {
    await this.loginButton.click();
  }

  async submitWithEnter(): Promise<void> {
    await this.password.press('Enter');
  }

  async signIn(user: Pick<User, 'username' | 'password'>): Promise<void> {
    await this.fill(user.username, user.password);
    await this.submit();
  }

  async signInWithEnter(user: Pick<User, 'username' | 'password'>): Promise<void> {
    await this.fill(user.username, user.password);
    await this.submitWithEnter();
  }

  /** Submit and report the HTTP status of the token call (0 when none was made). */
  async signInCapturingStatus(user: Pick<User, 'username' | 'password'>): Promise<number> {
    await this.fill(user.username, user.password);
    const response = this.page.waitForResponse((r) => /oauth2\/token/.test(r.url()), { timeout: 15_000 }).catch(() => null);
    await this.submit();
    return (await response)?.status() ?? 0;
  }

  /** Counts (and dismisses) JavaScript dialogs, to prove injected script never ran. */
  watchDialogs(): { count: () => number } {
    let n = 0;
    this.page.on('dialog', (d) => {
      n += 1;
      void d.dismiss();
    });
    return { count: () => n };
  }

  /** Keyboard only: focus User Id, type, Tab, type, Enter. */
  async signInByKeyboard(user: Pick<User, 'username' | 'password'>): Promise<void> {
    await this.userId.focus();
    await this.page.keyboard.type(user.username);
    await this.page.keyboard.press('Tab');
    await this.page.keyboard.type(user.password);
    await this.page.keyboard.press('Enter');
  }

  async doubleClickLogin(): Promise<void> {
    await this.loginButton.dblclick();
  }

  async expectStillOnLogin(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login/i);
    await this.expectLoaded();
  }

  async expectSignedIn(): Promise<void> {
    await expect(this.page).toHaveURL(/\/HOME$/i);
  }

  async passwordInputType(): Promise<string | null> {
    return this.password.getAttribute('type');
  }

  /** Reveal-then-hide via the visibility icon; returns the input type after each click. */
  async toggleVisibility(): Promise<[string | null, string | null]> {
    await this.passwordToggle().click();
    const shown = await this.password.getAttribute('type');
    await this.passwordToggle().click();
    return [shown, await this.password.getAttribute('type')];
  }

  /** Tab order from the page start: the accessible names or ids of what takes focus. */
  async tabOrder(stops = 6): Promise<string[]> {
    const seen: string[] = [];
    for (let i = 0; i < stops; i += 1) {
      await this.page.keyboard.press('Tab');
      seen.push(await this.page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? document.activeElement?.tagName ?? '').trim()));
    }
    return seen;
  }

  async pressTab(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) await this.page.keyboard.press('Tab');
  }

  async focusUserId(): Promise<void> {
    await this.userId.focus();
  }

  async isLinkFocusable(link: Locator): Promise<boolean> {
    return link.evaluate((e) => (e as HTMLElement).tabIndex >= 0);
  }

  // ── web conditions ────────────────────────────────────────────────────────
  tokenCalls(): { count: () => number } {
    return countRequests(this.page, /oauth2\/token/);
  }

  async delayToken(ms: number): Promise<void> {
    await delayRequests(this.page, api.token, ms);
  }

  async failToken(status: number): Promise<void> {
    await failRequests(this.page, api.token, status);
  }

  async restoreToken(): Promise<void> {
    await this.page.unroute(api.token);
  }

  async goOffline(): Promise<void> {
    await setOffline(this.page, true);
  }

  async goOnline(): Promise<void> {
    await setOffline(this.page, false);
  }

  async setViewport(size: { width: number; height: number }): Promise<void> {
    await this.page.setViewportSize(size);
  }

  urlTracker(): { urls: () => string[] } {
    return trackUrls(this.page);
  }

  consoleTracker(): { text: () => string } {
    return trackConsole(this.page);
  }

  async clearSession(): Promise<void> {
    await clearBrowserSession(this.page);
  }

  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }

  /** Text of the whole page body, to prove nothing raw or reflected is shown. */
  async bodyText(): Promise<string> {
    return this.page.locator('body').innerText();
  }

  /** True when `value` is still present in the User Id / Password inputs. */
  async userIdValue(): Promise<string> {
    return this.userId.inputValue();
  }

  async passwordValue(): Promise<string> {
    return this.password.inputValue();
  }

  /** Open a protected route directly while signed out; resolves once the app has decided. */
  async visitProtected(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async expectOn(path: RegExp): Promise<void> {
    await expect(this.page).toHaveURL(path);
  }

  async goBackNoWait(): Promise<void> {
    await this.page.goBack();
  }

  async storedToken(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('token'));
  }
}
