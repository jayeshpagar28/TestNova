import type { Locator, Page } from '@playwright/test';

/**
 * UI shared across pages (header, nav, dialogs, toasts, tables), scoped to a
 * root locator so a component never matches something elsewhere on the page.
 * A locator that changes is fixed once here, and every page inherits the fix.
 */
export abstract class BaseComponent {
  constructor(
    protected readonly page: Page,
    protected readonly root: Locator,
  ) {}

  async isVisible(timeout = 5_000): Promise<boolean> {
    try {
      await this.root.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitUntilVisible(timeout = 15_000): Promise<this> {
    await this.root.waitFor({ state: 'visible', timeout });
    return this;
  }

  async waitUntilHidden(timeout = 15_000): Promise<void> {
    await this.root.waitFor({ state: 'hidden', timeout });
  }
}
