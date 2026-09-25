/** Moving around the console through the navbar and sidebar rather than by URL. */

import { expect, type Page } from '@playwright/test';
import { reseedSessionToken } from './cloud-fixtures.js';

/** Collapsing the sidebar hides the page labels, so nothing asserts a nav item until this runs. */
export async function expandSidebar(page: Page): Promise<void> {
  const expander = page.getByRole('button', { name: 'Expand sidebar' });
  if (await expander.isVisible().catch(() => false)) await expander.click();
}

/**
 * The organization's project list. Reached by URL because the chrome cannot get here: the
 * `Organization: <handle>` chip opens the org switcher, and `Clear project` leads to OrgHome.
 */
export async function gotoOrgHome(page: Page, orgHandler: string): Promise<void> {
  // Every group enters through here, so it is where the session gets topped up. No-op outside
  // token mode, where buildStorageState writes an empty refresh_token and nothing can refresh.
  if (!page.url().startsWith('about:')) await reseedSessionToken(page);

  const landed = page.getByRole('heading', { name: 'All Projects' });
  if (await landed.isVisible({ timeout: 5_000 }).catch(() => false)) return;

  await page.goto(`/organizations/${orgHandler}/home`, { waitUntil: 'domcontentloaded' });
  if (await landed.isVisible({ timeout: 30_000 }).catch(() => false)) return;

  // OrgHome sends a session it considers un-onboarded to the most recently updated project
  // (OrgHome.tsx:131). Mark it onboarded exactly as OrgHome does for itself (:130) and retry.
  // Seeded here, not in the token setup, which reads the project handle out of that redirect.
  await page.evaluate((org) => {
    const userId = (JSON.parse(localStorage.getItem('user') ?? '{}') as { userId?: string }).userId;
    if (userId) localStorage.setItem(`persona:${userId}:${org}`, 'developer');
  }, orgHandler);

  await page.goto(`/organizations/${orgHandler}/home`, { waitUntil: 'domcontentloaded' });
  await expect(landed, `the org project list did not render for ${orgHandler}`).toBeVisible({ timeout: 60_000 });
}

export async function openProject(page: Page, displayName: string): Promise<void> {
  // The opener is a plain button with no project in scope, and a combobox beside 'Change
  // project' inside one, so all three shapes are accepted.
  const opener = page
    .getByRole('button', { name: 'Select project' })
    .or(page.getByRole('button', { name: 'Change project' }))
    .or(page.getByRole('combobox', { name: 'Select project' }));
  await opener.first().click();
  await page.getByRole('menuitem', { name: displayName }).click();
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible({ timeout: 60_000 });
}

export async function openIntegration(page: Page, displayName: string): Promise<void> {
  await page.getByRole('button', { name: 'Select integration' }).click();
  // First match: a repeated import leaves two integrations under the same name, and either will do.
  await page.getByRole('menuitem', { name: displayName }).first().click();
  await expect(page.getByRole('heading', { name: displayName }).first()).toBeVisible({ timeout: 60_000 });
}

/** Idempotent: waits for a child so the caller does not race the expand animation. */
export async function openNavGroup(page: Page, group: string, firstChild: string): Promise<void> {
  const child = page.getByRole('button', { name: firstChild, exact: true });
  if (await child.isVisible().catch(() => false)) return;

  await page.getByRole('button', { name: group, exact: true }).click();
  await expect(child, `the ${group} group did not reveal ${firstChild}`).toBeVisible({ timeout: 30_000 });
}

export async function expectNavItems(page: Page, labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    await expect(page.getByRole('button', { name: label, exact: true }), `sidebar is missing ${label}`).toBeVisible({ timeout: 30_000 });
  }
}

export function cardFor(page: Page, title: string, buttonName: string) {
  // 'Deploy' names both a sidebar page and every sample's button, so it is scoped to its own
  // card. The ancestor hop survives DOM changes that an .nth() index would not.
  return page
    .getByText(title, { exact: true })
    .locator(`xpath=ancestor::*[.//button[normalize-space()="${buttonName}"]][1]`)
    .getByRole('button', { name: buttonName, exact: true });
}
