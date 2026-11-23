// Seed for the official Playwright agents (planner_setup_page / generator_setup_page run it to get a
// page). It uses the project's fixtures so web signals are collected from the first navigation, and
// it opens baseURL from the active project. It is not part of any module: the dashboard catalogue
// reads tests/e2e only.
import { test, expect } from '../src/fixtures/test.js';

test.describe('Seed', () => {
  test('seed', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL('about:blank');
  });
});
