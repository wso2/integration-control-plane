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

import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { AUTH_STATE_PATH, getAuthContext } from '../../helpers/auth-context.js';
import { expectPageRendered } from '../../helpers/cloud-fixtures.js';
import { newConsoleContext } from '../../helpers/session-storage.js';
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
  AUTOMATION_REPO_URL,
  AUTOMATION_SUB_PATH,
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
  MI_DEPLOY_TIMEOUT_MS,
  MI_SAMPLE_TECHNOLOGY,
  MI_TECHNOLOGY,
  NO_CONSUMERS,
  NO_SCHEDULE,
  PROBE_TIMEOUT_MS,
  PROJECT,
  PROJECT_REMOVAL_TIMEOUT_MS,
  REDEPLOY_SETTLE_MS,
  REMOVAL_TIMEOUT_MS,
  SAMPLE,
  UNPORTED_SECTIONS,
} from '../../helpers/journey-fixtures.js';
import { activeProject, listFixtureProjects, STALE_AGE_MS, staleProjects, setActiveProject } from '../../helpers/journey-project.js';
import { enterOrgHome, enterProject, enterProjectOrSkip, openProjectSettings, projectSettingsButton, reseedHere } from '../../helpers/journey-session.js';
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
  orgHandler = getAuthContext().orgHandler;
  context = await newConsoleContext(browser, {
    storageState: AUTH_STATE_PATH,
    baseURL: testInfo.project.use.baseURL,
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

// 00 — A Temporary test case: the undated IPAAS-E2E project an older suite created, which 08b cannot date and so never collects

// Exact matches only: the search box merely narrows the list, and every run's own dated project starts with this name.
async function filterToLegacyProject(page: Page): Promise<Locator> {
  await enterOrgHome(page, orgHandler);
  const search = page.getByPlaceholder('Search projects');
  if (await search.isVisible({ timeout: 15_000 }).catch(() => false)) await search.fill(PROJECT);
  return page.locator('.MuiCard-root').filter({ has: page.getByText(PROJECT, { exact: true }) });
}

async function openLegacySettings(page: Page): Promise<void> {
  await filterToLegacyProject(page);
  await page.getByRole('button', { name: `Settings for ${PROJECT}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 30_000 });
}

/** Deletes every integration the overview still lists and waits the deletions out. */
async function emptyLegacyProject(page: Page): Promise<number> {
  const card = await filterToLegacyProject(page);
  await card.first().click();
  await expect(page.getByRole('heading', { name: PROJECT, exact: true })).toBeVisible({ timeout: 60_000 });
  await waitForIntegrationsToLoad(page);
  const removed = await deleteAllIntegrations(page);
  await waitForDeletionsToFinish(page);
  return removed;
}

/** Empties and deletes the legacy project; throws with the reason when it cannot. */
async function sweepLegacyProject(page: Page, note: (description: string) => void): Promise<void> {
  const card = await filterToLegacyProject(page);
  if (
    !(await card
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false))
  ) {
    note(`no ${PROJECT} project to sweep`);
    return;
  }

  // A project already being deleted keeps its card but loses the settings button, so it is only waited out.
  const settings = page.getByRole('button', { name: `Settings for ${PROJECT}`, exact: true });
  if (await settings.isVisible({ timeout: 15_000 }).catch(() => false)) {
    // Delete Project stays disabled while integrations remain, so a disabled button sends the sweep back to the overview.
    const deleteProject = page.getByRole('button', { name: 'Delete Project', exact: true });
    let enabled = false;
    for (let round = 0; round < 2 && !enabled; round++) {
      note(`removed ${await emptyLegacyProject(page)} integration(s) from ${PROJECT}`);
      await openLegacySettings(page);
      enabled = await expect(deleteProject)
        .toBeEnabled({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!enabled) throw new Error(`Delete Project stayed disabled — ${PROJECT} still holds integrations`);

    await deleteProject.click();
    await confirmRemoval(page, 'Enter project name to confirm', PROJECT);
    const rejected = page.getByRole('alert').filter({ hasText: /Failed to delete the project/i });
    if (await rejected.isVisible({ timeout: 10_000 }).catch(() => false)) {
      throw new Error(`the console rejected the delete: ${(await rejected.textContent())?.trim()}`);
    }
  } else {
    note(`${PROJECT} is already being deleted; waiting for it to finish`);
  }

  await filterToLegacyProject(page);
  await expect(page.getByText(PROJECT, { exact: true }), `the ${PROJECT} card is still on the org home`).toHaveCount(0, { timeout: PROJECT_REMOVAL_TIMEOUT_MS });
  note(`swept ${PROJECT}`);
}

// Below the test timeout, so a stuck sweep is skipped by its own deadline rather than failed by Playwright's.
const LEGACY_SWEEP_BUDGET_MS = 2 * PROJECT_REMOVAL_TIMEOUT_MS;

test.describe('00 sweep the legacy IPAAS-E2E project @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('TC_IP_PROJ_008 a project named exactly IPAAS-E2E is emptied and deleted', async () => {
    test.setTimeout(LEGACY_SWEEP_BUDGET_MS + 2 * 60_000);

    // Housekeeping, not a product assertion, as in 08b: a sweep that cannot finish is skipped with its reason.
    const reason = (error: unknown): string => (error instanceof Error ? error.message.split('\n')[0] : String(error));
    const note = (description: string): void => {
      test.info().annotations.push({ type: 'fixture', description });
    };

    // A run pointed at this very project with E2E_PROJECT must not delete it out from under itself.
    test.skip(activeProject() === PROJECT, `this run's own project is ${PROJECT}, so it is not swept`);

    // Its own tab, so closing it at the deadline aborts whatever is still in flight without touching the journey's page.
    const sweepPage = await context.newPage();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        sweepLegacyProject(sweepPage, note),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error(`not finished within ${LEGACY_SWEEP_BUDGET_MS / 60_000} minutes`)), LEGACY_SWEEP_BUDGET_MS);
        }),
      ]);
    } catch (error) {
      test.skip(true, `${PROJECT} could not be swept, left for the next run: ${reason(error)}`);
    } finally {
      clearTimeout(deadline);
      await sweepPage.close().catch(() => {});
    }
  });
});

