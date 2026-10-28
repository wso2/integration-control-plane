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
 * Fixtures a cloud spec creates for itself, and the shared page-readiness assertions.
 *
 * Resources go through the BFF, not the UI: a spec asserting the populated project home
 * should not also depend on the create-project form, and teardown must run even when a
 * test failed mid-page. The requests are issued from inside the page so they reuse the
 * console's own base URL and bearer.
 */

import { expect, type Page } from '@playwright/test';
import { updateParkedEntry } from './session-storage.js';
import { SDK_SESSION_ACTIVE_KEY, decodeTokenClaims, resolveToken, sdkSession, sdkSessionKey } from './token.js';

export interface FixtureResult {
  status: number;
  body: string;
}

// API_CONFIG arrives from config.json at startup; evaluating early hits the console's own origin instead.
export async function waitForApiConfig(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { API_CONFIG?: { choreoBaseApiUrl?: string } }).API_CONFIG?.choreoBaseApiUrl), null, {
    timeout: 30_000,
  });
}

/**
 * The console's access token, read from this tab's sessionStorage, where the Thunder SDK keeps it
 * and where token mode's parked session is restored. Empty when the page has no session, so a fixture call reports the BFF's 401
 * rather than throwing over a test's own failure.
 */
export async function readSessionToken(page: Page): Promise<string> {
  // Off the console (the IdP after a rejected session, about:blank) there is no config to name
  // the session by, and on about:blank reading storage itself throws; both mean "no session".
  const clientId = await page.evaluate(() => (window as unknown as { API_CONFIG?: { asgardeoClientId?: string } }).API_CONFIG?.asgardeoClientId);
  if (!clientId) return '';
  const raw = await page.evaluate((key) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }, sdkSessionKey(clientId));
  return raw ? ((JSON.parse(raw) as { access_token?: string }).access_token ?? '') : '';
}

