import type { Page, TestInfo } from '@playwright/test';

/**
 * The web signals the defect analysis stage reads: console errors, uncaught page
 * errors, failed requests, 4xx/5xx responses and slow navigations. Collected for
 * every test and attached as JSON. A test that passed while the page threw an
 * uncaught exception or got a 500 did not really pass, and stage 7 says so.
 */

export interface WebSignals {
  consoleErrors: { text: string; url: string }[];
  pageErrors: { message: string }[];
  failedRequests: { method: string; url: string; failure: string }[];
  httpErrors: { method: string; url: string; status: number }[];
  slowNavigations: { url: string; ms: number }[];
}

/** A navigation slower than this is reported. Override with TESTNOVA_SLOW_PAGE_MS. */
const SLOW_MS = Number(process.env.TESTNOVA_SLOW_PAGE_MS ?? 5_000);

/** Noise that is never a defect in the app under test. */
const IGNORE = /favicon\.ico|google-analytics|googletagmanager|doubleclick|hotjar|sentry\.io/i;

export function watchSignals(page: Page): WebSignals {
  const s: WebSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], slowNavigations: [] };
  const started = new Map<string, number>();

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORE.test(msg.location().url)) {
      s.consoleErrors.push({ text: msg.text(), url: msg.location().url });
    }
  });
  page.on('pageerror', (error) => s.pageErrors.push({ message: error.message }));
  page.on('requestfailed', (req) => {
    if (IGNORE.test(req.url())) return;
    const failure = req.failure()?.errorText ?? 'failed';
    // Aborted by navigation is the browser cancelling an obsolete request, not a fault.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure)) return;
    s.failedRequests.push({ method: req.method(), url: req.url(), failure });
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !IGNORE.test(res.url())) {
      s.httpErrors.push({ method: res.request().method(), url: res.url(), status: res.status() });
    }
  });
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) started.set(req.url(), Date.now());
  });
  page.on('load', () => {
    const url = page.url();
    const t0 = started.get(url);
    if (t0 !== undefined) {
      const ms = Date.now() - t0;
      if (ms > SLOW_MS) s.slowNavigations.push({ url, ms });
      started.delete(url);
    }
  });
  return s;
}

export function signalCount(s: WebSignals): number {
  return s.consoleErrors.length + s.pageErrors.length + s.failedRequests.length + s.httpErrors.length + s.slowNavigations.length;
}

export async function attachSignals(s: WebSignals, testInfo: TestInfo): Promise<void> {
  if (signalCount(s) === 0) return;
  await testInfo.attach('web-signals', { body: JSON.stringify(s, null, 2), contentType: 'application/json' });
}
