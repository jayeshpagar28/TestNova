import type { Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

export class MyProfilePage extends ProtectedPage {
  protected readonly path = '/MY_PROFILE';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'Profile', level: 2, exact: true });

  field(label: string): Locator {
    return this.mainArea.getByRole('textbox', { name: label, exact: true });
  }

  label(text: string): Locator {
    return this.mainArea.getByRole('heading', { name: text, level: 4, exact: true });
  }

  roleLabel(text: string): Locator {
    return this.label(text);
  }

  /** Every input and textarea on the form. */
  controls(): Locator {
    return this.mainArea.locator('input, textarea');
  }

  async enabledControlCount(): Promise<number> {
    return this.controls().evaluateAll((els) => els.filter((e) => !(e as HTMLInputElement).disabled).length);
  }

  async value(label: string): Promise<string> {
    return this.field(label).inputValue();
  }

  /** Save, Edit, Update or Delete controls. */
  changeActions(): Locator {
    return this.mainArea.getByRole('button', { name: /save|edit|update|delete/i });
  }

  /** Try to type into a disabled field; Playwright cannot, so this asks the DOM. */
  async tryTyping(label: string, text: string): Promise<string> {
    const f = this.field(label);
    const before = await f.inputValue();
    await f.click({ force: true });
    await this.page.keyboard.type(text);
    const after = await f.inputValue();
    return before === after ? 'unchanged' : after;
  }
}
