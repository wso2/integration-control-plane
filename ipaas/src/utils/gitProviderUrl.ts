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

import { GitProvider } from '../types/credentials';
import { gitProviderBase } from '../paths';
import type { Repository } from '../types/repository';

const trimSlashes = (s: string): string => s.replace(/^\/+|\/+$/g, '');

/**
 * Source repo URL for the create-component payload. `org`/`repo` come from the
 * repo picker; `serverUrl` (GitLab self-managed) comes from the stored credential.
 * Mirrors Devant's per-provider builders.
 */
export function buildRepoUrl(provider: GitProvider, org: string, repo: string, serverUrl?: string): string {
  switch (provider) {
    case GitProvider.BITBUCKET_CLOUD:
      return `${gitProviderBase.bitbucket}/${org}/${repo}`;
    case GitProvider.GITLAB_SELF_MANAGED:
      return `${(serverUrl || gitProviderBase.gitlab).replace(/\/$/, '')}/${org}/${repo}`;
    case GitProvider.BITBUCKET_SERVER:
      return `${(serverUrl || gitProviderBase.bitbucket).replace(/\/$/, '')}/${org}/${repo}`;
    case GitProvider.AZURE_DEVOPS:
      return `${gitProviderBase.azure}/${org}/_git/${repo}`;
    default:
      return `${gitProviderBase.github}/${org}/${repo}`;
  }
}

/**
 * Azure DevOps clone URL for the create-component payload. A repository lives
 * under a project, which `buildRepoUrl` has no slot for. Names may hold spaces
 * and other reserved characters, so each segment is encoded.
 */
export function buildAzureDevOpsRepoUrl(org: string, project: string, repo: string): string {
  return `${gitProviderBase.azure}/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}`;
}

/**
 * Browsable URL to a component's source at its branch and sub-path, unlike
 * `buildRepoUrl` above which builds the bare clone URL. Segments are trimmed
 * because the cloud BFF derives them by splitting the stored clone URL, so a
 * repo registered with a trailing slash leaves one behind.
 */
export function buildRepoBrowseUrl(repo: Repository): string {
  const { gitProvider, branch, bitbucketServerUrl, projectApp } = repo;
  const organizationApp = trimSlashes(repo.organizationApp);
  const nameApp = trimSlashes(repo.nameApp);
  const serverUrl = trimSlashes(repo.serverUrl || '');
  const subPath = trimSlashes(repo.appSubPath || '');
  const suffix = subPath ? `/${subPath}` : '';
  const encodedBranch = encodeURIComponent(branch);
  switch (gitProvider) {
    case 'github':
      return `${gitProviderBase.github}/${organizationApp}/${nameApp}/tree/${encodedBranch}${suffix}`;
    case 'bitbucket':
      return `${gitProviderBase.bitbucket}/${organizationApp}/${nameApp}/src/HEAD${suffix}?at=${encodedBranch}`;
    case 'bitbucket_server': {
      const base = trimSlashes(bitbucketServerUrl || '') || serverUrl;
      return `${base}/projects/${organizationApp}/repos/${nameApp}/browse${suffix}?at=${encodedBranch}`;
    }
    case 'gitlab_self_managed':
      return `${serverUrl}/${organizationApp}/${nameApp}`;
    case 'azure_devops': {
      // Azure resolves `path` against the repo root, so it always needs a leading slash.
      const azurePath = `/${subPath}`;
      return `${buildAzureDevOpsRepoUrl(organizationApp, trimSlashes(projectApp || ''), nameApp)}?path=${encodeURIComponent(azurePath)}&version=GB${encodedBranch}`;
    }
    default:
      return `${gitProviderBase.github}/${organizationApp}/${nameApp}`;
  }
}
