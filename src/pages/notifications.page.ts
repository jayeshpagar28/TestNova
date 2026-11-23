import { expect, type Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

export class NotificationsPage extends ProtectedPage {
  protected readonly path = '/NOTIFICATIONS';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'Notifications', level: 2 });

  readonly previous: Locator = this.page.getByRole('button', { name: 'Previous', exact: true });
  // exact: notification rows are buttons whose text can contain "next" ("in the next 1 day").
  readonly next: Locator = this.page.getByRole('button', { name: 'Next', exact: true });
  readonly markAllAsRead: Locator = this.mainArea.getByText('Mark All as Read', { exact: true });
  readonly pageSize: Locator = this.page.locator('#RowsPerPageDropdown');

  tab(name: 'All' | 'Unread'): Locator {
    return this.mainArea.getByRole('heading', { name, level: 4, exact: true });
  }

  async selectTab(name: 'All' | 'Unread'): Promise<void> {
    await this.tab(name).click();
  }

  /** The tab painted as selected: the one with an opaque background on its container. */
  async selectedTab(): Promise<string | null> {
    for (const name of ['All', 'Unread'] as const) {
      const bg = await this.tab(name).evaluate((e) => getComputedStyle(e.parentElement ?? e).backgroundColor);
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return name;
    }
    return null;
  }

  /** Notification rows: each is a button inside the list. */
  rows(): Locator {
    return this.mainArea.getByRole('list').getByRole('button');
  }

  async rowTexts(): Promise<string[]> {
    return (await this.rows().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  pageButton(n: number): Locator {
    return this.page.getByRole('button', { name: String(n), exact: true });
  }

  /** The numbered page button painted as current (PrimeNG paginator highlight). */
  currentPageButton(): Locator {
    return this.page.locator('.p-paginator-page.p-highlight');
  }

  async goToPage(n: number): Promise<void> {
    const before = (await this.rowTexts()).join('|');
    await this.pageButton(n).click();
    await expect(this.currentPageButton()).toHaveText(String(n));
    // The highlight moves before the rows are replaced; wait for the new rows so callers
    // never read the previous page's list. (If rows really are identical, callers' own
    // assertions see it once the wait times out.)
    await expect
      .poll(async () => (await this.rowTexts()).join('|'), { timeout: 5_000 })
      .not.toBe(before)
      .catch(() => undefined);
  }

  async goNext(): Promise<void> {
    await this.next.click();
  }

  async goPrevious(): Promise<void> {
    await this.previous.click();
  }

  async rapidNext(times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      if (await this.next.isDisabled()) break;
      await this.next.click({ noWaitAfter: true });
    }
  }

  async goToLastPage(limit = 200): Promise<void> {
    for (let i = 0; i < limit; i += 1) {
      if (await this.next.isDisabled()) return;
      await this.next.click();
    }
  }

  async choosePageSize(size: number): Promise<void> {
    await this.pageSize.click();
    await this.page.getByRole('option', { name: String(size), exact: true }).click();
  }

  async pageSizeOptions(): Promise<string[]> {
    await this.pageSize.click();
    const options = await this.page.getByRole('option').allInnerTexts();
    await this.page.keyboard.press('Escape');
    return options.map((o) => o.trim());
  }

  listCalls(): { count: () => number } {
    return this.countApiCalls(/notification\/list/, 'GET');
  }
}
