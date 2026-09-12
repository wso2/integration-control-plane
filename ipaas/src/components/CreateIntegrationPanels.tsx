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

import { Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, GitHub, Plus, GitBranch } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useCreateComponent } from '../hooks/useComponents';
import { useChoreoSampleImages } from '../hooks/useRepository';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '../auth/tokenManager';
import { IS_CLOUD } from '../features';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useAuth } from '../auth/AuthContext';
import { useFeaturePreview } from '../contexts/FeaturePreviewContext';
import IDEMockup from './IDEMockup/IDEMockup';
import { AiBuilderLandingCard } from './AiBuilder/AiBuilderLandingCard';
import PillTabs from './PillTabs';
import PrebuiltCard from './PrebuiltCard';
import SampleRowCard from './SampleRowCard';
import IntegrationCreationLoader from './IntegrationCreationLoader';
import GitLogoIcon from '../assets/icons/GitLogoIcon';
import GitLabIcon from '../assets/icons/GitLabIcon';
import BitbucketIcon from '../assets/icons/BitbucketIcon';
import AzureDevOpsIcon from '../assets/icons/AzureDevOpsIcon';
import { GitProvider } from '../types/credentials';
import { componentSubTypeFromSample, displayTypeFromSample } from '../constants/integrations';
import { GITHUB_AUTH } from '../constants/github';
import { PROVIDER_ICON_SX, GITHUB_ICON_SX, SECTION_LABEL_SX } from '../constants/styles';
import { resourceUrl, narrow, type ProjectScope } from '../nav';
import { importComponentUrl, browseSamplesUrl, prebuiltIntegrationsUrl, componentsNewAiBuilderUrl, buildGitHubOAuthUrl } from '../paths';
import type { Sample } from '../types/samples';
import { toHandler } from '../utils/string';
import { buildCloudEditorUrl } from '../utils/cloudEditor';
import { useProjectId } from '../hooks/useProjects';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useOrgComponentLimits, useOrgSubscriptions } from '../hooks/useOrg';
import { Permissions } from '../constants/permissions';
import { FREE_COMPONENT_LIMIT } from '../constants/subscription';
import { useSamples } from '../hooks/useSamples';
import { usePrebuiltIntegrations } from '../hooks/usePrebuiltIntegrations';

export interface CreateIntegrationPanelsProps {
  scope: ProjectScope;
  /** Rendered above the panels — the page supplies its heading, the empty project supplies none. */
  heading?: ReactNode;
}

/**
 * The two create-an-integration panels: the browser-editor + import column, and the
 * prebuilt/samples column. Shared by the Create Integration page and a project's empty state,
 * which offer the same choices and differ only in their surrounding chrome.
 */
