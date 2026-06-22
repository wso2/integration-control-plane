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

import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight, GitHub, GitLab, Bitbucket } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useCreateComponent } from '../hooks/useComponents';
import { useChoreoSampleImages } from '../hooks/useRepository';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '../auth/oauthState';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useAuth } from '../auth/AuthContext';
import IDEMockup from '../components/IDEMockup/IDEMockup';
import PillTabs from '../components/PillTabs';
import PrebuiltCard from '../components/PrebuiltCard';
import SampleRowCard from '../components/SampleRowCard';
import IntegrationCreationLoader from '../components/IntegrationCreationLoader';
import GitIcon from '../assets/icons/GitIcon';
import AzureIcon from '../assets/icons/AzureIcon';
import { componentSubTypeFromSample, displayTypeFromSample } from '../constants/integrations';
import { GITHUB_AUTH } from '../constants/github';
import { CARD_HOVER_SX, PROVIDER_ICON_SX } from '../constants/styles';
import { resourceUrl, narrow, type ProjectScope } from '../nav';
import { importComponentUrl, browseSamplesUrl, prebuiltIntegrationsUrl, importComingSoonUrl, buildGitHubOAuthUrl } from '../paths';
import type { Sample } from '../types/samples';
import { toHandler } from '../utils/string';
import { useProjectId } from '../hooks/useProjects';
import { useSamples } from '../hooks/useSamples';
import { usePrebuiltIntegrations } from '../hooks/usePrebuiltIntegrations';

