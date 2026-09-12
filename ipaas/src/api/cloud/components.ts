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

/** Cloud (OpenChoreo) component API. Calls the ipaas-service BFF. */

import type {
  Component,
  ComponentDetail,
  Endpoint,
  EnvEndpoint,
  CreateComponentInput,
  UpdateComponentInput,
  UpdateAutoDeployInput,
  UpdateEndpointInput,
  GenerateComponentEndpointsInput,
  ComponentNameAvailability,
  DisplayType,
  DeploymentTrack,
  ApiVersion,
  CreateDeploymentTrackInput,
  DeleteTrackResult,
  CheckDeletableResult,
} from '../../types/component';
import type { CreateMcpProxyComponentInput } from '../../types/mcpProxy';
import { bff, items, q, seg, type ListResponse } from './_client';
import { parseGitHubUrl } from '../../utils/github';
import { toVisibilityWire } from './_visibility';
import { OTHER_BUILDPACK } from '../../constants/integrations';

// Underscored params (_orgHandler, _versionId, _releaseId) are kept on exported
// signatures so cloud matches the devant contract that tsconfig type-checks
// against; the cloud BFF does not need them.

// Devant's deleteComponent result shape. Mirrored locally (devant keeps it
// file-local too) so cloud preserves the same contract.
interface DeleteComponentResult {
  status: string;
  canDelete: boolean;
  message: string;
  encodedData: string;
}

// Shape returned by GET /components/{name}/deployment-track on the BFF; fields
// are optional because the BFF returns null when no track has been created yet.
interface BffDeploymentTrack {
  id?: string;
  branch?: string;
  latest?: boolean;
  autoDeployEnabled?: boolean;
}

// OpenChoreo annotation keys the BFF reads displayName/description back from
// (clients/openchoreo/component_client.go#normalizeComponent). They must be set
// on create or the component round-trips with an empty name/description.
const ANN_DISPLAY_NAME = 'openchoreo.dev/display-name';
const ANN_DESCRIPTION = 'openchoreo.dev/description';
// OpenChoreo has no first-class "prebuilt" component flag, so a prebuilt
// integration is marked with this annotation; the BFF reads it back to report
// component.isPrebuilt and to deploy the supplied image instead of building.
const ANN_PREBUILT = 'openchoreo.dev/prebuilt';

// Frontend DisplayType -> OpenChoreo ComponentType reference + Workflow
// (buildpack builder). `componentType` is the {workloadType}/{componentTypeName}
// pair required by the Component CRD; `workflow` must appear in that
// ComponentType's spec.allowedWorkflows.
//
// Service components use deployment/integration-as-api, the integration platform
// fronts every endpoint with the WSO2 API Platform gateway (apip)
//
// The Ballerina (BI) entries resolve against real cluster resources: every
// ComponentType referenced here (deployment/integration-as-api,
// cronjob/scheduled-task, deployment/event-integration) is provisioned with
// ballerina-buildpack-builder in its allowedWorkflows.
const DISPLAY_TYPE_MAP: Record<DisplayType, { componentType: string; workflow: string }> = {
  ballerinaService: { componentType: 'deployment/integration-as-api', workflow: 'ballerina-buildpack-builder' },
  scheduledTask: { componentType: 'cronjob/scheduled-task', workflow: 'ballerina-buildpack-builder' },
  manualTrigger: { componentType: 'cronjob/scheduled-task', workflow: 'ballerina-buildpack-builder' },
  webhook: { componentType: 'deployment/event-integration', workflow: 'ballerina-buildpack-builder' },
  ballerinaEventHandler: { componentType: 'deployment/event-integration', workflow: 'ballerina-buildpack-builder' },
  miApiService: { componentType: 'deployment/integration-as-api', workflow: 'mi-buildpack-builder' },
  miCronjob: { componentType: 'cronjob/scheduled-task', workflow: 'mi-buildpack-builder' },
  miJob: { componentType: 'cronjob/scheduled-task', workflow: 'mi-buildpack-builder' },
  miWebhook: { componentType: 'deployment/event-integration', workflow: 'mi-buildpack-builder' },
  miEventHandler: { componentType: 'deployment/event-integration', workflow: 'mi-buildpack-builder' },
};

