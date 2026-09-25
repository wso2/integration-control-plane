/**
 * The cloud journey: one fixture project, created, exercised and deleted across seven groups.
 *
 * One shared context, so the journey moves as a user does rather than reopening a window per
 * test. Groups run in declaration order and are independent — a failed deploy still leaves
 * import, page availability and cleanup to report. Only the fixture project is a hard
 * dependency; without it every later group skips.
 *
 * Tracing must not be started by hand: Playwright already instruments contexts made from the
 * `browser` fixture, and a second start throws.
 */

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';
import { authStatePath } from '../../helpers/product.js';
import { expectPageRendered } from '../../helpers/cloud-fixtures.js';
import { BUILD_TIMEOUT_MS, waitForBuildToSettle } from '../../helpers/build.js';
import { cardFor, expandSidebar, expectNavItems, openIntegration, openNavGroup, openProject } from '../../helpers/console-nav.js';
import { fillSecret, readSecret } from '../../helpers/secrets.js';
import {
  AGENT_GATE_TIMEOUT_MS,
  AGENT_NAME_PATTERN,
  AGENT_PROMPT,
  AGENT_REPLY_TIMEOUT_MS,
  AGENT_REPO_URL,
  AGENT_TYPE,
  AUTOMATION,
  CLOUD_SECTIONS,
  CONSUMER,
  DEPLOY_TIMEOUT_MS,
  ENV,
  EXECUTE_ATTEMPTS,
  EXECUTE_GAP_MS,
  EXECUTIONS_POLL_MS,
  EXECUTIONS_TARGET,
  EXECUTIONS_WATCH_MS,
  FOOTER_LINKS,
  NO_CONSUMERS,
  NO_SCHEDULE,
  PROBE_TIMEOUT_MS,
  PROJECT,
  PROJECT_REMOVAL_TIMEOUT_MS,
  REDEPLOY_SETTLE_MS,
  REMOVAL_TIMEOUT_MS,
  SAMPLE,
  WIP_ONLY_SECTIONS,
} from '../../helpers/journey-fixtures.js';
import { enterOrgHome, enterProject, enterProjectOrSkip, filterToProject, openProjectSettings, projectSettingsButton, reseedHere, waitForStaleProjectRemoval } from '../../helpers/journey-session.js';
import {
  agentRow,
  confirmRemoval,
  deleteAllIntegrations,
  deleteIntegration,
  deleteMatchingIntegrations,
  integrationRow,
  isPresent,
  reachCreateControl,
  samplesTab,
  waitForDeletionsToFinish,
  waitForIntegrationsToLoad,
} from '../../helpers/journey-integrations.js';
import {
  consumerRow,
  deleteAllConsumers,
  dismissStrayDialog,
  deploymentStatus,
  envCard,
  finishedExecutions,
  openConsumerDrawer,
  probeEndpoint,
  requireActiveDeployment,
  requireAutomationReady,
  serverResponseCode,
  showAllExecutions,
  swaggerOperation,
  waitForConfigureGate,
  waitForDeploymentSettled,
  waitForExecutionsPanel,
} from '../../helpers/journey-envcard.js';

// The org's APIP gateway answers 503 for every path, including ones that never existed, so nothing
// exposed through it can be called. Remove both skips once the gateway serves its endpoints again.
const GATEWAY_DOWN = 'the environment gateway reports no healthy upstream for any path';

// No retries: a retry would replay a stateful journey against state the first pass mutated.
test.describe.configure({ retries: 0 });

const CONSUMER_BASE = CONSUMER;
// Set at creation: an undeletable leftover of the same name makes the create form reject it.
let consumerName = CONSUMER_BASE;
let agentName = '';

