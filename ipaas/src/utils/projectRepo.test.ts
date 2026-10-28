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
import type { Component } from '../types/component';
import { componentRepoPath, isExternalRepoIntegration, repoPathOf } from './projectRepo';

const component = (partial: Partial<Component>): Component => ({ id: 'c1', projectId: 'p1', name: 'n', handler: 'h', displayName: 'N', displayType: 'ballerinaService', description: '', status: '', componentSubType: null, version: '1.0.0', createdAt: '', lastBuildDate: '', ...partial });

const onTrack = (url: string) => component({ deploymentTracks: [{ id: 't1', url }] });

describe('repoPathOf', () => {
  it('reads org/repo from an https clone url', () => {
    expect(repoPathOf('https://github.com/WSO2/my-repo')).toBe('wso2/my-repo');
    expect(repoPathOf('https://github.com/wso2/my-repo.git')).toBe('wso2/my-repo');
  });

  it('keeps nested groups', () => {
    expect(repoPathOf('https://gitlab.com/group/sub/my-repo')).toBe('group/sub/my-repo');
  });

  it('reads scp-style and credentialed urls', () => {
    expect(repoPathOf('git@github.com:wso2/my-repo.git')).toBe('wso2/my-repo');
    expect(repoPathOf('https://token@github.com/wso2/my-repo')).toBe('wso2/my-repo');
  });

  it('keeps a port out of the path', () => {
    expect(repoPathOf('https://git.example.com:7990/wso2/my-repo')).toBe('wso2/my-repo');
  });

  it('returns null when there is no repo to read', () => {
    expect(repoPathOf(undefined)).toBeNull();
    expect(repoPathOf('  ')).toBeNull();
    expect(repoPathOf('https://github.com/wso2')).toBeNull();
  });
});

describe('componentRepoPath', () => {
  it('prefers the repository field the repository lookup fills', () => {
    expect(componentRepoPath(component({ repository: { organizationApp: 'WSO2', nameApp: 'Repo' } }))).toBe('wso2/repo');
  });

  it('falls back to the deployment track url', () => {
    expect(componentRepoPath(onTrack('https://github.com/wso2/repo'))).toBe('wso2/repo');
  });

  it('skips a track carrying no url', () => {
    expect(componentRepoPath(component({ deploymentTracks: [{ id: 't1' }, { id: 't2', url: 'https://github.com/wso2/repo' }] }))).toBe('wso2/repo');
  });

  it('returns null when the integration reports no repository', () => {
    expect(componentRepoPath(component({}))).toBeNull();
  });
});

describe('isExternalRepoIntegration', () => {
  it('treats an integration built from the project repo as internal', () => {
    expect(isExternalRepoIntegration(onTrack('https://github.com/wso2/repo'), 'WSO2', 'Repo')).toBe(false);
  });

  it('treats an integration built from another repo as external', () => {
    expect(isExternalRepoIntegration(onTrack('https://github.com/wso2/samples'), 'wso2', 'repo')).toBe(true);
  });

  // Nothing to clone means nothing the editor could open, which is what external gates.
  it('treats an integration with no repository as external', () => {
    expect(isExternalRepoIntegration(component({}), 'wso2', 'repo')).toBe(true);
  });

  it('treats nothing as external when the project has no repo linked', () => {
    expect(isExternalRepoIntegration(component({}), undefined, undefined)).toBe(false);
    expect(isExternalRepoIntegration(onTrack('https://github.com/wso2/samples'), 'wso2', undefined)).toBe(false);
  });
});
