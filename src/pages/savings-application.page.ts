import type { Locator } from '@playwright/test';
import { ProtectedPage } from './protected.page.js';

/** Application list behind the Home "Savings Application" button. Viewing only: it holds real applicant data. */
export class SavingsApplicationPage extends ProtectedPage {
  protected readonly path = '/UNPOSTED';
  protected readonly identifier: Locator = this.page.getByRole('heading', { name: 'Application List', level: 3 });

  readonly newApplication: Locator = this.mainArea.getByText('New Application');
}
