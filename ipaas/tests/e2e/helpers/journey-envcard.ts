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

/** The integration overview's cards, and the panels a deployed integration hangs off them. */

import { expect, type Locator, type Page } from '@playwright/test';
import { STARTING_STATUS, waitForBuildToSettle } from './build.js';
import { AGENT_GATE_POLL_MS, AGENT_GATE_TIMEOUT_MS, AUTOMATION, BUILD_QUIET_MS, DEPLOY_TIMEOUT_MS, ENV, MI_DEPLOY_TIMEOUT_MS, PROBE_GAP_MS, SAMPLE } from './journey-fixtures.js';

/** The environment card. Scoped because the build card shows the same status words a deployment does. */
export function envCard(page: Page): Locator {
  return page
    .locator('.MuiCard-root')
    .filter({ has: page.getByRole('heading', { name: ENV, exact: true }) })
    .first();
}

/** The env card's deployment status, as StatusDot renders it. */
export function deploymentStatus(page: Page): Locator {
  // first(): a consumer's own "Active" chip renders lower in the same card, and two matches make textContent() throw.
  return envCard(page)
    .getByText(/^(In progress|Active|Error|Suspended|Not deployed)$/)
    .first();
}

/** The Latest Build header, so its status is read from the build and not the first match on the page. */
export function buildCard(page: Page): Locator {
  // Hopped from the heading: the build card is a Box, so there is no Card element to filter on.
  return page.getByRole('heading', { name: 'Latest build' }).locator('xpath=ancestor::*[.//button[normalize-space()="View logs"]][1]');
}

/** Closes a modal left open over the page, which would otherwise hide the card being asserted. */
export async function dismissStrayDialog(page: Page): Promise<void> {
  const close = page
    .getByRole('dialog')
    .getByRole('button', { name: /^close$/i })
    .first();
  if (await close.isVisible({ timeout: 2_000 }).catch(() => false)) await close.click();
}

/** Polled, not asserted: the status dot renders nothing until a deployment exists to report. */
export async function waitForDeploymentSettled(page: Page, timeout = DEPLOY_TIMEOUT_MS): Promise<string> {
  await expect
    .poll(
      async () =>
        (
          await deploymentStatus(page)
            .textContent()
            .catch(() => null)
        )?.trim() ?? '',
      {
        timeout,
        message: 'the deployment never reported a settled status — the card may still be offering to deploy',
      },
    )
    .toMatch(/^(Active|Error)$/);
  return (await deploymentStatus(page).textContent())?.trim() ?? '';
}

/** A build settling is not the end of it: the platform can start a second one, and the card hides its actions while it runs. */
export async function waitForBuildQuiet(page: Page, quietMs = BUILD_QUIET_MS): Promise<string> {
  let status = '';
  for (let pass = 0; pass < 4; pass += 1) {
    status = await waitForBuildToSettle(page);
    if (!/^Completed/.test(status)) return status;
    const restarted = await expect(buildCard(page).getByRole('img', { name: STARTING_STATUS }))
      .toBeVisible({ timeout: quietMs })
      .then(() => true)
      .catch(() => false);
    if (!restarted) return status;
  }
  return status;
}

/**
 * Auto deploy is held off for Ballerina integrations, so a finished build waits on the card's Deploy
 * (DeployButton.tsx). The card renders Deploy only while auto deploy is off and the newest build is not
 * running yet, so a card that shows its deployment status and no Deploy has nothing to deploy.
 *
 * Returning without a click is accepted as is: with auto deploy on, the platform owns the rollout, and a caller's
 * Active check may briefly read the previous revision before it starts. The journey's fixtures are fresh
 * integrations with no earlier revision, so that window does not arise there.
 */
