import type { Locator, Page } from '@playwright/test';
import { BaseComponent } from './base.component.js';

/** Side navigation (Home, My Profile, Notifications, About Us). Items are li > a without roles. */
export class SideNav extends BaseComponent {
  constructor(page: Page) {
    super(page, page.getByRole('main').getByRole('navigation'));
  }

  item(name: string): Locator {
    return this.root.getByRole('listitem').filter({ hasText: new RegExp(`^${name}$`) });
  }

  /** The text part of an item; hidden when the sidebar is collapsed to icons. */
  label(name: string): Locator {
    return this.item(name).locator('span');
  }

  /** The sidebar collapse/expand button (an unnamed button, first in the nav). */
  toggle(): Locator {
    return this.root.getByRole('button').first();
  }

  async go(name: string): Promise<void> {
    await this.item(name).click();
  }

  async goRepeatedly(name: string, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) await this.item(name).click({ noWaitAfter: true });
  }

  async labels(): Promise<string[]> {
    const texts = await this.root.locator('a.nav-link').allInnerTexts();
    return texts.map((t) => t.trim());
  }

  /**
   * Label of the highlighted item. The app marks it with inline styling rather than
   * a class or aria-current, so the item whose computed colours differ from the
   * rest is the active one. Null when all look alike.
   */
  async highlighted(): Promise<string | null> {
    const rows = await this.root.locator('a.nav-link').evaluateAll((els) =>
      els.map((e) => {
        const cs = getComputedStyle(e as HTMLElement);
        const li = getComputedStyle((e as HTMLElement).parentElement as HTMLElement);
        return { label: (e.textContent ?? '').trim(), sig: [cs.color, cs.backgroundColor, li.backgroundColor, cs.fontWeight].join('|') };
      }),
    );
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.sig, (counts.get(r.sig) ?? 0) + 1);
    const odd = rows.filter((r) => counts.get(r.sig) === 1);
    return odd.length === 1 ? odd[0].label : null;
  }
}
