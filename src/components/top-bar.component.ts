import type { Locator, Page } from '@playwright/test';
import { BaseComponent } from './base.component.js';

/** Top bar: date, Alerts and Notification badges, and the avatar (profile) menu. */
export class TopBar extends BaseComponent {
  constructor(page: Page) {
    super(page, page.getByRole('navigation').first());
  }

  private get avatar(): Locator {
    return this.root.locator('.dropdown.user-account');
  }

  private get menu(): Locator {
    return this.root.locator('.profile-notification');
  }

  /** Visible text of the Alerts badge (the title attribute is the app's own name for it). */
  alertsBadge(): Locator {
    return this.root.getByTitle('Alerts');
  }

  notificationBadge(): Locator {
    return this.root.getByTitle('Notification');
  }

  async notificationCount(): Promise<number> {
    const text = (await this.notificationBadge().innerText()).replace(/\D/g, '');
    return text ? Number(text) : 0;
  }

  menuItem(name: string): Locator {
    return this.menu.getByText(name, { exact: false }).filter({ visible: true });
  }

  menuUserName(): Locator {
    return this.menu.locator('.user-profile-name');
  }

  async openMenu(): Promise<void> {
    await this.avatar.click();
    await this.menu.waitFor({ state: 'visible' });
  }

  /** Toggle by clicking the avatar without waiting for the menu (rapid-click cases). */
  async clickAvatar(): Promise<void> {
    await this.avatar.click();
  }

  async isMenuOpen(): Promise<boolean> {
    return this.menu.isVisible();
  }

  menuLocator(): Locator {
    return this.menu;
  }

  async chooseMenuItem(name: string): Promise<void> {
    await this.openMenu();
    await this.menuItem(name).click();
  }

  async logout(): Promise<void> {
    await this.openMenu();
    await this.menu.locator('.logout').click();
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /** Click an empty part of the page, away from every control. */
  async clickAway(): Promise<void> {
    await this.page.getByRole('heading', { level: 2 }).first().click();
  }
}
