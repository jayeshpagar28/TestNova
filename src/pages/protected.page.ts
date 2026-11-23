import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';
import { SideNav } from '../components/side-nav.component.js';
import { Toast } from '../components/toast.component.js';
import { TopBar } from '../components/top-bar.component.js';
import {
  clearBrowserSession,
  countRequests,
  delayRequests,
  failRequests,
  setOffline,
  stopIntercepting,
  trackConsole,
} from '../utils/conditions.js';

/**
 * A page behind the login wall. Carries the shared shell (top bar, side nav,
 * toast) and the web-condition helpers every protected page needs.
 */
export abstract class ProtectedPage extends BasePage {
  readonly topBar: TopBar;
  readonly sideNav: SideNav;
  readonly toast: Toast;

  constructor(page: Page) {
    super(page);
    this.topBar = new TopBar(page);
    this.sideNav = new SideNav(page);
    this.toast = new Toast(page);
  }

  /** Request the URL and return without waiting for this page (used when a redirect is expected). */
  async visit(): Promise<void> {
    await this.page.goto(this.path);
  }

  async expectRedirectedToLogin(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login/i);
  }

  async expectAt(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${this.path}$`, 'i'));
  }

  async forward(): Promise<void> {
    await this.page.goForward();
  }

  async reloadWithoutWaiting(): Promise<void> {
    await this.page.reload();
  }

  /** Reload while offline; the browser refuses, which is the expected outcome here. */
  async reloadExpectingFailure(): Promise<void> {
    await this.page.reload().catch(() => undefined);
  }

  /** Number of distinct elements that take focus over `presses` Tab presses. */
  async distinctFocusStops(presses = 10): Promise<number> {
    const stops = new Set<string>();
    for (let i = 0; i < presses; i += 1) {
      await this.pressTab();
      stops.add(
        await this.page.evaluate(() => {
          const e = document.activeElement as HTMLElement | null;
          return e ? `${e.tagName}|${(e.textContent ?? '').trim().slice(0, 40)}|${e.className}` : 'none';
        }),
      );
    }
    return stops.size;
  }

  async clearSession(): Promise<void> {
    await clearBrowserSession(this.page);
  }

  async failApi(pattern: string | RegExp, status: number): Promise<void> {
    await failRequests(this.page, pattern, status);
  }

  async delayApi(pattern: string | RegExp, ms: number): Promise<void> {
    await delayRequests(this.page, pattern, ms);
  }

  async restoreApi(pattern: string | RegExp): Promise<void> {
    await stopIntercepting(this.page, pattern);
  }

  async goOffline(): Promise<void> {
    await setOffline(this.page, true);
  }

  async goOnline(): Promise<void> {
    await setOffline(this.page, false);
  }

  countApiCalls(pattern: RegExp, method = 'GET'): { count: () => number } {
    return countRequests(this.page, pattern, method);
  }

  watchConsole(): { text: () => string } {
    return trackConsole(this.page);
  }

  async setViewport(size: { width: number; height: number }): Promise<void> {
    await this.page.setViewportSize(size);
  }

  async pressTab(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) await this.page.keyboard.press('Tab');
  }

  async pressEnter(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  /** Text of the element holding keyboard focus. */
  async focusedText(): Promise<string> {
    return this.page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
  }

  /** Tab through the page and report whether each wanted label ever took focus. */
  async tabReaches(labels: string[], maxTabs = 40): Promise<string[]> {
    const reached = new Set<string>();
    for (let i = 0; i < maxTabs; i += 1) {
      await this.pressTab();
      const t = await this.focusedText();
      for (const l of labels) if (t.includes(l)) reached.add(l);
    }
    return [...reached];
  }

  /** True when the page overflows horizontally (clipped or scrolling sideways). */
  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }

  /** Raw HTTP/stack text must never reach the user. */
  async expectNoRawError(): Promise<void> {
    const body = this.page.locator('body');
    await expect(body).not.toContainText(/\b401\b|Unauthorized|stack|Traceback|\[object Object\]/i);
  }

  protected get mainArea(): Locator {
    return this.page.getByRole('main');
  }

  async bodyText(): Promise<string> {
    return this.page.locator('body').innerText();
  }
}