// Resolves with the BFF's verdict rather than throwing, so a caller can record the handle first.
export async function createFixtureProject(page: Page, name: string, description: string): Promise<FixtureResult> {
  const token = await readSessionToken(page);
  return page.evaluate(
    async ({ project, desc, bearer }) => {
      const base = (window as unknown as { API_CONFIG: { choreoBaseApiUrl: string } }).API_CONFIG.choreoBaseApiUrl;
      const headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };

      // deploymentPipeline is required and its name is environment-specific, so it is looked up.
      const pipelineRes = await fetch(`${base}/deploymentpipelines`, { headers });
      const pipelineBody = await pipelineRes.text();
      if (!pipelineRes.ok) return { status: pipelineRes.status, body: `listing deployment pipelines: ${pipelineBody.slice(0, 200)}` };

      const pipeline = (JSON.parse(pipelineBody).items ?? [])[0]?.name;
      if (!pipeline) return { status: 0, body: `no deployment pipeline in ${pipelineBody.slice(0, 200)}` };

      const res = await fetch(`${base}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: project, displayName: project, description: desc, deploymentPipeline: pipeline }),
      });
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    },
    { project: name, desc: description, bearer: token },
  );
}

// Builds and deploys are off: a row in the integrations table needs no running integration.
export async function createFixtureComponent(page: Page, project: string, name: string, displayName: string): Promise<FixtureResult> {
  const token = await readSessionToken(page);
  return page.evaluate(
    async ({ projectName, componentName, display, bearer }) => {
      const base = (window as unknown as { API_CONFIG: { choreoBaseApiUrl: string } }).API_CONFIG.choreoBaseApiUrl;
      const headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };

      const res = await fetch(`${base}/projects/${projectName}/components`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          metadata: {
            name: componentName,
            annotations: { 'openchoreo.dev/display-name': display, 'openchoreo.dev/description': 'Created by an e2e fixture' },
          },
          spec: {
            owner: { projectName },
            componentType: { kind: 'ComponentType', name: 'deployment/integration-as-api' },
            autoDeploy: false,
            autoBuild: false,
            workflow: {
              kind: 'ClusterWorkflow',
              name: 'ballerina-buildpack-builder',
              parameters: { repository: { url: 'https://github.com/wso2/integration-control-plane', revision: { branch: 'main' }, appPath: '.' } },
            },
          },
        }),
      });
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    },
    { projectName: project, componentName: name, display: displayName, bearer: token },
  );
}

// Deletes every component in each project before the project itself: a project delete is
// refused while children remain, and enumerating them covers integrations created by a test
// that failed before it could record the handle.
export async function deleteFixtureProjects(page: Page, projects: readonly string[]): Promise<string[]> {
  const token = await readSessionToken(page);
  return page.evaluate(async ({ handles, bearer }) => {
    const base = (window as unknown as { API_CONFIG: { choreoBaseApiUrl: string } }).API_CONFIG.choreoBaseApiUrl;
    const headers = { Authorization: `Bearer ${bearer}` };

    const out: string[] = [];
    for (const project of handles) {
      const listed = await fetch(`${base}/projects/${project}/components`, { headers });
      const components = listed.ok ? (((await listed.json()).items ?? []) as Record<string, string>[]) : [];
      for (const component of components) {
        const name = component.handler ?? component.name;
        const res = await fetch(`${base}/projects/${project}/components/${name}`, { method: 'DELETE', headers }).catch(() => null);
        if (!res || (!res.ok && res.status !== 404)) out.push(`${res?.status ?? 'error'} ${project}/${name}`);
      }
      const res = await fetch(`${base}/projects/${project}`, { method: 'DELETE', headers });
      out.push(`${res.status} ${project}`);
    }
    return out;
  }, { handles: [...projects], bearer: token });
}

// Reports rather than throws: a throw here would replace the tests' own failures with a
// teardown error. A 404 is not a leak — handles are recorded before the create is confirmed.
export function reportTeardown(results: readonly string[]): void {
  for (const line of results) {
    if (!line.startsWith('2') && !line.startsWith('404')) console.warn(`Teardown left a project behind: ${line}`);
  }
}

// Token-endpoint traffic is the SDK's business, not the page's.
export function trackFailedRequests(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/oauth2/token')) failures.push(`${r.status()} ${r.url()}`);
  });
  return failures;
}

// A redirect away is how a missing or gated page presents itself, so the URL is checked first.
export async function expectPageRendered(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page, `Navigating to ${url} did not stay there`).toHaveURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 30_000 });
  await expect(page.locator('main').getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Puts a freshly fetched token into the page, replacing rather than refreshing: in token mode
 * the session carries no refresh token, so a spec outliving the token's hour — the build waits —
 * has to seed a new one itself. A no-op elsewhere; a browser-login session refreshes itself.
 */
/**
 * A reseeded token has to outlive the longest gap before the next reseed, with room to spare:
 * a token-mode session has no refresh token, so the SDK never renews it, and the first 401 after
 * it expires ends the session and redirects to sign-in (auth/session.ts). So installing a
 * nearly-spent token does not merely lapse — it ends the run.
 */
const RESEED_MIN_LIFETIME_MS = 6 * 60_000;

export async function reseedSessionToken(page: Page): Promise<void> {
  if (!process.env.E2E_TOKEN_MODE) return;

  let token = await resolveToken();
  let claims = decodeTokenClaims(token);

  // The provider serves one cached token until it nears expiry, so a reseed mid-run can be handed
  // seconds of life. Waiting for the rotation costs less than losing the session.
  for (let attempt = 0; attempt < 5 && claims.exp * 1000 - Date.now() < RESEED_MIN_LIFETIME_MS; attempt++) {
    const waitMs = Math.min(Math.max(claims.exp * 1000 - Date.now(), 0) + 5_000, 60_000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    token = await resolveToken();
    claims = decodeTokenClaims(token);
  }

  const remainingMs = claims.exp * 1000 - Date.now();
  if (remainingMs < RESEED_MIN_LIFETIME_MS) {
    throw new Error(`The token provider keeps serving tokens with ${Math.round(remainingMs / 1000)}s of life, under the ${RESEED_MIN_LIFETIME_MS / 60_000} minutes a reseed needs. Its own refresh is likely failing.`);
  }

  // The SDK reads its session from storage on every request, so this tab's next call carries the
  // new token; the parked copy is what tabs opened later in the context start from.
  const entry = { name: sdkSessionKey(claims.clientId), value: sdkSession(token, claims) };
  await page.evaluate(
    ({ next, activeKey }) => {
      sessionStorage.setItem(next.name, next.value);
      localStorage.setItem(activeKey, 'true');
    },
    { next: entry, activeKey: SDK_SESSION_ACTIVE_KEY },
  );
  await updateParkedEntry(page, entry);
}
