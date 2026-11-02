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
import { buildRepoUrl, buildRepoBrowseUrl } from './gitProviderUrl';
import { GitProvider } from '../types/credentials';
import type { Repository } from '../types/repository';

const repo = (over: Partial<Repository>): Repository => ({ gitProvider: 'github', organizationApp: 'acme', nameApp: 'svc', branch: 'main', appSubPath: '', ...over }) as Repository;

describe('buildRepoUrl', () => {
  it('builds a GitHub URL', () => {
    expect(buildRepoUrl(GitProvider.GITHUB, 'acme', 'svc')).toBe('https://github.com/acme/svc');
  });
  it('builds a Bitbucket cloud URL', () => {
    expect(buildRepoUrl(GitProvider.BITBUCKET_CLOUD, 'acme', 'svc')).toBe('https://bitbucket.org/acme/svc');
  });
  it('builds a GitLab self-managed URL from the credential server URL (trailing slash trimmed)', () => {
    expect(buildRepoUrl(GitProvider.GITLAB_SELF_MANAGED, 'acme', 'svc', 'https://gitlab.acme.io/')).toBe('https://gitlab.acme.io/acme/svc');
  });
  it('falls back to gitlab.com when no server URL is given', () => {
    expect(buildRepoUrl(GitProvider.GITLAB_SELF_MANAGED, 'acme', 'svc')).toBe('https://gitlab.com/acme/svc');
  });
  it('builds a Bitbucket server URL from the credential server URL (trailing slash trimmed)', () => {
    expect(buildRepoUrl(GitProvider.BITBUCKET_SERVER, 'acme', 'svc', 'https://bitbucket.acme.io/')).toBe('https://bitbucket.acme.io/acme/svc');
  });
  it('builds an Azure DevOps _git URL', () => {
    expect(buildRepoUrl(GitProvider.AZURE_DEVOPS, 'acme org', 'svc repo', undefined, 'Payments & Billing')).toBe('https://dev.azure.com/acme%20org/Payments%20%26%20Billing/_git/svc%20repo');
  });
});

describe('buildRepoBrowseUrl', () => {
  it('builds a GitHub tree URL with the sub-path', () => {
    expect(buildRepoBrowseUrl(repo({ appSubPath: 'samples/json-to-xml' }))).toBe('https://github.com/acme/svc/tree/main/samples/json-to-xml');
  });

  it('omits the trailing slash when the component sits at the repo root', () => {
    expect(buildRepoBrowseUrl(repo({}))).toBe('https://github.com/acme/svc/tree/main');
  });

  it('does not double up when nameApp carries a trailing slash', () => {
    expect(buildRepoBrowseUrl(repo({ nameApp: 'svc/', appSubPath: 'samples/json-to-xml' }))).toBe('https://github.com/acme/svc/tree/main/samples/json-to-xml');
  });

  it('encodes a branch containing a slash', () => {
    expect(buildRepoBrowseUrl(repo({ branch: 'feature/new-ui' }))).toBe('https://github.com/acme/svc/tree/feature%2Fnew-ui');
  });

  it('builds a Bitbucket cloud URL with the branch as a query param', () => {
    expect(buildRepoBrowseUrl(repo({ gitProvider: 'bitbucket', appSubPath: 'svc' }))).toBe('https://bitbucket.org/acme/svc/src/HEAD/svc?at=main');
  });

  it('builds a Bitbucket server URL from the server URL (trailing slash trimmed)', () => {
    expect(buildRepoBrowseUrl(repo({ gitProvider: 'bitbucket_server', bitbucketServerUrl: 'https://bitbucket.acme.io/', appSubPath: 'svc' }))).toBe('https://bitbucket.acme.io/projects/acme/repos/svc/browse/svc?at=main');
  });

  it('falls back to a plain GitHub URL for an unknown provider', () => {
    expect(buildRepoBrowseUrl(repo({ gitProvider: 'gitlab' }))).toBe('https://github.com/acme/svc');
  });

  describe('Azure DevOps path handling', () => {
    const azure = (appSubPath: string) => buildRepoBrowseUrl(repo({ gitProvider: 'azure_devops', projectApp: 'proj', appSubPath }));

    it('uses the repo root when appSubPath is empty', () => {
      expect(azure('')).toBe('https://dev.azure.com/acme/proj/_git/svc?path=%2F&version=GBmain');
    });

    it('keeps a single leading slash when appSubPath is already slash-prefixed', () => {
      expect(azure('/src/foo')).toBe('https://dev.azure.com/acme/proj/_git/svc?path=%2Fsrc%2Ffoo&version=GBmain');
    });

    it('adds the leading slash and drops a trailing one', () => {
      expect(azure('src/foo/')).toBe('https://dev.azure.com/acme/proj/_git/svc?path=%2Fsrc%2Ffoo&version=GBmain');
    });
  });
});