// Read in beforeAll, not at module scope: module scope is evaluated when Playwright collects
// the file, which is before the setup project has written the context it reads.
let orgHandler = '';

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  orgHandler = getAuthContext(testInfo.project.name).orgHandler;
  context = await browser.newContext({
    storageState: authStatePath(testInfo.project.name),
    baseURL: testInfo.project.use.baseURL,
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

// 01 — the fixture project. Everything else depends on this one.

test.describe('01 fixture project @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterOrgHome(page, orgHandler);
  });

  test('the organization home lists its projects', async () => {
    await expect(page.getByRole('heading', { name: 'All Projects' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
  });

  test('the organization home links to tutorials and Discord support', async () => {
    // EXPLORE_GROUPS is rendered by Projects.tsx, the org project list, not a project overview.
    await expect(page.getByRole('link', { name: 'Build an Automation' })).toHaveAttribute('href', /get-started\/build-automation$/);
    await expect(page.getByRole('link', { name: 'Get Support on Discord' })).toHaveAttribute('href', 'https://discord.com/invite/wso2');
  });

  test('IPAAS-E2E exists, created fresh or reused and emptied', async () => {
    test.setTimeout(12 * 60_000);

    await filterToProject(page);

    if (
      await projectSettingsButton(page)
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    ) {
      // Emptied on reuse: 02 asserts the empty state, and a run whose cleanup failed leaves rows.
      await openProject(page, PROJECT);
      await waitForIntegrationsToLoad(page);
      const cleared = await deleteAllIntegrations(page);
      await expect(page.getByRole('button', { name: /^Delete / }), `${PROJECT} still lists integrations after clearing it`).toHaveCount(0, { timeout: 60_000 });
      test.info().annotations.push({ type: 'fixture', description: `${PROJECT} already existed; reused after clearing ${cleared} integration(s)` });
      return;
    }

    await waitForStaleProjectRemoval(page);

    // exact — 'Create' also prefixes 'Create an Integration' and 'Create Project'.
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('textbox', { name: 'Display Name' }).fill(PROJECT);
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();

    const landed = await page
      .getByRole('heading', { name: PROJECT })
      .waitFor({ state: 'visible', timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!landed) {
      const reason =
        (
          await page
            .getByRole('alert')
            .first()
            .textContent()
            .catch(() => null)
        )?.trim() ?? '';
      // Project quota is a 402 from platform-api surfaced as a 500, so the console shows a
      // generic failure. Skipped rather than failed: the suite cannot create quota it lacks.
      test.skip(/quota|already exists|internal server error|failed to create/i.test(reason), `Project could not be created: ${reason || 'no error shown'}`);
      throw new Error(`Create Project did not land on the project. Alert: ${reason || 'none'}`);
    }

    test.info().annotations.push({ type: 'fixture', description: `${PROJECT} created` });
  });

  test('the project opens on an overview headed by its name', async () => {
    await enterProjectOrSkip(page, orgHandler);
    await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible({ timeout: 60_000 });
  });
});

// 02 — the empty state, before anything populates it

test.describe('02 empty project overview @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
  });

  test('offers to create an integration on Cloud', async () => {
    await expect(page.getByText('Create an Integration on Cloud', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Open Cloud Editor' })).toBeVisible();
  });

  test('offers to import your own integration', async () => {
    await expect(page.getByText('Import your own Integration', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Import from a Public Repository' })).toBeVisible();
  });

  test('offers the Start quickly panel with both tabs', async () => {
    await expect(page.getByText('Start quickly', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Prebuilt Integrations' })).toBeVisible();
    await expect(samplesTab(page)).toBeVisible();
  });

  test('offers no import provider beyond the five supported ones', async () => {
    // A sixth provider appearing here means one shipped without a decision about it.
    await expect(page.getByRole('button', { name: /^Import from/ })).toHaveCount(5);
  });

  test('the Prebuilt Integrations tab is selected by default and lists cards', async () => {
    await expect(page.getByRole('tab', { name: 'Prebuilt Integrations' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Explore more prebuilt integrations' })).toBeVisible();
  });

  test('prebuilt cards name the integrations they connect', async () => {
    // One card, not the catalogue: the backend owns its contents and can reorder them.
    await expect(page.getByText('Export Salesforce Opportunities to a Google Sheet')).toBeVisible();
    await expect(page.getByText('Salesforce • Google Sheets')).toBeVisible();
  });

  test('shows no integrations table while the project is empty', async () => {
    // Positive assertion first: absence passes trivially against a page that has not rendered.
    await expect(page.getByText('Start quickly', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

// 03 — browse samples

test.describe('03 browse samples @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  let browseSamplesUrl = '';

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    const match = page.url().match(/\/projects\/([^/?#]+)/);
    if (!match) {
      test.skip(true, 'Could not determine project handler from the URL after entering the project');
      return;
    }
    browseSamplesUrl = `/organizations/${orgHandler}/projects/${match[1]}/components/new/samples`;

    await page.goto(browseSamplesUrl, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      page
        .getByRole('heading', { name: 'Browse Samples' })
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
      page
        .getByText('Failed to load samples. Please try again later.')
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
    ]);
    await expect(page.getByText('Failed to load samples. Please try again later.'), 'The samples service is down — this is a backend failure, not a UI regression').not.toBeVisible();
  });

  test('shows the Browse Samples heading and subtitle', async () => {
    await expect(page.getByRole('heading', { name: 'Browse Samples' })).toBeVisible();
    await expect(page.getByText('Deploy a sample to get started quickly.')).toBeVisible();
  });

  test('shows a Back button to the integration creation options', async () => {
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  });

  test('shows the sample search input', async () => {
    await expect(page.getByPlaceholder('Search samples…')).toBeVisible();
  });

  test('shows the Type and Tags filter sections, and hides Technology', async () => {
    await expect(page.getByRole('button', { name: 'Type', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tags', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Technology', exact: true })).not.toBeVisible();
  });

  test('a search with no matches shows the empty-result message', async () => {
    // Every SampleGridCard renders a "Quick Deploy" button — asserting on it first confirms
    // real results are showing before we search them away.
    await expect(page.getByRole('button', { name: 'Quick Deploy' }).first()).toBeVisible();
    await page.getByPlaceholder('Search samples…').fill(`no-such-sample-${Date.now()}`);
    await expect(page.getByText('No samples match your search.')).toBeVisible();
  });

  test('clearing the search brings the results back', async () => {
    const search = page.getByPlaceholder('Search samples…');
    await search.fill(`no-such-sample-${Date.now()}`);
    await expect(page.getByText('No samples match your search.')).toBeVisible();
    await search.clear();
    await expect(page.getByText('No samples match your search.')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Quick Deploy' }).first()).toBeVisible();
  });
});

// 04 — deploying a sample

test.describe('04 deploy a sample @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
  });

  test('the Samples tab lists Hello World Service', async () => {
    await reachCreateControl(page, samplesTab(page));
    await samplesTab(page).click();
    await expect(page.getByText(SAMPLE, { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('Deploy provisions the integration and lands on its overview', async () => {
    test.setTimeout(4 * 60_000);
    // Scoped to the card: the sidebar's Deploy page and each sample's Deploy button share a name.
    await cardFor(page, SAMPLE, 'Deploy').click();

    // The deploy runs through a progress page before settling on the integration's overview.
    await expect(page.getByRole('heading', { name: SAMPLE })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the integration overview reports a build', async () => {
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the sample appears in the project with the table columns', async () => {
    await enterProject(page, orgHandler);
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 30_000 });
    for (const column of ['Name', 'Description', 'Type', 'Last Updated']) {
      await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
    await expect(integrationRow(page, SAMPLE)).toHaveCount(1);
  });

  test('the sample build completes', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + 2 * 60_000);
    await openIntegration(page, SAMPLE);
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });

    const status = await waitForBuildToSettle(page);
    test.info().annotations.push({ type: 'build', description: `${SAMPLE}: ${status}` });
    // A build that never settles already fails the run, so one that settles on Failed must too.
    expect(status, `${SAMPLE} build ended as ${status}`).toMatch(/^Completed/);
  });
});

// 04b — the deployed endpoint, then the consumer application lifecycle

test.describe('04b endpoint and consumers @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    // The table has to paint before the row's delete action can be probed for.
    await waitForIntegrationsToLoad(page);
    test.skip(!(await isPresent(page, SAMPLE)), `${SAMPLE} is not in the project`);
    await openIntegration(page, SAMPLE);
  });

  // Serial: a build that never completed leaves nothing to test, so one failure reports the cause once.
  test('the latest build reports Completed', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + 2 * 60_000);
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });
    const status = await waitForBuildToSettle(page);
    expect(status, `${SAMPLE} build ended as ${status}`).toMatch(/^Completed/);
  });

  test('the deployment settles out of In Progress into Active', async () => {
    test.setTimeout(DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await expect(envCard(page), `no ${ENV} card on ${SAMPLE}`).toBeVisible({ timeout: 2 * 60_000 });
    await expect(deploymentStatus(page)).toHaveText(/^(Active|Error)$/, { timeout: DEPLOY_TIMEOUT_MS });
    const status = (await deploymentStatus(page).textContent())?.trim() ?? '';
    test.info().annotations.push({ type: 'deployment', description: `${SAMPLE} in ${ENV}: ${status}` });
    expect(status, `${SAMPLE} deployment to ${ENV} ended as ${status}`).toBe('Active');
  });

  test('the env card offers the endpoint URLs and the resources it exposes', async () => {
    await dismissStrayDialog(page);
    const card = envCard(page);
    await expect(card.getByText('URLs', { exact: true })).toBeVisible({ timeout: 3 * 60_000 });
    await expect(card.getByText('Download Spec', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'View Details' }).first(), 'the card lists no resources').toBeVisible();
  });

  test('the consumers section is offered with its security scheme', async () => {
    const card = envCard(page);
    await expect(card.getByText(/^Consumers\s*\(\d+\)/)).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText(/^Security Scheme:/)).toBeVisible();
  });

  // Skipped where deletion is unavailable: creating and revoking are still worth exercising.
  test('the section starts with no consumers', async () => {
    const refused = await deleteAllConsumers(page);
    test.skip(!!refused, `cannot clear existing consumers here — ${refused}`);
    await expect(envCard(page).getByText(NO_CONSUMERS)).toBeVisible({ timeout: 60_000 });
  });

  test('a consumer application is created and shows its key once', async () => {
    const taken = await consumerRow(page, CONSUMER)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    consumerName = taken ? `${CONSUMER}-${Date.now().toString().slice(-5)}` : CONSUMER;

    await openConsumerDrawer(page);
    // By placeholder: the drawer's label is a sibling Typography, so the field has no accessible name.
    await page.getByPlaceholder('e.g. my-greeting-client').fill(consumerName);
    await page.getByRole('button', { name: 'Generate Credentials' }).click();

    const drawer = page.getByRole('dialog').filter({ hasText: consumerName });
    await expect(drawer.getByText('Header', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(drawer.getByText('API Key', { exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  });

  test('the new consumer is listed as Active', async () => {
    await expect(consumerRow(page, consumerName), `${consumerName} is not listed`).toBeVisible({ timeout: 60_000 });
    await expect(consumerRow(page, consumerName).getByText('Active', { exact: true })).toBeVisible();
  });

  test('revoking the key marks the consumer Revoked', async () => {
    await consumerRow(page, consumerName).getByRole('button', { name: 'Manage', exact: true }).click();
    const drawer = page.getByRole('dialog').filter({ hasText: consumerName });
    await drawer.getByRole('button', { name: 'Revoke', exact: true }).click();

    const confirm = page.getByRole('dialog').filter({ hasText: 'Revoke this API key?' });
    await confirm.getByRole('button', { name: 'Revoke', exact: true }).click();
    // The drawer closes itself once the key is revoked, so Done is clicked only if it is still there.
    const done = drawer.getByRole('button', { name: 'Done', exact: true });
    if (await done.isVisible({ timeout: 5_000 }).catch(() => false)) await done.click();

    await expect(consumerRow(page, consumerName).getByText('Revoked', { exact: true })).toBeVisible({ timeout: 60_000 });
  });

  test('deleting the consumer empties the section', async () => {
    const refused = await deleteAllConsumers(page);
    expect(refused, `${consumerName} could not be deleted`).toBeNull();
    await expect(envCard(page).getByText(NO_CONSUMERS)).toBeVisible({ timeout: 60_000 });
  });
});

// 04c — calling the endpoint from the Test Console

test.describe('04c test console @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    await waitForIntegrationsToLoad(page);
    test.skip(!(await isPresent(page, SAMPLE)), `${SAMPLE} is not in the project`);
    await openIntegration(page, SAMPLE);
  });

  test('the build completed and the deployment is Active', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await requireActiveDeployment(page);
  });

  test('the env card offers Test, which opens the Test Console', async () => {
    const testButton = envCard(page).getByRole('button', { name: 'Test', exact: true });
    await expect(testButton).toBeVisible({ timeout: 60_000 });
    await testButton.click();
    await expect(page).toHaveURL(/\/test\/console$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Test Console', level: 1 })).toBeVisible({ timeout: 60_000 });
  });

  test('the console names the endpoint, visibility, invoke URL and security header', async () => {
    for (const label of ['Endpoint', 'Visibility', 'Invoke URL']) {
      await expect(page.getByText(label, { exact: true }), `the console is missing the ${label} field`).toBeVisible({ timeout: 60_000 });
    }
    // Not exact: the label carries the header's name as a caption inside it, so its text is both.
    await expect(page.getByText(/^Security Header\S/), 'the console is missing the Security Header field, or it names no header').toBeVisible({ timeout: 60_000 });
  });

  test('a test key is held, or fetched on demand', async () => {
    const field = page.getByPlaceholder('Paste or fetch a test key');
    await expect(field).toBeVisible({ timeout: 60_000 });
    if (!(await field.inputValue())) {
      await page.getByRole('button', { name: 'Get Test Key' }).click();
    }
    await expect.poll(async () => (await field.inputValue()).length, { message: 'no test key was populated', timeout: 60_000 }).toBeGreaterThan(0);
  });

  test('the endpoint answers the same call from outside the browser', async () => {
    test.setTimeout(PROBE_TIMEOUT_MS + 2 * 60_000);
    test.skip(true, GATEWAY_DOWN);
    await expect(swaggerOperation(page), 'the swagger viewer lists no operation').toBeVisible({ timeout: 60_000 });

    // Ahead of the console's own call, and without CORS in the way, so a gateway that is not
    // routing yet reports its own reason instead of surfacing as a blocked response.
    const probe = await probeEndpoint(page, PROBE_TIMEOUT_MS);
    test.info().annotations.push({ type: 'probe', description: `the endpoint answered ${probe.status}` });
    expect(probe.status, `the endpoint answered ${probe.status} (${probe.reason}) — the gateway is not routing to it`).toBe(200);
  });

  test('executing GET /greeting answers 200', async () => {
    test.setTimeout(EXECUTE_ATTEMPTS * EXECUTE_GAP_MS + 3 * 60_000);
    test.skip(true, GATEWAY_DOWN);
    await expect(swaggerOperation(page), 'the swagger viewer lists no operation').toBeVisible({ timeout: 60_000 });
    await swaggerOperation(page).click();
    await page.getByRole('button', { name: 'Try it out' }).click();

    let code = '';
    for (let attempt = 1; attempt <= EXECUTE_ATTEMPTS; attempt += 1) {
      await page.getByRole('button', { name: 'Execute' }).click();
      await expect(serverResponseCode(page)).toBeVisible({ timeout: 60_000 });
      code = (await serverResponseCode(page).textContent())?.trim() ?? '';
      if (code === '200') break;
      if (attempt < EXECUTE_ATTEMPTS) await page.waitForTimeout(EXECUTE_GAP_MS);
    }

    test.info().annotations.push({ type: 'invoke', description: `GET /greeting answered ${code}` });
    expect(code, `GET /greeting answered ${code} — an "Undocumented" code is the browser refusing the response`).toBe('200');
  });
});

// 04d — the automation sample: schedule it, then watch it run

test.describe('04d schedule an automation @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  // Set in beforeAll: an automation an earlier run deployed is scheduled again rather than duplicated.
  let alreadyDeployed = false;

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    await waitForIntegrationsToLoad(page);
    alreadyDeployed = await isPresent(page, AUTOMATION);
    if (alreadyDeployed) await openIntegration(page, AUTOMATION);
  });

  test('the Samples tab lists Scheduled Logger as an Automation', async () => {
    test.skip(alreadyDeployed, `${AUTOMATION} is already in the project`);
    await reachCreateControl(page, samplesTab(page));
    await samplesTab(page).click();
    await expect(page.getByText(AUTOMATION, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Automation', { exact: true }).first(), `${AUTOMATION} is not offered as an Automation`).toBeVisible();
  });

  test('Deploy provisions the automation and lands on its overview', async () => {
    test.setTimeout(4 * 60_000);
    test.skip(alreadyDeployed, `${AUTOMATION} is already in the project`);
    await cardFor(page, AUTOMATION, 'Deploy').click();
    await expect(page.getByRole('heading', { name: AUTOMATION })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the build completed and the automation offers Schedule and Test', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await requireAutomationReady(page);
  });

  test('the automation starts with no schedule', async () => {
    await expect(envCard(page).getByText(NO_SCHEDULE)).toBeVisible({ timeout: 60_000 });
    await expect(envCard(page).getByRole('button', { name: 'Schedule', exact: true })).toBeVisible();
  });

  test('scheduling it every minute takes effect', async () => {
    await envCard(page).getByRole('button', { name: 'Schedule', exact: true }).click();
    const drawer = page.getByRole('dialog').filter({ hasText: 'Repeat beginning of every' });
    await expect(drawer).toBeVisible({ timeout: 30_000 });

    // BY INTERVAL is the drawer's first tab and its default.
    await drawer.getByRole('textbox').first().fill('1');
    await drawer.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Minute', exact: true }).click();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();

    await expect(envCard(page).getByRole('button', { name: 'Stop Schedule' }), 'the schedule was not accepted').toBeVisible({ timeout: 2 * 60_000 });
    await expect(envCard(page).getByText(NO_SCHEDULE)).toHaveCount(0);
  });

  test('at least five executions are reported within eight minutes', async () => {
    test.setTimeout(EXECUTIONS_WATCH_MS + 3 * 60_000);
    const deadline = Date.now() + EXECUTIONS_WATCH_MS;
    let seen = 0;

    for (;;) {
      await waitForExecutionsPanel(page);
      await showAllExecutions(page);
      seen = await finishedExecutions(page).count();
      if (seen >= EXECUTIONS_TARGET || Date.now() >= deadline) break;
      await page.waitForTimeout(Math.min(EXECUTIONS_POLL_MS, deadline - Date.now()));
      // Reloaded through a reseed: the card polls on its own triggers, and this watch outlives a token.
      await reseedHere(page);
      await expect(envCard(page)).toBeVisible({ timeout: 60_000 });
    }

    test.info().annotations.push({ type: 'executions', description: `${AUTOMATION}: ${seen} finished in ${Math.round(EXECUTIONS_WATCH_MS / 60_000)}m` });
    expect(seen, `only ${seen} execution(s) finished — a one-minute schedule should produce at least ${EXECUTIONS_TARGET}`).toBeGreaterThanOrEqual(EXECUTIONS_TARGET);
  });

  test('the schedule is stopped again', async () => {
    await envCard(page).getByRole('button', { name: 'Stop Schedule' }).click();
    await expect(envCard(page).getByRole('button', { name: 'Schedule', exact: true }), 'the schedule is still live').toBeVisible({ timeout: 2 * 60_000 });
  });
});

// 05 — importing an AI agent from a public repository, configuring it, then chatting with it

test.describe('05 import an AI agent @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  // Mounted from the vault at runtime, and typed through fillSecret so it is never a step parameter.
  const openAiKey = readSecret('E2E_OPENAI_KEY');

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
  });

  test('the import form opens from the project', async () => {
    const importButton = page.getByRole('button', { name: 'Import from a Public Repository' });
    await reachCreateControl(page, importButton);
    await importButton.click();
    await expect(page.getByRole('heading', { name: 'Import an Integration' })).toBeVisible({ timeout: 30_000 });
  });

  test('the repository URL resolves into a branch and a derived name', async () => {
    test.setTimeout(3 * 60_000);
    await page.getByRole('textbox', { name: 'Repository URL' }).fill(AGENT_REPO_URL);

    // These appear only once the repository resolves through GitHub; an empty branch list means
    // the public API's hourly rate limit is spent, which a real user hits too.
    await expect(page.getByRole('combobox', { name: /^Branch/ }), 'the repository did not resolve into a branch — GitHub public API rate limit is the usual cause').toContainText('main', { timeout: 60_000 });
    // Read, never opened: the picker re-runs technology detection, which can leave the submit disabled.
    await expect(page.getByRole('textbox', { name: 'Repository Sub Path' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Display Name' }), 'the display name was not derived from the repository').not.toHaveValue('');
  });

  test('importing provisions the agent under its derived name', async () => {
    test.setTimeout(4 * 60_000);
    await page.getByRole('button', { name: new RegExp(`^${AGENT_TYPE}`) }).click();

    // Polled, not read once: `isEnabled()` reports the state at the moment it is called.
    const submit = page.getByRole('button', { name: 'Import Integration' });
    await expect(submit, 'Import Integration stayed disabled — technology detection did not settle').toBeEnabled({ timeout: 60_000 });
    await submit.click();

    const heading = page.getByRole('heading', { name: AGENT_NAME_PATTERN }).first();
    await expect(heading, 'the import did not land on the agent overview').toBeVisible({ timeout: 2 * 60_000 });
    agentName = (await heading.textContent())?.trim() ?? '';
    test.info().annotations.push({ type: 'fixture', description: `agent imported as ${agentName}` });
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the imported agent reports its source and type', async () => {
    await expect(page.getByText(AGENT_TYPE, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: new RegExp(AGENT_REPO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  });

  test('the build section collapses and expands', async () => {
    // One control under two tooltips, so each label appearing proves the section moved.
    const collapse = page.getByRole('button', { name: 'Collapse build details', exact: true });
    const expand = page.getByRole('button', { name: 'Expand build details', exact: true });

    // The toggle trails the heading on a just-imported integration, so wait for either state
    // before deciding which way it has to move.
    await expect(collapse.or(expand), 'the build card offered no collapse control').toBeVisible({ timeout: 60_000 });
    const [first, second] = (await collapse.isVisible().catch(() => false)) ? [collapse, expand] : [expand, collapse];
    await first.click();
    await expect(second, 'the build section did not move on the first toggle').toBeVisible({ timeout: 30_000 });
    await second.click();
    await expect(first, 'the build section did not move back').toBeVisible({ timeout: 30_000 });
  });

  test('View Logs opens the build logs and Hide Logs closes them', async () => {
    const viewLogs = page.getByRole('button', { name: 'View Logs' }).first();
    await expect(viewLogs).toBeVisible({ timeout: 5 * 60_000 });
    await viewLogs.click();

    // One button carries both labels (BuildCard.tsx:208), so the flip is the evidence.
    const hideLogs = page.getByRole('button', { name: 'Hide Logs' }).first();
    await expect(hideLogs).toBeVisible({ timeout: 30_000 });
    await hideLogs.click();
    await expect(page.getByRole('button', { name: 'View Logs' }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('the build completed and the deployment is Active', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await requireActiveDeployment(page, agentName || AGENT_TYPE);
  });

  test('the agent asks to be configured before it can run', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + AGENT_GATE_TIMEOUT_MS + 2 * 60_000);
    // An import runs more than one build, and the card reports no deployment until the last lands.
    const reported = await waitForConfigureGate(page);
    expect(reported, `${agentName} never asked for configuration — the card reported: ${reported}`).toBe('the agent asked to be configured');
  });

  test('the model key is accepted and the agent redeploys', async () => {
    test.setTimeout(DEPLOY_TIMEOUT_MS + 3 * 60_000);
    test.skip(true, 'awaiting a valid model key: E2E_OPENAI_KEY is not issued yet');

    await envCard(page).getByRole('button', { name: 'Configure to Continue' }).click();
    await fillSecret(page.getByRole('textbox', { name: 'Enter a value' }).first(), openAiKey!);

    // Stepped through, because the wizard's length is the configuration's — and Apply commits it.
    const wizard = page.getByRole('dialog').filter({ hasText: 'Configure' });
    for (let step = 0; step < 5; step += 1) {
      const next = wizard.getByRole('button', { name: 'Next', exact: true });
      if (!(await next.isVisible({ timeout: 10_000 }).catch(() => false))) break;
      await next.click();
    }
    const apply = wizard.getByRole('button', { name: 'Apply', exact: true });
    await expect(apply, 'the configure wizard never offered Apply').toBeVisible({ timeout: 30_000 });
    await apply.click();
    await expect(wizard, 'the configure wizard stayed open after Apply').toHaveCount(0, { timeout: 60_000 });

    await page.waitForTimeout(REDEPLOY_SETTLE_MS);
    await reseedHere(page);
    const status = await waitForDeploymentSettled(page);
    expect(status, `${agentName} deployment ended as ${status} after configuring`).toBe('Active');
  });

  test('the agent replies in the chat', async () => {
    test.setTimeout(AGENT_REPLY_TIMEOUT_MS + DEPLOY_TIMEOUT_MS + 2 * 60_000);
    test.skip(true, 'awaiting a valid model key: E2E_OPENAI_KEY is not issued yet');

    // An In Progress redeploy answers nothing, so the card is waited out before a message is sent.
    await reseedHere(page);
    const ready = await waitForDeploymentSettled(page);
    expect(ready, `${agentName} is ${ready}, so it cannot answer`).toBe('Active');

    const box = envCard(page).getByRole('textbox', { name: 'Message your agent…' });
    await expect(box, 'the chat is not offered on the agent card').toBeVisible({ timeout: 2 * 60_000 });
    await box.fill(AGENT_PROMPT);
    await envCard(page).getByRole('button', { name: 'Send', exact: true }).click();

    // `Copy message` renders only on an agent bubble, so it appearing is the reply landing.
    await expect(envCard(page).getByRole('button', { name: 'Copy message' }).first(), 'the agent did not reply').toBeVisible({ timeout: AGENT_REPLY_TIMEOUT_MS });
  });
});

// 06 — the populated overview, which only exists once 04 and 05 have run

test.describe('06 populated project overview @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    await waitForIntegrationsToLoad(page);
    const populated = (await isPresent(page, SAMPLE)) || (await agentRow(page).count()) > 0;
    test.skip(!populated, 'The project holds no integrations, so the populated branch cannot be exercised');
  });

  test('every integration row carries cells and a delete action', async () => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const count = await rows.count();
    expect(count, 'the populated branch needs at least one integration').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // The type cell is derived from componentType; a row without one fell through to 'unsupported'.
      await expect(row.getByRole('cell')).not.toHaveCount(0);
      await expect(row.getByRole('button', { name: /^Delete / })).toBeVisible();
    }
  });

  test('the empty-state entry points are replaced, not merely hidden', async () => {
    // The table proves the populated branch rendered; only then does absence mean anything.
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30_000 });

    // Current strings: the removed spec asserted text that no longer exists, so it could only pass.
    await expect(page.getByText('Import your own Integration', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Start quickly', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Cloud Editor', exact: true })).toHaveCount(0);
  });

  test('the architecture panel is offered', async () => {
    await expect(page.getByRole('heading', { name: 'Architecture Diagram' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /architecture diagram$/ })).toBeVisible();
  });

  test('the integration count panel totals the rows in the table', async () => {
    await expect(page.getByRole('heading', { name: 'Integration Count by Type' })).toBeVisible({ timeout: 30_000 });

    const rowCount = await page.getByRole('row', { name: /^View details for / }).count();
    const total = page.getByText('Total', { exact: true }).locator('xpath=following-sibling::*[1]');
    await expect(total).toHaveText(String(rowCount));
  });

  test('the contributors panel names contributors when the project has any', async () => {
    // ContributorsCard returns null until commit history yields contributors.
    const heading = page.getByRole('heading', { name: 'Contributors' });
    const present = await heading
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!present, 'No contributors resolved for this project');

    await expect(page.getByRole('img', { name: /\d+ contributions?/ })).not.toHaveCount(0);
  });

  test('search narrows the table to the matching integration', async () => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const before = await rows.count();
    expect(before, 'need at least one integration to search for').toBeGreaterThan(0);

    // Derived at runtime: integration names belong to the backend.
    const name = ((await rows.first().getAttribute('aria-label')) ?? '').replace(/^View details for /, '').trim();
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(name);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(name);
  });

  test('a search with no matches empties the table', async () => {
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(`no-such-integration-${Date.now()}`);
    await expect(page.getByRole('row', { name: /^View details for / })).toHaveCount(0);
  });
});

// 07 — the pages each scope offers

test.describe('07 page availability @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('the organization scope offers its pages', async () => {
    await enterOrgHome(page, orgHandler);
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines', 'Settings']);
  });

  test('the project scope offers its pages', async () => {
    await enterProjectOrSkip(page, orgHandler);
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines', 'Settings']);

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible({ timeout: 30_000 });
  });

  test('the integration scope offers its pages, including Operate', async () => {
    await enterProjectOrSkip(page, orgHandler);
    await waitForIntegrationsToLoad(page);
    test.skip(!(await isPresent(page, SAMPLE)), `${SAMPLE} is not in the project`);
    await openIntegration(page, SAMPLE);
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);

    // Opened, not just listed: a nav item survives a page that fails to render, and the
    // integration-scoped observability specs no longer run on cloud to catch that.
    for (const observePage of ['Runtime Logs', 'Metrics']) {
      await page.getByRole('button', { name: observePage, exact: true }).click();
      await expect(page.locator('main').getByRole('heading').first(), `${observePage} did not render`).toBeVisible({ timeout: 60_000 });
    }

    await openNavGroup(page, 'Operate', 'Runtime');
    await expectNavItems(page, ['Runtime', 'Containers', 'Configs & Secrets']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines']);

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: SAMPLE })).toBeVisible({ timeout: 30_000 });
  });

  test('the footer offers Documentation, Terms of Use, Privacy Policy and Support in order', async () => {
    await enterOrgHome(page, orgHandler);
    for (const [name, href] of FOOTER_LINKS) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }

    const links = page.getByRole('link', { name: /^(Documentation|Terms of Use|Privacy Policy|Support)$/ });
    for (const [index, [name]] of FOOTER_LINKS.entries()) {
      await expect(links.nth(index)).toHaveText(name);
    }
  });

  test('every footer link opens in a new tab', async () => {
    for (const [name] of FOOTER_LINKS) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('target', '_blank');
    }
  });

  test('the footer shows the WSO2 copyright notice', async () => {
    await expect(page.getByText(`© ${new Date().getFullYear()}, WSO2 LLC.`)).toBeVisible();
  });

  test('organization settings page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
  });

  for (const section of CLOUD_SECTIONS) {
    test(`organization settings offers "${section}"`, async () => {
      await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    });
  }

  test('organization settings offers no WIP-only section', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
    await expect(page.getByText('Org Details', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    for (const section of WIP_ONLY_SECTIONS) {
      await expect(page.getByText(section, { exact: true })).not.toBeVisible();
    }
  });

  test('package registries page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/package-registries`);
  });

  test('org details page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/org-details`);
  });
});

