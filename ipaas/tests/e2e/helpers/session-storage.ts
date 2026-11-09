/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Carrying the console's sessionStorage across Playwright contexts.
 *
 * The Thunder SDK keeps the console's session in sessionStorage, and Playwright's storageState
 * saves cookies and localStorage only. So a setup parks the console tab's sessionStorage in one
 * localStorage entry, which storageState does save, and every context a spec opens copies it
 * back before the console loads. The console never reads the parked entry.
 */

import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';

export const PARKED_SESSION_KEY = 'e2e:session-storage';

export interface StorageEntry {
  name: string;
  value: string;
}

/** Copies the page's sessionStorage into the parked entry; call before saving storageState. */
export async function parkSessionStorage(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const entries = Object.keys(sessionStorage).map((name) => ({ name, value: sessionStorage.getItem(name) ?? '' }));
    localStorage.setItem(key, JSON.stringify(entries));
  }, PARKED_SESSION_KEY);
}

/**
 * Restores the parked entries in every page of the context, before the console's own scripts
 * run. Only entries a tab is missing are written, so a token reseeded into a tab survives that
 * tab's next navigation. Other origins hold no parked entry and are left alone.
 */
export async function restoreSessionStorage(context: BrowserContext): Promise<void> {
  await context.addInitScript((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      for (const { name, value } of JSON.parse(raw) as StorageEntry[]) {
        if (sessionStorage.getItem(name) === null) sessionStorage.setItem(name, value);
      }
    } catch {
      // about:blank and opaque origins have no storage to restore into.
    }
  }, PARKED_SESSION_KEY);
}

/**
 * The OneTrust cookie banner (src/services/tracking) floats over the page and swallows clicks
 * meant for drawers and dialogs. Names are OneTrust's own, read off a run's page snapshot.
 */
export async function rejectCookieBanner(page: Page): Promise<void> {
  const banner = page.getByRole('alertdialog', { name: 'Privacy' });
  await page.addLocatorHandler(banner, async () => {
    await banner.getByRole('button', { name: 'Reject All', exact: true }).click();
  });
}

/** browser.newContext for the console: the saved storageState plus its sessionStorage. */
export async function newConsoleContext(browser: Browser, options: BrowserContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await restoreSessionStorage(context);
  // Caught: registering on a page that has already closed (an OAuth popup, a tab a teardown shut) rejects.
  context.on('page', (page) => void rejectCookieBanner(page).catch(() => {}));
  return context;
}

/** Updates one parked entry, so pages opened later in the context restore the new value. */
export async function updateParkedEntry(page: Page, entry: StorageEntry): Promise<void> {
  await page.evaluate(
    ({ key, next }) => {
      const parked = JSON.parse(localStorage.getItem(key) ?? '[]') as StorageEntry[];
      localStorage.setItem(key, JSON.stringify([...parked.filter((e) => e.name !== next.name), next]));
    },
    { key: PARKED_SESSION_KEY, next: entry },
  );
}
