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
import { sortByStartTimeDesc } from './sortByStartTime';

describe('sortByStartTimeDesc', () => {
  const runs = [
    { id: 'running-old', status: 'RUNNING', startTime: '2026-10-01T11:59:21Z' },
    { id: 'failed-new', status: 'FAILED', startTime: '2026-10-02T17:50:36Z' },
    { id: 'running-new', status: 'RUNNING', startTime: '2026-10-02T17:54:34Z' },
    { id: 'no-time', status: 'COMPLETED', startTime: null },
  ];

  it('orders by start time, newest first, whatever the status', () => {
    expect(sortByStartTimeDesc(runs).map((run) => run.id)).toEqual(['running-new', 'failed-new', 'running-old', 'no-time']);
  });

  it('leaves the list it was given untouched', () => {
    const before = runs.map((run) => run.id);
    sortByStartTimeDesc(runs);
    expect(runs.map((run) => run.id)).toEqual(before);
  });
});
