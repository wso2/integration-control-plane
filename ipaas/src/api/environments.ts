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

/** Cloud (OpenChoreo) environment / dataplane API. Calls the ipaas-service BFF. */

import type { CloudDataPlane, EnvironmentIdentityProvider, EnvironmentTemplate, Environment, Logger, UpdateLogLevelInput } from '../types/environment';
import { fetchProjectDeploymentPipelines } from './deploymentPipelines';
import { restrictEnvironmentsToPipeline } from '../utils/environmentOrder';
import type { DeploymentPipeline } from '../types/deploymentPipeline';
import { bff, items, q, seg, type ListResponse } from './_client';
// The wire shape and its mapper live in their own module so this file and
// deploymentPipelines.ts can share one definition without importing each other.
import { toEnvironment, type BffEnvironment } from './_environmentShape';

// _orgUuid is kept for devant contract parity; cloud derives the org from the token.

// Environments are org-wide in OpenChoreo; what makes them a *project's* environments, and
// fixes their order, is the promotion chain of the pipeline the project is bound to. Index 0 is
// the first deploy target, so an unordered list would silently retarget deploys.
// Best-effort: a pipeline read failure degrades to the raw list, never an error.
export const fetchEnvironments = async (_orgUuid: string, projectId: string): Promise<Environment[]> => {
  const [environments, pipelines] = await Promise.all([
    bff.get<ListResponse<BffEnvironment>>(`/environments${q({ project: projectId })}`).then((r) => items(r).map(toEnvironment)),
    fetchProjectDeploymentPipelines('', projectId).catch(() => [] as DeploymentPipeline[]),
  ]);
  return restrictEnvironmentsToPipeline(environments, pipelines[0]?.promotion_tree);
};

export const fetchAllEnvironments = (): Promise<Environment[]> => bff.get<ListResponse<BffEnvironment>>('/environments').then((r) => items(r).map(toEnvironment));

// CloudDataPlanes drive devant-era URL derivation (alerting, runtime logs,
// copilot region endpoints). In cloud there is one dataplane with the gateway
// host fixed at deploy time, so when the BFF returns nothing or errors we
// synthesise a single default entry — otherwise pages that gate on loadingCdps
// (Alerts, RuntimeLogsProject) hang while React Query retries.
const DEFAULT_CLOUD_DATAPLANE: CloudDataPlane = {
  id: 'default',
  external_gateway_virtual_host: '',
  internal_gateway_virtual_host: '',
  region: 'default',
  is_cilium: false,
};

export const fetchCloudDataPlanes = async (_orgUuid: string): Promise<CloudDataPlane[]> => {
  try {
    const list = items(await bff.get<ListResponse<CloudDataPlane>>('/dataplanes'));
    return list.length > 0 ? list : [DEFAULT_CLOUD_DATAPLANE];
  } catch {
    return [DEFAULT_CLOUD_DATAPLANE];
  }
};

/** The org's identity platform in the environment, where OAuth clients of its integrations' APIs are created. */
export const fetchEnvironmentIdentityProvider = (environmentName: string): Promise<EnvironmentIdentityProvider> => bff.get<EnvironmentIdentityProvider>(`/environments/${seg(environmentName)}/identity-provider`);

export const fetchLoggers = (environmentId: string, componentId: string): Promise<Logger[]> => bff.get<ListResponse<Logger>>(`/components/${seg(componentId)}/loggers${q({ environment: environmentId })}`).then(items);

export const updateLogLevel = (input: UpdateLogLevelInput): Promise<{ success: boolean; message: string; commandIds: string[] }> => bff.put<{ success: boolean; message: string; commandIds: string[] }>(`/components/${seg(input.componentName)}/loggers`, input);

export const fetchEnvironmentTemplates = (_orgId: string): Promise<EnvironmentTemplate[]> =>
  bff.get<ListResponse<BffEnvironment>>('/environments').then((r) =>
    items(r).map((e) => {
      const { id, name, critical, createdAt } = toEnvironment(e);
      return { id, name, critical, createdAt };
    }),
  );