// Reverse map (read path): the BFF returns a composite displayType from
// buildDisplayType() — lower(buildpackType)+Cap(componentType), e.g. "biService"
// / "miService". The console's label resolvers only recognise the canonical
// frontend DisplayType values, so we translate using the logical componentType
// the BFF also returns plus the BI/MI buildpack prefix.
const LOGICAL_TYPE_TO_DISPLAY_TYPE: Record<string, { bi: string; mi: string }> = {
  service: { bi: 'ballerinaService', mi: 'miApiService' },
  automation: { bi: 'scheduledTask', mi: 'miCronjob' },
  eventIntegration: { bi: 'ballerinaEventHandler', mi: 'miEventHandler' },
  proxy: { bi: 'proxy', mi: 'proxy' },
};

function withFrontendDisplayType<T extends Component>(c: T): T {
  // Rewriting a foreign runtime to a BI/MI displayType would make it read as one of ours.
  if (c.buildpackType === OTHER_BUILDPACK) return c;
  const isMI = (c.displayType ?? '').toLowerCase().startsWith('mi');
  // File integrations reuse the BI/MI service build runtime, so the app
  // distinguishes them by componentSubType — not displayType (identifyIntegration,
  // getDisplayLabel and ArchitectureCard all key off it). The BFF returns
  // componentType 'fileIntegration' but no subType, so surface the service
  // displayType plus the file componentSubType; otherwise the overview would
  // classify them as 'unsupported'.
  // TODO: Remove this SubType logic once WIP is decommissioned.
  if (c.componentType === 'fileIntegration') {
    return { ...c, displayType: isMI ? 'miApiService' : 'ballerinaService', componentSubType: isMI ? 'miFileIntegration' : 'ballerinaFileIntegration' };
  }
  if (c.componentType === 'aiAgent') {
    return { ...c, displayType: isMI ? 'miApiService' : 'ballerinaService', componentSubType: 'aiAgent' };
  }
  if (c.componentType === 'mcpServer') {
    return { ...c, displayType: isMI ? 'miApiService' : 'ballerinaService', componentSubType: 'MCP' };
  }
  const entry = LOGICAL_TYPE_TO_DISPLAY_TYPE[c.componentType ?? ''];
  if (!entry) return c;
  return { ...c, displayType: isMI ? entry.mi : entry.bi };
}

function resolveCreateMapping(input: CreateComponentInput): { componentType: string; workflow: string } {
  const mapping = DISPLAY_TYPE_MAP[input.displayType] ?? DISPLAY_TYPE_MAP.ballerinaService;
  const isFileIntegration = input.componentSubType === 'ballerinaFileIntegration' || input.componentSubType === 'miFileIntegration';
  if (isFileIntegration) return { ...mapping, componentType: 'deployment/file-integration' };
  // The BFF routes create, build, deploy and delete to agent-manager on this type.
  // 'deployment/ai-agent' names the agents created before that move.
  if (input.componentSubType === 'aiAgent') return { ...mapping, componentType: 'proxy/agent-api' };
  if (input.componentSubType === 'MCP') return { ...mapping, componentType: 'deployment/mcp-server' };
  return mapping;
}

