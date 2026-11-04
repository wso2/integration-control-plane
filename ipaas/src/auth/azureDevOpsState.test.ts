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

import { beforeEach, describe, expect, it } from 'vitest';
import { generateAndSaveAzureDevOpsState, validateAndClearAzureDevOpsState } from './azureDevOpsState';

beforeEach(() => sessionStorage.clear());

describe('azureDevOpsState', () => {
  it('accepts only the exact issued state and consumes it', () => {
    const state = generateAndSaveAzureDevOpsState();
    expect(validateAndClearAzureDevOpsState(state)).toBe(true);
    expect(validateAndClearAzureDevOpsState(state)).toBe(false);
  });

  it('rejects a forged state and consumes the stored nonce', () => {
    const state = generateAndSaveAzureDevOpsState();
    expect(validateAndClearAzureDevOpsState('forged')).toBe(false);
    expect(validateAndClearAzureDevOpsState(state)).toBe(false);
  });
});
