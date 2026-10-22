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

import { apiVersionError, hasVersionedApis, nextApiVersion, trackApiVersionMissing, trackBranchOptions } from './deploymentTracks';
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

describe('nextApiVersion', () => {
  it.each([
    { versions: [], next: 'v1.0' },
    { versions: ['', undefined], next: 'v1.0' },
    { versions: ['v1.0'], next: 'v1.1' },
    { versions: ['v1.0', 'v1.3', 'v2.1'], next: 'v2.2' },
    // By number, not by text: v1.10 is after v1.9.
    { versions: ['v1.9', 'v1.10'], next: 'v1.11' },
    { versions: ['v10.0', 'v9.9'], next: 'v10.1' },
    { versions: ['', 'v1.0', 'latest'], next: 'v1.1' },
  ])('gives $next after $versions', ({ versions, next }) => {
    expect(nextApiVersion(versions)).toBe(next);
  });
});

describe('apiVersionError', () => {
  const tracks: DeploymentTrack[] = [
    { id: 'main-aaaaaa', branch: 'main', latest: true, apiVersion: 'v1.0' },
    { id: 'next-bbbbbb', branch: 'next', apiVersion: 'v1.1' },
    { id: 'old-cccccc', branch: 'old' },
  ];

  it.each(['1.0', 'v1', 'v1.0.0', 'V1.0', 'v1.x', ' v1.2', ''])('rejects %j', (value) => {
    expect(apiVersionError(value, tracks)).toBe('API version must look like v1.0');
  });

  it('rejects a version another track uses', () => {
    expect(apiVersionError('v1.1', tracks)).toBe('API version v1.1 is already used by another deployment track');
    expect(apiVersionError('v1.1', tracks, 'old-cccccc')).toBe('API version v1.1 is already used by another deployment track');
  });

  it('accepts an unused version, and the edited track keeping its own', () => {
    expect(apiVersionError('v1.2', tracks)).toBeNull();
    expect(apiVersionError('v1.1', tracks, 'next-bbbbbb')).toBeNull();
  });
});

describe('hasVersionedApis', () => {
  it.each([
    { displayType: 'ballerinaService', componentSubType: null, versioned: true },
    { displayType: 'miApiService', componentSubType: null, versioned: true },
    { displayType: 'ballerinaService', componentSubType: 'MCP', versioned: true },
    { displayType: 'ballerinaService', componentSubType: 'aiAgent', versioned: false },
    { displayType: 'scheduledTask', componentSubType: null, versioned: false },
    { displayType: 'ballerinaEventHandler', componentSubType: null, versioned: false },
  ])('$displayType/$componentSubType with tracks → $versioned', ({ displayType, componentSubType, versioned }) => {
    expect(hasVersionedApis({ displayType, componentSubType, deploymentTracksEnabled: true })).toBe(versioned);
  });

  it('keeps an integration without tracks unversioned', () => {
    expect(hasVersionedApis({ displayType: 'ballerinaService', componentSubType: null, deploymentTracksEnabled: false })).toBe(false);
    expect(hasVersionedApis({ displayType: 'ballerinaService', componentSubType: 'MCP' })).toBe(false);
  });
});

describe('trackApiVersionMissing', () => {
  const mcp = { displayType: 'ballerinaService', componentSubType: 'MCP', deploymentTracksEnabled: true };
  const tracks: DeploymentTrack[] = [
    { id: 'main', branch: 'main', apiVersion: 'v1.0' },
    { id: 'next', branch: 'next' },
  ];

  it('flags a track of an MCP server with no version', () => {
    expect(trackApiVersionMissing({ ...mcp, deploymentTracks: tracks }, 'next')).toBe(true);
    expect(trackApiVersionMissing({ ...mcp, deploymentTracks: tracks }, 'main')).toBe(false);
  });

  it('ignores integrations that serve no versioned APIs', () => {
    expect(trackApiVersionMissing({ ...mcp, componentSubType: 'aiAgent', deploymentTracks: tracks }, 'next')).toBe(false);
  });
});
