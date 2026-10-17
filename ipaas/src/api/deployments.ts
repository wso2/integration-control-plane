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
 * Cloud (OpenChoreo) deployment API. Calls the ipaas-service BFF.
 *
 * BFF route status:
 *   live – GET /deployments, GET /deployments/history, GET /releases,
 *          GET  /release-mgt-deployments              (deployment history per env),
 *          GET  /releases/{releaseId}/endpoints       (workload endpoints + spec),
 *          POST /deployments, POST /deployments/promote,
 *          PUT  /deployments/stop, POST /deployments/redeploy (see redeploy note),
 *          POST /builds, GET /builds/{name}/logs,
 *          POST /deploy-prebuilt                      (create workload from image + bind)
 *
 * OpenChoreo model notes:
 *   - "Images" (GET /releases) are the component's successful builds, not
 *     ComponentReleases — the latter are immutable snapshots created only at
 *     deploy time, so they are empty before the first deploy.
 *   - Deploying (POST /deployments) snapshots the current Workload via
 *     generate-release and binds it; OpenChoreo can only release the latest
 *     Workload, so the most recent successful build is what deploys.
 *
 * Write-path note: several POST/PUT handlers in the BFF accept `?projectName=…`.
 * The writes here omit it because the devant-typed input shapes do not carry
 * projectId. The BFF service today resolves the project from componentName;
 * if that tightens, the right fix is to widen the devant input types (separate
 * workstream) rather than adding a query here.
 */

import type { ComponentDeployment, BuildRun, ReleaseMgtDeployment, DeploymentTrackImage, DeployDeploymentTrackInput, PromoteInput, StopDeploymentInput, DeployPrebuiltImageInput, ByoiImage } from '../types/deployment';
import type { EnvEndpoint } from '../types/component';
import type { DeployComponentInput } from '../types/build';
import { bff, items, q, seg, type ListResponse, type MessageResponse } from './_client';
import { getEndpointLabel } from '../utils/endpoints';
import { toVisibilityLabel } from './_visibility';

// Underscored params (_orgHandler, _orgUuid, _projectId, _versionId) are kept
// on these signatures for devant contract parity; cloud does not use them.

// Empty 200 body (no deployment yet) → ./_client's request() resolves it as
// `undefined`, not `null`. React Query treats an `undefined` queryFn result as a
// bug and errors the query, so coalesce here to the declared `| null` contract.
export const fetchComponentDeployment = (_orgHandler: string, _orgUuid: string, componentId: string, _versionId: string, environmentId: string): Promise<ComponentDeployment | null> =>
  bff.get<ComponentDeployment | null>(`/components/${seg(componentId)}/deployments${q({ environmentId })}`).then((d) => d ?? null);

// Shape of GET /components/{name}/releases/{releaseId}/endpoints (BFF
// APIResourcesResponse): the workload's endpoints with resolved URLs and the
// base64 OpenAPI spec. The BFF resolves the env from the releaseId.
interface BffEndpointURL {
  host?: string;
  path?: string;
  port?: number;
  scheme?: string;
}
interface BffEndpointResources {
  name: string;
  displayName?: string;
  type?: string;
  port?: number;
  basePath?: string;
  visibility?: string[];
  visibilityStatus?: EnvEndpoint['visibilityStatus'];
  displayProjectUrl?: boolean;
  urls?: { external?: BffEndpointURL; internal?: BffEndpointURL };
  schemaContent?: string;
}

function buildUrl(u?: BffEndpointURL): string {
  if (!u?.host) return '';
  const scheme = u.scheme || 'https';
  const portSuffix = u.port && u.port !== 80 && u.port !== 443 ? `:${u.port}` : '';
  const path = u.path && u.path !== '/' ? u.path : '';
  return `${scheme}://${u.host}${portSuffix}${path}`;
}

