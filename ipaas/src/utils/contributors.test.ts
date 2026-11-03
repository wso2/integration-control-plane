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
import { mergeContributors } from './contributors';

describe('mergeContributors', () => {
  it('merges emails that differ only in case or spacing, summing their contributions', () => {
    const merged = mergeContributors([
      { displayName: 'Ada', email: 'Ada@Example.com', totalContributions: 2 },
      { displayName: '', email: ' ada@example.com', avatarUrl: 'https://img.example/ada.png', totalContributions: 3 },
    ]);
    expect(merged).toEqual([{ displayName: 'Ada', email: 'ada@example.com', avatarUrl: 'https://img.example/ada.png', totalContributions: 5 }]);
  });

  it('keeps different people apart and lists the busiest first', () => {
    const merged = mergeContributors([
      { displayName: 'Ada', email: 'ada@example.com', totalContributions: 1 },
      { displayName: 'Bob', email: 'bob@example.com', totalContributions: 4 },
    ]);
    expect(merged.map((c) => c.displayName)).toEqual(['Bob', 'Ada']);
  });
});