// 01 — the fixture project. Everything else depends on this one.

test.describe('01 fixture project @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterOrgHome(page, orgHandler);
  });

  test('TC_IP_PROJ_001 the organization home lists its projects', async () => {
    await expect(page.getByRole('heading', { name: 'All Projects' })).toBeVisible({ timeout: 60_000 });
    // first(): an org with no projects also offers it in the empty state, and both open the same form.
    await expect(page.getByRole('button', { name: 'Create Project', exact: true }).first()).toBeVisible();
  });

  test('TC_IP_PROJ_002 the organization home links to tutorials and Discord support', async () => {
    // EXPLORE_GROUPS is rendered by Projects.tsx, the org project list, not a project overview.
    await expect(page.getByRole('link', { name: 'Build an Automation' })).toHaveAttribute('href', /get-started\/build-automation$/);
    await expect(page.getByRole('link', { name: 'Get Support on Discord' })).toHaveAttribute('href', 'https://discord.com/invite/wso2');
  });

  test('TC_IP_PROJ_003 this run creates a fixture project of its own', async () => {
    test.setTimeout(4 * 60_000);

    // The pipeline starts a run every half hour and a run lasts nearly an hour, so runs never share one.
    const project = activeProject();

    // first(): an org with no projects also offers it in the empty state; the form's submit shares the name but lives on the next page.
    await page.getByRole('button', { name: 'Create Project', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Project Name' }).fill(project);
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();

    const landed = await page
      .getByRole('heading', { name: project })
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

    test.info().annotations.push({ type: 'fixture', description: `created ${project}` });
  });

  test('TC_IP_PROJ_004 the project opens on an overview headed by its name', async () => {
    await enterProjectOrSkip(page, orgHandler);
    await expect(page.getByRole('heading', { name: activeProject() })).toBeVisible({ timeout: 60_000 });
  });
});

// 02 — the empty state, before anything populates it

