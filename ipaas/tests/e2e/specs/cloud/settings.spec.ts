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
 * Settings at organization and project scope, and the sections the cloud build declares.
 *
 * Cloud's org settings carry exactly two sections — `src/constants/orgSettingsSections.ts`
 * gates on IS_CLOUD and lists Org Details and Package Registries, with the others noted as
 * not yet supported. Asserting the absent ones stay absent is what catches a WIP-only
 * section leaking into the cloud build.
 */

import { expect, test } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';
import { expectPageRendered } from '../../helpers/cloud-fixtures.js';

const CLOUD_SECTIONS = ['Org Details', 'Package Registries'];
// Declared only in the non-cloud branch of SETTINGS_SECTIONS.
const WIP_ONLY_SECTIONS = ['Access Control', 'Egress Control', 'Workflows', 'Credentials', 'On-Prem Keys', 'Application Security'];

test.describe('settings @smoke', () => {
  let orgHandler: string;
  let projectHandler: string;

  test.beforeEach(async () => {
    const ctx = getAuthContext();
    orgHandler = ctx.orgHandler;
    projectHandler = ctx.projectHandler ?? 'default';
  });

  // -------------------------------------------------------------------------
  // Organization settings
  // -------------------------------------------------------------------------

  test('organization settings page exists', async ({ page }) => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
  });

  for (const section of CLOUD_SECTIONS) {
    test(`organization settings offers "${section}"`, async ({ page }) => {
      await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    });
  }

  test('organization settings offers no WIP-only section', async ({ page }) => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
    // Positive assertion first: these absences would pass on a blank page.
    await expect(page.getByText('Org Details', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    for (const section of WIP_ONLY_SECTIONS) {
      await expect(page.getByText(section, { exact: true })).not.toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // Package Registries
  // -------------------------------------------------------------------------

  test('package registries page exists', async ({ page }) => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/package-registries`);
  });

  test('org details page exists', async ({ page }) => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/org-details`);
  });

  // -------------------------------------------------------------------------
  // Project settings
  // -------------------------------------------------------------------------

  test('project settings page exists', async ({ page }) => {
    await expectPageRendered(page, `/organizations/${orgHandler}/projects/${projectHandler}/settings`);
  });
});
