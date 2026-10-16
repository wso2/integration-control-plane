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

import { CircularProgress, PageContent, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useComponentByHandler } from '../hooks/useComponents';
import { useCommitHistory, useComponentRepository } from '../hooks/useRepository';
import { useDeploymentStatus } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgs } from '../hooks/useOrg';
import BuildHistory from '../components/Build/BuildHistory';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import { useSelectedTrack } from '../hooks/useSelectedTrack';
import ComingSoon from './ComingSoon';
import type { ComponentScope } from '../nav';
import { UUID_RE } from '../utils/string';
import { useProjectId } from '../hooks/useProjects';
import { RAG_NO_SOURCE_SUBTYPES } from '../constants/ragIngestion';

export default function Build(scope: ComponentScope): JSX.Element {
  const isProjectUuid = UUID_RE.test(scope.project);
  const { projectId: projectIdFromHook, isLoading: loadingProject } = useProjectId(scope.project);
  const projectId = isProjectUuid ? scope.project : projectIdFromHook;

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const componentId = component?.id ?? '';

  const { track, trackId: versionId } = useSelectedTrack(component);

  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(orgUuid, projectId);

  const { data: repository, isLoading: loadingRepository } = useComponentRepository(projectId, scope.component);
  // Each track builds its own branch.
  const branch = track?.branch || repository?.branch || '';

  const { data: builds = [], isLoading: loadingBuilds } = useDeploymentStatus(componentId, versionId);
  const { data: commits = [], isLoading: loadingCommits } = useCommitHistory(componentId, branch);

  const isLoading = (!isProjectUuid && loadingProject) || loadingComponent || loadingOrgs || loadingEnvironments || loadingRepository;

  if (isLoading) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (!component) {
    return (
      <PageContent>
        <Typography color="error">Failed to load component information.</Typography>
      </PageContent>
    );
  }

  if (component.isPrebuilt) {
    return <ComingSoon title="Build Not Available for Prebuilt Integrations" description="Prebuilt integrations are deployed directly from a published image — there is no source build step." />;
  }

  // Proxy/converted integrations (e.g. an MCP proxy from an existing HTTP API)
  // have no source repository, so there's nothing to build.
  if (component.displayType === 'proxy' || component.displayType === 'gitProxy') {
    return <ComingSoon title="Build Not Available" description="This integration is created from an existing API and has no source repository to build." />;
  }

  // RAG-provisioned components (ingestion cronjob, retrieval/API services) are
  // deployed from a prebuilt image and have no source repository to build.
  if (RAG_NO_SOURCE_SUBTYPES.has(component.componentSubType ?? '')) {
    return <ComingSoon title="Build Not Available" description="This integration is deployed from a prebuilt image and has no source repository to build." />;
  }

  const envId = environments[0]?.id ?? '';

  return (
    <>
      <DeploymentTrackBar component={component} />
      <PageContent>
        <BuildHistory componentId={componentId} versionId={versionId} envId={envId} branch={branch} builds={builds} buildsLoading={loadingBuilds} commits={commits} commitsLoading={loadingCommits} repository={repository ?? null} />
      </PageContent>
    </>
  );
}
