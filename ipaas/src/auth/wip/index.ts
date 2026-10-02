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
 * WIP auth (also used by ICP): WSO2 Identity Platform OIDC + STS token
 * exchange, and local username/password login. Resolved through `#auth`.
 */

import { getAccessToken as readAccessToken } from './tokenManager';

export { AuthProvider, useAuth } from './AuthContext';
export { authenticatedFetch, getOrgUuidFromToken, switchOrgToken, validateAndClearOIDCState } from './tokenManager';
export { saveRedirectUrl, getAndClearRedirectUrl } from '../shared/redirectUrl';
export { generateAndSaveGitHubState, validateAndClearGitHubState } from '../shared/githubState';

export async function getAccessToken(): Promise<string | null> {
  return readAccessToken();
}

// Not in the contract: only src/api/wip retries with it (STS and APIM scope errors).
export { refreshAccessToken } from './tokenManager';
