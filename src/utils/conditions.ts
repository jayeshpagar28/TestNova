import type { Page, Route } from '@playwright/test';

/**
 * Web conditions (network failure, delay, offline, cleared session) shared by page
 * objects. Specs never call these directly: a page object exposes them as intent.
 */

export const api = {
  token: '**/oauth2/token*',
  sidemenu: '**/admin/sidemenu/list*',
  notificationList: '**/notification/list*',
} as const;

/** Answer every matching request with `status` and a small JSON body. */
export async function failRequests(page: Page, pattern: string | RegExp, status: number): Promise<void> {
  await page.route(pattern, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: 'forced failure' }) }),
  );
}

/** Hold every matching request for `ms` before letting it through. */
export async function delayRequests(page: Page, pattern: string | RegExp, ms: number): Promise<void> {
  await page.route(pattern, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });
}

export async function stopIntercepting(page: Page, pattern: string | RegExp): Promise<void> {
  await page.unroute(pattern);
}

export async function setOffline(page: Page, offline: boolean): Promise<void> {
  await page.context().setOffline(offline);
}

/** Count requests matching a URL pattern from now on. */
export function countRequests(page: Page, pattern: RegExp, method = 'POST'): { count: () => number } {
  let n = 0;
  page.on('request', (r) => {
    if (r.method() === method && pattern.test(r.url())) n += 1;
  });
  return { count: () => n };
}

/** Drop the session the way an expiry would: cookies and web storage. */
export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/** Collect every URL the page visits (for "no credentials in the URL"). */
export function trackUrls(page: Page): { urls: () => string[] } {
  const seen: string[] = [page.url()];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) seen.push(f.url());
  });
  return { urls: () => seen };
}

/** Collect console messages (for "password is never logged"). */
export function trackConsole(page: Page): { text: () => string } {
  const lines: string[] = [];
  page.on('console', (m) => lines.push(m.text()));
  return { text: () => lines.join('\n') };
}
