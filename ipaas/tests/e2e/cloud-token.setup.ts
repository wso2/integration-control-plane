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

import { expect, test as setup } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertUsableLifetime, buildStorageState, decodeTokenClaims, resolveToken } from './helpers/token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '../../.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'cloud-user.json');
const CONTEXT_FILE = path.join(AUTH_DIR, 'cloud-context.json');

await mkdir(AUTH_DIR, { recursive: true });

setup('seed the cloud session from a token', async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('No baseURL configured for the token setup project.');

  const token = await resolveToken();
  const claims = decodeTokenClaims(token);
  assertUsableLifetime(claims, Date.now());

  console.log(`Token for org ${claims.ouHandle}, expires ${new Date(claims.exp * 1000).toISOString()}.`);

  await writeFile(AUTH_FILE, JSON.stringify(buildStorageState(token, claims, baseURL), null, 2));

  // The project handle is not in the token. Loading the console resolves it, and on an
  // org whose home has never been opened it also provisions the default project.
  const context = await browser.newContext({ storageState: AUTH_FILE, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page, 'Token did not produce a signed-in session').toHaveURL(/\/organizations\/[^/]+\/projects\/[^/]+\/home/, { timeout: 120_000 });

  const url = page.url();
  const projectMatch = url.match(/\/projects\/([^/]+)/);
  if (!projectMatch) throw new Error(`Could not extract the project handle from URL: ${url}`);

  await writeFile(CONTEXT_FILE, JSON.stringify({ orgHandler: claims.ouHandle, projectHandler: projectMatch[1] }));
  console.log(`Session seeded. Landed on ${url}`);

  await context.close();
});
