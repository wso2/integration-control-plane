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

import { GitHub } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import AzureDevOpsIcon from '../assets/icons/AzureDevOpsIcon';
import GitLabIcon from '../assets/icons/GitLabIcon';
import BitbucketIcon from '../assets/icons/BitbucketIcon';
import { GitProvider } from '../types/credentials';

/** Human label per provider (credential-mode import UI). */
export const GIT_PROVIDER_LABEL: Record<string, string> = {
  [GitProvider.GITHUB]: 'GitHub',
  [GitProvider.BITBUCKET_CLOUD]: 'Bitbucket',
  [GitProvider.BITBUCKET_SERVER]: 'Bitbucket',
  [GitProvider.GITLAB_SELF_MANAGED]: 'GitLab',
  [GitProvider.AZURE_DEVOPS]: 'Azure DevOps',
};

/** Provider brand icon at a given size. */
export function gitProviderIcon(provider: string, size = 16): JSX.Element | null {
  switch (provider) {
    case GitProvider.GITHUB:
      return <GitHub size={size} />;
    case GitProvider.BITBUCKET_CLOUD:
    case GitProvider.BITBUCKET_SERVER:
      return <BitbucketIcon size={size} />;
    case GitProvider.GITLAB_SELF_MANAGED:
      return <GitLabIcon size={size} />;
    case GitProvider.AZURE_DEVOPS:
      return <AzureDevOpsIcon size={size} />;
    default:
      return null;
  }
}

/**
 * Providers cloud cannot link to a project yet — their entry points in the
 * project repository dialog render disabled. Component import has its own
 * provider list: Azure DevOps components import through the delegated Entra
 * connection even though project linking stays unavailable.
 */
export const CLOUD_COMING_SOON_PROVIDERS = new Set<string>([GitProvider.BITBUCKET_CLOUD, GitProvider.BITBUCKET_SERVER, GitProvider.GITLAB_SELF_MANAGED, GitProvider.AZURE_DEVOPS]);

/** Tooltip for a provider that is visible but not yet usable, e.g. "Import from GitLab Coming Soon". */
export function providerComingSoonLabel(provider: string): string {
  return `Importing from ${GIT_PROVIDER_LABEL[provider] ?? provider} Coming Soon`;
}
