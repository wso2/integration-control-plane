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

import { describe, it, expect } from 'vitest';
import { getPipelineSnippet, isNeverUsed, tokenLastUsedLabel } from './externalCi';

const args = { componentId: 'comp-1', versionId: 'ver-1', endpoint: 'https://apis.example/devops/1.0.0/external-ci/deploy' };

describe('getPipelineSnippet', () => {
  it('injects endpoint, component id and version id into every provider snippet', () => {
    (['curl', 'github', 'gcb', 'azure'] as const).forEach((p) => {
      const s = getPipelineSnippet(p, args);
      expect(s).toContain(args.endpoint);
      expect(s).toContain('comp-1');
      expect(s).toContain('ver-1');
    });
  });

  it('uses the GitHub secret placeholder for the github snippet', () => {
    expect(getPipelineSnippet('github', args)).toContain('secrets.CHOREO_TOKEN');
  });

  it('uses the INSERT_TOKEN placeholder for cURL', () => {
    expect(getPipelineSnippet('curl', args)).toContain('<INSERT_TOKEN>');
  });
});

describe('isNeverUsed / tokenLastUsedLabel', () => {
  it('treats the 0001 sentinel (or empty) as never used', () => {
    expect(isNeverUsed('0001-01-01T00:00:00Z')).toBe(true);
    expect(isNeverUsed('')).toBe(true);
    expect(isNeverUsed(undefined)).toBe(true);
    expect(tokenLastUsedLabel('0001-01-01T00:00:00Z')).toBe('Never');
  });

  it('formats a real timestamp', () => {
    expect(isNeverUsed('2026-07-12T15:46:36Z')).toBe(false);
    expect(tokenLastUsedLabel('2026-07-12T15:46:36Z')).not.toBe('Never');
  });
});
