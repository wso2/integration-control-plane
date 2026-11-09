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
import { WORKFLOW_TIME_RANGE_OPTIONS, workflowTimeRangeFrom } from './workflowTimeRangeFilter';

describe('workflowTimeRangeFilter', () => {
  it('offers any time, then the windows in the order the select lists them', () => {
    expect(WORKFLOW_TIME_RANGE_OPTIONS).toEqual([
      { value: '', label: 'Any time' },
      { value: '1h', label: 'Past 1 hour' },
      { value: '24h', label: 'Past 24 hours' },
      { value: '7d', label: 'Past 7 days' },
      { value: '30d', label: 'Past 30 days' },
    ]);
  });

  it('bounds a window from the clock it is given, and leaves any time unbounded', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    expect(workflowTimeRangeFrom('1h', now)).toBe('2026-10-02T11:00:00.000Z');
    expect(workflowTimeRangeFrom('7d', now)).toBe('2026-09-25T12:00:00.000Z');
    expect(workflowTimeRangeFrom('', now)).toBeUndefined();
  });
});