export async function deployLatestBuild(page: Page): Promise<void> {
  const deploy = envCard(page).getByRole('button', { name: 'Deploy', exact: true });
  const status = deploymentStatus(page);
  for (let pass = 0; pass < 2; pass += 1) {
    // Either settles the card: an undeployed track shows only Deploy, a deployed one its status.
    await deploy
      .or(status)
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => {});
    // Deploy renders after the track's images load, which can trail the status by a moment.
    const offered = await deploy
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (offered) {
      // Disabled while a build is queued or running, because its image does not exist yet.
      const enabled = await expect(deploy)
        .toBeEnabled({ timeout: 2 * 60_000 })
        .then(() => true)
        .catch(() => false);
      // An agent's builds list no releases, so its Deploy never enables; Agent Manager deploys it, and the card reports that status.
      if (!enabled && (await status.isVisible())) return;
      await expect(deploy, 'Deploy stayed disabled after the build settled').toBeEnabled({ timeout: 1_000 });
      await deploy.click();
      // The card's own alert, shown for four seconds (EnvCardShell.tsx); an error alert carries the BFF's reason instead.
      await expect(envCard(page).getByText('Deployment started successfully'), 'the deploy request was refused').toBeVisible({ timeout: 60_000 });
      // DeployButton hides once the deployment runs the latest image, so a status read after this is the new deployment's.
      await expect(deploy, 'the card still offers Deploy, so the deployment does not run the latest build').toBeHidden({ timeout: 2 * 60_000 });
      return;
    }
    if (pass > 0 || (await status.isVisible())) return;
    // Neither rendered: the overview does not refetch the track's images when a build lands, so reload once.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(envCard(page), 'the environment card did not come back after the reload').toBeVisible({ timeout: 60_000 });
  }
}

/** Fails unless the latest build completed and its deployment to the environment settled as Active. */
export async function requireActiveDeployment(page: Page, name = SAMPLE): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Latest build' })).toBeVisible({ timeout: 60_000 });
  const build = await waitForBuildQuiet(page);
  expect(build, `${name} build ended as ${build}`).toMatch(/^Completed/);
  await dismissStrayDialog(page);
  await deployLatestBuild(page);
  const deployed = await waitForDeploymentSettled(page);
  expect(deployed, `${name} deployment to ${ENV} ended as ${deployed}`).toBe('Active');
}

/** Reloaded, not merely awaited: the card renders "Deploy this agent…" until a build lands and does not refetch on its own. */
export async function waitForConfigureGate(page: Page, timeout = AGENT_GATE_TIMEOUT_MS): Promise<string> {
  const deadline = Date.now() + timeout;
  const gate = () => envCard(page).getByRole('button', { name: 'Configure to continue' });

  for (;;) {
    if (
      await expect(gate())
        .toBeVisible({ timeout: AGENT_GATE_POLL_MS })
        .then(() => true)
        .catch(() => false)
    ) {
      return 'the agent asked to be configured';
    }
    if (Date.now() >= deadline) return (await envCard(page).textContent())?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? 'the card reported nothing';

    // An import triggers build after build, and each one has to finish before a deployment exists.
    await waitForBuildQuiet(page, Math.min(BUILD_QUIET_MS, Math.max(0, deadline - Date.now())));
    // A plain reload: waitForBuildQuiet already tops the token up through the build helper.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(envCard(page), 'the environment card did not come back after the reload').toBeVisible({ timeout: 60_000 });
  }
}

/**
 * A sample deployed from its image has no build (Component.tsx hides the build card for a prebuilt
 * integration), and Quick deploy already started its deployment, so there is nothing to deploy.
 */
export async function requireSampleActive(page: Page, name = SAMPLE): Promise<void> {
  await dismissStrayDialog(page);
  await expect(envCard(page), `no ${ENV} card on ${name}`).toBeVisible({ timeout: 2 * 60_000 });
  const deployed = await waitForDeploymentSettled(page);
  expect(deployed, `${name} deployment to ${ENV} ended as ${deployed}`).toBe('Active');
}

