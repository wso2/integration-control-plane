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

import { describe, it, expect } from 'vitest';
import { buildCloudEditorUrl, derivePodPhase, displayableEditorUrl, highestPodPhase } from './cloudEditor';
import type { ClusterPod } from '../types/runtime';

const base = {
  userId: 'u1',
  orgUuid: 'org-uuid',
  orgHandle: 'acme',
  projectId: 'proj-1',
  codeServerSample: { name: 'Code Server' },
};

describe('buildCloudEditorUrl', () => {
  it('serializes the required params onto the /editor deep link', () => {
    const url = new URL(buildCloudEditorUrl(base, 'https://example.com'));
    expect(url.pathname).toBe('/editor');
    expect(url.searchParams.get('userId')).toBe('u1');
    expect(url.searchParams.get('orgHandle')).toBe('acme');
    expect(url.searchParams.get('componentId')).toBe('null');
    expect(JSON.parse(url.searchParams.get('codeServerSample') ?? '{}')).toEqual({ name: 'Code Server' });
  });

  it('omits scaffoldKey when not provided and includes it when set', () => {
    expect(new URL(buildCloudEditorUrl(base, 'https://example.com')).searchParams.has('scaffoldKey')).toBe(false);
    const withKey = new URL(buildCloudEditorUrl({ ...base, scaffoldKey: 'ai-scaffold-9' }, 'https://example.com'));
    expect(withKey.searchParams.get('scaffoldKey')).toBe('ai-scaffold-9');
  });
});

const pod = (conditions: Array<{ type: string; status: string }>): ClusterPod => ({ status: { phase: 'Pending', conditions } }) as ClusterPod;

describe('derivePodPhase', () => {
  it('is scheduling with no pod or no conditions met', () => {
    expect(derivePodPhase(undefined)).toBe('scheduling');
    expect(derivePodPhase(pod([]))).toBe('scheduling');
  });

  it('is starting once scheduled and initialized', () => {
    expect(
      derivePodPhase(
        pod([
          { type: 'PodScheduled', status: 'True' },
          { type: 'Initialized', status: 'True' },
        ]),
      ),
    ).toBe('starting');
  });

  it('is opening once containers are ready', () => {
    expect(
      derivePodPhase(
        pod([
          { type: 'PodScheduled', status: 'True' },
          { type: 'Initialized', status: 'True' },
          { type: 'PodReadyToStartContainers', status: 'True' },
          { type: 'ContainersReady', status: 'True' },
          { type: 'Ready', status: 'True' },
        ]),
      ),
    ).toBe('opening');
  });
});

describe('highestPodPhase', () => {
  it('returns scheduling for an empty pod list', () => {
    expect(highestPodPhase([])).toBe('scheduling');
  });

  it('returns the furthest-along phase across pods', () => {
    const scheduling = pod([]);
    const opening = pod([
      { type: 'PodReadyToStartContainers', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'Ready', status: 'True' },
    ]);
    expect(highestPodPhase([scheduling, opening])).toBe('opening');
  });
});

describe('displayableEditorUrl', () => {
  // The address is on screen for the whole of a cold start; the token must not be.
  it('strips the connection token', () => {
    expect(displayableEditorUrl('https://editor-abc.gateway.example.com/?tkn=deadbeef')).toBe('https://editor-abc.gateway.example.com/');
  });

  it('keeps every other query parameter', () => {
    expect(displayableEditorUrl('https://editor-abc.example.com/?folder=%2Fworkspace&tkn=deadbeef')).toBe('https://editor-abc.example.com/?folder=%2Fworkspace');
  });

  it('is a no-op for a URL with no token', () => {
    expect(displayableEditorUrl('https://editor-abc.example.com/')).toBe('https://editor-abc.example.com/');
  });

  // Display only — navigation uses the URL held in state.
  it('returns an unparseable value unchanged', () => {
    expect(displayableEditorUrl('not a url')).toBe('not a url');
  });
});
