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
 * Shape of a new journey group. Copy the describe block into
 * tests/e2e/specs/cloud/ipaas-e2e-journey.spec.ts at the point where the fixture
 * project is in the state the group needs, then replace every placeholder.
 *
 * The journey file already declares `page`, `orgHandler` and the helper imports;
 * this file only declares them so it type-checks on its own. Locators must come
 * from the page component under src/pages/, not from memory.
 */
import { expect, test, type Page } from '@playwright/test';
import { enterProjectOrSkip } from '../../../../tests/e2e/helpers/journey-session.js';

declare const page: Page;
declare const orgHandler: string;

test.describe('NN <surface> @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // Skips the whole group when the fixture project is missing.
    await enterProjectOrSkip(page, orgHandler);
  });

  test('TC_IP_<AREA>_<NNN> <states an observable behaviour>', async () => {
    await expect(page.getByRole('heading', { name: '<expected heading>' })).toBeVisible({ timeout: 30_000 });
  });
});
