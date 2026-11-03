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

import { expect, test } from '@playwright/test';

test.describe('cloud login @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForURL(/\/gate\/signin/, { timeout: 60_000, waitUntil: 'domcontentloaded' });

    // The Gate SPA shows only a progressbar until its flow metadata resolves.
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible({ timeout: 60_000 });
  });

  test('TC_IP_AUTH_001 /login hands off to the Thunder sign-in page', async ({ page }) => {
    await expect(page).toHaveURL(/\/gate\/signin/);
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('TC_IP_AUTH_002 shows Google and GitHub as the only sign-in options', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();

    // No email/password path exists here — the e2e suite depends on that staying true.
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('TC_IP_AUTH_003 shows Terms of Service and Privacy Policy links', async ({ page }) => {
    const terms = page.getByRole('link', { name: 'Terms of Service' });
    const privacy = page.getByRole('link', { name: 'Privacy Policy' });

    await expect(terms).toBeVisible();
    await expect(privacy).toBeVisible();
    await expect(terms).toHaveAttribute('href', 'https://wso2.com/cloud/terms-of-use/');
    await expect(privacy).toHaveAttribute('href', 'https://wso2.com/privacy-policy/');
  });

  test('TC_IP_AUTH_004 GitHub option hands off to a GitHub OAuth app that can identify the user', async ({ page }) => {
    await page.getByRole('button', { name: 'Continue with GitHub' }).click();
    await page.waitForURL(/github\.com/, { timeout: 60_000, waitUntil: 'domcontentloaded' });

    // With no GitHub session the authorize request is nested in return_to.
    const url = new URL(page.url());
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('client_id')).toBeTruthy();

    const returnTo = url.searchParams.get('return_to');
    expect(returnTo, 'GitHub did not carry an authorize request in return_to').toContain('/login/oauth/authorize');

    const authorize = new URLSearchParams(returnTo!.split('?')[1]);
    expect(authorize.get('scope')).toBe('read:user user:email');
    expect(authorize.get('response_type')).toBe('code');
    expect(authorize.get('redirect_uri')).toContain('/gate/signin');
  });
});
