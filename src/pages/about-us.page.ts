import type { Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

export class AboutUsPage extends ProtectedPage {
  protected readonly path = '/ABOUT_US';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'About Us', level: 1 });

  section(name: string): Locator {
    return this.mainArea.getByRole('heading', { name, exact: true });
  }

  /** Items of the list that follows a section heading. */
  sectionItems(): Locator {
    return this.mainArea.getByRole('listitem').filter({ hasNot: this.page.getByRole('list') });
  }

  /** Inputs, selects and textareas: a read-only page has none. */
  editableControls(): Locator {
    return this.mainArea.locator('input, select, textarea');
  }

  /** Buttons other than the sidebar toggle. */
  dataActions(): Locator {
    return this.mainArea.getByRole('button').filter({ hasNot: this.page.locator('nav') }).filter({ hasText: /\S/ });
  }

  async brokenImages(): Promise<number> {
    return this.mainArea.locator('img').evaluateAll(
      (imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length,
    );
  }

  async scrollToEnd(): Promise<void> {
    await this.page.mouse.wheel(0, 10_000);
  }
}
