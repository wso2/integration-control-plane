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
import { useEffect, type JSX } from 'react';
import { useAuth } from '../auth/AuthContext';
import NotFound from '../components/NotFound';
import { CloudEditorCard, IntegratorIDECard } from '../components/Integration/IntegrationCards';
import { useComponentByHandler } from '../hooks/useComponents';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProject, useProjectByHandler, useProjects } from '../hooks/useProjects';
import { useCommitHistory, useComponentRepository, useChoreoSampleImages } from '../hooks/useRepository';
import { broaden, resourceUrl, type ComponentScope } from '../nav';
import { UUID_RE } from '../utils/string';
import { trackEvent } from '../utils/tracking';

export default function ComponentIntegration(scope: ComponentScope): JSX.Element {
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectByHandler, isLoading: loadingByHandler } = useProjectByHandler(!isUuid ? scope.project : '');
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = projectByHandler ?? projectById ?? projectFromList;
  const loadingProject = !project && (isUuid ? loadingById : loadingByHandler || loadingProjects);
  const projectId = project?.id ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const isLoading = loadingProject || loadingComponent;
  const { data: repository } = useComponentRepository(projectId, scope.component);
  const { data: commits = [] } = useCommitHistory(component?.id ?? '', repository?.branch ?? '');
  const latestCommit = commits.find((c) => c.isLatest) ?? commits[0] ?? null;

  const { userId } = useAuth();
  const orgUuid = useOrgUuid() ?? '';
  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);
  const codeServerSample = (sampleImages ?? []).find((img) => img.name === 'Code Server');

  useEffect(() => {
    if (component) trackEvent('component-develop');
    // Only re-fire when navigating to a different component, not on every re-render where
    // `component` gets a new object reference for the same id (e.g. a background refetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component?.id]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!component) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  const isMI = (component.displayType ?? '').startsWith('mi');
  const extensionId = isMI ? 'WSO2.micro-integrator' : 'WSO2.ballerina';

  const handleOpenInCloud = () => {
    if (!codeServerSample) return;
    const params = new URLSearchParams({
      userId: userId ?? '',
      orgUuid,
      orgHandle: scope.org,
      projectId,
      componentId: component.id,
      codeServerSample: JSON.stringify(codeServerSample),
      sourceCommitHash: latestCommit?.sha ?? '',
    });
    window.open(`${window.location.origin}/editor?${params}`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenInIntegrator = () => {
    const params = new URLSearchParams({ project: project?.handler ?? '', org: scope.org, component: component.handler });
    window.open(`vscode://${extensionId}/open?${params}`, '_blank');
  };

  return (
    <PageContent>
      <Typography variant="h2" sx={{ mb: 1 }}>
        Get Started with Integration Development
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Follow these simple steps to set up your development environment, and deploy your integrations.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <CloudEditorCard disabled={!codeServerSample} onOpenInCloud={handleOpenInCloud} />
        <IntegratorIDECard onOpenInIntegrator={handleOpenInIntegrator} />
      </Box>
    </PageContent>
  );
}
