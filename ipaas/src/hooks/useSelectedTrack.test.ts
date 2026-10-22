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

import { resolveTrack, staleTrackParam, withTrackParam } from './useSelectedTrack';
import type { DeploymentTrack } from '../types/component';

const MAIN: DeploymentTrack = { id: 'main-aaaaaa', branch: 'main', latest: true };
const NEXT: DeploymentTrack = { id: 'next-bbbbbb', branch: 'next' };

describe('resolveTrack', () => {
  it.each([
    ['the requested track', [MAIN, NEXT], 'next-bbbbbb', NEXT],
    ['the default track when none is requested', [NEXT, MAIN], null, MAIN],
    // A link to a deleted track lands on the default rather than on nothing.
    ['the default track for a stale request', [NEXT, MAIN], 'gone-cccccc', MAIN],
    ['the first track when none is the default', [NEXT, { ...MAIN, latest: false }], null, NEXT],
    ['nothing before the component loads', [], 'next-bbbbbb', undefined],
  ])('resolves %s', (_, tracks, requested, want) => {
    expect(resolveTrack(tracks, requested)).toBe(want);
  });
});

describe('withTrackParam', () => {
  it.each([
    ['carries the track onto a bare URL', '/c/hello/build', '?track=next-bbbbbb', '/c/hello/build?track=next-bbbbbb'],
    ['keeps the target URL query', '/c/hello/build?buildId=7', '?track=next-bbbbbb&env=dev', '/c/hello/build?buildId=7&track=next-bbbbbb'],
    ['leaves the URL alone without a track', '/c/hello/build', '?env=dev', '/c/hello/build'],
  ])('%s', (_, url, search, want) => {
    expect(withTrackParam(url, search)).toBe(want);
  });
});

describe('staleTrackParam', () => {
  it.each([
    ['leaves a param that names a track', [MAIN, NEXT], 'next-bbbbbb', NEXT, undefined],
    ['leaves a missing param', [MAIN, NEXT], null, MAIN, undefined],
    ['drops a stale param when the default track is shown', [NEXT, MAIN], 'gone-cccccc', MAIN, null],
    ['names the shown track when it is not the default', [NEXT], 'gone-cccccc', NEXT, 'next-bbbbbb'],
    ['waits for the tracks to load', [], 'next-bbbbbb', undefined, undefined],
  ])('%s', (_, tracks, requested, shown, want) => {
    expect(staleTrackParam(tracks, requested, shown)).toBe(want);
  });
});
