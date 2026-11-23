import type { Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

export class HomePage extends ProtectedPage {
  protected readonly path = '/HOME';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'Alerts & Internal Updates' });

  readonly viewAll: Locator = this.mainArea.getByText('View All', { exact: true });
  readonly savingsApplication: Locator = this.page.getByRole('button', { name: /Savings Application/ });

  /** All / Important switch inside the Alerts panel. */
  tab(name: 'All' | 'Important'): Locator {
    return this.mainArea.getByText(name, { exact: true });
  }

  async selectTab(name: 'All' | 'Important'): Promise<void> {
    await this.tab(name).click();
  }

  /** The tab painted as selected: it is the one with an opaque background. */
  async selectedTab(): Promise<string | null> {
    // The panel re-renders right after a tab click; styles read mid-render are blank,
    // so wait (inside the page object) until one tab is painted as selected.
    const deadline = Date.now() + 5000;
    for (;;) {
      for (const name of ['All', 'Important'] as const) {
        const bg = await this.tab(name).evaluate((e) => getComputedStyle(e).backgroundColor);
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return name;
      }
      if (Date.now() > deadline) return null;
      await this.page.waitForTimeout(100);
    }
  }

  /** Alert titles and dates are h3 headings in the main area. */
  alertHeadings(): Locator {
    return this.mainArea.getByRole('heading', { level: 3 });
  }

  async openSavingsApplication(): Promise<void> {
    await this.savingsApplication.click();
  }

  async doubleClickSavingsApplication(): Promise<void> {
    await this.savingsApplication.dblclick();
  }

  iframeCount(): Promise<number> {
    return this.page.locator('iframe').count();
  }

  sideMenuCalls(): { count: () => number } {
    return this.countApiCalls(/admin\/sidemenu\/list/, 'GET');
  }

  /** What the app stored from the side-menu API, for comparison with the labels shown. */
  async storedMenuLabels(): Promise<string> {
    return this.page.evaluate(() => localStorage.getItem('masterMenuList') ?? '');
  }

  /** Links inside the alert list that leave the app. */
  externalLinks(): Locator {
    return this.mainArea.locator('a[href^="http"]');
  }
}