// 08 — cleanup, which is also the deletion coverage

test.describe('08 clean up @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    await waitForIntegrationsToLoad(page);
  });

  test('the deployed sample is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    // Gated on what the project actually holds, not on a flag: a group that created something
    // and then failed before setting its flag would otherwise strand it on a shared org.
    test.skip(!(await isPresent(page, SAMPLE)), `${SAMPLE} is not in the project`);
    await deleteIntegration(page, SAMPLE);
  });

  test('the scheduled automation is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    test.skip(!(await isPresent(page, AUTOMATION)), `${AUTOMATION} is not in the project`);
    await deleteIntegration(page, AUTOMATION);
  });

  test('the imported agent is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    const removed = await deleteMatchingIntegrations(page, AGENT_NAME_PATTERN);
    test.skip(removed === 0, 'no imported agent is in the project');
  });

  test('the project reports no integrations left', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    await waitForDeletionsToFinish(page);
    for (const name of [SAMPLE, AUTOMATION]) {
      await expect(integrationRow(page, name), `${name} is still listed`).toHaveCount(0, { timeout: 60_000 });
    }
    await expect(page.getByRole('row').filter({ hasText: AGENT_NAME_PATTERN }), 'the imported agent is still listed').toHaveCount(0, { timeout: 60_000 });
  });

  test('Delete Project becomes available once the project is empty', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 3 * 60_000);
    // Back to project scope: cloud's integration scope offers no Settings item (AppLayout.tsx:1424).
    await openProjectSettings(page, orgHandler);

    // Disabled while integrations remain (ProjectOverview.tsx:120), so this also proves the
    // deletions landed. Re-entered each attempt because the components query does not refetch.
    const deleteProject = page.getByRole('button', { name: 'Delete Project', exact: true });
    let enabled = false;
    // 40 attempts at 15s, matching the budget a single integration's removal gets.
    for (let attempt = 0; attempt < 40 && !enabled; attempt++) {
      enabled = await expect(deleteProject)
        .toBeEnabled({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!enabled) await openProjectSettings(page, orgHandler);
    }
    expect(enabled, 'Delete Project stayed disabled — an integration is still being removed').toBe(true);
  });

  test('deleting the project returns to the organization home without its card', async () => {
    test.setTimeout(PROJECT_REMOVAL_TIMEOUT_MS + 3 * 60_000);
    await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
    await confirmRemoval(page, 'Enter project name to confirm', PROJECT);

    // No success alert exists (ProjectOverview.tsx:72 navigates with state Projects.tsx:93
    // clears), so the redirect is the signal. Raced against the failure branch (:76) so a
    // rejected delete reports its reason instead of timing out on a heading.
    const landed = page.getByRole('heading', { name: 'All Projects' });
    const rejected = page.getByRole('alert').filter({ hasText: /Failed to delete the project/i });
    await Promise.race([landed.waitFor({ state: 'visible', timeout: 2 * 60_000 }).catch(() => {}), rejected.waitFor({ state: 'visible', timeout: 2 * 60_000 }).catch(() => {})]);
    if (await rejected.isVisible().catch(() => false)) {
      throw new Error(`the console rejected the delete: ${(await rejected.textContent())?.trim()}`);
    }
    await expect(landed, 'the delete neither completed nor reported an error').toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(PROJECT, { exact: true }), `the ${PROJECT} card is still on the org home`).toHaveCount(0, { timeout: PROJECT_REMOVAL_TIMEOUT_MS });
  });
});

// 09 — signing out, the journey's last act
test.describe('09 sign out @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('signing out asks for confirmation and returns to the sign-in page', async () => {
    test.setTimeout(2 * 60_000);
    await enterOrgHome(page, orgHandler);

    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, 'signing out did not ask for confirmation').toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Sign Out' }).click();

    // Cloud has no in-app login page — /login hands off to Thunder's hosted Gate.
    await expect(page).toHaveURL(/\/gate\/signin/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible({ timeout: 30_000 });
  });
});
