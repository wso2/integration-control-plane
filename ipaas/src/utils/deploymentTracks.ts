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

import type { Component, DeploymentTrack } from '../types/component';
import type { RepoBranch } from '../types/repository';
import { identifyIntegration } from './identifyIntegration';

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

/** A track's API version: `v` then major and minor numbers. The BFF holds the same rule. */
const API_VERSION_PATTERN = /^v(\d+)\.(\d+)$/;

export const API_VERSION_FORMAT_ERROR = 'API version must look like v1.0';

/**
 * The version a new track's API gets when none is given: the minor after the
 * highest version among `versions`, by major then minor, or `v1.0` when there
 * is none. The BFF assigns by the same rule, so the field shows what it would pick.
 */
export function nextApiVersion(versions: (string | undefined)[]): string {
  let highest: [number, number] | null = null;
  for (const v of versions) {
    const m = v ? API_VERSION_PATTERN.exec(v) : null;
    if (!m) continue;
    const parsed: [number, number] = [Number(m[1]), Number(m[2])];
    if (!highest || parsed[0] > highest[0] || (parsed[0] === highest[0] && parsed[1] > highest[1])) highest = parsed;
  }
  return highest ? `v${highest[0]}.${highest[1] + 1}` : 'v1.0';
}

/**
 * Why `value` can't be a track's API version, with the BFF's wording, or `null`
 * when it can. A version names the track's API URL, so no two tracks of an
 * integration share one; `editingId` is the track being edited, if any.
 */
export function apiVersionError(value: string, tracks: DeploymentTrack[], editingId?: string): string | null {
  if (!API_VERSION_PATTERN.test(value)) return API_VERSION_FORMAT_ERROR;
  if (tracks.some((t) => t.id !== editingId && t.apiVersion === value)) return `API version ${value} is already used by another deployment track`;
  return null;
}

/** Integration types that serve their endpoints as APIs on the API Platform gateway. AI agents are fronted by the AI gateway instead. */
const GATEWAY_API_TYPES = new Set(['integration-as-api', 'mcp-server', 'webhook']);

/**
 * Integrations whose endpoints the gateway exposes as versioned APIs, where a
 * track's API version is part of its URL: every integration with deployment
 * tracks that serves APIs on the gateway. An integration without tracks keeps
 * one unversioned API per endpoint.
 */
export function hasVersionedApis(component: Pick<Component, 'displayType' | 'componentSubType' | 'deploymentTracksEnabled'>): boolean {
  if (!component.deploymentTracksEnabled) return false;
  return GATEWAY_API_TYPES.has(identifyIntegration(component.displayType, component.componentSubType).type);
}

/** Whether the track `trackId` names serves versioned APIs but has no version yet, so none of its endpoints is exposed. */
export function trackApiVersionMissing(component: Pick<Component, 'displayType' | 'componentSubType' | 'deploymentTracksEnabled' | 'deploymentTracks'>, trackId: string | undefined): boolean {
  if (!hasVersionedApis(component)) return false;
  const track = component.deploymentTracks?.find((t) => t.id === trackId);
  return !!track && !track.apiVersion;
}
