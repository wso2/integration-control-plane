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

/** Getting into the console, staying signed in, and reaching the fixture project. */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { reseedSessionToken, waitForApiConfig } from './cloud-fixtures.js';
import { expandSidebar, gotoOrgHome, openProject } from './console-nav.js';
import { dismissStrayDialog } from './journey-envcard.js';
import { PROJECT, PROJECT_REMOVAL_TIMEOUT_MS } from './journey-fixtures.js';

/** Parked on config.json first: reseeding writes through the page, so it needs the console's origin. */
export async function refreshSession(page: Page): Promise<void> {
  if (!process.env.E2E_TOKEN_MODE) return;
  await page.goto('/config.json', { waitUntil: 'domcontentloaded' });
  await reseedSessionToken(page);
}

/** Tops the session up without leaving the page: a token expires inside this suite's longest waits. */
export async function reseedHere(page: Page): Promise<void> {
  if (!process.env.E2E_TOKEN_MODE) return;
  const here = page.url();
  await page.goto('/config.json', { waitUntil: 'domcontentloaded' });
  await reseedSessionToken(page);
  await page.goto(here, { waitUntil: 'domcontentloaded' });
}

/** A dead session should say so, not time out on content that will never render. */
export function assertSignedIn(page: Page): void {
  const url = page.url();
  if (/\/gate\/signin|platform-idp/.test(url)) {
    throw new Error(`the console redirected to the IdP sign-in page (${url}) — the session was rejected. In token mode this means the token expired and the reseed did not take.`);
  }
}

export async function enterOrgHome(page: Page, orgHandler: string): Promise<void> {
  await refreshSession(page);
  await page.goto(`/organizations/${orgHandler}/home`, { waitUntil: 'domcontentloaded' });
  assertSignedIn(page);
  await waitForApiConfig(page);
  await gotoOrgHome(page, orgHandler);
}

export async function enterProject(page: Page, orgHandler: string): Promise<void> {
  await enterOrgHome(page, orgHandler);
  await openProject(page, PROJECT);
}

/** Reached through the sidebar each time: reloading the settings URL bounces the console back to the project home. */
export async function openProjectSettings(page: Page, orgHandler: string): Promise<void> {
  await enterProject(page, orgHandler);
  await expandSidebar(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 30_000 });
}

/** Narrows the org home to the fixture project: the list pages at ten cards, in no order we control. */
export async function filterToProject(page: Page): Promise<void> {
  const search = page.getByPlaceholder('Search projects');
  if (!(await search.isVisible({ timeout: 15_000 }).catch(() => false))) return;
  await search.fill(PROJECT);
}

/** Present only on a card that is not being deleted — see ProjectCard in Projects.tsx. */
export function projectSettingsButton(page: Page): Locator {
  return page.getByRole('button', { name: `Settings for ${PROJECT}` }).first();
}

/** Asked of the page, not remembered: a worker restart resets any flag and would skip every group. */
export async function enterProjectOrSkip(page: Page, orgHandler: string): Promise<void> {
  // Retried: an earlier failure leaves a modal or a lapsed session, and skipping silences every group after.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await dismissStrayDialog(page);
    await enterOrgHome(page, orgHandler);
    await filterToProject(page);
    // Not the card's name: a deleting project keeps its card but is hidden from the switcher.
    if (
      await projectSettingsButton(page)
        .isVisible({ timeout: 15_000 })
        .catch(() => false)
    ) {
      await openProject(page, PROJECT);
      return;
    }
    await reseedHere(page);
  }
  test.skip(true, `${PROJECT} was not on the organization home after three attempts — group 01 did not create it, or it is being deleted`);
}

/** Waits out a project left mid-deletion by an earlier run: it can be neither reused nor recreated. */
export async function waitForStaleProjectRemoval(page: Page): Promise<void> {
  if (
    !(await page
      .getByText(PROJECT, { exact: true })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false))
  )
    return;
  test.info().annotations.push({ type: 'fixture', description: `${PROJECT} was still being deleted; waited for it to disappear` });
  await expect(page.getByText(PROJECT, { exact: true }), `${PROJECT} is stuck mid-deletion on the org home`).toHaveCount(0, { timeout: PROJECT_REMOVAL_TIMEOUT_MS });
}