/** An automation's card renders no status dot, so readiness is its Schedule and Test actions. The sample runs from its image, so no build is awaited. */
export async function requireAutomationReady(page: Page): Promise<void> {
  await dismissStrayDialog(page);
  await expect(envCard(page), `no ${ENV} card on ${AUTOMATION}`).toBeVisible({ timeout: 2 * 60_000 });
  // Enabled, not merely visible: both actions are rendered but disabled while a build is running.
  await expect(
    envCard(page)
      .getByRole('button', { name: 'Schedule', exact: true })
      .or(envCard(page).getByRole('button', { name: 'Stop schedule' })),
    `${AUTOMATION} offers no Schedule action, so it is not deployed`,
  ).toBeEnabled({ timeout: MI_DEPLOY_TIMEOUT_MS });
  await expect(envCard(page).getByRole('button', { name: 'Test', exact: true }), `${AUTOMATION} offers no Test action, so it is not deployed`).toBeEnabled({ timeout: MI_DEPLOY_TIMEOUT_MS });
}

// proxyReconciliation.ts: the generic failure, or the wording codedApiError (apiSecurity.ts) gives a known code.
const GATEWAY_FAILURE = /^(The API gateway could not be updated|Your organization has reached its API limit|This environment takes API changes only through promotion|.+ isn’t running this release’s API)/;

/**
 * The card's proxy reconciliation alert (EnvCardBody.tsx) when the API never reached the gateway.
 * Retried once, as a user would; answers the alert's text if a failure remains, or null.
 */
export async function gatewayFailure(page: Page): Promise<string | null> {
  const alerts = envCard(page).getByRole('alert');
  const retryName = /^Retry(ing…)?$/;
  // A failed retry replaces the alert's text with the retry's error but keeps its Retry action.
  const failure = alerts
    .filter({ hasText: GATEWAY_FAILURE })
    .or(alerts.filter({ has: page.getByRole('button', { name: retryName }) }))
    .first();
  const retry = failure.getByRole('button', { name: retryName });
  const updating = alerts.filter({ hasText: 'Updating the API gateway…' }).first();
  const text = async () => (await failure.textContent())?.replace(/Retry(ing…)?$/, '').trim() || 'the API gateway could not be updated';

  const shown = await failure
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return null;
  if (!(await retry.isEnabled().catch(() => false))) return text();

  const before = await text();
  await retry.click();
  // Accepted: the gateway update restarts, or clears at once. Refused: the alert names the retry's error instead.
  const state = async (): Promise<string> => {
    if (await updating.isVisible()) return 'updating';
    if (!(await failure.isVisible())) return 'cleared';
    return (await text()) !== before ? 'refused' : '';
  };
  let outcome = '';
  await expect
    .poll(async () => (outcome = await state()), { timeout: 60_000 })
    .not.toBe('')
    .catch(() => {});
  if (outcome === 'cleared') return null;
  if (outcome !== 'updating') return text();

  // Wait for the reconciliation to end before reading its result.
  await expect(updating, 'the API gateway update did not finish').toBeHidden({ timeout: 2 * 60_000 });
  const failedAgain = await failure
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  return failedAgain ? text() : null;
}

/** A consumer's row on the env card, found from its name up to the row that carries Manage. */
export function consumerRow(page: Page, name: string): Locator {
  return envCard(page).getByText(name, { exact: true }).locator('xpath=ancestor::*[.//button[normalize-space()="Manage"]][1]');
}

/** Opens the create drawer, whose button is named for whether the API has consumers yet. */
export async function openConsumerDrawer(page: Page): Promise<void> {
  const create = envCard(page).getByRole('button', { name: /^(Consume API|New consumer)$/ });
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.click();
}