// Reshape the flat CreateComponentInput into the K8s-style { metadata, spec }
// body the OpenChoreo BFF expects. The frontend `name` is already the RFC 1123
// slug, so it maps straight to metadata.name; displayName/description ride
// along as annotations.
function toBffCreateComponentBody(input: CreateComponentInput) {
  const mapping = resolveCreateMapping(input);
  const appPath = (input.repositorySubPath ?? '/').replace(/^\/+/, '');
  // GitHub-App (private repo) mode: the workflow repository must carry an
  // explicit secretRef:"" (OpenChoreo then renders no ExternalSecret;
  // git-app-service provisions the per-run clone secret), and the BFF receives
  // the source binding to persist. Public/sample/prebuilt bodies are unchanged.
  const gitHubRepo = input.gitHubAppInstallationId ? parseGitHubUrl(input.srcGitRepoUrl ?? '') : null;
  return {
    metadata: {
      name: input.name,
      annotations: {
        [ANN_DISPLAY_NAME]: input.displayName,
        [ANN_DESCRIPTION]: input.description ?? '',
        // Marked prebuilt so the BFF reports isPrebuilt and the deploy path uses
        // the supplied image; the annotation is omitted for normal components.
        ...(input.isPrebuilt ? { [ANN_PREBUILT]: 'true' } : {}),
      },
    },
    spec: {
      owner: { projectName: input.projectId },
      componentType: { kind: 'ComponentType', name: mapping.componentType },
      autoDeploy: input.enableAutoDeploy ?? true,
      // Prebuilt integrations deploy a ready-made image and must not trigger a
      // git build on create; everything else builds from source.
      autoBuild: !input.isPrebuilt,
      workflow: {
        kind: 'ClusterWorkflow',
        name: mapping.workflow,
        parameters: {
          repository: {
            url: input.srcGitRepoUrl ?? '',
            revision: { branch: input.repositoryBranch ?? '' },
            appPath,
            ...(gitHubRepo ? { secretRef: '' } : {}),
          },
        },
      },
    },
    ...(gitHubRepo
      ? {
          githubApp: {
            installationId: Number(input.gitHubAppInstallationId),
            owner: gitHubRepo.org,
            repo: gitHubRepo.repo,
            branch: input.repositoryBranch ?? '',
            appPath,
            repositoryUrl: input.srcGitRepoUrl ?? '',
          },
        }
      : {}),
  };
}

export const fetchComponents = (_orgHandler: string, projectId: string): Promise<Component[]> => bff.get<ListResponse<Component>>(`/projects/${seg(projectId)}/components`).then((r) => items(r).map(withFrontendDisplayType));

// The BFF's GET /projects/{p}/components/{name} returns an empty stub today
// (TODO: revert to a single GET once the detail endpoint is live). Until then
// we derive the component from the (wired) list endpoint and enrich it with
// its deployment track — otherwise the detail page renders empty id/handler
// and downstream writes (e.g. updateComponent) PUT to an empty name and 404.
export const fetchComponentByHandler = async (projectId: string, componentHandler: string): Promise<ComponentDetail> => {
  const components = await fetchComponents('', projectId);
  const match = components.find((c) => c.handler === componentHandler || c.id === componentHandler);
  if (!match) throw new Error(`Component "${componentHandler}" not found in project "${projectId}"`);

  // Track enrichment is best-effort: the detail page is still usable without it.
  let track: BffDeploymentTrack | null = null;
  try {
    track = await bff.get<BffDeploymentTrack | null>(`/components/${seg(match.handler)}/deployment-track`);
  } catch {
    // Ignore — a synthetic track is used below.
  }

  // OpenChoreo synthesizes a track (id == UID) only for components whose
  // spec.workflow.parameters.repository is set; otherwise the BFF returns an
  // empty track. Consumers gate build/endpoint queries on a non-empty versionId
  // (== selected track id), so fall back to the component id as a stable track
  // id to keep those queries enabled. The component id is always non-empty.
  const deploymentTracks: DeploymentTrack[] = [
    track?.id ? { id: track.id, branch: track.branch, latest: track.latest, autoDeployEnabled: track.autoDeployEnabled } : { id: match.id, branch: track?.branch, latest: true, autoDeployEnabled: track?.autoDeployEnabled },
  ];

  // Devant exposes the track also as apiVersions, and pages that need a
  // versionId (Build, Alerts) read it from there. Cloud has a single implicit
  // version per component, so mirror the synthesized track; apiVersion has no
  // OpenChoreo equivalent and stays empty.
  const apiVersions: ApiVersion[] = deploymentTracks.map((t) => ({ id: t.id, apiVersion: '', branch: t.branch ?? '', latest: t.latest ?? true }));

  // orgHandler is unused by cloud consumers but kept in the shape for parity.
  return { ...match, orgHandler: '', deploymentTracks, apiVersions };
};

// awaits: real /endpoints mapping in the BFF (currently returns an empty list).
export const fetchComponentEndpoints = (componentId: string, _versionId: string): Promise<Endpoint[]> => bff.get<ListResponse<Endpoint>>(`/components/${seg(componentId)}/endpoints`).then(items);

export const fetchComponentNameAvailability = (projectId: string, candidate: string): Promise<ComponentNameAvailability> => bff.get<ComponentNameAvailability>(`/projects/${seg(projectId)}/components/name-availability${q({ candidate })}`);

