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

import type { DeploymentTrack } from '../types/component';
import type { RepoBranch } from '../types/repository';

export interface TrackBranchOption extends RepoBranch {
  /** Another track already builds it; a branch can have one track. */
  inUse: boolean;
}

/**
 * The branches a track can build, for the track `editingId` names or for a new
 * one. The track's own branch stays listed even when the repository no longer
 * has it, so editing such a track shows what it builds.
 */
export function trackBranchOptions(branches: RepoBranch[], tracks: DeploymentTrack[], editingId: string | undefined, current: string): TrackBranchOption[] {
  const taken = new Set(tracks.filter((t) => t.id !== editingId && t.branch).map((t) => t.branch!));
  const listed = current && !branches.some((b) => b.name === current) ? [{ name: current, isDefault: false }, ...branches] : branches;
  return listed.map((b) => ({ ...b, inUse: taken.has(b.name) }));
}