test.describe('02 empty project overview @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
  });

  test('TC_IP_OVW_001 offers to create an integration on Cloud', async () => {
    await expect(page.getByText('Create an Integration on Cloud', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Open Cloud Editor' })).toBeVisible();
  });

  test('TC_IP_OVW_002 offers to import your own integration', async () => {
    await expect(page.getByText('Import your own Integration', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Import from a Public Repository' })).toBeVisible();
  });

  test('TC_IP_OVW_003 offers the Start quickly panel with both tabs', async () => {
    await expect(page.getByText('Start quickly', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Prebuilt Integrations' })).toBeVisible();
    await expect(samplesTab(page)).toBeVisible();
  });

  test('TC_IP_OVW_004 offers no import provider beyond the five supported ones', async () => {
    // A sixth provider appearing here means one shipped without a decision about it.
    await expect(page.getByRole('button', { name: /^Import from/ })).toHaveCount(5);
  });

  test('TC_IP_OVW_005 the Prebuilt Integrations tab is selected by default and lists cards', async () => {
    await expect(page.getByRole('tab', { name: 'Prebuilt Integrations' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Explore more prebuilt integrations' })).toBeVisible();
  });

  test('TC_IP_OVW_006 prebuilt cards name the integrations they connect', async () => {
    // One card, not the catalogue: the backend owns its contents and can reorder them.
    await expect(page.getByText('Export Salesforce Opportunities to a Google Sheet')).toBeVisible();
    await expect(page.getByText('Salesforce • Google Sheets')).toBeVisible();
  });

  test('TC_IP_OVW_007 shows no integrations table while the project is empty', async () => {
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

  test('TC_IP_SMPL_001 shows the Browse Samples heading and subtitle', async () => {
    await expect(page.getByRole('heading', { name: 'Browse Samples' })).toBeVisible();
    await expect(page.getByText('Deploy a sample to get started quickly.')).toBeVisible();
  });

  test('TC_IP_SMPL_002 shows a Back button to the integration creation options', async () => {
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  });

  test('TC_IP_SMPL_003 shows the sample search input', async () => {
    await expect(page.getByPlaceholder('Search samples…')).toBeVisible();
  });

  test('TC_IP_SMPL_004 shows the Type, Technology and Tags filter sections', async () => {
    for (const section of ['Type', 'Technology', 'Tags']) {
      await expect(page.getByRole('button', { name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('checkbox', { name: MI_SAMPLE_TECHNOLOGY, exact: true }), 'the Technology filter offers no MI samples').toBeVisible();
  });

  test('TC_IP_SMPL_005 a search with no matches shows the empty-result message', async () => {
    // Every SampleGridCard renders a "Quick Deploy" button — asserting on it first confirms
    // real results are showing before we search them away.
    await expect(page.getByRole('button', { name: 'Quick Deploy' }).first()).toBeVisible();
    await page.getByPlaceholder('Search samples…').fill(`no-such-sample-${Date.now()}`);
    await expect(page.getByText('No samples match your search.')).toBeVisible();
  });

  test('TC_IP_SMPL_006 clearing the search brings the results back', async () => {
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

  test('TC_IP_DEPLOY_001 the Samples tab lists Hello World Service', async () => {
    await reachCreateControl(page, samplesTab(page));
    await samplesTab(page).click();
    await expect(page.getByText(SAMPLE, { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('TC_IP_DEPLOY_002 Deploy provisions the integration and lands on its overview', async () => {
    test.setTimeout(4 * 60_000);
    // Scoped to the card: the sidebar's Deploy page and each sample's Deploy button share a name.
    await cardFor(page, SAMPLE, 'Deploy').click();

    // The deploy runs through a progress page before settling on the integration's overview.
    await expect(page.getByRole('heading', { name: SAMPLE })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('TC_IP_DEPLOY_003 the integration overview reports a build', async () => {
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('TC_IP_DEPLOY_004 the sample appears in the project with the table columns', async () => {
    await enterProject(page, orgHandler);
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 30_000 });
    for (const column of ['Name', 'Description', 'Type', 'Last Updated']) {
      await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
    await expect(integrationRow(page, SAMPLE)).toHaveCount(1);
  });

  test('TC_IP_DEPLOY_005 the sample build completes', async () => {
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
  test('TC_IP_DEPLOY_006 the latest build reports Completed', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + 2 * 60_000);
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });
    const status = await waitForBuildToSettle(page);
    expect(status, `${SAMPLE} build ended as ${status}`).toMatch(/^Completed/);
  });

  test('TC_IP_DEPLOY_007 the deployment settles out of In Progress into Active', async () => {
    test.setTimeout(DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await expect(envCard(page), `no ${ENV} card on ${SAMPLE}`).toBeVisible({ timeout: 2 * 60_000 });
    await expect(deploymentStatus(page)).toHaveText(/^(Active|Error)$/, { timeout: DEPLOY_TIMEOUT_MS });
    const status = (await deploymentStatus(page).textContent())?.trim() ?? '';
    test.info().annotations.push({ type: 'deployment', description: `${SAMPLE} in ${ENV}: ${status}` });
    expect(status, `${SAMPLE} deployment to ${ENV} ended as ${status}`).toBe('Active');
  });

  test('TC_IP_DEPLOY_008 the env card offers the endpoint URLs and the resources it exposes', async () => {
    await dismissStrayDialog(page);
    const card = envCard(page);
    await expect(card.getByText('URLs', { exact: true })).toBeVisible({ timeout: 3 * 60_000 });
    await expect(card.getByText('Download Spec', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'View Details' }).first(), 'the card lists no resources').toBeVisible();
  });

  test('TC_IP_CONS_001 the consumers section is offered with its security scheme', async () => {
    const card = envCard(page);
    await expect(card.getByText(/^Consumers\s*\(\d+\)/)).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText(/^Security Scheme:/)).toBeVisible();
  });

  // Skipped where deletion is unavailable: creating and revoking are still worth exercising.
  test('TC_IP_CONS_002 the section starts with no consumers', async () => {
    const refused = await deleteAllConsumers(page);
    test.skip(!!refused, `cannot clear existing consumers here — ${refused}`);
    await expect(envCard(page).getByText(NO_CONSUMERS)).toBeVisible({ timeout: 60_000 });
  });

  test('TC_IP_CONS_003 a consumer application is created and shows its key once', async () => {
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

  test('TC_IP_CONS_004 the new consumer is listed as Active', async () => {
    await expect(consumerRow(page, consumerName), `${consumerName} is not listed`).toBeVisible({ timeout: 60_000 });
    await expect(consumerRow(page, consumerName).getByText('Active', { exact: true })).toBeVisible();
  });

  test('TC_IP_CONS_005 revoking the key marks the consumer Revoked', async () => {
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

  test('TC_IP_CONS_006 deleting the consumer empties the section', async () => {
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

  test('TC_IP_TEST_001 the build completed and the deployment is Active', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await requireActiveDeployment(page);
  });

  test('TC_IP_TEST_002 the env card offers Test, which opens the Test Console', async () => {
    const testButton = envCard(page).getByRole('button', { name: 'Test', exact: true });
    await expect(testButton).toBeVisible({ timeout: 60_000 });
    await testButton.click();
    await expect(page).toHaveURL(/\/test\/console$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Test Console', level: 1 })).toBeVisible({ timeout: 60_000 });
  });

  test('TC_IP_TEST_003 the console names the endpoint, visibility, invoke URL and security header', async () => {
    for (const label of ['Endpoint', 'Visibility', 'Invoke URL']) {
      await expect(page.getByText(label, { exact: true }), `the console is missing the ${label} field`).toBeVisible({ timeout: 60_000 });
    }
    // Not exact: the label carries the header's name as a caption inside it, so its text is both.
    await expect(page.getByText(/^Security Header\S/), 'the console is missing the Security Header field, or it names no header').toBeVisible({ timeout: 60_000 });
  });

  test('TC_IP_TEST_004 a test key is held, or fetched on demand', async () => {
    const field = page.getByPlaceholder('Paste or fetch a test key');
    await expect(field).toBeVisible({ timeout: 60_000 });
    if (!(await field.inputValue())) {
      await page.getByRole('button', { name: 'Get Test Key' }).click();
    }
    await expect.poll(async () => (await field.inputValue()).length, { message: 'no test key was populated', timeout: 60_000 }).toBeGreaterThan(0);
  });

  test('TC_IP_TEST_005 the endpoint answers the same call from outside the browser', async () => {
    test.setTimeout(PROBE_TIMEOUT_MS + 2 * 60_000);
    test.skip(true, GATEWAY_DOWN);
    await expect(swaggerOperation(page), 'the swagger viewer lists no operation').toBeVisible({ timeout: 60_000 });

    // Ahead of the console's own call, and without CORS in the way, so a gateway that is not
    // routing yet reports its own reason instead of surfacing as a blocked response.
    const probe = await probeEndpoint(page, PROBE_TIMEOUT_MS);
    test.info().annotations.push({ type: 'probe', description: `the endpoint answered ${probe.status}` });
    expect(probe.status, `the endpoint answered ${probe.status} (${probe.reason}) — the gateway is not routing to it`).toBe(200);
  });

  test('TC_IP_TEST_006 executing GET /greeting answers 200', async () => {
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

// 04d — an MI automation imported from a public repository: schedule it, then watch it run

async function stopSchedule(page: Page): Promise<void> {
  await envCard(page).getByRole('button', { name: 'Stop Schedule' }).click();
  await expect(envCard(page).getByRole('button', { name: 'Schedule', exact: true }), 'the schedule is still live').toBeVisible({ timeout: 2 * 60_000 });
}

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

  // Serial mode skips TC_IP_AUTO_007 once an earlier test fails, and a live one-minute schedule would keep firing on the shared org.
  test.afterAll(async () => {
    await dismissStrayDialog(page);
    if (!(await page.getByRole('heading', { name: AUTOMATION }).isVisible().catch(() => false))) {
      await enterProject(page, orgHandler);
      await waitForIntegrationsToLoad(page);
      if (!(await isPresent(page, AUTOMATION))) return;
      await openIntegration(page, AUTOMATION);
    } else {
      // Already on the overview, but the failed watch may have outlived its token, so reload it with a fresh one.
      await reseedHere(page);
    }

    const schedule = envCard(page).getByRole('button', { name: 'Schedule', exact: true });
    const stop = envCard(page).getByRole('button', { name: 'Stop Schedule' });
    // isVisible() does not wait, and the card renders after the reload.
    const rendered = await schedule
      .or(stop)
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (!rendered) return;
    if (await stop.isVisible()) await stopSchedule(page);
  });

  test('TC_IP_AUTO_001 the import form resolves the repository and its MI sub path', async () => {
    test.setTimeout(3 * 60_000);
    test.skip(alreadyDeployed, `${AUTOMATION} is already in the project`);
    const importButton = page.getByRole('button', { name: 'Import from a Public Repository' });
    await reachCreateControl(page, importButton);
    await importButton.click();
    await expect(page.getByRole('heading', { name: 'Import an Integration' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Repository URL' }).fill(AUTOMATION_REPO_URL);
    await expect(page.getByRole('combobox', { name: /^Branch/ }), 'the repository did not resolve into a branch — GitHub public API rate limit is the usual cause').toContainText('main', { timeout: 60_000 });

    await page.getByRole('textbox', { name: 'Repository Sub Path' }).click();
    const picker = page.getByRole('dialog').filter({ hasText: 'Repository Sub Path' });
    // Prefix match: an expanded folder's name would also carry its children's.
    await picker.getByRole('treeitem', { name: new RegExp(`^${AUTOMATION_SUB_PATH}`) }).click();
    await picker.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByRole('textbox', { name: 'Repository Sub Path' })).toHaveValue(`/${AUTOMATION_SUB_PATH}`);
    await expect(page.getByRole('textbox', { name: 'Integration Name' })).toHaveValue(AUTOMATION);
  });

  test('TC_IP_AUTO_002 WSO2 Integrator: MI is selected and importing provisions the automation', async () => {
    test.setTimeout(4 * 60_000);
    test.skip(alreadyDeployed, `${AUTOMATION} is already in the project`);

    await expect(page.getByText(MI_TECHNOLOGY, { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Automation/ }).click();

    // The cards expose no selected state, so an enabled submit (it needs a technology) is the closest check that detection picked one.
    const submit = page.getByRole('button', { name: 'Import Integration' });
    await expect(submit, 'Import Integration stayed disabled — technology detection did not select WSO2 Integrator: MI').toBeEnabled({ timeout: 60_000 });
    await submit.click();

    await expect(page.getByRole('heading', { name: AUTOMATION }), 'the import did not land on the automation overview').toBeVisible({ timeout: 2 * 60_000 });
  });

  test('TC_IP_AUTO_003 the build completed and the automation offers Schedule and Test', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + MI_DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await requireAutomationReady(page);
  });

  test('TC_IP_AUTO_004 the automation starts with no schedule', async () => {
    await expect(envCard(page).getByText(NO_SCHEDULE)).toBeVisible({ timeout: 60_000 });
    await expect(envCard(page).getByRole('button', { name: 'Schedule', exact: true })).toBeVisible();
  });

  test('TC_IP_AUTO_005 scheduling it every minute takes effect', async () => {
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

  test('TC_IP_AUTO_006 at least five executions are reported within eight minutes', async () => {
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

  test('TC_IP_AUTO_007 the schedule is stopped again', async () => {
    await stopSchedule(page);
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

  test('TC_IP_AGENT_001 the import form opens from the project', async () => {
    const importButton = page.getByRole('button', { name: 'Import from a Public Repository' });
    await reachCreateControl(page, importButton);
    await importButton.click();
    await expect(page.getByRole('heading', { name: 'Import an Integration' })).toBeVisible({ timeout: 30_000 });
  });

  test('TC_IP_AGENT_002 the repository URL resolves into a branch and a derived name', async () => {
    test.setTimeout(3 * 60_000);
    await page.getByRole('textbox', { name: 'Repository URL' }).fill(AGENT_REPO_URL);

    // These appear only once the repository resolves through GitHub; an empty branch list means
    // the public API's hourly rate limit is spent, which a real user hits too.
    await expect(page.getByRole('combobox', { name: /^Branch/ }), 'the repository did not resolve into a branch — GitHub public API rate limit is the usual cause').toContainText('main', { timeout: 60_000 });
    // Read, never opened: the picker re-runs technology detection, which can leave the submit disabled.
    await expect(page.getByRole('textbox', { name: 'Repository Sub Path' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Integration Name' }), 'the integration name was not derived from the repository').not.toHaveValue('');
  });

  test('TC_IP_AGENT_003 importing provisions the agent under its derived name', async () => {
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

  test('TC_IP_AGENT_004 the imported agent reports its source and type', async () => {
    await expect(page.getByText(AGENT_TYPE, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: new RegExp(AGENT_REPO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  });

  test('TC_IP_AGENT_005 the build section collapses and expands', async () => {
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

  test('TC_IP_AGENT_006 View Logs opens the build logs and Hide Logs closes them', async () => {
    const viewLogs = page.getByRole('button', { name: 'View Logs' }).first();
    await expect(viewLogs).toBeVisible({ timeout: 5 * 60_000 });
    await viewLogs.click();

    // One button carries both labels (BuildCard.tsx:208), so the flip is the evidence.
    const hideLogs = page.getByRole('button', { name: 'Hide Logs' }).first();
    await expect(hideLogs).toBeVisible({ timeout: 30_000 });
    await hideLogs.click();
    await expect(page.getByRole('button', { name: 'View Logs' }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('TC_IP_AGENT_007 the build completed and the deployment is Active', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + DEPLOY_TIMEOUT_MS + 2 * 60_000);
    await requireActiveDeployment(page, agentName || AGENT_TYPE);
  });

  test('TC_IP_AGENT_008 the agent asks to be configured before it can run', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + AGENT_GATE_TIMEOUT_MS + 2 * 60_000);
    // An import runs more than one build, and the card reports no deployment until the last lands.
    const reported = await waitForConfigureGate(page);
    expect(reported, `${agentName} never asked for configuration — the card reported: ${reported}`).toBe('the agent asked to be configured');
  });

  test('TC_IP_AGENT_009 the model key is accepted and the agent redeploys', async () => {
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

  test('TC_IP_AGENT_010 the agent replies in the chat', async () => {
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

  test('TC_IP_OVW_008 every integration row carries cells and a delete action', async () => {
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

  test('TC_IP_OVW_009 the empty-state entry points are replaced, not merely hidden', async () => {
    // The table proves the populated branch rendered; only then does absence mean anything.
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30_000 });

    // Current strings: the removed spec asserted text that no longer exists, so it could only pass.
    await expect(page.getByText('Import your own Integration', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Start quickly', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Cloud Editor', exact: true })).toHaveCount(0);
  });

  test('TC_IP_OVW_010 the architecture panel is offered', async () => {
    await expect(page.getByRole('heading', { name: 'Architecture Diagram' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /architecture diagram$/ })).toBeVisible();
  });

  test('TC_IP_OVW_011 the integration count panel totals the rows in the table', async () => {
    await expect(page.getByRole('heading', { name: 'Integration Count by Type' })).toBeVisible({ timeout: 30_000 });

    const rowCount = await page.getByRole('row', { name: /^View details for / }).count();
    const total = page.getByText('Total', { exact: true }).locator('xpath=following-sibling::*[1]');
    await expect(total).toHaveText(String(rowCount));
  });

  test('TC_IP_OVW_012 the contributors panel names contributors when the project has any', async () => {
    // ContributorsCard returns null until commit history yields contributors.
    const heading = page.getByRole('heading', { name: 'Contributors' });
    const present = await heading
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!present, 'No contributors resolved for this project');

    await expect(page.getByRole('img', { name: /\d+ contributions?/ })).not.toHaveCount(0);
  });

  test('TC_IP_OVW_013 search narrows the table to the matching integration', async () => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const before = await rows.count();
    expect(before, 'need at least one integration to search for').toBeGreaterThan(0);

    // Derived at runtime: integration names belong to the backend.
    const name = ((await rows.first().getAttribute('aria-label')) ?? '').replace(/^View details for /, '').trim();
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(name);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(name);
  });

  test('TC_IP_OVW_014 a search with no matches empties the table', async () => {
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(`no-such-integration-${Date.now()}`);
    await expect(page.getByRole('row', { name: /^View details for / })).toHaveCount(0);
  });
});

// 07 — the pages each scope offers

test.describe('07 page availability @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('TC_IP_NAV_001 the organization scope offers its pages', async () => {
    await enterOrgHome(page, orgHandler);
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines', 'Settings']);
  });

  test('TC_IP_NAV_002 the project scope offers its pages', async () => {
    await enterProjectOrSkip(page, orgHandler);
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines', 'Settings']);

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: activeProject() })).toBeVisible({ timeout: 30_000 });
  });

  test('TC_IP_NAV_003 the integration scope offers its pages, including Operate', async () => {
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

  test('TC_IP_NAV_004 the footer offers Documentation, Support, Terms of Use and Privacy Policy in order', async () => {
    await enterOrgHome(page, orgHandler);
    for (const [name, href] of FOOTER_LINKS) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }

    const links = page.getByRole('link', { name: /^(Documentation|Terms of Use|Privacy Policy|Support)$/ });
    for (const [index, [name]] of FOOTER_LINKS.entries()) {
      await expect(links.nth(index)).toHaveText(name);
    }
  });

  test('TC_IP_NAV_005 every footer link opens in a new tab', async () => {
    for (const [name] of FOOTER_LINKS) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('target', '_blank');
    }
  });

  test('TC_IP_NAV_006 the footer shows the WSO2 copyright notice', async () => {
    await expect(page.getByText(`© ${new Date().getFullYear()}, WSO2 LLC.`)).toBeVisible();
  });

  test('TC_IP_SET_001 organization settings page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
  });

  const SECTION_IDS: Record<(typeof CLOUD_SECTIONS)[number], string> = { 'Package Registries': 'TC_IP_SET_003' };
  for (const section of CLOUD_SECTIONS) {
    test(`${SECTION_IDS[section]} organization settings offers "${section}"`, async () => {
      await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    });
  }

  test('TC_IP_SET_004 organization settings offers no unported section', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
    // Positive assertion first: these absences would pass on a blank page.
    await expect(page.getByText('Package Registries', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // Org Details was removed from cloud settings, so it must not come back either.
    await expect(page.getByText('Org Details', { exact: true })).not.toBeVisible();
    for (const section of UNPORTED_SECTIONS) {
      await expect(page.getByText(section, { exact: true })).not.toBeVisible();
    }
  });

  test('TC_IP_SET_005 package registries page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/package-registries`);
  });
});

// 08 — cleanup, which is also the deletion coverage

test.describe('08 clean up @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler);
    await waitForIntegrationsToLoad(page);
  });

  test('TC_IP_CLEAN_001 the deployed sample is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    // Gated on what the project actually holds, not on a flag: a group that created something
    // and then failed before setting its flag would otherwise strand it on a shared org.
    test.skip(!(await isPresent(page, SAMPLE)), `${SAMPLE} is not in the project`);
    await deleteIntegration(page, SAMPLE);
  });

  test('TC_IP_CLEAN_002 the scheduled automation is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    test.skip(!(await isPresent(page, AUTOMATION)), `${AUTOMATION} is not in the project`);
    await deleteIntegration(page, AUTOMATION);
  });

  test('TC_IP_CLEAN_003 the imported agent is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    const removed = await deleteMatchingIntegrations(page, AGENT_NAME_PATTERN);
    test.skip(removed === 0, 'no imported agent is in the project');
  });

  test('TC_IP_CLEAN_004 the project reports no integrations left', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    await waitForDeletionsToFinish(page);
    for (const name of [SAMPLE, AUTOMATION]) {
      await expect(integrationRow(page, name), `${name} is still listed`).toHaveCount(0, { timeout: 60_000 });
    }
    await expect(page.getByRole('row').filter({ hasText: AGENT_NAME_PATTERN }), 'the imported agent is still listed').toHaveCount(0, { timeout: 60_000 });
  });

  test('TC_IP_PROJ_005 Delete Project becomes available once the project is empty', async () => {
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

  test('TC_IP_PROJ_006 deleting the project returns to the organization home without its card', async () => {
    test.setTimeout(PROJECT_REMOVAL_TIMEOUT_MS + 3 * 60_000);
    await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
    await confirmRemoval(page, 'Enter project name to confirm', activeProject());

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
    await expect(page.getByText(activeProject(), { exact: true }), `the ${activeProject()} card is still on the org home`).toHaveCount(0, { timeout: PROJECT_REMOVAL_TIMEOUT_MS });
  });
});

// 08b — the projects other runs left behind, which nothing else would ever remove

test.describe('08b sweep abandoned projects @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('TC_IP_PROJ_007 projects older than the abandonment age are removed with their integrations', async () => {
    test.setTimeout(3 * PROJECT_REMOVAL_TIMEOUT_MS);

    // Housekeeping, not a product assertion: a failed sweep leaves the project for the next run to collect.
    const own = activeProject();
    const reason = (error: unknown): string => (error instanceof Error ? error.message.split('\n')[0] : String(error));

    let abandoned: string[];
    try {
      await enterOrgHome(page, orgHandler);
      abandoned = staleProjects(await listFixtureProjects(page), new Date(), own);
    } catch (error) {
      test.skip(true, `could not read the organization's projects: ${reason(error)}`);
      return;
    }

    if (abandoned.length === 0) {
      test.info().annotations.push({ type: 'fixture', description: `no project older than ${STALE_AGE_MS / 60_000} minutes to sweep` });
      return;
    }

    const failed: string[] = [];
    for (const project of abandoned) {
      // Isolated per project: one that cannot be deleted must not cost the others their turn.
      try {
        // The helpers act on whichever project is active, so the sweep borrows the name in turn.
        setActiveProject(project);
        await enterOrgHome(page, orgHandler);

        // A project already being deleted keeps its card but loses the settings button, so it cannot be opened.
        if (
          !(await projectSettingsButton(page)
            .isVisible({ timeout: 15_000 })
            .catch(() => false))
        ) {
          test.info().annotations.push({ type: 'fixture', description: `${project} is already being deleted; left to finish` });
          continue;
        }

        await openProject(page, project);
        await waitForIntegrationsToLoad(page);
        await deleteAllIntegrations(page);

        await openProjectSettings(page, orgHandler);
        const deleteProject = page.getByRole('button', { name: 'Delete Project', exact: true });
        await expect(deleteProject).toBeEnabled({ timeout: PROJECT_REMOVAL_TIMEOUT_MS });
        await deleteProject.click();
        await confirmRemoval(page, 'Enter project name to confirm', project);
        test.info().annotations.push({ type: 'fixture', description: `swept abandoned ${project}` });
      } catch (error) {
        failed.push(project);
        test.info().annotations.push({ type: 'fixture', description: `${project} could not be swept: ${reason(error)}` });
      } finally {
        setActiveProject(own);
      }
    }

    test.skip(failed.length > 0, `left for the next run: ${failed.join(', ')}`);
  });
});

// 09 — signing out, the journey's last act
test.describe('09 sign out @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('TC_IP_AUTH_006 signing out asks for confirmation and returns to the sign-in page', async () => {
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
