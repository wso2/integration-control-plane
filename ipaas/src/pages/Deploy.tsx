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

import { Box, CircularProgress, PageContent, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { useComponentByHandler } from '../hooks/useComponents';
import { useCommitHistory } from '../hooks/useRepository';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgs } from '../hooks/useOrg';
import { useProjectId } from '../hooks/useProjects';
import { UUID_RE } from '../utils/string';
import BuildArea from '../components/Deploy/BuildArea';
import ComingSoon from './ComingSoon';
import DeployEnvironmentCard from '../components/Deploy/DeployEnvironmentCard/DeployEnvironmentCard';
import type { ComponentScope } from '../nav';
import { getComponentTypeFlags } from '../utils/componentType';
import { identifyIntegration } from '../utils/identifyIntegration';
import { getDisplayLabel } from '../constants/integrations';

export default function Deploy(scope: ComponentScope): JSX.Element {
  const isProjectUuid = UUID_RE.test(scope.project);
  const { projectId: projectIdFromHook, project, isLoading: loadingProject } = useProjectId(scope.project);
  const projectId = isProjectUuid ? scope.project : projectIdFromHook;

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const componentId = component?.id ?? '';
  const deploymentTrack = component?.deploymentTracks?.[0];
  const versionId = deploymentTrack?.id ?? '';
  const autoDeployEnabled = deploymentTrack?.autoDeployEnabled ?? false;
  const branch = deploymentTrack?.branch ?? '';

  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(orgUuid, projectId);
  const { data: commits = [] } = useCommitHistory(componentId, branch);

  // Must be declared before any early returns to satisfy React hooks rules
  const [promotingToEnvId, setPromotingToEnvId] = useState<string | null>(null);

  const isLoading = (!isProjectUuid && loadingProject) || loadingComponent || loadingOrgs || loadingEnvironments;

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
    return <ComingSoon title="Deploy Not Available for Prebuilt Integrations" description="Prebuilt integrations are deployed automatically during setup — manual deploy management is not available here." />;
  }

  const flags = getComponentTypeFlags(component.displayType ?? '', component.componentSubType);
  const displayLabel = getDisplayLabel(component.displayType ?? '', component.componentSubType ?? null);
  // Type identified once, via the canonical resolver — NOT re-derived in
  // `getComponentTypeFlags` (which keys only on displayType). File and event
  // integrations share a service displayType + build pipeline, so they deploy
  // like a service; only their (non-existent) endpoint UI is suppressed below.
  const integrationType = identifyIntegration(component.displayType ?? '', component.componentSubType ?? null).type;
  // File/event/AI-agent integrations share a service displayType but expose no
  // user-configurable endpoints — devant opens the endpoint-less
  // ConfigurationWizard for all three. Suppress the endpoint UI accordingly.
  const hideEndpoints = integrationType === 'file-integration' || integrationType === 'event-integration' || integrationType === 'ai-agent';

  if (flags.isProxy) {
    return <ComingSoon title="Proxy Deploy Coming Soon" description="Deploy management for REST API Proxy components will be available in a future release." />;
  }

  if (!flags.isDeployable && !hideEndpoints) {
    return <ComingSoon title="Deploy Not Yet Supported" description={`Deploy management for ${displayLabel} components is coming soon.`} />;
  }

  return (
    <PageContent>
      <Typography variant="h1" sx={{ mb: 4 }}>
        Deploy
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 'max-content' }}>
        {/* Left panel — build artifact selection + deploy trigger */}
        <Box sx={{ flexShrink: 0 }}>
          <BuildArea
            componentId={componentId}
            versionId={versionId}
            orgHandler={scope.org}
            orgUuid={orgUuid}
            projectId={projectId}
            deploymentPipelineId={project?.defaultDeploymentPipelineId ?? ''}
            flags={flags}
            branch={branch}
            commits={commits}
            firstEnvId={environments[0]?.id ?? ''}
            firstEnvTemplateId={environments[0]?.templateId ?? environments[0]?.id ?? ''}
            autoDeployEnabled={autoDeployEnabled}
            componentName={component.name}
            projectHandler={project?.handler ?? ''}
            displayType={component.displayType}
            hideEndpoints={hideEndpoints}
          />
        </Box>

        {/* Environment cards — each preceded by a horizontal connector line */}
        {environments.map((env, index) => {
          const nextEnv = index < environments.length - 1 ? environments[index + 1] : undefined;
          return (
            <Box key={env.id} sx={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
              <Box sx={{ width: 40, height: '1px', bgcolor: 'divider', mt: '112px', flexShrink: 0 }} />
              <Box sx={{ width: 320 }}>
                <DeployEnvironmentCard
                  orgHandler={scope.org}
                  orgUuid={orgUuid}
                  projectId={projectId}
                  componentId={componentId}
                  versionId={versionId}
                  deploymentPipelineId={project?.defaultDeploymentPipelineId ?? ''}
                  flags={flags}
                  hideEndpoints={hideEndpoints}
                  env={env}
                  branch={branch}
                  componentName={component.name}
                  projectHandler={project?.handler ?? ''}
                  nextEnvId={nextEnv?.id}
                  isPromotionTarget={env.id === promotingToEnvId}
                  // Highlight whichever env the promote actually targets — in cloud
                  // that is the pipeline's target, not necessarily nextEnv.
                  onPromoteStarted={(targetEnvId) => setPromotingToEnvId(targetEnvId)}
                  onPromoteSettled={() => setPromotingToEnvId(null)}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </PageContent>
  );
}
