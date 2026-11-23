import type { Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

/** Change Password is a page (not a dialog) and offers no Cancel. Nothing here ever submits a new password. */
export class ChangePasswordPage extends ProtectedPage {
  protected readonly path = '/CHANGE_PASSWORD';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'Change Password', level: 2 });

  readonly updateButton: Locator = this.page.getByRole('button', { name: 'Update Password' });

  required(text: string): Locator {
    return this.mainArea.getByText(text, { exact: true });
  }

  async submitEmpty(): Promise<void> {
    await this.updateButton.click();
  }
}
