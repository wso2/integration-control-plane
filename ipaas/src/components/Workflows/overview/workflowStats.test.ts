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
import { isScopedWorkflowKey, workflowKeys } from '../api/queryKeys';
import { countOf, countText, workflowCountKey } from './workflowStats';

describe('workflow figures', () => {
  it('counts a page, and caps it when the page filled', () => {
    expect(countOf({ items: [1, 2, 3], nextPageToken: null, hasMore: false })).toEqual({ count: 3, capped: false });
    expect(countOf({ items: [1, 2], nextPageToken: 't', hasMore: true })).toEqual({ count: 2, capped: true });
  });

  it('counts only what the filter keeps', () => {
    expect(countOf({ items: [1, 2, 3, 4], nextPageToken: null, hasMore: false }, (n) => n % 2 === 0)).toEqual({ count: 2, capped: false });
  });

  it('counts an empty answer as zero', () => {
    expect(countOf(null)).toEqual({ count: 0, capped: false });
  });

  it('reads loading, failed and capped counts', () => {
    expect(countText(undefined)).toBe('…');
    expect(countText(null)).toBe('–');
    expect(countText({ count: 50, capped: true })).toBe('50+');
    expect(countText({ count: 0, capped: false })).toBe('0');
  });

  it('keys a figure under its connection, apart from the listings', () => {
    const key = workflowCountKey('scope-1', 'instances', { status: 'RUNNING' });
    expect(isScopedWorkflowKey(key, 'scope-1')).toBe(true);
    expect(isScopedWorkflowKey(key, 'scope-2')).toBe(false);
    expect(key.slice(0, 3)).not.toEqual(workflowKeys.instances('scope-1').slice(0, 3));
  });
});
