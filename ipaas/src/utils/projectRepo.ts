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

import type { Component } from '../types/component';

/** Every segment after the host, so a nested GitLab group survives as `group/sub/repo`. */
export function repoPathOf(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const path = url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^[^@/]*@/, '')
    // scp-style `host:org/repo`, but not the port in `host:7990/org/repo`.
    .replace(/:(?!\d)/, '/');
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  return parts.slice(1).join('/').replace(/\.git$/i, '').toLowerCase();
}

/** The repository lookup fills `repository`; without it, the deployment track's URL is used. */
export function componentRepoPath(component: Component): string | null {
  const { organizationApp, nameApp } = component.repository ?? {};
  if (organizationApp && nameApp) return `${organizationApp}/${nameApp}`.toLowerCase();
  return repoPathOf(component.deploymentTracks?.find((t) => t.url)?.url);
}

/** An integration the Cloud Editor cannot open: a different repo, or none at all. */
export function isExternalRepoIntegration(component: Component, projectGitOrg?: string, projectGitRepo?: string): boolean {
  if (!projectGitOrg || !projectGitRepo) return false;
  return componentRepoPath(component) !== `${projectGitOrg}/${projectGitRepo}`.toLowerCase();
}