export default function CreateIntegrationPanels({ scope, heading }: CreateIntegrationPanelsProps): JSX.Element {
  // Without a page heading above them (the empty-project surface), the section labels carry the
  // whole explanation and spell the choice out in full.
  const standalone = !heading;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
      channelRef.current?.close();
    },
    [],
  );
  const navigate = useAppNavigate();
  const { userId } = useAuth();
  const { projectId } = useProjectId(scope.project);
  const orgUuid = useOrgUuid() ?? '';

  const { hasAnyPermission } = useAccessControl();
  const { data: orgLimits } = useOrgComponentLimits(orgUuid);
  const { data: subscriptions } = useOrgSubscriptions(orgUuid);

  const isUpgraded = (subscriptions ?? []).some((sub) => sub.subscriptionType === 'devant-subscription' && sub.subscriptionStatus === 'active');
  const quotaReached = !isUpgraded && (orgLimits?.billableComponentCount ?? 0) >= FREE_COMPONENT_LIMIT;
  const canManage = hasAnyPermission([Permissions.INTEGRATION_MANAGE], projectId);
  const creationBlocked = !canManage || quotaReached;
  const blockedTooltip = !canManage ? 'You do not have permission to create integrations.' : 'You have exceeded the allocated integration quota. Upgrade your subscription.';
  const { features } = useFeaturePreview();
  const aiBuilderEnabled = !!features['AI Integration Builder'];
  const { data: samplesData, isLoading: samplesLoading, isError: samplesError } = useSamples();
  const { data: prebuiltData, isLoading: prebuiltLoading, isError: prebuiltError } = usePrebuiltIntegrations();

  const featuredSamples = samplesData?.featuredSamples ?? [];
  const featuredPrebuilt = (prebuiltData?.prebuiltIntegrations ?? []).slice(0, 3);

  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);

  const [selectedTab, setSelectedTab] = useState(0);
  const [deployingSample, setDeployingSample] = useState<string | null>(null);
  const [isImportAuthenticating, setIsImportAuthenticating] = useState(false);
  const [pageError, setPageError] = useState<{ message: string; severity: 'error' | 'warning' } | null>(null);

  const createComponent = useCreateComponent();

  const handleOpenCloudEditor = () => {
    if (creationBlocked) return;
    const codeServerSample = (sampleImages ?? []).find((img) => img.name === 'Code Server');
    if (!codeServerSample) {
      setPageError({ message: 'Cloud Editor is not available. Please try again later.', severity: 'warning' });
      return;
    }
    const url = buildCloudEditorUrl({ userId, orgUuid, orgHandle: scope.org, projectId, codeServerSample }, window.location.origin);
    if (!window.open(url, '_blank')) {
      setPageError({ message: 'Please allow popups for this site and try again.', severity: 'warning' });
    }
  };

  const importUrl = importComponentUrl(scope.org, scope.project);

  const handleImportClick = () => {
    if (creationBlocked) return;
    const { githubAppClientId, githubAppAuthRedirectUrl } = window.API_CONFIG;
    if (!githubAppClientId) {
      // Cloud only: no GitHub App configured means private-repo authorization
      // is impossible, so land the import page in public-URL mode instead of
      // its default (private) mode with a dead Authorize button. Other
      // variants keep the original navigation.
      navigate(importUrl, IS_CLOUD ? { state: { mode: 'public' } } : undefined);
      return;
    }
    setIsImportAuthenticating(true);

    const state = generateAndSaveGitHubState();
    const url = buildGitHubOAuthUrl(githubAppAuthRedirectUrl ?? '', githubAppClientId, state);
    const popup = window.open(url, 'github-oauth', GITHUB_AUTH.POPUP_DIMENSIONS);
    // A blocked popup is null, and `null?.closed` is never true — polling it would spin forever
    // with the button stuck in its authenticating state.
    if (!popup) {
      setIsImportAuthenticating(false);
      setPageError({ message: 'Please allow popups for this site and try again.', severity: 'warning' });
      return;
    }

    const channel = new BroadcastChannel(GITHUB_AUTH.BROADCAST_CHANNEL);
    channelRef.current = channel;
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        channel.close();
        channelRef.current = null;
        setIsImportAuthenticating(false);
      }
    }, GITHUB_AUTH.POPUP_POLL_INTERVAL_MS);
    pollRef.current = pollClosed;

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
    if (!projectId || creationBlocked) return;
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
      <Box sx={{ pt: 5, display: 'flex', flexDirection: 'column', flex: 1 }}>
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
      </Box>
    );
  }

  return (
    <>
      {pageError && (
        <Alert severity={pageError.severity} onClose={() => setPageError(null)} sx={{ mb: 3 }}>
          {pageError.message}
        </Alert>
      )}

      {heading}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'stretch',
          gridTemplateColumns: { xs: '1fr', md: '6fr 4fr' },
        }}>
        {/* Left column: AI Builder / Cloud Editor + Import */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          {/* AI prompt box (gated) — replaces the IDE-mockup card in view1 */}
          {aiBuilderEnabled ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary', fontWeight: 500 }}>
                Start with an idea
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0, mt: 1.5 }}>
                <AiBuilderLandingCard
                  onStartPlanning={(query) => {
                    navigate(componentsNewAiBuilderUrl(scope.org, scope.project), { state: { query } });
                  }}
                />
              </Box>
            </Box>
          ) : (
            /* Cloud Editor card */
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
                <Typography variant="body2" sx={SECTION_LABEL_SX}>
                  {standalone ? 'Create an Integration on Cloud' : 'Create on Cloud'}
                </Typography>
              </Stack>
              <Card variant="outlined" sx={{ flex: 1, boxShadow: 'none', borderColor: 'primary.main', ...(creationBlocked ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}>
                <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3, '&:last-child': { pb: 3 } }}>
                  <Box sx={{ flex: 1, minHeight: 260, overflow: 'hidden' }}>
                    <IDEMockup onOpenClick={handleOpenCloudEditor} />
                  </Box>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Import Integration card */}
          <Box sx={{ flex: '0 0 auto' }}>
            {aiBuilderEnabled ? (
              <Typography variant="body2" sx={{ mb: 2.5, color: 'text.secondary', fontWeight: 500, mt: 1 }}>
                Create it yourself
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ ...SECTION_LABEL_SX, mb: 1.5 }}>
                {standalone ? 'Import your own Integration' : 'Import your own'}
              </Typography>
            )}
            <Card variant="outlined" sx={{ boxShadow: 'none', ...(isImportAuthenticating || creationBlocked ? { pointerEvents: 'none', opacity: creationBlocked ? 0.5 : 0.7 } : {}) }}>
              <CardContent
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: aiBuilderEnabled ? 'space-between' : 'flex-start',
                  p: aiBuilderEnabled ? 2.5 : 1.5,
                  gap: 3,
                  '&:last-child': { pb: aiBuilderEnabled ? 2.5 : 1.5 },
                }}>
                {aiBuilderEnabled ? (
                  <>
                    {/* Create on Cloud affordance (view1: folded into the "Create it yourself" row) */}
                    <Button variant="text" onClick={handleOpenCloudEditor} data-cyid="create-on-cloud-btn" startIcon={<Plus size={20} />} sx={{ flexShrink: 0, color: 'primary.main', fontWeight: 500, textTransform: 'none', '&:hover': { opacity: 0.85 } }}>
                      Create on Cloud
                    </Button>

                    {/* Vertical divider */}
                    <Box sx={{ width: '2px', alignSelf: 'stretch', bgcolor: 'divider', flexShrink: 0 }} />

                    {/* Import label */}
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GitBranch size={18} />
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        Import a repository from
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 2, ml: 2, flexShrink: 0 }}>
                    <GitBranch size={18} />
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      Import a repository from
                    </Typography>
                  </Box>
                )}

                {/* Provider icon buttons */}
                <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: aiBuilderEnabled ? 2 : 4 }}>
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
                          <GitLogoIcon size={aiBuilderEnabled ? 24 : 25} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from GitHub" placement="top">
                        <IconButton aria-label="Import from GitHub" onClick={handleImportClick} sx={GITHUB_ICON_SX}>
                          <GitHub size={aiBuilderEnabled ? 23 : 24} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from GitLab" placement="top">
                        <IconButton aria-label="Import from GitLab" onClick={() => navigate(importUrl, { state: { provider: GitProvider.GITLAB_SELF_MANAGED } })} sx={PROVIDER_ICON_SX}>
                          <GitLabIcon size={aiBuilderEnabled ? 21 : 22} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from Bitbucket" placement="top">
                        <IconButton aria-label="Import from Bitbucket" onClick={() => navigate(importUrl, { state: { provider: GitProvider.BITBUCKET_CLOUD } })} sx={PROVIDER_ICON_SX}>
                          <BitbucketIcon size={aiBuilderEnabled ? 21 : 22} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Import from Azure" placement="top">
                        <IconButton aria-label="Import from Azure" onClick={() => navigate(importUrl, { state: { provider: GitProvider.AZURE_DEVOPS } })} sx={PROVIDER_ICON_SX}>
                          <AzureDevOpsIcon size={aiBuilderEnabled ? 21 : 22} />
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
        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="body2" sx={{ ...SECTION_LABEL_SX, mb: aiBuilderEnabled ? 1 : 1.5 }}>
            Start quickly
          </Typography>
          <Card
            variant="outlined"
            sx={{
              flex: 1,
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
              mt: aiBuilderEnabled ? 1.5 : 0,
            }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 3, '&:last-child': { pb: 3 } }}>
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
                          disabled={creationBlocked}
                          disabledTooltip={blockedTooltip}
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
                        <SampleRowCard key={sample.displayName} sample={sample} onDeploy={() => handleQuickDeploy(sample)} isDeploying={deployingSample === sample.displayName} deployDisabled={creationBlocked} deployDisabledTooltip={blockedTooltip} />
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
    </>
  );
}
