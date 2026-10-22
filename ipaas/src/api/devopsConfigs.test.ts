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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, get, put } };
});

import { getConfigMaps, getReleaseById, updateConfigMapData } from './devopsConfigs';
import type { ConfigMapWriteData } from '../types/devopsConfigs';

// Releases are looked up in each track's own history, so each track has its own.
const HISTORY: Record<string, { release_name: string; environment_id: string }[]> = {
  '': [{ release_name: 'hello-main-r1', environment_id: 'development' }],
  'next-bbbbbb': [{ release_name: 'hello-next-r1', environment_id: 'development' }],
};

const trackOf = (url: string): string => new URL(url, 'http://bff').searchParams.get('deploymentTrackId') ?? '';

const group = (track: string): ConfigMapWriteData => ({ name: 'app', metadata: {}, environment_id: 'development', organization_id: 'org', project_id: 'proj', app_environment_id: '', isBase64: false, config_type: 'VariableList', data: { TRACK: track } });

describe('devopsConfigs deployment tracks', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    get.mockImplementation(async (url: string) => {
      if (url.includes('/release-mgt-deployments')) return { items: HISTORY[trackOf(url)] ?? [] };
      if (url.includes('/containers')) return { items: [{ name: 'main' }] };
      if (url.includes('/env-groups')) return { groups: [] };
      return null;
    });
    put.mockResolvedValue({});
  });

  it('finds a non-default release in its own track', async () => {
    const release = await getReleaseById('org', 'proj', 'hello', 'hello-next-r1', 'next-bbbbbb');
    expect(release.containers).toHaveLength(1);
    expect(get.mock.calls.map(([url]) => trackOf(url))).toEqual(['next-bbbbbb', 'next-bbbbbb']);
  });

  it('reads env groups for the track asked for', async () => {
    await getReleaseById('org', 'proj', 'hello', 'hello-main-r1');
    await getConfigMaps('org', 'proj', 'development', 'next-bbbbbb');
    const groupReads = get.mock.calls.map(([url]) => url as string).filter((url) => url.includes('/env-groups'));
    expect(groupReads.map(trackOf)).toEqual(['next-bbbbbb']);
  });

  // A track switch back to a cached release does not re-read it, so a write
  // must not trust the track the last read recorded.
  it('writes to the track the caller names over the last one read', async () => {
    await getReleaseById('org', 'proj', 'hello', 'hello-next-r1', 'next-bbbbbb');
    await updateConfigMapData('org', 'proj', 'app', group('main'), '');
    expect(put).toHaveBeenCalledTimes(1);
    expect(trackOf(put.mock.calls[0][0])).toBe('');
  });

  it('writes to the track last read when the caller names none', async () => {
    await getReleaseById('org', 'proj', 'hello', 'hello-next-r1', 'next-bbbbbb');
    await updateConfigMapData('org', 'proj', 'app', group('next'));
    expect(trackOf(put.mock.calls[0][0])).toBe('next-bbbbbb');
  });
});
