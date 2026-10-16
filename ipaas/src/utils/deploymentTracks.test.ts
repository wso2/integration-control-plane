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

import { trackBranchOptions } from './deploymentTracks';
import type { DeploymentTrack } from '../types/component';

const TRACKS: DeploymentTrack[] = [
  { id: 'main-aaaaaa', branch: 'main', latest: true },
  { id: 'next-bbbbbb', branch: 'next' },
];
const BRANCHES = [
  { name: 'main', isDefault: true },
  { name: 'next', isDefault: false },
  { name: 'feature', isDefault: false },
];

const summary = (editingId: string | undefined, current: string) => trackBranchOptions(BRANCHES, TRACKS, editingId, current).map((o) => `${o.name}${o.inUse ? ':taken' : ''}`);

describe('trackBranchOptions', () => {
  it('greys out every branch a track builds when creating one', () => {
    expect(summary(undefined, '')).toEqual(['main:taken', 'next:taken', 'feature']);
  });

  it("keeps a track's own branch pickable when editing it", () => {
    expect(summary('next-bbbbbb', 'next')).toEqual(['main:taken', 'next', 'feature']);
  });

  it('still shows a branch the repository no longer has', () => {
    expect(summary('next-bbbbbb', 'gone')).toEqual(['gone', 'main:taken', 'next', 'feature']);
  });
});
