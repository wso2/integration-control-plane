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
 * Starting point for a new spec. Copy to tests/e2e/specs/shared/<surface>.spec.ts,
 * then replace every placeholder — a spec that still says <surface> has not been
 * thought about yet.
 *
 * Delete whichever beforeEach you do not need. Locators must come from the page
 * component under src/pages/, not from memory.
 */
import { expect, test } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';

test.describe('<surface> @smoke', () => {
  let orgHandler: string;
  let projectHandler: string;

  test.beforeEach(async ({ page }) => {
    const ctx = getAuthContext();
    orgHandler = ctx.orgHandler;
    if (!ctx.projectHandler) throw new Error('No projectHandler in auth context — re-run setup');
    projectHandler = ctx.projectHandler;

    await page.goto(`/organizations/${orgHandler}/projects/${projectHandler}/<path>`, {
      waitUntil: 'domcontentloaded',
    });

    // Race real readiness against a login redirect so an expired session fails fast
    // with a clear message instead of timing out on content that will never render.
    await Promise.race([
      page
        .getByRole('heading', { name: '<expected heading>' })
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
      page
        .getByRole('heading', { name: 'Sign In' })
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
    ]);
    await expect(page, 'Session expired or was never authenticated').toHaveURL(/<url-pattern>/, {
      timeout: 5_000,
    });
  });

  test('<states an observable behaviour>', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '<expected heading>' })).toBeVisible();
  });
});
