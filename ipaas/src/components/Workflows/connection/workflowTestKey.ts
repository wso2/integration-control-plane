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

import { isWorkflowError } from '../api/http';

/**
 * When the connection mints the management API's test key again.
 *
 * The key comes from `useEndpointTestAccess`, which mints it through the BFF's test-key route
 * (`useCreateEndpointTestKey`): a short-lived key, valid for an hour, whose answer states no
 * validity. That hook mints once, and once more after one 401 per endpoint; a workflow page is the
 * kind that is left open for hours, so the connection also mints ahead of expiry, and after any
 * refused read once the key is old enough to have expired (see `useWorkflowConnection`).
 */

/** How long a test key minted by the BFF stays valid. */
export const TEST_KEY_VALIDITY_SECONDS = 60 * 60;

// The longest delay a browser timer honours; a longer one fires at once, on every tick.
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Mint again a minute before expiry; without a validity, the key is kept until it is refused. */
export function testKeyRefreshInterval(validitySeconds: number | undefined): number | false {
  return validitySeconds && validitySeconds > 0 ? Math.min(Math.max(validitySeconds - 60, 30) * 1000, MAX_TIMER_MS) : false;
}

/**
 * A credential younger than this that is refused is not the problem (the gateway or the engine
 * is), so renewing it would only repeat the refusal.
 */
export const TEST_KEY_MIN_AGE_MS = 60 * 1000;

/** Whether a failed read says the test key should be minted again. */
export function isKeyRefusal(error: unknown, issuedAt: number, now = Date.now()): boolean {
  return isWorkflowError(error, 'GATEWAY_REJECTED') && now - issuedAt >= TEST_KEY_MIN_AGE_MS;
}
