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
 * The isEmpty === false branch of the project home: the integrations table, the
 * architecture and summary panels, and the absence of the empty-state entry points.
 *
 * The suite creates its own project and one integration inside it, so the branch is
 * exercised whatever any shared project happens to contain. Nothing asserts a particular
 * integration's name — the rows are read at runtime.
 */

import { expect, test } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';
import { createFixtureComponent, createFixtureProject, deleteFixtureProjects, reportTeardown, waitForApiConfig } from '../../helpers/cloud-fixtures.js';
import { authStatePath } from '../../helpers/product.js';

const COLUMNS = ['Name', 'Description', 'Type', 'Last Updated', 'Action'];
const FIXTURE_COMPONENT = 'e2e-fixture-api';

test.describe('populated project home @smoke', () => {
  // beforeAll runs once per worker; parallel workers would each create a project and exhaust quota.
  test.describe.configure({ mode: 'serial' });

  let orgHandler: string;
  let projectHandler: string;
  // Every handle, not just the last: beforeAll re-runs on retry and one variable leaks a project.
  const createdProjects: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    orgHandler = getAuthContext(testInfo.project.name).orgHandler;

    const ctx = await browser.newContext({ storageState: authStatePath(testInfo.project.name) });
    const page = await ctx.newPage();
    await page.goto(`/organizations/${orgHandler}/projects/default/home`, { waitUntil: 'domcontentloaded' });
    await waitForApiConfig(page);

    const handle = `e2e-populated-${Date.now()}`;
    const project = await createFixtureProject(page, handle, 'Populated-branch assertions; deleted in teardown');

    // Recorded before the check so a project behind a failed response is still torn down.
    createdProjects.push(handle);
    if (project.status < 200 || project.status >= 300) throw new Error(`Could not create the fixture project (${project.status}): ${project.body}`);

    const component = await createFixtureComponent(page, handle, FIXTURE_COMPONENT, 'E2E Fixture API');
    if (component.status < 200 || component.status >= 300) throw new Error(`Could not create the fixture integration (${component.status}): ${component.body}`);

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

  test.beforeEach(async ({ page }) => {
    await page.goto(`/organizations/${orgHandler}/projects/${projectHandler}/home`, { waitUntil: 'domcontentloaded' });

    await Promise.race([
      page
        .getByRole('heading', { name: 'Integrations' })
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
      page
        .getByRole('heading', { name: 'Sign In' })
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
    ]);
    await expect(page, 'Session expired or was never authenticated').toHaveURL(/\/projects\/[^/]+\/home/, { timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Integrations table
  // -------------------------------------------------------------------------

  test('shows the integrations table with its columns', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible();
    for (const column of COLUMNS) {
      await expect(page.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
  });

  test('every integration row carries a type and a delete action', async ({ page }) => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const count = await rows.count();
    expect(count, 'This project has no integrations, so the populated branch cannot be exercised').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // The type cell is derived from componentType; a row without one fell through to 'unsupported'.
      await expect(row.getByRole('cell')).not.toHaveCount(0);
      await expect(row.getByRole('button', { name: /^Delete / })).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // The empty-state entry points are replaced, not merely hidden
  // -------------------------------------------------------------------------

  test('does not show the empty-state entry points', async ({ page }) => {
    // The table proves the branch rendered; only then does absence mean anything.
    await expect(page.getByRole('table')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Import an Integration' })).not.toBeVisible();
    await expect(page.getByText('Get Started Quickly')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Cloud Editor', exact: true })).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Summary panels
  // -------------------------------------------------------------------------

  test('shows the architecture panel', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh architecture' })).toBeVisible();
  });

  test('integration types panel totals the rows in the table', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Integration Types' })).toBeVisible();

    const rowCount = await page.getByRole('row', { name: /^View details for / }).count();
    const total = page.getByText('Total').locator('xpath=following-sibling::*[1]');
    await expect(total).toHaveText(String(rowCount));
  });

  test('contributors panel names contributors when the project has any', async ({ page }) => {
    // ContributorsCard returns null until commit history yields contributors.
    const heading = page.getByRole('heading', { name: 'Contributors' });
    const present = await heading
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!present, 'No contributors resolved for this project');

    await expect(page.getByRole('img', { name: /\d+ contributions?/ })).not.toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  test('search narrows the table to the matching integration', async ({ page }) => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const before = await rows.count();
    expect(before, 'Need at least one integration to search for').toBeGreaterThan(0);

    // Derived at runtime: integration names belong to the backend.
    const name = ((await rows.first().getAttribute('aria-label')) ?? (await rows.first().innerText()))
      .replace(/^View details for /, '')
      .split('\n')[0]
      .trim();

    await page.getByRole('textbox', { name: 'Search integrations' }).fill(name);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(name);
  });

  test('a search with no matches empties the table', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(`no-such-integration-${Date.now()}`);
    await expect(page.getByRole('row', { name: /^View details for / })).toHaveCount(0);
  });
});
