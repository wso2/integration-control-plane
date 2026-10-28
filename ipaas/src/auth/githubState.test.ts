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
import { generateAndSaveGitHubState, validateAndClearGitHubState } from './githubState';

beforeEach(() => {
  sessionStorage.clear();
});

describe('githubState', () => {
  it('accepts the state it issued, once', () => {
    const state = generateAndSaveGitHubState();
    expect(validateAndClearGitHubState(state)).toBe(true);
    expect(validateAndClearGitHubState(state)).toBe(false);
  });

  it('refuses another state and spends the saved one', () => {
    const state = generateAndSaveGitHubState();
    expect(validateAndClearGitHubState('forged')).toBe(false);
    expect(validateAndClearGitHubState(state)).toBe(false);
  });

  it('refuses everything when no flow was started', () => {
    expect(validateAndClearGitHubState('')).toBe(false);
    expect(validateAndClearGitHubState('anything')).toBe(false);
  });

  it('issues a different state each time', () => {
    expect(generateAndSaveGitHubState()).not.toBe(generateAndSaveGitHubState());
  });
});
