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

/**
 * Cloud prebuilt-integrations API.
 *
 * The catalog and its per-integration assets are static files on a public URL
 * (window.API_CONFIG.prebuiltIntegrationsUrl, GitHub raw by default) — those
 * fetches are identical to devant's. The setup-flow functions delegate to the
 * cloud BFF functions already wired in the sibling domain files instead of
 * devant's GraphQL/system APIs.
 */

import { normalizePrebuiltIntegrations } from '../utils/prebuilt';
import type { SchemaConfigItem } from '../types/configuration';
import type { PrebuiltIntegration, PrebuiltIntegrationsData, PrebuiltComponentRef, PrebuiltEnvironmentRef } from '../types/prebuilt';
import { fetchComponentByHandler, fetchComponentNameAvailability } from './components';
import { fetchEnvironments } from './environments';
import { fetchCommitHistory } from './repository';
import { saveSchemaConfig } from './configuration';

export async function fetchPrebuiltIntegrations(url: string, signal?: AbortSignal): Promise<PrebuiltIntegrationsData> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const data = (await response.json()) as { prebuiltIntegrations: PrebuiltIntegration[] };
  if (!Array.isArray(data?.prebuiltIntegrations)) throw new Error('Invalid response format: missing prebuiltIntegrations array');
  return normalizePrebuiltIntegrations(data);
}

export async function fetchPrebuiltAsset(baseUrl: string, filename: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${baseUrl.replace(/\/?$/, '/')}${filename}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// Devant resolves a free name via GraphQL; cloud asks the BFF, which checks the
// candidate against the project's K8s component names. A random suffix is the
// last resort so the prebuilt flow never stalls on a name collision.
export async function checkNameAvailability(projectId: string, candidate: string): Promise<string> {
  try {
    const result = await fetchComponentNameAvailability(projectId, candidate);
    if (result.componentNameUnique) return candidate;
    return result.alternateComponentName || `${candidate}-${Math.random().toString(36).slice(2, 7)}`;
  } catch {
    return `${candidate}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

export async function fetchComponentDetail(projectId: string, handler: string): Promise<PrebuiltComponentRef> {
  const component = await fetchComponentByHandler(projectId, handler);
  return { id: component.id, handler: component.handler, deploymentTracks: (component.deploymentTracks ?? []).map((t) => ({ id: t.id })) };
}

export async function fetchFirstEnvironment(orgUuid: string, projectId: string): Promise<PrebuiltEnvironmentRef> {
  const environments = await fetchEnvironments(orgUuid, projectId);
  const env = environments[0];
  if (!env) throw new Error('No environments found for this project');
  // Devant keys config on a per-environment templateId; OpenChoreo has no such
  // concept, so the environment slug (env.id) is the identity used everywhere —
  // it is both the config-schema path segment and the ReleaseBinding
  // spec.environment the deploy binds to, keeping saved config on the right env.
  return { id: env.id, templateId: env.id };
}

export async function fetchLatestCommitSha(componentId: string, branch: string): Promise<string> {
  // The commit SHA is optional metadata for the saved config. A freshly created
  // prebuilt component often has no resolvable commit history yet, so return an
  // empty string rather than throwing — otherwise the caller's config save (which
  // shares a try/catch with this call) would be skipped entirely.
  const commits = await fetchCommitHistory(componentId, branch);
  const latest = commits.find((c) => c.isLatest) ?? commits[0];
  return latest?.sha ?? '';
}

export async function savePrebuiltConfig(projectId: string, componentId: string, envId: string, deploymentTrackId: string, configurations: SchemaConfigItem[], commitHash: string): Promise<void> {
  // Devant stamps each value with the target environment before saving; keep
  // parity so the saved config is scoped the same way.
  const configurationsWithEnv = configurations.map((item) => ({
    ...item,
    values: item.values.map((v) => ({ ...v, environmentUuid: envId })),
  }));
  await saveSchemaConfig({ projectId, componentId, envId, deploymentTrackId, configurations: configurationsWithEnv, commitHash });
}
