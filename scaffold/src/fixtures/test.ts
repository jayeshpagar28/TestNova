import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadEnv } from '../utils/load-env.js';
import { credentialsFor, envPrefix } from '../utils/project.js';
import { attachSignals, watchSignals, type WebSignals } from '../utils/web-signals.js';
import type { User } from '../data/test-data.js';

// Workers are separate processes and test data is read at module scope, so .env
// is loaded here as well as in the config. loadEnv() caches per process.
loadEnv();

/** One axe violation, trimmed to what a defect report needs. */
export interface A11yViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: number;
}

type Fixtures = {
  /** Console errors, page errors, failed and 4xx/5xx requests, slow pages: always on, attached when non-empty. */
  webSignals: WebSignals;
  /** Run an axe scan of the current page; the result is attached to the test as evidence. */
  scanA11y: (label?: string) => Promise<A11yViolation[]>;
  /** Credentials for a role from .env; skips the test (with the reason) when they are missing. */
  credentials: (roleKey?: string) => User;
};

/**
 * The project's test entry point. Specs import `test` from here, never from
 * '@playwright/test' directly, so every page object arrives as a fixture and no
 * spec constructs one or touches a raw locator.
 *
 * Generated suites register their page objects by extending this in
 * ./pages.ts and re-exporting; see the generator agent's instructions.
 */
export const test = base.extend<Fixtures>({
  webSignals: [
    async ({ page }, use, testInfo) => {
      const signals = watchSignals(page);
      await use(signals);
      await attachSignals(signals, testInfo);
    },
    { auto: true },
  ],

  scanA11y: async ({ page }, use, testInfo) => {
    await use(async (label = 'page') => {
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const violations: A11yViolation[] = result.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
      }));
      await testInfo.attach(`a11y-${label}`, {
        body: JSON.stringify({ url: page.url(), violations }, null, 2),
        contentType: 'application/json',
      });
      return violations;
    });
  },

  credentials: async ({}, use) => {
    await use((roleKey = '') => {
      const c = credentialsFor(roleKey);
      test.skip(
        !c.username || !c.password,
        `No credentials for this role: set ${envPrefix(roleKey)}USERNAME and ${envPrefix(roleKey)}PASSWORD in .env`,
      );
      return c;
    });
  },
});

export { expect };
