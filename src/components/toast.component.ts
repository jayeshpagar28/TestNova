import { expect, type Locator, type Page } from '@playwright/test';
import { BaseComponent } from './base.component.js';

/** The alert toast (login errors, logout confirmation). Owns its Close button. */
export class Toast extends BaseComponent {
  constructor(page: Page) {
    super(page, page.getByRole('alert').first());
  }

  message(text: string | RegExp): Locator {
    return this.root.filter({ hasText: text });
  }

  async expectMessage(text: string | RegExp): Promise<void> {
    await expect(this.message(text)).toBeVisible();
  }

  async expectNoMessage(text: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('alert').filter({ hasText: text })).toHaveCount(0);
  }

  async text(): Promise<string> {
    await this.root.waitFor({ state: 'visible' });
    return (await this.root.innerText()).replace(/\s+/g, ' ').trim();
  }

  async close(): Promise<void> {
    const close = this.root.getByRole('button', { name: 'Close' });
    if (await close.isVisible()) await close.click();
  }
}
