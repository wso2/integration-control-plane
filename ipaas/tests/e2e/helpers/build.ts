/** Waiting out a build. */

import { expect, type Page } from '@playwright/test';
import { reseedSessionToken } from './cloud-fixtures.js';

// describeBuildStatus (utils/buildProgress.ts). 'Failed' also reads 'Failed while <phrase>', and a running
// build's name goes on to its stage ('In progress: Build source & test, stage 2 of 3'), hence prefix matches.
export const TERMINAL_STATUS = /^(Completed|Failed|Cancelled|Timed Out)/;
export const STARTING_STATUS = /^(Queued|In progress)\b/;

/** A dev build can sit in the queue for a long while before it starts moving. */
export const BUILD_TIMEOUT_MS = 30 * 60_000;

/**
 * The build's status (BuildStatusPill.tsx): an image whose accessible name leads with the status. Its
 * visible text names the running stage instead, so the name, not the text, is what is matched.
 */
export function buildStatus(page: Page) {
  return page.getByRole('img', { name: /^(Queued|In progress|Completed|Failed|Cancelled|Timed Out)/ }).first();
}

/** The status the build reads now, from its accessible name. */
export async function buildStatusText(page: Page): Promise<string> {
  return (await buildStatus(page).getAttribute('aria-label'))?.trim() ?? '';
}

/** Returns the terminal status text; reaching *a* terminal state is the contract. */
export async function waitForBuildToSettle(page: Page): Promise<string> {
  // Chunked so a fresh token can go in between: one 20-minute assertion outlives the token.
  const CHUNK_MS = 4 * 60_000;

  // Captured before any polling. Read at recovery time instead, a session that lapsed mid-chunk
  // would already have redirected the SPA, and this would send the run back to the sign-in page.
  const buildPage = page.url();

  // Before the first chunk too, so the whole wait runs on a token with its full lifetime rather
  // than on whatever the preceding tests left of one.
  await reseedFromConsoleOrigin(page, buildPage);

  // Wall-clock, not a chunk count: each pass also spends time reseeding, so counting chunks
  // overruns the caller's timeout and loses this helper's diagnostic to a generic one.
  const deadline = Date.now() + BUILD_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const finished = await expect(buildStatus(page))
      .toHaveAccessibleName(TERMINAL_STATUS, { timeout: Math.min(CHUNK_MS, deadline - Date.now()) })
      .then(() => true)
      .catch(() => false);
    if (finished) return buildStatusText(page);

    if (Date.now() >= deadline) break;
    await reseedFromConsoleOrigin(page, buildPage);
  }

  throw new Error(`Build did not reach a terminal state within ${BUILD_TIMEOUT_MS / 60_000} minutes; last status: ${await buildStatusText(page)}`);
}

/** Reseeding writes through page.evaluate, so it only reaches the console's own storage. */
async function reseedFromConsoleOrigin(page: Page, returnTo: string): Promise<void> {
  await page.goto('config.json', { waitUntil: 'domcontentloaded' });
  await reseedSessionToken(page);
  await page.goto(returnTo, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Latest build' })).toBeVisible({ timeout: 60_000 });
}
