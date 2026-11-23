import { test as base, expect } from './test.js';

/**
 * Page-object registry. Every page and component is a fixture here, so specs
 * import `test` from this file and never construct a page object or touch a
 * raw locator.
 *
 * Empty in a new project: stage 5 of the AI Pipeline (the test generator)
 * registers each page object it writes under src/pages/ and src/components/.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Pages = {};

export const test = base.extend<Pages>({});

export { expect };
