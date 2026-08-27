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

import type { CloudDataPlane, CreateEnvironmentData, EnvDeletionEligibility, EnvironmentTemplate, Environment, EnvironmentInput, Logger, ProjectDeployedComponents, UpdateLogLevelInput } from '../../types/environment';
import { toHandler } from '../../utils/string';
import { appendEnvironmentToDefaultPipeline } from './deploymentPipelines';
import { bff, items, q, seg, type ListResponse, type MessageResponse } from './_client';
// The wire shape and its mapper live in their own module so this file and
// deploymentPipelines.ts can share one definition without importing each other.
import { toEnvironment, type BffEnvironment } from './_environmentShape';

// _orgUuid is kept for devant contract parity; cloud derives the org from the token.

export const fetchEnvironments = (_orgUuid: string, projectId: string): Promise<Environment[]> => bff.get<ListResponse<BffEnvironment>>(`/environments${q({ project: projectId })}`).then((r) => items(r).map(toEnvironment));

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

// Per-runtime log-level control is an ICP feature — the BFF routes behind these
// were ICP GraphQL calls and have been removed. OpenChoreo has no equivalent, and
// nothing in this build renders a log-level control.
export const fetchLoggers = (_environmentId: string, _componentId: string): Promise<Logger[]> => {
  throw new Error('[cloud] environments.fetchLoggers: not implemented');
};

export const updateLogLevel = (_input: UpdateLogLevelInput): Promise<{ success: boolean; message: string; commandIds: string[] }> => {
  throw new Error('[cloud] environments.updateLogLevel: not implemented');
};

// Every environment must bind to a data plane. Omitting the ref makes OpenChoreo
// look for a DataPlane named "default" in the namespace and fail with "DataPlane
// not found" when it is absent, so the name is always sent explicitly; the BFF
// wraps it in a namespaced DataPlane ref (the kind `GET /dataplanes` lists). The
// ref is immutable once set, so an environment bound to the wrong plane can only
// be fixed by recreating it. Name is slugged to satisfy the RFC 1123
// metadata.name rule.
const DEFAULT_DATA_PLANE = 'default';
export const createEnvironment = async (input: EnvironmentInput, dataPlaneName?: string): Promise<Environment> => {
  const created = await bff.post<BffEnvironment>('/environments', {
    name: toHandler(input.name),
    displayName: input.name,
    description: input.description,
    isProduction: input.critical,
    dataPlaneRef: dataPlaneName || DEFAULT_DATA_PLANE,
  });
  const environment = toEnvironment(created);

  // Best effort: an environment outside every promotion chain cannot be deployed
  // to. The environment itself already exists at this point and the CD Pipelines
  // editor is the recovery path, so a failure here must not read as a failed create.
  try {
    await appendEnvironmentToDefaultPipeline(environment.id);
  } catch (err) {
    console.warn(`[cloud] environment '${environment.id}' created but not added to the default pipeline`, err);
  }
  return environment;
};

// The BFF update accepts only displayName/description/isProduction — the slug
// (name) is the immutable identity, so a rename edits the label only.
export const updateEnvironment = (input: EnvironmentInput & { environmentId: string }): Promise<Environment> =>
  bff.put<BffEnvironment>(`/environments/${seg(input.environmentId)}`, { displayName: input.name, description: input.description, isProduction: input.critical }).then(toEnvironment);

export const deleteEnvironment = (environmentId: string): Promise<string> => bff.delete<MessageResponse>(`/environments/${seg(environmentId)}`).then((r) => r?.message ?? '');

export const fetchEnvironmentTemplates = (_orgId: string): Promise<EnvironmentTemplate[]> =>
  bff.get<ListResponse<BffEnvironment>>('/environments').then((r) =>
    items(r).map((e) => {
      const { id, name, critical, createdAt } = toEnvironment(e);
      return { id, name, critical, createdAt };
    }),
  );

// The org-environment surface is what the Environments settings page drives. In
// cloud it is the same BFF environment, so this maps onto createEnvironment
// rather than the devops REST flow. `dnsPrefix`/`vhost` have no OpenChoreo
// counterpart — the gateway host is fixed at deploy time — and are ignored.
export const createOrgEnvironment = async (_orgUuid: string, input: CreateEnvironmentData & { vhost: string }): Promise<void> => {
  await createEnvironment({ name: input.name, description: input.description ?? '', critical: input.isProd }, input.dataplaneId);
};

// An environment template id is the environment slug (see fetchEnvironmentTemplates).
export const deleteEnvironmentTemplate = async (_orgUuid: string, templateId: string): Promise<void> => {
  await deleteEnvironment(templateId);
};

/** A `{ name, displayName }` BFF row — projects and components share the shape here. */
interface BffNamed {
  name: string;
  displayName?: string;
}

/**
 * Stands in for a component whose deployment state could not be read. It has to
 * be a real entry in `deployedComponentsDetails`, not just `deletable: false`,
 * because the delete dialog gates its confirm button on that list alone.
 */
const UNVERIFIED_COMPONENT = 'unknown (deployment state could not be read)';

/** Components of `project` deployed to `environmentId`. Never rejects. */
const deployedInProject = async (project: BffNamed, environmentId: string): Promise<ProjectDeployedComponents> => {
  const detail = { projectId: project.name, projectName: project.displayName || project.name };

  let components: BffNamed[];
  try {
    components = items(await bff.get<ListResponse<BffNamed>>(`/projects/${seg(project.name)}/components`));
  } catch {
    return { ...detail, components: [{ componentName: UNVERIFIED_COMPONENT }] };
  }

  const deployed = await Promise.all(
    components.map(async (component) => {
      const entry = { componentId: component.name, componentName: component.displayName || component.name };
      try {
        // "Not deployed" is 200 with a null body, so only a genuine failure lands
        // in the catch — an unreadable component is unknown, not empty.
        return (await bff.get<unknown>(`/components/${seg(component.name)}/deployments${q({ environmentId })}`)) ? entry : null;
      } catch {
        return entry;
      }
    }),
  );
  return { ...detail, components: deployed.filter((c) => c != null) };
};

// OpenChoreo has no "what is deployed here" query, so eligibility is derived by
// walking projects -> components -> that component's deployment in this
// environment. That is O(projects + components) requests, which is acceptable on
// a settings page opened on demand.
//
// Deleting an Environment cascades and takes running workloads with it, so this
// fails closed: anything that cannot be verified is reported as deployed. That
// also means the function must never reject — a rejected query leaves the dialog
// with no data at all, which it reads as "nothing deployed" and enables delete.
export const getEnvDeleteEligibility = async (_orgUuid: string, templateId: string): Promise<EnvDeletionEligibility> => {
  const blockAll = (reason: string): EnvDeletionEligibility => ({
    templateId,
    envName: templateId,
    deletable: false,
    deployedComponentsDetails: [{ projectName: reason, components: [{ componentName: UNVERIFIED_COMPONENT }] }],
  });

  let projects: BffNamed[];
  try {
    projects = items(await bff.get<ListResponse<BffNamed>>('/projects'));
  } catch {
    return blockAll('All projects');
  }

  const deployedComponentsDetails = (await Promise.all(projects.map((project) => deployedInProject(project, templateId)))).filter((p) => (p.components?.length ?? 0) > 0);

  return { templateId, envName: templateId, deletable: deployedComponentsDetails.length === 0, deployedComponentsDetails };
};