/** Deletes every consumer, answering with the server's reason when one is refused. */
export async function deleteAllConsumers(page: Page): Promise<string | null> {
  for (;;) {
    const remove = envCard(page)
      .getByRole('button', { name: /^Delete / })
      .first();
    if (!(await remove.isVisible({ timeout: 5_000 }).catch(() => false))) return null;
    const name = (await remove.getAttribute('aria-label'))?.replace(/^Delete /, '') ?? '';
    // The list refreshes under the loop, so a row can go before it is clicked; re-read rather than fail.
    if (
      !(await remove
        .click({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false))
    ) {
      continue;
    }
    const dialog = page.getByRole('dialog').filter({ hasText: /^Delete/ });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    // A refused delete leaves the dialog open, so it is dismissed and the reason reported.
    const failure = dialog.getByRole('alert');
    if (await failure.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const reason = (await failure.textContent())?.trim() ?? 'no reason given';
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      return `deleting ${name} was refused: ${reason}`;
    }
    await expect(envCard(page).getByText(name, { exact: true }), `${name} is still listed after deleting it`).toHaveCount(0, { timeout: 60_000 });
  }
}

/** Finished runs only: a synthesised scheduled or queued row renders "--" and offers no View logs. */
export function finishedExecutions(page: Page): Locator {
  return envCard(page).getByRole('button', { name: 'View logs' });
}

export async function waitForExecutionsPanel(page: Page): Promise<void> {
  const card = envCard(page);
  // The card renders before its executions, so counting straight after a load reports no runs.
  const table = card.getByRole('columnheader', { name: 'Triggered at', exact: true });
  const empty = card.getByText('No execution data available.');
  await expect(table.or(empty).first(), 'the executions panel never rendered').toBeVisible({ timeout: 60_000 });
}

/** Widens the executions table so the count is not split across pages (5 per page by default). */
export async function showAllExecutions(page: Page): Promise<void> {
  const perPage = envCard(page).getByRole('combobox').last();
  if (!(await perPage.isVisible({ timeout: 10_000 }).catch(() => false))) return;
  if ((await perPage.textContent())?.trim() === '25') return;
  await perPage.click();
  await page.getByRole('option', { name: '25', exact: true }).click();
  await expect(perPage, 'the executions table stayed paged at five rows').toHaveText('25', { timeout: 15_000 });
}

/** Swagger UI exposes no roles or labels, so its own classes are the only handle. */
export function swaggerOperation(page: Page): Locator {
  return page.locator('.opblock-summary').first();
}

export function serverResponseCode(page: Page): Locator {
  // Excluding the header: Swagger gives the column heading the same class as the value it labels.
  return page.locator('.live-responses-table .response-col_status:not(.col_header)').first();
}

/** What the Test Console would send: its invoke URL, the header it names, and the key it holds. */
export async function testConsoleTarget(page: Page): Promise<{ url: string; header: string; key: string }> {
  // Invoke URL is the server base (TestConsole.tsx:186); Swagger appends the operation's path to it.
  const base = await page.getByText('Invoke URL', { exact: true }).locator('xpath=following::input[1]').inputValue();
  const path = (await page.locator('.opblock-summary-path').first().textContent())?.trim() ?? '';
  const url = `${base.replace(/\/$/, '')}${path}`;
  const label = (await page.getByText(/^Security header\S/).textContent())?.trim() ?? '';
  const header = label.replace(/^Security header/, '').trim();
  const key = await page.getByPlaceholder('Paste or fetch a test key').inputValue();
  return { url, header, key };
}

/** Called outside the browser, where CORS does not apply, so a gateway error is readable rather than blocked. */
export async function probeEndpoint(page: Page, timeout: number): Promise<{ status: number; reason: string }> {
  const { url, header, key } = await testConsoleTarget(page);
  const deadline = Date.now() + timeout;
  let last = { status: 0, reason: 'the endpoint was never reached' };

  for (;;) {
    const response = await page.request.get(url, { headers: { [header]: key }, failOnStatusCode: false, timeout: 30_000 }).catch((error: Error) => error);
    if (response instanceof Error) {
      last = { status: 0, reason: response.message.split('\n')[0] };
    } else {
      // Truncated and stripped of the key, because this reason is reported into the run's artifacts.
      const body = (await response.text().catch(() => '')).slice(0, 200).split(key).join('<key>');
      last = { status: response.status(), reason: body.trim() || response.statusText() };
    }
    if (last.status === 200 || Date.now() >= deadline) return last;
    await page.waitForTimeout(Math.min(PROBE_GAP_MS, Math.max(0, deadline - Date.now())));
  }
}
