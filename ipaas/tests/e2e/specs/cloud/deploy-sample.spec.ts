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
 * Deploying a sample from the project home, through to the build it kicks off.
 *
 * Serial and stateful on purpose: the deploy feeds the assertion after it, because a sample
 * deploy provisions a real integration and starts a real build. The fixture project and the
 * integration are removed in teardown.
 *
 * Covers the Samples entry point only. The build card's own behaviour — the logs toggle, the
 * collapse, waiting out a terminal state — is asserted once, in import-integration.spec.ts,
 * since it is the same card reached by a different route.
 *
 * The status labels and the logs toggle are harvested from src/components/BuildCard.tsx;
 * the samples list and its Deploy buttons from a live snapshot of the Samples tab.
 */

import { expect, test, type Page } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';
import { createFixtureProject, deleteFixtureProjects, reportTeardown, waitForApiConfig } from '../../helpers/cloud-fixtures.js';
import { authStatePath } from '../../helpers/product.js';

// BuildCard.tsx:118-140. 'Failed' also reads 'Failed while <phrase>', hence the prefix match.
const STARTING_STATUS = /^(Queued|In Progress)$/;

// Named rather than taken by position: the catalogue's order is the backend's to change.
const SAMPLE = 'Hello World Service';

// The status has no role or accessible name (BuildCard.tsx:194-198), so it is matched by its text.
function buildStatus(page: Page) {
  return page.getByText(/^(Queued|In Progress|Completed|Failed|Cancelled|Timed Out)/).first();
}

// Samples render as flat siblings with no accessible grouping, so a sample's Deploy button
// is located relative to its title rather than by position in the list.
function sampleDeployButton(page: Page, sample: string) {
  return page.locator(`xpath=//p[normalize-space()='${sample}']/following::button[normalize-space()='Deploy'][1]`);
}

test.describe('deploy a sample @smoke', () => {
  // The first test's deploy is the fixture for the rest, and beforeAll runs once per worker.
  test.describe.configure({ mode: 'serial' });

  let orgHandler: string;
  let projectHandler: string;
  let componentHandle: string | null = null;
  const createdProjects: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    orgHandler = getAuthContext(testInfo.project.name).orgHandler;

    const ctx = await browser.newContext({ storageState: authStatePath(testInfo.project.name) });
    const page = await ctx.newPage();
    await page.goto(`/organizations/${orgHandler}/projects/default/home`, { waitUntil: 'domcontentloaded' });
    await waitForApiConfig(page);

    const handle = `e2e-sample-${Date.now()}`;
    const result = await createFixtureProject(page, handle, 'Sample deploy spec; deleted in teardown');

    // Recorded before the check so a project behind a failed response is still torn down.
    createdProjects.push(handle);
    if (result.status < 200 || result.status >= 300) throw new Error(`Could not create the fixture project (${result.status}): ${result.body}`);

    projectHandler = handle;
    await ctx.close();
  });

  test.afterAll(async ({ browser }, testInfo) => {
    if (createdProjects.length === 0) return;

    const ctx = await browser.newContext({ storageState: authStatePath(testInfo.project.name) });
    const page = await ctx.newPage();
    await page.goto(`/organizations/${orgHandler}/projects/default/home`, { waitUntil: 'domcontentloaded' });
    await waitForApiConfig(page);

    reportTeardown(await deleteFixtureProjects(page, createdProjects));
    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Deploy
  // -------------------------------------------------------------------------

  test('deploying a sample provisions an integration', async ({ page }) => {
    await page.goto(`/organizations/${orgHandler}/projects/${projectHandler}/home`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('tab', { name: 'Samples' }).click();
    await expect(page.getByText(SAMPLE, { exact: true })).toBeVisible({ timeout: 30_000 });

    const deploy = sampleDeployButton(page, SAMPLE);
    await expect(deploy).toBeVisible({ timeout: 30_000 });
    await deploy.click();

    // The handle is read from the URL rather than assumed from the sample's name.
    // Waits for a handle that is not 'new': the creation form itself lives at
    // /components/new/import, and the landing URL carries no trailing segment.
    await page.waitForURL((url) => (url.pathname.match(/\/components\/([^/]+)/)?.[1] ?? 'new') !== 'new', { timeout: 120_000 });
    componentHandle = page.url().match(/\/components\/([^/]+)/)?.[1] ?? null;
    expect(componentHandle, 'Deploy did not navigate to an integration').toBeTruthy();
    expect(componentHandle, 'Landed on the creation form, not the new integration').not.toBe('new');
  });

  // -------------------------------------------------------------------------
  // The build it kicks off
  // -------------------------------------------------------------------------

  test('the build card reports a build that has started', async ({ page }) => {
    test.skip(!componentHandle, 'No integration was provisioned');
    await page.goto(`/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandle}/overview`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });
    // A set, not 'Queued': the build may already have moved on, making a literal match flaky.
    await expect(buildStatus(page)).toHaveText(STARTING_STATUS, { timeout: 60_000 });
  });
});