export function toEnvEndpoint(ep: BffEndpointResources, releaseId: string): EnvEndpoint {
  const displayProjectUrl = ep.displayProjectUrl !== false;
  const effectiveLabels = (ep.visibility ?? []).map(toVisibilityLabel).filter((label) => label !== 'Project');
  const publicStatus = ep.visibilityStatus?.public.status;
  if ((publicStatus === 'ENABLING' || publicStatus === 'ENABLED') && !effectiveLabels.includes('Public')) effectiveLabels.push('Public');
  const networkVisibilities = Array.from(new Set([...(displayProjectUrl ? ['Project'] : []), ...effectiveLabels]));
  const publicUrl = buildUrl(ep.urls?.external);
  const internalUrl = buildUrl(ep.urls?.internal);
  const organizationUrl = networkVisibilities.includes('Organization') ? internalUrl : '';
  const projectUrl = displayProjectUrl ? internalUrl : '';
  return {
    id: ep.name,
    releaseId,
    environmentId: '',
    displayName: getEndpointLabel(ep),
    type: ep.type ?? '',
    port: ep.port ?? null,
    visibility: networkVisibilities[0] ?? '',
    networkVisibilities,
    visibilityStatus: ep.visibilityStatus,
    displayProjectUrl,
    publicUrl,
    organizationUrl,
    projectUrl,
    // Not organizationUrl: organization visibility needs to be implemented yet.
    invokeUrl: publicUrl || internalUrl,
    // The swagger view reads activeEndpoint.apimRevisionId; there is no APIM, so carry
    // the base64 OpenAPI here for apim.ts#fetchApimSwagger to decode.
    apimRevisionId: ep.schemaContent ?? null,
  };
}

export const fetchEnvEndpoints = (componentId: string, _versionId: string, releaseId: string): Promise<EnvEndpoint[]> =>
  bff.get<{ endpoints?: BffEndpointResources[] }>(`/components/${seg(componentId)}/releases/${seg(releaseId)}/endpoints`).then((r) => (r?.endpoints ?? []).map((ep) => toEnvEndpoint(ep, releaseId)));

// The fields read from GET /components/{name}/builds (BFF WorkflowRun).
// Newest-first per the BFF, so items[0] is the latest build.
interface BffWorkflowRun {
  name?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  componentName?: string;
  commit?: string;
  trigger?: 'initial' | 'manual' | 'automatic';
}

// OpenChoreo workflow-run status -> the build vocabulary the build card expects
// (BuildRun.status / .conclusion).
const WORKFLOW_STATUS_MAP: Record<string, { status: string; conclusion: string }> = {
  Succeeded: { status: 'completed', conclusion: 'success' },
  Failed: { status: 'completed', conclusion: 'failure' },
  Running: { status: 'in_progress', conclusion: '' },
  Pending: { status: 'queued', conclusion: '' },
};

// Fallback id for runs whose name carries no millisecond stamp.
function hashRunName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// The Build ID: the unixMillis suffix of a `{componentName}-{unixMillis}` run
// name. The BFF sends no numeric id, and BuildRun.id is numeric in the contract.
function runStamp(name: string, componentName?: string): number | null {
  const stamp = componentName && name.startsWith(`${componentName}-`) ? name.slice(componentName.length + 1) : name.slice(name.lastIndexOf('-') + 1);
  if (!/^\d+$/.test(stamp)) return null;
  const n = Number(stamp);
  return Number.isSafeInteger(n) ? n : null;
}

// A run is addressed by name — for logs, and for the Build ID. Runs without one
// are dropped rather than mapped to a nameless BuildRun.
const hasRunName = (run: BffWorkflowRun): run is BffWorkflowRun & { name: string } => !!run.name;

function toBuildRun(run: BffWorkflowRun & { name: string }): BuildRun {
  const name = run.name;
  const { status, conclusion } = WORKFLOW_STATUS_MAP[run.status ?? ''] ?? WORKFLOW_STATUS_MAP.Pending;
  const stamp = runStamp(name, run.componentName);
  return {
    id: stamp ?? hashRunName(name),
    sha: run.commit ?? '',
    startedAt: run.startedAt ?? '',
    completedAt: run.completedAt ?? '',
    status,
    conclusion,
    conclusionV2: conclusion,
    isAutoDeploy: run.trigger === 'automatic',
    isTriggeredAtCreation: run.trigger === 'initial',
    name,
    failureReason: 0,
    sourceCommitId: run.commit ?? '',
    buildRef: name, // == runId consumed by useBuildRunLogs
  };
}

// Devant's deploymentStatusByVersion returns build records; the cloud build feed
// is the BFF builds (WorkflowRun) list, reshaped to the same BuildRun
// contract. (The BFF /deployments/history endpoint is release-binding state, not
// builds, so it is intentionally not used here.)
export const fetchDeploymentStatus = (componentId: string, _versionId: string): Promise<BuildRun[]> =>
  bff
    .get<ListResponse<BffWorkflowRun>>(`/components/${seg(componentId)}/builds`)
    .then(items)
    .then((runs) => runs.filter(hasRunName).map(toBuildRun));

