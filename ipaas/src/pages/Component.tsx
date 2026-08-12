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

import { Box, CircularProgress, PageContent } from '@wso2/oxygen-ui';
import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject, useProjectByHandler, useProjects } from '../hooks/useProjects';
import { useComponentByHandler, useComponentEndpoints } from '../hooks/useComponents';
import { useIntegrationIdentity } from '../hooks/useIntegrationIdentity';
import { useEnvironments } from '../hooks/useEnvironments';
import type { IntegrationType } from '../types/integration';
import { useCommitHistory, useComponentRepository } from '../hooks/useRepository';
import { useApimApi } from '../hooks/useApim';
import { IS_CLOUD, IS_WIP } from '../features';
import { useDeploymentStatus } from '../hooks/useDeployments';
import BusinessInfo from '../components/BusinessInfo';
import NotFound from '../components/NotFound';
import { ArtifactDetail } from '../components/ArtifactDetail';
import Environment from '../components/EnvironmentCard';
import PromoteButton from '../components/EnvironmentCard/PromoteButton';
import IntegrationRenderer from '../components/Overview/_shared/IntegrationRenderer';
import HeaderShell from '../components/Overview/_shared/HeaderShell';
import { useIntegrationModule } from '../hooks/useIntegrationModule';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import type { SelectedArtifact } from '../components/artifact-config';
import { resourceUrl, broaden, type ComponentScope } from '../nav';
import { useLoadComponentPermissions } from '../hooks/usePermissionLoader';
import BuildCard from '../components/BuildCard';
import { UUID_RE } from '../utils/string';
import { RAG_NO_SOURCE_SUBTYPES } from '../constants/ragIngestion';

/**
 * Integration types whose Overview rendering has been migrated to the new
 * `components/overview/<type>/` modules. Add a type here as part of its
 * migration phase. This constant goes away entirely in Phase 4, when every
 * type uses the new dispatch and the legacy `<Environment>` is deleted.
 * See [[icp-integration-migration]] and [[icp-phase4-commitment]] in memory.
 */
const MIGRATED_INTEGRATION_TYPES = new Set<IntegrationType>(['automation', 'integration-as-api', 'webhook', 'file-integration', 'event-integration', 'ai-agent', 'mcp-server', 'mcp-proxy', 'tailscale-vpn', 'rag-ingestion']);

/**
 * Types whose module provides a `CustomOverview` that owns the WHOLE surface
 * (its own identity header + body) — so the page skips the generic HeaderShell,
 * Build card, track bar, and BusinessInfo. Tailscale is the only one today.
 */
const CUSTOM_OVERVIEW_TYPES = new Set<IntegrationType>(['tailscale-vpn']);

