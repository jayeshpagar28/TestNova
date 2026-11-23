import { defineConfig, devices, type Project } from '@playwright/test';
import { loadEnv } from './src/utils/load-env.js';
import { activeProject, type BrowserName } from './src/utils/project.js';

// Before anything reads process.env: Playwright does not load .env itself, and a
// run without TEST_USERNAME skips every authenticated test and still exits 0.
loadEnv();

/**
 * The project under test comes from the Setup screen (projects/<id>/project.json)
 * or from APP_URL / TEST_BROWSERS / TEST_ENV. With neither, baseURL is unset and
 * global setup fails the run with the fix, rather than every test timing out on
 * a blank page and reading as an app defect.
 */
const project = activeProject();

const DEVICE: Record<BrowserName, (typeof devices)[string]> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

// TESTNOVA_EVIDENCE=on keeps trace and video for every test (the dashboard sets it
// for single-test runs); the default keeps them only where a test failed.
const evidence = process.env.TESTNOVA_EVIDENCE_MODE === 'on' ? 'on' : 'retain-on-failure';

const projects: Project[] = (project?.browsers ?? ['chromium']).map((name) => ({
  name,
  use: { ...DEVICE[name] },
}));

export default defineConfig({
  testDir: './tests',

  globalSetup: './src/global-setup.ts',

  // list for the terminal, html for humans, json for the reporting agents:
  // stages 6-8 need machine-readable results, not scraped console output.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry separates a transient network blip from a real failure. The healer
  // reads both attempts; a test that only passes on retry is reported as flaky.
  retries: 1,
  workers: process.env.TESTNOVA_WORKERS ? Number(process.env.TESTNOVA_WORKERS) : 2,

  use: {
    baseURL: project?.url,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: evidence,
    video: evidence,
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: process.env.TEST_IGNORE_HTTPS_ERRORS === '1',
  },

  projects,
  outputDir: 'test-results',
});