// Shape of GET /components/{name}/release-mgt-deployments items (BFF
// ReleaseMgtDeployment): the BFF serializes these in snake_case, but the
// consumer (DeploymentHistoryDrawer) reads the camelCase ReleaseMgtDeployment
// type, so the boundary is remapped below.
interface BffReleaseMgtDeployment {
  id?: string;
  environment_id?: string;
  status?: string;
  release_name?: string;
  deployed_at?: string;
  deployed_by?: string;
  commit_hash?: string;
  comment?: string;
  created_at?: string;
}

function toReleaseMgtDeployment(d: BffReleaseMgtDeployment): ReleaseMgtDeployment {
  return {
    id: d.id ?? '',
    releaseMgtId: '',
    environmentId: d.environment_id ?? '',
    deploymentName: d.release_name ?? '',
    attempt: 0,
    configRevision: 0,
    status: d.status ?? '',
    comment: d.comment ?? '',
    deployedAt: d.deployed_at ?? '',
    deployedBy: d.deployed_by ?? '',
    releaseName: d.release_name ?? '',
    commitHash: d.commit_hash ?? '',
    componentConfigs: { configMappingRevision: 0, schemaBasedConfigRevision: 0, apiSettings: '' },
    createdAt: d.created_at ?? '',
  };
}

// Wired — the BFF serves this from GetDeploymentHistory (one entry per current
// ReleaseBinding) and maps the binding's readiness to SUCCESS/FAILED/PENDING.
export const fetchReleaseMgtDeployments = (_orgUuid: string, _projectId: string, componentId: string, _versionId: string, environmentId: string): Promise<ReleaseMgtDeployment[]> =>
  bff.get<ListResponse<BffReleaseMgtDeployment>>(`/components/${seg(componentId)}/release-mgt-deployments${q({ environment: environmentId })}`).then((r) => items(r).map(toReleaseMgtDeployment));

// Deployable images are the component's successful builds (the BFF derives them
// from WorkflowRuns, not ComponentReleases, which only exist post-deploy).
export const fetchDeploymentTrackImages = (componentId: string, _versionId: string): Promise<DeploymentTrackImage[]> => bff.get<ListResponse<DeploymentTrackImage>>(`/components/${seg(componentId)}/releases`).then(items);

// The BFF has no BYOI image-history endpoint, so report an empty history.
export const fetchByoiImageHistory = (_orgUuid: string, _projectId: string, _componentId: string, _versionId: string): Promise<ByoiImage[]> => Promise.resolve([]);

export const deployDeploymentTrack = (input: DeployDeploymentTrackInput): Promise<string> => bff.post<MessageResponse>(`/components/${seg(input.componentId)}/deployments`, input).then((r) => r?.message ?? '');

export const triggerBuild = (input: DeployComponentInput): Promise<{ message: string; success: boolean }> =>
  bff.post<{ message: string; success: boolean }>(`/components/${seg(input.componentId)}/builds`, input).then((r) => r ?? { message: '', success: true });

export const promote = (input: PromoteInput): Promise<string> => bff.post<MessageResponse>(`/components/${seg(input.componentId)}/deployments/promote`, input).then((r) => r?.message ?? '');

export const stopDeployment = (input: StopDeploymentInput): Promise<string> => bff.put<MessageResponse>(`/components/${seg(input.componentId)}/deployments/stop`, input).then((r) => r?.message ?? '');

// Redeploy by releaseId — the BFF resolves the env from the release binding and
// re-activates it (the env-keyed /deployments/redeploy route requires an env the
// devant-typed input does not carry).
export const redeployDeployment = (input: { orgHandler: string; componentId: string; releaseId: string; type: string; releaseMgtReleaseId?: string; releaseMgtDeploymentId?: string }): Promise<string> =>
  bff.post<MessageResponse>(`/components/${seg(input.componentId)}/releases/${seg(input.releaseId)}/redeploy`, {}).then((r) => r?.message ?? '');

// Deploys the prebuilt image: the BFF creates a Workload from imageUrl (baking any
// supplied config values onto spec.container), snapshots it via generate-release,
// and binds it to the project's first environment. `input` already carries
// componentId/imageUrl/appBranch/configurations, so it is posted as-is.
export const deployPrebuiltImage = (input: DeployPrebuiltImageInput): Promise<string> => bff.post<MessageResponse>(`/components/${seg(input.componentId)}/deploy-prebuilt`, input).then((r) => r?.message ?? '');