export default function Component(scope: ComponentScope): JSX.Element {
  // Support both UUID and handler in the URL — only one query will be enabled at a time
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectByHandler, isLoading: loadingByHandler } = useProjectByHandler(!isUuid ? scope.project : '');
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  // Fallback: find project by handler from the cached projects list (shares cache with AppLayout's useProjects call)
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = projectByHandler ?? projectById ?? projectFromList;
  // Stop loading as soon as project is resolved from any source; don't block on retrying queries
  const loadingProject = !project && (isUuid ? loadingById : loadingByHandler || loadingProjects);
  const projectId = project?.id ?? '';
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [] } = useEnvironments(scope.org, projectId);
  const { data: repository = null, isLoading: loadingRepository } = useComponentRepository(projectId, scope.component);
  const { data: commits = [], isLoading: loadingCommits } = useCommitHistory(component?.id ?? '', repository?.branch ?? '');

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const [selectedTrackId, setSelectedTrackId] = useState('');

  // Derived rather than synced via an effect: the version-scoped queries below (endpoints,
  // deployment status) key off this, and waiting for an effect + extra render to set it would
  // add a full round trip to the waterfall before those queries could even become enabled.
  // Falls back to the latest track whenever the current selection isn't valid for these tracks
  // (initial mount, or a stale id left over from a previously viewed component).
  const versionId = tracks.some((t) => t.id === selectedTrackId) ? selectedTrackId : (tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '');

  const { data: endpoints = [] } = useComponentEndpoints(component?.id ?? '', versionId);
  const apimId = IS_WIP ? (endpoints.find((e) => e.apimId)?.apimId ?? null) : null;
  const { data: apimApiInfo } = useApimApi(apimId);
  const [selectedArtifact, setSelectedArtifact] = useState<SelectedArtifact | null>(null);

  // Load component permissions using the UUID - only when component is loaded
  useLoadComponentPermissions(scope.org, projectId, component?.id || '');

  const queryClient = useQueryClient();
  const { data: buildDeployments = [] } = useDeploymentStatus(component?.id ?? '', versionId);
  const isBuildInProgress = buildDeployments[0]?.status === 'in_progress';
  const prevBuildStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const current = buildDeployments[0];
    if (prevBuildStatusRef.current === 'in_progress' && current?.status === 'completed' && current?.conclusion === 'success') {
      queryClient.invalidateQueries({ queryKey: ['componentDeployment'] });
    }
    prevBuildStatusRef.current = current?.status;
  }, [buildDeployments, queryClient]);

  // Identity hook must run before any early return — rules of hooks. The
  // hook itself handles `undefined` component by returning `null`.
  const identity = useIntegrationIdentity(component);
  // Resolve the type's Overview module once; shared by the header (HeaderShell)
  // and the env-card renderer (IntegrationRenderer) so neither re-resolves it.
  const overviewModule = useIntegrationModule(identity?.type ?? null);

  const isLoading = loadingProject || loadingComponent;
  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  if (!component) return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;

  const displayType = component.displayType ?? '';
  const latestCommit = commits.find((c) => c.isLatest) ?? commits[0] ?? null;
  // Types whose Overview rendering has been migrated to the new
  // `components/overview/<type>/` modules. Other types continue using
  // the legacy `<Environment>` until their own migration phase. Bridge
  // fields (orgHandler etc.) are threaded through so the registry-loaded
  // module can delegate to existing chrome. This set goes away in Phase 4
  // when every type uses the new dispatch unconditionally.
  const useIntegrationsModule = identity ? MIGRATED_INTEGRATION_TYPES.has(identity.type) : false;
  // Full-surface types (e.g. Tailscale) render only their CustomOverview — no
  // generic header / build card / track bar / business info around it.
  const hasCustomOverview = identity ? CUSTOM_OVERVIEW_TYPES.has(identity.type) : false;

  // "No source" capability: proxy/converted integrations (e.g. an MCP proxy
  // built from an existing HTTP API) have no git repo. Drives the header's
  // Source/Commit + Open-in-Cloud, and the Build card — matching devant.
  const isProxyComponent = displayType === 'proxy' || displayType === 'gitProxy';
  // RAG-provisioned components (ingestion cronjob, retrieval/API services) are
  // deployed from a prebuilt image with no source repo — hide Source/Commit,
  // the editor, and the Build card (same treatment as a proxy).
  const isRagNoSource = RAG_NO_SOURCE_SUBTYPES.has(component.componentSubType ?? '');
  const hasSource = !isProxyComponent && !isRagNoSource;
  const showBuildCard = !component.isPrebuilt && hasSource;

  return (
    <>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Deployment track bar */}
        {!hasCustomOverview && tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={versionId} onChange={setSelectedTrackId} orgHandler={scope.org} projectHandler={project?.handler ?? ''} componentHandler={component.handler} />}

        {/* <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}> */}
        <PageContent>
          {/* Component header */}
          {!hasCustomOverview && (
            <HeaderShell
              component={component}
              project={project}
              repository={repository}
              latestCommit={latestCommit}
              orgHandler={scope.org}
              projectId={projectId}
              projectHandler={project?.handler ?? scope.project}
              apimId={apimId}
              module={overviewModule}
              hasSource={hasSource}
              isRepositoryLoading={loadingRepository}
              isLatestCommitLoading={loadingRepository || loadingCommits}
            />
          )}

          {/* Latest build card */}
          {!hasCustomOverview && showBuildCard && (
            <>
              <BuildCard componentId={component.id} versionId={versionId} latestCommit={latestCommit} />
            </>
          )}

          {/* Environment cards with Promote between them.
              Automation routes through the new registry; other types keep
              the legacy rendering until their own migration phase. */}
          {useIntegrationsModule && identity ? (
            <IntegrationRenderer
              component={component}
              identity={identity}
              environments={environments}
              versionId={versionId}
              projectId={projectId}
              orgHandler={scope.org}
              projectHandler={project?.handler ?? ''}
              deploymentPipelineId={project?.defaultDeploymentPipelineId ?? ''}
              latestCommit={latestCommit}
              isBuildInProgress={isBuildInProgress}
              module={overviewModule}
            />
          ) : (
            environments.map((env, index) => (
              <Fragment key={env.id}>
                <Environment
                  env={env}
                  prevEnv={index > 0 ? environments[index - 1] : undefined}
                  componentId={component.id}
                  projectId={projectId}
                  componentType={component.componentType ?? ''}
                  displayType={displayType}
                  componentHandler={component.handler}
                  projectHandler={project?.handler ?? ''}
                  orgHandler={scope.org}
                  versionId={versionId}
                  deploymentPipelineId={project?.defaultDeploymentPipelineId ?? ''}
                  latestCommit={latestCommit}
                  apiId={component.apiId}
                  isBuildInProgress={isBuildInProgress}
                />
                {/* In cloud the pipeline decides whether this env promotes at all —
                    including out of the last card — so PromoteButton renders null
                    when there is no hop. Elsewhere, adjacency still gates it. */}
                {(IS_CLOUD || index < environments.length - 1) && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                    <PromoteButton orgHandler={scope.org} componentId={component.id} versionId={versionId} deploymentPipelineId={project?.defaultDeploymentPipelineId ?? ''} sourceEnvId={env.id} targetEnvId={environments[index + 1]?.id} />
                  </Box>
                )}
              </Fragment>
            ))
          )}

          {/* Subscription Plans, Documents, and Compliance cards — devant only (requires APIM) */}
          {!hasCustomOverview && IS_WIP && apimId && (
            <BusinessInfo
              projectId={projectId}
              componentId={component.id}
              apimId={apimId}
              apimApiInfo={apimApiInfo}
              activePolicies={apimApiInfo?.policies ?? []}
              docsPath={`/organizations/${scope.org}/projects/${project?.handler ?? scope.project}/components/${component.handler}/document`}
            />
          )}
        </PageContent>
      </Box>
      <ArtifactDetail selected={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
      {/* </Box> */}
    </>
  );
}
