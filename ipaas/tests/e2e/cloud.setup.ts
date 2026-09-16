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

import { expect, test as setup, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { waitForOTP } from './helpers/gmail.js';
import { fillSecret, readSecret } from './helpers/secrets.js';
import { msUntilNextWindow, totpCode } from './helpers/totp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '../../.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'cloud-user.json');
const CONTEXT_FILE = path.join(AUTH_DIR, 'cloud-context.json');

await mkdir(AUTH_DIR, { recursive: true });

// Six cross-domain redirects, plus a mail round-trip when the account has no TOTP.
setup.setTimeout(300_000);

// These walls cannot be scripted past; one manual sign-in from this machine clears them.
async function assertNoChallenge(page: Page): Promise<void> {
  if (/verified-device|sessions\/verify|recovery|captcha/i.test(page.url())) {
    throw new Error(`GitHub presented a security challenge (${page.url()}). Sign in manually once with this account from this machine, then re-run.`);
  }

  const captcha = page.locator('iframe[src*="captcha"], .js-octocaptcha-parent, #captcha').first();
  if (await captcha.isVisible().catch(() => false)) {
    throw new Error('GitHub presented a CAPTCHA, which cannot be automated. Sign in manually once with this account from this machine, then re-run.');
  }
}

// TOTP and the emailed device code are mutually exclusive: enrolling TOTP stops the emails.
async function handleTwoFactor(page: Page, options: { totpSecret?: string; afterMs: number }): Promise<void> {
  const codeField = page.locator('#app_totp, input[name="app_otp"], input[name="otp"], input[autocomplete="one-time-code"]').first();

  const challenged = await codeField
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!challenged) {
    // GitHub skips the prompt entirely when it already trusts the session.
    await assertNoChallenge(page);
    return;
  }

  if (!options.totpSecret) {
    const code = await waitForOTP({
      subjectPattern: /verify your device|device verification|sign-in attempt/i,
      afterMs: options.afterMs,
      timeoutMs: 90_000,
    });
    await fillSecret(codeField, code);
    await leaveTwoFactor(page, 'the emailed device-verification code was rejected');
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Read the remaining window once, so the check and the wait agree on the same one.
    const untilNextWindow = msUntilNextWindow();
    if (untilNextWindow < 3_000) await page.waitForTimeout(untilNextWindow + 500);

    await fillSecret(codeField, totpCode(options.totpSecret));

    try {
      // GitHub auto-submits once the sixth digit lands, so success shows as leaving the page.
      await page.waitForURL((url) => !/sessions\/two-factor/.test(url.pathname), { timeout: 15_000 });
      return;
    } catch {
      await assertNoChallenge(page);
      if (attempt === 2) {
        throw new Error('TOTP was rejected twice. Check that E2E_GITHUB_TOTP_SECRET matches the account and that the system clock is accurate.');
      }
      await page.waitForTimeout(msUntilNextWindow() + 500);
    }
  }
}

async function leaveTwoFactor(page: Page, failure: string): Promise<void> {
  const submit = page.getByRole('button', { name: /^(Verify|Continue|Submit)/ }).first();
  const hasSubmit = await submit
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (hasSubmit) await submit.click();

  try {
    await page.waitForURL((url) => !/sessions\/two-factor|verified-device/.test(url.pathname), { timeout: 30_000 });
  } catch {
    await assertNoChallenge(page);
    throw new Error(`GitHub did not accept the second factor: ${failure}.`);
  }
}

// GitHub records consent per account, so only the first sign-in ever sees this screen.
async function handleOAuthConsent(page: Page): Promise<void> {
  if (!/github\.com\/login\/oauth\/authorize/.test(page.url())) return;

  const authorize = page.getByRole('button', { name: /authorize/i }).first();
  await Promise.race([page.waitForURL((url) => !/\/login\/oauth\/authorize/.test(url.pathname), { timeout: 15_000 }), authorize.waitFor({ state: 'visible', timeout: 15_000 })]).catch(() => {});

  if (!/github\.com\/login\/oauth\/authorize/.test(page.url())) return;
  if (!(await authorize.isVisible().catch(() => false))) return;

  // GitHub keeps the button disabled for a moment after render.
  await expect(authorize).toBeEnabled({ timeout: 15_000 });
  await authorize.click();
}

