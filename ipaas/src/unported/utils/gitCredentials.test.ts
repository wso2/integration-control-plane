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
import { credentialsForProvider } from './gitCredentials';
import { GitProvider, type GitCredential } from '../../types/credentials';

const cred = (id: string, type: string): GitCredential => ({
  id,
  name: `cred-${id}`,
  createdAt: '',
  organizationUuid: 'org',
  type,
  referenceToken: '',
});

const all: GitCredential[] = [cred('1', GitProvider.GITHUB), cred('2', GitProvider.BITBUCKET_CLOUD), cred('3', GitProvider.BITBUCKET_SERVER), cred('4', GitProvider.GITLAB_SELF_MANAGED), cred('5', GitProvider.AZURE_DEVOPS)];

describe('credentialsForProvider', () => {
  it('matches both Bitbucket cloud and server for a Bitbucket selection', () => {
    expect(credentialsForProvider(all, GitProvider.BITBUCKET_CLOUD).map((c) => c.id)).toEqual(['2', '3']);
    expect(credentialsForProvider(all, GitProvider.BITBUCKET_SERVER).map((c) => c.id)).toEqual(['2', '3']);
  });

  it('matches only the exact type for GitLab', () => {
    expect(credentialsForProvider(all, GitProvider.GITLAB_SELF_MANAGED).map((c) => c.id)).toEqual(['4']);
  });

  it('matches only the exact type for Azure DevOps', () => {
    expect(credentialsForProvider(all, GitProvider.AZURE_DEVOPS).map((c) => c.id)).toEqual(['5']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(credentialsForProvider([], GitProvider.GITLAB_SELF_MANAGED)).toEqual([]);
  });
});
