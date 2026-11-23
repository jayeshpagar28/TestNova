import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared behaviour for every page object.
 *
 * Subclasses declare their locators as fields and must provide:
 *   - `path`: the route this page lives at, relative to baseURL ('' when it has no
 *     stable URL, e.g. a wizard step)
 *   - `identifier`: one locator unique to this page, used to decide "am I here?"
 *
 * Specs never touch a raw locator: they call the methods defined here and on the
 * subclasses. Page objects own the UI; specs own the intent.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Route relative to baseURL, e.g. '/login'. Empty when the page has no URL of its own. */
  protected abstract readonly path: string;

  /** A locator present only on this page. A shared heading is not unique. */
  protected abstract readonly identifier: Locator;

  /** Navigate directly to this page and wait for it. */
  async open(): Promise<this> {
    if (!this.path) throw new Error(`${this.constructor.name} has no direct route; reach it through navigation.`);
    await this.page.goto(this.path);
    return this.waitUntilLoaded();
  }

  /** Block until this page is on display. Returns `this` so calls chain. */
  async waitUntilLoaded(timeout = 15_000): Promise<this> {
    await this.identifier.waitFor({ state: 'visible', timeout });
    return this;
  }

  /** Non-throwing check. Use in assertions, not for waiting. */
  async isDisplayed(timeout = 5_000): Promise<boolean> {
    try {
      await this.identifier.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Web-assertion form of isDisplayed, with Playwright's retrying and error message. */
  async expectLoaded(): Promise<void> {
    await expect(this.identifier).toBeVisible();
  }

  /** Current URL path (no origin), for persistence and redirect assertions. */
  currentPath(): string {
    return new URL(this.page.url()).pathname;
  }

  /** Reload and wait: the web form of "relaunch the app and confirm it persisted". */
  async reload(): Promise<this> {
    await this.page.reload();
    return this.waitUntilLoaded();
  }

  /** Browser back, then wait for whichever page the caller expects. */
  async back(): Promise<void> {
    await this.page.goBack();
  }

  // ── locator helpers, in order of preference ───────────────────────────────
  // 1. byRole: what a user and a screen reader perceive
  // 2. byLabel: form controls
  // 3. byTestId: when the app exposes data-testid
  // 4. byText: last resort, breaks on every copy change

  protected byRole(role: Parameters<Page['getByRole']>[0], name?: string | RegExp, exact = false): Locator {
    return this.page.getByRole(role, name === undefined ? {} : { name, exact });
  }

  protected byLabel(label: string | RegExp, exact = false): Locator {
    return this.page.getByLabel(label, { exact });
  }

  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  protected byText(text: string | RegExp, exact = false): Locator {
    return this.page.getByText(text, { exact });
  }
}