export default function CreateIntegrationOptions(scope: ProjectScope): JSX.Element {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { projectId } = useProjectId(scope.project);
  const orgUuid = useOrgUuid() ?? '';
  const { data: samplesData, isLoading: samplesLoading, isError: samplesError } = useSamples();
  const { data: prebuiltData, isLoading: prebuiltLoading, isError: prebuiltError } = usePrebuiltIntegrations();

  const featuredSamples = samplesData?.featuredSamples ?? [];
  const featuredPrebuilt = (prebuiltData?.prebuiltIntegrations ?? []).slice(0, 3);

  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);

  const [isCloudEditorCardHovered, setIsCloudEditorCardHovered] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [deployingSample, setDeployingSample] = useState<string | null>(null);
  const [isImportAuthenticating, setIsImportAuthenticating] = useState(false);
  const [pageError, setPageError] = useState<{ message: string; severity: 'error' | 'warning' } | null>(null);

  const createComponent = useCreateComponent();

  const handleOpenCloudEditor = async () => {
    const codeServerSample = (sampleImages ?? []).find((img) => img.name === 'Code Server');
    if (!codeServerSample) {
      setPageError({ message: 'Cloud Editor is not available. Please try again later.', severity: 'warning' });
      return;
    }
    const deploymentUrl = new URL('/editor', window.location.origin);
    deploymentUrl.searchParams.set('userId', userId);
    deploymentUrl.searchParams.set('orgUuid', orgUuid);
    deploymentUrl.searchParams.set('orgHandle', scope.org);
    deploymentUrl.searchParams.set('projectId', projectId);
    deploymentUrl.searchParams.set('componentId', 'null');
    deploymentUrl.searchParams.set('codeServerSample', JSON.stringify(codeServerSample));
    const newTab = window.open(deploymentUrl.toString(), '_blank');
    if (!newTab) {
      setPageError({ message: 'Please allow popups for this site and try again.', severity: 'warning' });
    }
  };

  const importUrl = importComponentUrl(scope.org, scope.project);

  const handleImportClick = () => {
    const { githubAppClientId, githubAppAuthRedirectUrl } = window.API_CONFIG;
    if (!githubAppClientId) {
      navigate(importUrl);
      return;
    }
    setIsImportAuthenticating(true);

    const state = generateAndSaveGitHubState();
    const url = buildGitHubOAuthUrl(githubAppAuthRedirectUrl ?? '', githubAppClientId, state);
    const popup = window.open(url, 'github-oauth', GITHUB_AUTH.POPUP_DIMENSIONS);

    const channel = new BroadcastChannel(GITHUB_AUTH.BROADCAST_CHANNEL);
    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollClosed);
        channel.close();
        setIsImportAuthenticating(false);
      }
    }, GITHUB_AUTH.POPUP_POLL_INTERVAL_MS);

    channel.onmessage = (event) => {
      clearInterval(pollClosed);
      channel.close();
      const { authCode, state: returnedState } = event.data as { authCode: string | null; state: string | null };
      if (!returnedState || !validateAndClearGitHubState(returnedState)) {
        setIsImportAuthenticating(false);
        setPageError({ message: 'GitHub authorization failed (invalid state). Please try again.', severity: 'error' });
        return;
      }
      if (!authCode) {
        setIsImportAuthenticating(false);
        setPageError({ message: 'GitHub authorization failed. Please try again.', severity: 'error' });
        return;
      }
      navigate(importUrl, { state: { authCode } });
    };
  };

  const handleQuickDeploy = (sample: Sample) => {
    if (!projectId) return;
    setDeployingSample(sample.displayName);
    createComponent.mutate(
      {
        displayName: sample.displayName,
        name: toHandler(sample.displayName),
        description: sample.description,
        orgHandler: scope.org,
        projectId,
        displayType: displayTypeFromSample(sample.componentType, sample.buildPack),
        componentSubType: componentSubTypeFromSample(sample.componentType, sample.buildPack),
        srcGitRepoUrl: sample.repositoryUrl,
        repositorySubPath: `${sample.subDirectory ?? ''}${sample.componentPath}`,
        repositoryBranch: sample.branch ?? 'main',
        isPublicRepo: true,
        enableAutoDeploy: true,
      },
      {
        onSuccess: (component) => navigate(resourceUrl(narrow(scope, component.handler), 'overview')),
        onError: () => setDeployingSample(null),
      },
    );
  };

  if (createComponent.isPending || createComponent.isSuccess || createComponent.isError) {
    return (
      <PageContent sx={{ pt: 5, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <IntegrationCreationLoader
          label="Integration"
          subLabel={deployingSample || undefined}
          isPending={createComponent.isPending}
          isSuccess={createComponent.isSuccess}
          error={createComponent.isError ? (createComponent.error?.message ?? 'Something went wrong. Please try again.') : null}
          onBack={() => {
            createComponent.reset();
            setDeployingSample(null);
          }}
        />
      </PageContent>
    );
  }

  return (
    <PageContent sx={{ pt: 5, 'container-type': 'inline-size' }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 3 }}>
        Back to Project Home
      </Button>

      {pageError && (
        <Alert severity={pageError.severity} onClose={() => setPageError(null)} sx={{ mb: 3 }}>
          {pageError.message}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'stretch',
          gridTemplateColumns: '1fr',
          '@container (min-width: 900px)': {
            gridTemplateColumns: '6fr 4fr',
          },
        }}>
        {/* Left column: Cloud Editor + Import */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          {/* Cloud Editor card */}
          <Box sx={{ flex: 7 }}>
            <Card sx={{ height: '100%', ...CARD_HOVER_SX }} onMouseEnter={() => setIsCloudEditorCardHovered(true)} onMouseLeave={() => setIsCloudEditorCardHovered(false)} onClick={handleOpenCloudEditor}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3, '&:last-child': { pb: 3 } }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                  <Typography variant="h2">Create an Integration</Typography>
                  <Chip label="Beta" size="small" color="primary" variant="outlined" />
                </Stack>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                  Start developing in a complete, browser-based development environment.
                </Typography>
                {/* Fixed height for IDE mockup */}
                <Box sx={{ height: 260, overflow: 'hidden' }}>
                  <IDEMockup isHovered={isCloudEditorCardHovered} onOpenClick={handleOpenCloudEditor} />
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Import Integration card */}
          <Box sx={{ flex: 3 }}>
            <Card variant="outlined" sx={{ height: '100%', boxShadow: 'none', ...(isImportAuthenticating ? { pointerEvents: 'none', opacity: 0.7 } : {}) }}>
              <CardContent
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 3,
                  gap: 3,
                  '&:last-child': { pb: 3 },
                }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h2" sx={{ mb: 0.5 }}>
                    Import an Integration
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {isImportAuthenticating ? 'Completing GitHub authorization…' : 'Connect your repository and start building instantly'}
                  </Typography>
                </Box>

                {/* Vertical divider */}
                <Box sx={{ width: '2px', alignSelf: 'stretch', bgcolor: 'divider', flexShrink: 0 }} />

                {/* Provider icon buttons */}
                <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {isImportAuthenticating ? (
                    <CircularProgress size={22} />
                  ) : (
                    <>
                      <Tooltip title="Import from a Public Repository" placement="top">
                        <IconButton
                          aria-label="Import from a Public Repository"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(importUrl, { state: { mode: 'public' } });
                          }}
                          sx={PROVIDER_ICON_SX}>
                          <GitIcon size={25} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from GitHub" placement="top">
                        <IconButton aria-label="Import from GitHub" onClick={handleImportClick} sx={PROVIDER_ICON_SX}>
                          <GitHub size={24} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from GitLab" placement="top">
                        <IconButton aria-label="Import from GitLab" onClick={() => navigate(importComingSoonUrl(scope.org, scope.project))} sx={PROVIDER_ICON_SX}>
                          <GitLab size={22} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from Bitbucket" placement="top">
                        <IconButton aria-label="Import from Bitbucket" onClick={() => navigate(importComingSoonUrl(scope.org, scope.project))} sx={PROVIDER_ICON_SX}>
                          <Bitbucket size={22} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from Azure" placement="top">
                        <IconButton aria-label="Import from Azure" onClick={() => navigate(importComingSoonUrl(scope.org, scope.project))} sx={PROVIDER_ICON_SX}>
                          <AzureIcon size={22} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Right column: Get Started Quickly */}
        <Box sx={{ minWidth: 0 }}>
          <Card
            variant="outlined"
            sx={{
              height: '100%',
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 3, '&:last-child': { pb: 3 } }}>
              <Typography variant="h2" sx={{ mb: 0.5 }}>
                Get Started Quickly
              </Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                Start with prebuilt integrations or simple samples to get started.
              </Typography>

              <Box sx={{ mb: 2 }}>
                <PillTabs value={selectedTab} onChange={setSelectedTab} tabs={[{ label: 'Prebuilt Integrations' }, { label: 'Samples' }]} />
              </Box>

              <Box sx={{ display: 'grid', flex: 1, minWidth: 0, '& > *': { gridArea: '1 / 1', zIndex: 1, minWidth: 0 } }}>
                {/* Prebuilt panel */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    ...(selectedTab !== 0 ? { visibility: 'hidden', pointerEvents: 'none', zIndex: 0 } : {}),
                  }}>
                  {prebuiltLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : prebuiltError ? (
                    <Typography variant="body2" color="text.secondary">
                      Failed to load prebuilt integrations.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {featuredPrebuilt.map((integration) => (
                        <PrebuiltCard
                          key={integration.displayName}
                          integration={integration}
                          onClick={() =>
                            navigate(prebuiltIntegrationsUrl(scope.org, scope.project), {
                              state: {
                                selectedApplications: integration.applications,
                                selectedIntegration: integration,
                                fromPath: `/organizations/${scope.org}/projects/${scope.project}/components/new`,
                              },
                            })
                          }
                        />
                      ))}
                    </Box>
                  )}
                  <Box sx={{ mt: 'auto', pt: 2 }}>
                    <Button variant="text" color="primary" endIcon={<ArrowRight size={14} />} onClick={() => navigate(prebuiltIntegrationsUrl(scope.org, scope.project))} sx={{ textTransform: 'none', pl: 0 }}>
                      Explore more prebuilt integrations
                    </Button>
                  </Box>
                </Box>

                {/* Samples panel */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    ...(selectedTab !== 1 ? { visibility: 'hidden', pointerEvents: 'none', zIndex: 0 } : {}),
                  }}>
                  {samplesLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : samplesError ? (
                    <Typography variant="body2" color="text.secondary">
                      Failed to load samples.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {featuredSamples.map((sample) => (
                        <SampleRowCard key={sample.displayName} sample={sample} onDeploy={() => handleQuickDeploy(sample)} isDeploying={deployingSample === sample.displayName} />
                      ))}
                    </Box>
                  )}
                  <Box sx={{ mt: 'auto', pt: 2 }}>
                    <Button variant="text" color="primary" endIcon={<ArrowRight size={14} />} onClick={() => navigate(browseSamplesUrl(scope.org, scope.project))} sx={{ textTransform: 'none', pl: 0 }}>
                      Explore more samples
                    </Button>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </PageContent>
  );
}