export const fetchComponentEndpointSpec = (componentId: string, _versionId: string, endpointId: string): Promise<string | null> =>
  bff.get<{ spec: string | null }>(`/components/${seg(componentId)}/endpoints/${seg(endpointId)}/spec`).then((r) => r.spec ?? null);

export const createComponent = (input: CreateComponentInput): Promise<Component> =>
  bff.post<Component & { warning?: string }>(`/projects/${seg(input.projectId)}/components`, toBffCreateComponentBody(input)).then((created) => {
    // Non-fatal post-create failure reported by the BFF (e.g. GitHub source
    // binding not persisted, first build not started). The component exists;
    // a build can be retried from the component page.
    if (created.warning) console.warn(`[cloud] component created with warning: ${created.warning}`);
    return withFrontendDisplayType(created);
  });

export const deleteComponent = (input: { orgHandler: string; componentId: string; projectId: string }): Promise<DeleteComponentResult> =>
  bff.delete<DeleteComponentResult | null>(`/projects/${seg(input.projectId)}/components/${seg(input.componentId)}`).then((r) => r ?? { status: 'success', canDelete: true, message: '', encodedData: '' });

// OpenChoreo addresses components by name (== handler == id here), and the BFF
// UpdateComponent only consumes displayName/description/labels. Use the handler
// so the name segment is never empty, and send just the mutable fields.
export const updateComponent = (input: UpdateComponentInput): Promise<Component> => {
  // labels is omitted rather than sent empty when unset, so a name or
  // description edit leaves the stored labels alone instead of clearing them.
  const body = {
    displayName: input.displayName,
    description: input.description,
    ...(input.labels !== undefined && { labels: input.labels }),
  };
  return bff.put<Component>(`/projects/${seg(input.projectId)}/components/${seg(input.handler || input.id)}`, body).then(withFrontendDisplayType);
};

export const updateAutoDeployEnabled = (input: UpdateAutoDeployInput): Promise<{ id: string; autoDeployEnabled: boolean }> => bff.patch<{ id: string; autoDeployEnabled: boolean }>(`/components/${seg(input.componentId)}/auto-deploy`, input);

export const generateComponentEndpoints = (input: GenerateComponentEndpointsInput): Promise<EnvEndpoint[]> => bff.post<ListResponse<EnvEndpoint>>(`/components/${seg(input.componentId)}/endpoints/generate`, input).then(items);

export const generateComponentEnvironmentJwtSecret = (componentId: string, environmentId: string): Promise<string> => bff.post<{ secret: string }>(`/components/${seg(componentId)}/environments/${seg(environmentId)}/jwt-secret`).then((r) => r?.secret ?? '');

export const rotateComponentEnvironmentJwtSecret = (componentId: string, environmentId: string): Promise<string> =>
  bff.put<{ secret: string }>(`/components/${seg(componentId)}/environments/${seg(environmentId)}/jwt-secret/rotate`).then((r) => r?.secret ?? '');

// Sends visibility only; projectName resolves the component's release bindings.
export const updateEndpoint = (input: UpdateEndpointInput): Promise<object> =>
  bff.put<object>(`/components/${seg(input.componentId)}/endpoints/${seg(input.endpointId)}/visibility${q({ projectName: input.projectId })}`, {
    visibility: input.networkVisibilities.map(toVisibilityWire),
  });

// MCP proxy (convert from an existing HTTP API) is a wip/APIM-only flow.
export const createMcpProxyComponent = (_input: CreateMcpProxyComponentInput): Promise<Component> => {
  throw new Error('[cloud] components.createMcpProxyComponent: not implemented');
};

export const createDeploymentTrack = (_input: CreateDeploymentTrackInput): Promise<DeploymentTrack> => {
  throw new Error('[cloud] components.createDeploymentTrack: not implemented');
};

export const deleteDeploymentTrack = (_input: { orgHandler: string; componentId: string; projectId: string; deploymentTrackId: string }): Promise<DeleteTrackResult> => {
  throw new Error('[cloud] components.deleteDeploymentTrack: not implemented');
};

export const checkDeploymentTrackDeletable = (_input: { orgHandler: string; componentId: string; projectId: string; deploymentTrackId: string }): Promise<CheckDeletableResult> => {
  throw new Error('[cloud] components.checkDeploymentTrackDeletable: not implemented');
};
