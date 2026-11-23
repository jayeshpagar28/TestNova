import type { Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

/** Language chooser. Read-only here: no option is ever selected. */
export class LanguagePage extends ProtectedPage {
  protected readonly path = '/LANGUAGE';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'Choose Your Language', level: 4 });

  option(name: string): Locator {
    return this.mainArea.getByRole('heading', { name, level: 4, exact: true });
  }
}
