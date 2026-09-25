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

/** The project's integrations table: what it holds, and removing what a run leaves behind. */

import { expect, type Locator, type Page } from '@playwright/test';
import { AGENT_NAME_PATTERN, REMOVAL_TIMEOUT_MS } from './journey-fixtures.js';

/** The Start quickly tabs are real `role="tab"` elements — verified against a run. */
export function samplesTab(page: Page): Locator {
  return page.getByRole('tab', { name: 'Samples', exact: true });
}

/** An empty project offers these inline; a populated one hides them behind Create an Integration. */
export async function reachCreateControl(page: Page, target: Locator): Promise<void> {
  if (await target.isVisible({ timeout: 15_000 }).catch(() => false)) return;

  const createButton = page.getByRole('button', { name: 'Create an Integration', exact: true });
  await expect(createButton, 'neither the inline control nor Create an Integration was available').toBeVisible({ timeout: 30_000 });
  await createButton.click();
  await expect(page.getByRole('heading', { name: 'How would you like to create your integration?' })).toBeVisible({ timeout: 30_000 });
  await expect(target, 'the create surface did not offer the expected control').toBeVisible({ timeout: 30_000 });
}

/** By the row, not the delete button: a row mid-deletion drops its actions but is still an integration. */
export async function isPresent(page: Page, name: string): Promise<boolean> {
  return integrationRow(page, name)
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
}

/** The imported agent's row, matched by pattern because the import derives its name. */
export function agentRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: AGENT_NAME_PATTERN });
}

export function integrationRow(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ hasText: name });
}

/** Both dialogs are type-to-confirm: Delete stays disabled until the name matches exactly. */
export async function confirmRemoval(page: Page, placeholder: string, name: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByPlaceholder(placeholder).fill(name);

  const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
  await expect(confirm, 'Delete stayed disabled after the name was typed').toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  await expect(dialog).not.toBeVisible({ timeout: 60_000 });
}

/** The row greys out and stays counted until deletion lands, so its disappearance is the signal. */
export async function deleteIntegration(page: Page, name: string): Promise<void> {
  // An interrupted run leaves duplicates: the handle gets suffixed while the display name stays put.
  for (let attempt = 0; attempt < 5; attempt++) {
    // An earlier run may have started this deletion already, in which case there is nothing to click.
    await waitForDeletionsToFinish(page);
    const trash = page.getByRole('button', { name: `Delete ${name}` }).first();
    if (!(await trash.isVisible({ timeout: 5_000 }).catch(() => false))) break;

    await trash.click();
    await confirmRemoval(page, 'Enter integration name to confirm', name);
    // This row must go before looking for the next; it greys out first and still counts.
    await expect(page.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0, { timeout: REMOVAL_TIMEOUT_MS });
  }

  await expect(integrationRow(page, name), `${name} is still listed — deletion has not completed`).toHaveCount(0, { timeout: REMOVAL_TIMEOUT_MS });
}

/** Rows report Deleting until the platform finishes, and the project counts them the whole time. */
export async function waitForDeletionsToFinish(page: Page): Promise<void> {
  await expect(page.getByRole('row').filter({ hasText: 'is being deleted' }), 'an integration is still being deleted').toHaveCount(0, { timeout: REMOVAL_TIMEOUT_MS });
}

/** Waits for the integrations list to resolve, so an unloaded table is not read as empty. */
export async function waitForIntegrationsToLoad(page: Page): Promise<void> {
  // Any row will do: the table having painted is the point, not which fixtures survive.
  const settled = page.getByRole('columnheader', { name: 'Name', exact: true }).or(page.getByText('Start quickly', { exact: true }));
  await expect(settled.first(), 'the project showed neither its integrations nor the empty state').toBeVisible({ timeout: 60_000 });
}

/** Deletes every integration listed, including fixtures this spec never created. */
export async function deleteAllIntegrations(page: Page): Promise<number> {
  let removed = 0;
  // Bounded: a delete that reports success without removing the row would otherwise loop forever.
  for (let guard = 0; guard < 20; guard += 1) {
    const action = page.getByRole('button', { name: /^Delete / }).first();
    if (!(await action.isVisible({ timeout: 5_000 }).catch(() => false))) return removed;
    await deleteIntegration(page, (await action.getAttribute('aria-label'))?.replace(/^Delete /, '') ?? '');
    removed += 1;
  }
  return removed;
}

/** Deletes every integration whose name matches, for a fixture whose name the import derived. */
export async function deleteMatchingIntegrations(page: Page, pattern: RegExp): Promise<number> {
  let removed = 0;
  for (;;) {
    await waitForDeletionsToFinish(page);
    const action = page.getByRole('button', { name: new RegExp(`^Delete ${pattern.source}`, 'i') }).first();
    if (!(await action.isVisible({ timeout: 5_000 }).catch(() => false))) return removed;
    const name = (await action.getAttribute('aria-label'))?.replace(/^Delete /, '') ?? '';
    await deleteIntegration(page, name);
    removed += 1;
  }
}
