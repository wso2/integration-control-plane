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

import type { EndpointTestAccess } from '../../../hooks/useEndpointTestAccess';
import { httpStatusOf } from '../../../utils/apiErrors';
import { endpointLoadNotice } from '../../../utils/apiSecurity';

/**
 * How a call to the workflow Management API authenticates, twice over.
 *
 * The API Platform gateway in front of the integration lets a call through with the endpoint's
 * test key, sent in the header the gateway's api-key policy names (`useEndpointTestAccess`), or
 * with nothing when the endpoint is open. The management API behind it takes the caller from a
 * JWT: the signed-in user's platform access token, sent as `X-JWT-Assertion`. It validates that
 * token (issuer platform_idp, audience IPAAS_CONSOLE) and reads the caller and their roles from it,
 * so every call names the person using the console; no exchange and no identity headers are needed.
 */

/** The header the management API reads the caller's token from. */
export const CALLER_ASSERTION_HEADER = 'X-JWT-Assertion';

/** What gets a call past the gateway: the test key, in its header, or none for an open API. */
export interface GatewayCredential {
  authHeader: string;
  apiKey: string | null;
}

/** The credential headers of one request. The token is read per request, never cached here. */
export function workflowRequestHeaders({ authHeader, apiKey }: GatewayCredential, accessToken: string | null): Record<string, string> {
  return {
    ...(apiKey ? { [authHeader]: apiKey } : {}),
    ...(accessToken ? { [CALLER_ASSERTION_HEADER]: `Bearer ${accessToken}` } : {}),
  };
}

/**
 * Why the console holds no test key it can call the management API with.
 *
 * `not-exposed`: the endpoint is not an API on the gateway yet. `gateway-unavailable`: API
 * exposure is not configured in this environment. `security-unreadable`: the gateway's
 * configuration of the API could not be read. `no-gateway-url`: it is exposed, but no invoke URL
 * is known. `jwt-secured`: the gateway expects a JWT; a test key would switch it to api-key auth,
 * which only the person may choose. `mint-failed`: minting the key failed.
 */
export type TestKeyReason = 'not-exposed' | 'gateway-unavailable' | 'security-unreadable' | 'no-gateway-url' | 'jwt-secured' | 'mint-failed';

/** What a notice says, and how loudly. */
export interface WorkflowNotice {
  severity: 'info' | 'warning';
  text: string;
}

type TestKeyAccess = Pick<EndpointTestAccess, 'isUnavailable' | 'securityError' | 'mode' | 'isAuthorized' | 'keyError'>;

/** The reason the endpoint's test access leaves the management API out of reach, or null. */
export function testKeyReasonOf(access: TestKeyAccess): TestKeyReason | null {
  if (access.isUnavailable) {
    // The statuses `endpointLoadNotice` reads as states rather than failures.
    if (!access.securityError) return 'no-gateway-url';
    const status = httpStatusOf(access.securityError);
    if (status === 409) return 'not-exposed';
    return status === 503 ? 'gateway-unavailable' : 'security-unreadable';
  }
  if (access.isAuthorized || access.mode === null) return null;
  if (access.mode === 'jwt') return 'jwt-secured';
  return access.keyError ? 'mint-failed' : null;
}

// Worded as the Test Console words the same states for an endpoint it cannot test.
const LOAD_COPY = {
  notExposed: 'The Workflow Management API isn’t exposed on the gateway yet, so the console has no URL to reach it at. Set the endpoint’s visibility to Public and deploy, then come back.',
  unavailable: 'The API gateway isn’t available in this environment, so the console cannot reach the Workflow Management API.',
  readFailed: 'Could not read how the gateway exposes the Workflow Management API.',
};

/** What the workflow views say instead of their content, for each reason. */
export function testKeyNotice(reason: TestKeyReason, access: TestKeyAccess): WorkflowNotice {
  switch (reason) {
    case 'not-exposed':
    case 'gateway-unavailable':
    case 'security-unreadable':
      return endpointLoadNotice(access.securityError, LOAD_COPY) ?? { severity: 'warning', text: LOAD_COPY.readFailed };
    case 'no-gateway-url':
      return { severity: 'warning', text: 'The Workflow Management API is exposed on the gateway, but the gateway reports no URL to reach it at.' };
    case 'jwt-secured':
      return {
        severity: 'info',
        text: 'The gateway secures the Workflow Management API with JWT, and the console calls it with a test key. Getting one switches the endpoint to API key authentication, as it does in the Test Console.',
      };
    case 'mint-failed':
      return { severity: 'warning', text: access.keyError ?? 'Could not mint a test key.' };
  }
}