// Only a GitHub identity with no org mapping sees this form.
async function handleOrgOnboarding(page: Page): Promise<void> {
  const nameField = page.getByRole('textbox', { name: /organization name/i });

  // Either the console loads directly (already onboarded) or the form renders.
  await Promise.race([page.waitForURL(/\/organizations\//, { timeout: 45_000 }), nameField.waitFor({ state: 'visible', timeout: 45_000 })]).catch(() => {});

  if (!(await nameField.isVisible().catch(() => false))) return;

  console.log('First-time onboarding shown — creating an organization...');

  // Handles must be unique and URL-safe, so derive one per run unless pinned.
  const suffix = Date.now().toString(36);
  const orgName = readSecret('E2E_ORG_NAME') ?? `E2E Test Org ${suffix}`;
  const orgHandle = readSecret('E2E_ORG_HANDLE') ?? `e2e-test-${suffix}`;

  console.log(`Creating organization "${orgName}" (${orgHandle})...`);
  await nameField.fill(orgName);
  await page.getByRole('textbox', { name: /organization handle/i }).fill(orgHandle);

  const createButton = page.getByRole('button', { name: /create organization/i });
  await expect(createButton).toBeEnabled({ timeout: 15_000 });
  await createButton.click();
}

// Acceptance lives in localStorage, so a fresh context sees this dialog on every run.
async function acceptTermsOfUse(page: Page): Promise<void> {
  const accept = page.getByRole('dialog').getByRole('button', { name: 'Accept', exact: true });

  // Either the dialog renders, or post-login routing went straight to a project home.
  await Promise.race([page.waitForURL(/\/projects\/[^/]+\/home/, { timeout: 30_000 }), accept.waitFor({ state: 'visible', timeout: 30_000 })]).catch(() => {});

  if (await accept.isVisible().catch(() => false)) await accept.click();
}

setup('authenticate cloud', async ({ page }) => {
  const username = readSecret('E2E_GITHUB_USERNAME');
  const password = readSecret('E2E_GITHUB_PASSWORD');
  const totpSecret = readSecret('E2E_GITHUB_TOTP_SECRET');

  if (!username || !password) {
    throw new Error('E2E_GITHUB_USERNAME and E2E_GITHUB_PASSWORD must be set — see tests/e2e/README.md');
  }

  // Only read verification mail that arrives after this point.
  const startedAt = Date.now();

  console.log(`Signing in to ${process.env.E2E_CLOUD_BASE_URL ?? 'the cloud console'} as ${username}...`);
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // The cloud build renders no in-app sign-in UI; Login.tsx redirects straight to Thunder's Gate.
  await page.waitForURL(/\/gate\/signin/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  console.log('Reached the Thunder sign-in page; continuing with GitHub...');
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();

  // An already-signed-in GitHub session skips the login form. It can still land on the
  // consent screen, so that URL counts as a reused session too — without it the race falls
  // through and the setup tries to fill a login form that is not on the page.
  const loginField = page.locator('#login_field');
  const sessionReused = await Promise.race([
    loginField.waitFor({ state: 'visible', timeout: 60_000 }).then(() => false),
    page.waitForURL(/\/organizations\//, { timeout: 60_000 }).then(() => true),
    page.waitForURL(/\/login\/oauth\/authorize/, { timeout: 60_000 }).then(() => true),
  ]).catch(() => false);

  if (!sessionReused) {
    console.log('Submitting credentials...');
    await fillSecret(loginField, username);
    await fillSecret(page.locator('#password'), password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await assertNoChallenge(page);
    const flashError = page.locator('.flash-error').first();
    if (await flashError.isVisible().catch(() => false)) {
      throw new Error(`GitHub rejected the sign-in: ${(await flashError.innerText()).trim()}`);
    }

    await handleTwoFactor(page, { totpSecret, afterMs: startedAt });
  }

  // Runs on both paths: a reused session that has not authorised the app still gets consent.
  await handleOAuthConsent(page);

  await handleOrgOnboarding(page);

  await page.waitForURL(/\/organizations\/[^/]+/, { timeout: 120_000, waitUntil: 'domcontentloaded' });

  await acceptTermsOfUse(page);

  // Cloud onboarding has no region step; OrgHome provisions the default project itself.
  await expect(page, 'Cloud sign-in did not reach a project home').toHaveURL(/\/organizations\/[^/]+\/projects\/[^/]+\/home/, { timeout: 120_000 });

  const url = page.url();
  const orgMatch = url.match(/\/organizations\/([^/]+)/);
  const projectMatch = url.match(/\/projects\/([^/]+)/);
  if (!orgMatch || !projectMatch) throw new Error(`Could not extract org/project handles from URL: ${url}`);

  console.log(`Signed in. Landed on ${url}`);

  await page.context().storageState({ path: AUTH_FILE });

  await writeFile(
    CONTEXT_FILE,
    JSON.stringify({
      orgHandler: orgMatch[1],
      projectHandler: projectMatch[1],
    }),
  );
});
