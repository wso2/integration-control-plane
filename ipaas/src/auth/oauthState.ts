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
 * OAuth CSRF state — pure localStorage/sessionStorage utilities, no token or
 * network access. Deliberately a separate module from tokenManager.ts (which
 * holds actual token/data access): pages and components may import from here
 * directly (see src/pages/AGENTS.md, src/components/AGENTS.md). Keeping this
 * file's export surface limited to exactly these helpers — rather than
 * allow-listing names out of tokenManager.ts — means a future addition to
 * tokenManager.ts (e.g. a new data-access function) can never become
 * importable from UI code by accident; it would have to be added here
 * explicitly first.
 */

const REDIRECT_URL_KEY = 'icp_redirect_url';
const OIDC_STATE_KEY = 'icp_oidc_state';

export function saveRedirectUrl(url: string): void {
  localStorage.setItem(REDIRECT_URL_KEY, url);
}

export function getAndClearRedirectUrl(): string | null {
  const url = localStorage.getItem(REDIRECT_URL_KEY);
  localStorage.removeItem(REDIRECT_URL_KEY);
  return url;
}

export function generateAndSaveOIDCState(): string {
  const state = crypto.randomUUID();
  localStorage.setItem(OIDC_STATE_KEY, state);
  return state;
}

export function validateAndClearOIDCState(state: string): boolean {
  const savedState = localStorage.getItem(OIDC_STATE_KEY);
  localStorage.removeItem(OIDC_STATE_KEY);
  return savedState === state;
}

// GitHub OAuth CSRF state — sessionStorage so it's scoped to the initiating tab
const GITHUB_OAUTH_STATE_KEY = 'icp_github_oauth_state';

export function generateAndSaveGitHubState(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(GITHUB_OAUTH_STATE_KEY, state);
  return state;
}

export function validateAndClearGitHubState(state: string): boolean {
  const saved = sessionStorage.getItem(GITHUB_OAUTH_STATE_KEY);
  sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
  return saved !== null && saved === state;
}
