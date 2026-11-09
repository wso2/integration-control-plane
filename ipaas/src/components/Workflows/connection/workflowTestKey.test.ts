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

import { describe, expect, it } from 'vitest';
import { WorkflowApiError } from '../api/http';
import { TEST_KEY_MIN_AGE_MS, isKeyRefusal } from './workflowTestKey';

describe('isKeyRefusal', () => {
  const now = 1_000_000;
  const refused = new WorkflowApiError('GATEWAY_REJECTED', 401, null, 'GET /x');

  it('is a 401 for a key old enough to have expired', () => {
    expect(isKeyRefusal(refused, now - TEST_KEY_MIN_AGE_MS, now)).toBe(true);
  });

  it('is not a 401 for a key just minted, so a refusal with another cause cannot loop', () => {
    expect(isKeyRefusal(refused, now - 1000, now)).toBe(false);
  });

  it('is not any other failure', () => {
    const denied = new WorkflowApiError('ACCESS_DENIED', 403, null, 'GET /x');
    expect(isKeyRefusal(denied, 0, now)).toBe(false);
    expect(isKeyRefusal(new Error('offline'), 0, now)).toBe(false);
  });
});
