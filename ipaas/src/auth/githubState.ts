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

// GitHub OAuth CSRF state — sessionStorage so it's scoped to the initiating tab
const GITHUB_OAUTH_STATE_KEY = 'github_oauth_state';

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
