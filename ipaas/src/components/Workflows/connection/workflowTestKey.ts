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
 * When the connection renews the management API's test key.
 *
 * The key comes from `useEndpointTestAccess`, which holds one per endpoint for every view of it and
 * renews it a minute before it expires. A read can still be refused: a sleeping tab may miss the
 * renewal, or another tab's mint may reap the key. The connection then renews the key once it is
 * old enough for that (see `useWorkflowConnection`).
 */

/**
 * A credential younger than this that is refused is not the problem (the gateway or the engine
 * is), so renewing it would only repeat the refusal.
 */
export const TEST_KEY_MIN_AGE_MS = 60 * 1000;

/** Whether a failed read says the test key should be minted again. */
export function isKeyRefusal(error: unknown, issuedAt: number, now = Date.now()): boolean {
  return isWorkflowError(error, 'GATEWAY_REJECTED') && now - issuedAt >= TEST_KEY_MIN_AGE_MS;
}
