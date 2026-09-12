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

import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonGroup,
  InputBase,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grow,
  IconButton,
  InputAdornment,
  Link,
  ListingTable,
  Menu,
  MenuItem,
  MenuList,
  PageContent,
  Paper,
  Popper,
  Stack,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink, FileText, Filter, GitHub, GitBranch, Info, Link2, Pencil, Plus, PlugZap, RefreshCw, Search, Trash2 } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import IntegrationTypesCard from '../components/IntegrationTypesCard';
import ArchitectureCard from '../components/ArchitectureCard';
import ContributorsCard from '../components/ContributorsCard';
import IDEMockup from '../components/IDEMockup/IDEMockup';
import PillTabs from '../components/PillTabs';
import PrebuiltCard from '../components/PrebuiltCard';
import SampleRowCard from '../components/SampleRowCard';
import IntegrationCreationLoader from '../components/IntegrationCreationLoader';
import LinkRepositoryDialog from '../components/ProjectCreate/LinkRepositoryDialog';
import GitLogoIcon from '../assets/icons/GitLogoIcon';
import GitLabIcon from '../assets/icons/GitLabIcon';
import BitbucketIcon from '../assets/icons/BitbucketIcon';
import AzureDevOpsIcon from '../assets/icons/AzureDevOpsIcon';
import IntegratorIcon from '../assets/icons/IntegratorIcon';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useProject, useProjectByHandler, useProjects, useUpdateProject, useGitHubReadme, useIsOrgScopeReady } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useRemovalNotice } from '../hooks/useRemovalNotice';
import { useFreshDefaultProject } from '../hooks/useFreshDefaultProject';
import { useOrgs, useOrgComponentLimits, useOrgSubscriptions } from '../hooks/useOrg';
import { useChoreoSampleImages } from '../hooks/useRepository';
import type { Component, ComponentDeletionError, ComponentSubscription, SubscriptionInfo } from '../types/component';
import { useDeleteComponent, useCreateComponent } from '../hooks/useComponents';
import NotFound from '../components/NotFound';
import { formatDistanceToNow } from '../utils/time';
import { resourceUrl, broaden, narrow, newComponentUrl, type ProjectScope } from '../nav';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '../auth/tokenManager';
import { IS_CLOUD } from '../features';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useAuth } from '../auth/AuthContext';
import { componentOverviewUrl, importComponentUrl, browseSamplesUrl, prebuiltIntegrationsUrl, importComingSoonUrl, buildGitHubOAuthUrl } from '../paths';
import { Permissions } from '../constants/permissions';
import { isSupportedIntegration, getDisplayLabel, displayTypeFromSample, componentSubTypeFromSample, getNonIntegrationPlatform } from '../constants/integrations';
import { identifyIntegration } from '../utils/identifyIntegration';
import IntegrationIcon from '../components/IntegrationIcon';
import { GITHUB_AUTH } from '../constants/github';
import { CARD_HOVER_SX, PROVIDER_ICON_SX, GITHUB_ICON_SX } from '../constants/styles';
import Authorized from '../components/Authorized';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useFeaturePreview } from '../contexts/FeaturePreviewContext';
import { useLoadProjectPermissions } from '../hooks/usePermissionLoader';
import { UUID_RE, toHandler } from '../utils/string';
import { useSamples } from '../hooks/useSamples';
import { usePrebuiltIntegrations } from '../hooks/usePrebuiltIntegrations';
import type { Sample } from '../types/samples';

const Markdown = lazy(() => import('../components/Markdown'));

const FREE_COMPONENT_LIMIT = 5;

function EmptyProjectView({ scope, projectId }: { scope: ProjectScope; projectId: string }) {
  const navigate = useAppNavigate();
  const { userId } = useAuth();
  const { hasAnyPermission } = useAccessControl();
  const orgUuid = useOrgUuid() ?? '';
  const { data: samplesData, isLoading: samplesLoading, isError: samplesError } = useSamples();
  const { data: prebuiltData, isLoading: prebuiltLoading, isError: prebuiltError } = usePrebuiltIntegrations();
  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);
  const { data: orgLimits } = useOrgComponentLimits(orgUuid);
  const { data: subscriptions } = useOrgSubscriptions(orgUuid);
  const createComponent = useCreateComponent();

  const isUpgraded = (subscriptions ?? []).some((s) => s.subscriptionType === 'devant-subscription' && s.subscriptionStatus === 'active');
  const orgDevantComponentCount = isUpgraded ? 0 : (orgLimits?.billableComponentCount ?? 0);
  const quotaReached = orgDevantComponentCount >= FREE_COMPONENT_LIMIT;
  const canManage = hasAnyPermission([Permissions.INTEGRATION_MANAGE], projectId);

  const creationBlocked = !canManage || quotaReached;
  const blockedTooltip = !canManage ? 'You do not have permission to create integrations.' : 'You have exceeded the allocated integration quota. Upgrade your subscription.';

  const checkCreationGuard = (): boolean => {
    if (!canManage) {
      setPageError({ message: 'You do not have permission to create integrations.', severity: 'error' });
      return false;
    }
    if (quotaReached) {
      setPageError({ message: 'You have exceeded the allocated integration quota. Upgrade your subscription.', severity: 'warning' });
      return false;
    }
    return true;
  };

  const featuredSamples = samplesData?.featuredSamples ?? [];
  const featuredPrebuilt = (prebuiltData?.prebuiltIntegrations ?? []).slice(0, 3);

  const [selectedTab, setSelectedTab] = useState(0);
  const [deployingSample, setDeployingSample] = useState<string | null>(null);
  const [isImportAuthenticating, setIsImportAuthenticating] = useState(false);
  const [pageError, setPageError] = useState<{ message: string; severity: 'error' | 'warning' } | null>(null);

  const importUrl = importComponentUrl(scope.org, scope.project);

  const handleOpenCloudEditor = async () => {
    if (!checkCreationGuard()) return;
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

  const handleImportClick = () => {
    if (!checkCreationGuard()) return;
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
    if (!popup) {
      setIsImportAuthenticating(false);
      setPageError({ message: 'Please allow popups for this site and try again.', severity: 'warning' });
      return;
    }
    const channel = new BroadcastChannel(GITHUB_AUTH.BROADCAST_CHANNEL);
    const pollClosed = setInterval(() => {
      if (popup.closed) {
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
    if (!checkCreationGuard()) return;
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
        // AI agents and MCP servers ride the Ballerina displayType and are told
        // apart by the sub-type; without it a sample creates a plain integration.
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
    );
  }

  return (
    <>
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
          gridTemplateColumns: { xs: '1fr', md: '6fr 4fr' },
        }}>
        {/* Left column: Cloud Editor + Import */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <Tooltip title={creationBlocked ? blockedTooltip : ''} placement="top">
            <Box sx={creationBlocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
              <Card sx={{ ...CARD_HOVER_SX, ...(creationBlocked ? { pointerEvents: 'none' } : {}) }} onClick={handleOpenCloudEditor}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', p: 3, '&:last-child': { pb: 3 } }}>
                  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="h2">Create an Integration</Typography>
                    <Chip label="Beta" size="small" color="primary" variant="outlined" />
                  </Stack>
                  <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                    Start developing in a complete, browser-based development environment.
                  </Typography>
                  <Box sx={{ height: 260, overflow: 'hidden' }}>
                    <IDEMockup onOpenClick={handleOpenCloudEditor} />
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Tooltip>

          <Tooltip title={creationBlocked ? blockedTooltip : ''} placement="top">
            <Box sx={creationBlocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
              <Card variant="outlined" sx={{ boxShadow: 'none', ...(isImportAuthenticating ? { pointerEvents: 'none', opacity: 0.7 } : creationBlocked ? { pointerEvents: 'none' } : {}) }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 3, gap: 3, '&:last-child': { pb: 3 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h2" sx={{ mb: 0.5 }}>
                      Import an Integration
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {isImportAuthenticating ? 'Completing GitHub authorization…' : 'Connect your repository and start building instantly'}
                    </Typography>
                  </Box>
                  <Box sx={{ width: '2px', alignSelf: 'stretch', bgcolor: 'divider', flexShrink: 0 }} />
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
                            <GitLogoIcon size={25} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Import from GitHub" placement="top">
                          <IconButton aria-label="Import from GitHub" onClick={handleImportClick} sx={GITHUB_ICON_SX}>
                            <GitHub size={24} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Import from GitLab" placement="top">
                          <IconButton aria-label="Import from GitLab" onClick={() => navigate(importComingSoonUrl(scope.org, scope.project))} sx={PROVIDER_ICON_SX}>
                            <GitLabIcon size={22} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Import from Bitbucket" placement="top">
                          <IconButton aria-label="Import from Bitbucket" onClick={() => navigate(importComingSoonUrl(scope.org, scope.project))} sx={PROVIDER_ICON_SX}>
                            <BitbucketIcon size={22} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Import from Azure" placement="top">
                          <IconButton aria-label="Import from Azure" onClick={() => navigate(importComingSoonUrl(scope.org, scope.project))} sx={PROVIDER_ICON_SX}>
                            <AzureDevOpsIcon size={22} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Tooltip>
        </Box>

        {/* Right column: Get Started Quickly */}
        <Box sx={{ minWidth: 0 }}>
          <Card variant="outlined" sx={{ height: '100%', boxShadow: 'none', display: 'flex', flexDirection: 'column' }}>
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
                <Box sx={{ display: 'flex', flexDirection: 'column', ...(selectedTab !== 0 ? { visibility: 'hidden', pointerEvents: 'none', zIndex: 0 } : {}) }}>
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
                        <PrebuiltCard key={integration.displayName} integration={integration} onClick={() => navigate(prebuiltIntegrationsUrl(scope.org, scope.project))} disabled={creationBlocked} disabledTooltip={blockedTooltip} />
                      ))}
                    </Box>
                  )}
                  <Box sx={{ mt: 'auto', pt: 2 }}>
                    <Button variant="text" color="primary" endIcon={<ArrowRight size={14} />} onClick={() => navigate(prebuiltIntegrationsUrl(scope.org, scope.project))} sx={{ textTransform: 'none', pl: 0 }}>
                      Explore more prebuilt integrations
                    </Button>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', ...(selectedTab !== 1 ? { visibility: 'hidden', pointerEvents: 'none', zIndex: 0 } : {}) }}>
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

      {/* Footer links */}
      <Stack direction="row" alignItems="center" gap={2} sx={{ mt: 4 }}>
        <Link href="https://wso2.com/devant/docs" target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main', fontSize: '0.875rem' }}>
          Tutorials
        </Link>
        <Divider orientation="vertical" flexItem />
        <Link href="https://discord.gg/wso2" target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main', fontSize: '0.875rem' }}>
          Get Support on Discord
        </Link>
      </Stack>
    </>
  );
}

const APIM_SUBSCRIBERS_ERROR_CODE = 'APIM_SUBSCRIBERS';

/** Splits an integration's active API subscribers into internal (Choreo-managed test apps) vs external, deduped by application. */
function splitSubscribers(data: SubscriptionInfo[]): { internal: ComponentSubscription[]; external: ComponentSubscription[] } {
  const seen = new Set<string>();
  const internal: ComponentSubscription[] = [];
  const external: ComponentSubscription[] = [];
  data.forEach((info) => {
    info.list.forEach((sub) => {
      const { applicationId, name } = sub.applicationInfo;
      if (seen.has(applicationId)) return;
      seen.add(applicationId);
      (name.startsWith('_internal') ? internal : external).push(sub);
    });
  });
  return { internal, external };
}

function DeleteDialog({ component, scope, projectId, onClose, onDeleted }: { component: Component; scope: ProjectScope; projectId: string; onClose: () => void; onDeleted: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [subscribers, setSubscribers] = useState<{ internal: ComponentSubscription[]; external: ComponentSubscription[] } | null>(null);
  const mutation = useDeleteComponent();
  const confirmed = confirmation === component.displayName;

  // Escape and backdrop bypass the disabled Cancel button, so gate them too.
  const handleClose = () => {
    if (!mutation.isPending) onClose();
  };

  const handleDelete = () => {
    setDeleteError(null);
    mutation.mutate(
      { orgHandler: scope.org, componentId: component.id, projectId },
      {
        onSuccess: (result) => {
          if (result.canDelete) {
            onDeleted();
            return;
          }
          // The backend blocks deletion (e.g. active API subscribers) without throwing — canDelete must be checked explicitly.
          if (result.encodedData) {
            try {
              const bytes = Uint8Array.from(atob(result.encodedData), (c) => c.charCodeAt(0));
              const [firstError]: ComponentDeletionError[] = JSON.parse(new TextDecoder().decode(bytes));
              if (firstError?.code === APIM_SUBSCRIBERS_ERROR_CODE) {
                setSubscribers(splitSubscribers(firstError.data));
                return;
              }
            } catch {
              // Malformed encodedData — fall through to the generic message below.
            }
          }
          // Not a subscriber block (or a stale one from a prior attempt) — drop the subscribers
          // view so the generic error below is what actually renders.
          setSubscribers(null);
          setDeleteError(result.message || 'Failed to delete integration. Please try again.');
        },
        onError: (e) => {
          setSubscribers(null);
          setDeleteError(e instanceof Error ? e.message : 'Failed to delete integration. Please try again.');
        },
      },
    );
  };

  if (subscribers) {
    const { internal, external } = subscribers;
    return (
      <Dialog open onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Integration &lsquo;{component.displayName}&rsquo; has endpoints with active subscribers</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>This integration cannot be deleted as it has the following subscribers:</DialogContentText>
          {external.length > 0 && (
            <Box component="ul" sx={{ m: 0, mb: 1, pl: 3 }}>
              {external.map((s) => (
                <Typography key={s.applicationInfo.applicationId} component="li" variant="body2">
                  {s.applicationInfo.name}
                </Typography>
              ))}
            </Box>
          )}
          {internal.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {internal.length} internal usage{internal.length === 1 ? '' : 's'}
            </Typography>
          )}
          <Typography variant="body2">Please remove them before proceeding.</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={mutation.isPending} startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {mutation.isPending ? 'Retrying…' : 'Retry Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Are you sure you want to remove the integration &lsquo;<strong>{component.displayName}</strong>&rsquo; ?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>This action will be irreversible and all related details will be lost. Please type in the integration name below to confirm.</DialogContentText>
        {deleteError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {deleteError}
          </Alert>
        )}
        <TextField autoFocus fullWidth placeholder="Enter integration name to confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={handleClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button variant="contained" color="error" disabled={!confirmed || mutation.isPending} startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={handleDelete}>
          {mutation.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const INIT_PROGRESS_MAP: Record<string, { progress: number; text: string }> = {
  queued: { progress: 60, text: 'Setting up CI/CD pipelines' },
  pending: { progress: 30, text: 'Initializing component…' },
  running: { progress: 75, text: 'Configuring repository settings…' },
  in_progress: { progress: 75, text: 'Configuring repository settings…' },
};

function isCreatedWithin24Hours(createdAt?: string): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < 86_400_000;
}

function getInitProgress(c: Component, isWorkspace: boolean): { progress: number; text: string } | null {
  if (!c.initStatus?.trim()) return null;
  if (!isWorkspace && !isCreatedWithin24Hours(c.createdAt)) return null;
  return INIT_PROGRESS_MAP[c.initStatus.toLowerCase()] ?? null;
}

function ComponentNameCell({ component: c, isWorkspace, external = false, projectGitOrg, projectGitRepo }: { component: Component; isWorkspace: boolean; external?: boolean; projectGitOrg?: string; projectGitRepo?: string }) {
  const init = getInitProgress(c, isWorkspace);
  const nameLabel = init && c.displayType ? `${c.displayName}: ${c.displayType}` : c.displayName;
  const isExternalRepo =
    !!projectGitOrg && !!projectGitRepo && !!c.repository?.organizationApp && !!c.repository?.nameApp && (c.repository.organizationApp.toLowerCase() !== projectGitOrg.toLowerCase() || c.repository.nameApp.toLowerCase() !== projectGitRepo.toLowerCase());
  return (
    <Stack direction="row" alignItems="center" gap={1.5}>
      {init ? (
        <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: 40, height: 40 }}>
          <CircularProgress variant="determinate" value={init.progress} size={40} thickness={3} />
          <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="caption" component="div" color="text.secondary" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>
              {init.progress}%
            </Typography>
          </Box>
        </Box>
      ) : (
        <IntegrationIcon type={identifyIntegration(c.displayType ?? '', c.componentSubType ?? null).type} external={external} />
      )}
      <Stack direction="row" alignItems="center" gap={0.5}>
        <Stack gap={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {nameLabel}
          </Typography>
          {init && (
            <Typography variant="caption" color="text.secondary">
              {init.text}
            </Typography>
          )}
        </Stack>
        {isExternalRepo && !init && (
          <Tooltip title="This is an external integration linked from outside of this project repository.">
            <Box component="span" sx={{ display: 'inline-flex', color: 'text.secondary', ml: 0.25 }}>
              <ExternalLink size={13} />
            </Box>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
}

function IntegrationsTable({
  components,
  isLoading,
  isRefreshing,
  onRefresh,
  scope,
  projectId,
  orgDevantComponentCount,
  isWorkspace,
  projectGitOrg,
  projectGitRepo,
  onSelect,
}: {
  components: Component[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  scope: ProjectScope;
  projectId: string;
  orgDevantComponentCount: number;
  isWorkspace: boolean;
  projectGitOrg?: string;
  projectGitRepo?: string;
  onSelect: (handler: string) => void;
}) {
  const navigate = useAppNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [deleting, setDeleting] = useState<Component | null>(null);
  const [deleteAlert, setDeleteAlert] = useState<string | null>(null);
  useRemovalNotice(
    projectId,
    components,
    (c) => c.displayName,
    (name) => setDeleteAlert(`Integration '${name}' deleted successfully.`),
  );
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null);
  const quotaReached = orgDevantComponentCount >= FREE_COMPONENT_LIMIT;

  const allLabels = useMemo(() => {
    const s = new Set<string>();
    components.forEach((c) => {
      const labels = Array.isArray(c.labels) ? c.labels : c.labels ? [c.labels] : [];
      labels.forEach((l) => s.add(l));
    });
    return Array.from(s).sort();
  }, [components]);

  const handleToggleLabel = (label: string) => {
    setSelectedLabels((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  const q = query.trim().toLowerCase();
  const filtered = components.filter((c) => {
    const typeLabel = getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null);
    const matchesSearch = !q || c.displayName.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || typeLabel.toLowerCase().includes(q);
    const componentLabels = Array.isArray(c.labels) ? c.labels : c.labels ? [c.labels] : [];
    const matchesLabels = selectedLabels.length === 0 || componentLabels.some((l) => selectedLabels.includes(l));
    return matchesSearch && matchesLabels;
  });
  const filteredIntegrations = filtered.filter((c) => isSupportedIntegration(c.displayType ?? '', c.componentSubType ?? null, c.buildpackType));
  const filteredNonIntegrations = filtered.filter((c) => !isSupportedIntegration(c.displayType ?? '', c.componentSubType ?? null, c.buildpackType));
  const maxPage = Math.max(0, Math.ceil(filteredIntegrations.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filteredIntegrations.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  return (
    <section>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 2 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
          Integrations
        </Typography>
        <IconButton
          size="small"
          aria-label="Refresh integrations"
          onClick={onRefresh}
          disabled={isRefreshing}
          sx={isRefreshing ? { '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }, '& svg': { animation: 'spin 1s linear infinite' } } : undefined}>
          <RefreshCw size={16} />
        </IconButton>
        <TextField
          size="small"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search integrations' },
            input: {
              startAdornment: (
                <>
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                  {selectedLabels.map((label) => (
                    <Chip key={label} label={label} size="small" onDelete={() => handleToggleLabel(label)} sx={{ mr: 0.5 }} />
                  ))}
                </>
              ),
              endAdornment:
                allLabels.length > 0 ? (
                  <InputAdornment position="end">
                    <Tooltip title="Filter by label">
                      <IconButton size="small" aria-label="Filter by label" onClick={(e) => setLabelAnchor(e.currentTarget)} color={selectedLabels.length > 0 ? 'primary' : undefined} edge="end">
                        <Filter size={16} />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ) : undefined,
            },
          }}
        />
        <Menu anchorEl={labelAnchor} open={Boolean(labelAnchor)} onClose={() => setLabelAnchor(null)} slotProps={{ paper: { sx: { minWidth: 180, maxHeight: 320 } } }}>
          {allLabels.map((label) => (
            <MenuItem key={label} onClick={() => handleToggleLabel(label)} dense>
              <Checkbox size="small" checked={selectedLabels.includes(label)} sx={{ p: 0, mr: 1 }} />
              <Typography variant="body2">{label}</Typography>
            </MenuItem>
          ))}
          {selectedLabels.length > 0 && (
            <>
              <Divider />
              <MenuItem
                onClick={() => {
                  setSelectedLabels([]);
                  setLabelAnchor(null);
                }}
                dense>
                <Typography variant="body2" color="error">
                  Clear filter
                </Typography>
              </MenuItem>
            </>
          )}
        </Menu>
        <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
          <Tooltip title={quotaReached ? 'You have exceeded the allocated integration quota. Upgrade your subscription.' : ''} placement="top">
            <span>
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(newComponentUrl(scope))} disabled={quotaReached}>
                Create
              </Button>
            </span>
          </Tooltip>
        </Authorized>
      </Stack>

      {deleteAlert && (
        <Alert severity="success" onClose={() => setDeleteAlert(null)} sx={{ mb: 2 }}>
          {deleteAlert}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} color="primary" />
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyListing icon={<PlugZap size={48} />} title="No integrations found" description={query || selectedLabels.length > 0 ? 'Try adjusting your search or filters' : 'Create your first integration to get started'} />
      ) : (
        <>
          {filteredIntegrations.length > 0 && (
            <ListingTable.Container disablePaper>
              <ListingTable variant="card" density="compact" sx={{ '& .MuiTableBody-root .MuiTableCell-root': { py: 2 } }}>
                <ListingTable.Head>
                  <ListingTable.Row>
                    <ListingTable.Cell>Name</ListingTable.Cell>
                    <ListingTable.Cell>Description</ListingTable.Cell>
                    <ListingTable.Cell>Type</ListingTable.Cell>
                    <ListingTable.Cell>Last Updated</ListingTable.Cell>
                    <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                      <ListingTable.Cell width={60} align="right">
                        Action
                      </ListingTable.Cell>
                    </Authorized>
                  </ListingTable.Row>
                </ListingTable.Head>
                <ListingTable.Body>
                  {paginated.map((c) => {
                    const init = getInitProgress(c, isWorkspace);
                    const deleting = c.deleting === true;
                    return (
                      // followCursor because ListingTable.Row does not forward a ref for the tooltip to anchor to.
                      <Tooltip key={c.id} followCursor title={deleting ? 'This integration is being deleted' : ''}>
                        <ListingTable.Row
                          variant="card"
                          clickable={!deleting}
                          hover={!deleting}
                          tabIndex={deleting ? -1 : 0}
                          aria-disabled={deleting || undefined}
                          aria-label={deleting ? `${c.displayName} is being deleted` : `View details for ${c.displayName}`}
                          // The card variant tints its own background on hover; pin both states so a dying row stays inert.
                          sx={deleting ? { opacity: 0.38, cursor: 'default', backgroundColor: 'background.acrylic', '&:hover': { backgroundColor: 'background.acrylic' } } : undefined}
                          onClick={deleting ? undefined : () => onSelect(c.handler)}
                          onKeyDown={(e) => {
                            if (!deleting && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              if (e.key === ' ') e.preventDefault();
                              onSelect(c.handler);
                            }
                          }}>
                          <ListingTable.Cell>
                            <ComponentNameCell component={c} isWorkspace={isWorkspace} projectGitOrg={projectGitOrg} projectGitRepo={projectGitRepo} />
                          </ListingTable.Cell>
                          <ListingTable.Cell>
                            {!init && (
                              <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                {c.description?.trim() || ''}
                              </Typography>
                            )}
                          </ListingTable.Cell>
                          <ListingTable.Cell>{!init && <Typography variant="body2">{getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null)}</Typography>}</ListingTable.Cell>
                          <ListingTable.Cell>
                            {!init && !deleting && (
                              <Typography variant="body2" color="text.secondary">
                                {formatDistanceToNow(c.lastBuildDate)}
                              </Typography>
                            )}
                          </ListingTable.Cell>
                          <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                            <ListingTable.Cell align="right">
                              {deleting ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <CircularProgress size={14} color="inherit" />
                                  <Typography variant="body2" color="text.secondary" noWrap>
                                    Deleting
                                  </Typography>
                                </Box>
                              ) : (
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label={`Delete ${c.displayName}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleting(c);
                                    }}>
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </ListingTable.Cell>
                          </Authorized>
                        </ListingTable.Row>
                      </Tooltip>
                    );
                  })}
                </ListingTable.Body>
              </ListingTable>
            </ListingTable.Container>
          )}
          {filteredIntegrations.length > 10 && (
            <TablePagination
              component="div"
              count={filteredIntegrations.length}
              page={safePage}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 20, 50]}
              sx={{ mt: 1 }}
              SelectProps={{ inputProps: { 'aria-label': 'rows per page' } }}
            />
          )}

          {filteredNonIntegrations.length > 0 && (
            <>
              <Typography variant="h6" component="h3" sx={{ fontWeight: 600, mt: filteredIntegrations.length > 0 ? 4 : 0, mb: 2 }}>
                Non Integrations
              </Typography>
              <ListingTable.Container disablePaper>
                <ListingTable variant="card" density="compact" sx={{ '& .MuiTableBody-root .MuiTableCell-root': { py: 2 } }}>
                  <ListingTable.Head>
                    <ListingTable.Row>
                      <ListingTable.Cell>Name</ListingTable.Cell>
                      <ListingTable.Cell>Description</ListingTable.Cell>
                      <ListingTable.Cell>Type</ListingTable.Cell>
                      <ListingTable.Cell>Last Updated</ListingTable.Cell>
                      {/* No Action column: another platform owns these, so none of them are actionable from here. */}
                    </ListingTable.Row>
                  </ListingTable.Head>
                  <ListingTable.Body>
                    {filteredNonIntegrations.map((c) => {
                      const init = getInitProgress(c, isWorkspace);
                      return (
                        <Tooltip key={c.id} followCursor title={`This component is not part of WSO2 Integration Platform. Switch to ${getNonIntegrationPlatform(c.originCloud)} to view and manage it.`}>
                          <ListingTable.Row variant="card" aria-disabled tabIndex={-1} sx={{ opacity: 0.5, cursor: 'default' }}>
                            <ListingTable.Cell>
                              <ComponentNameCell component={c} isWorkspace={isWorkspace} external projectGitOrg={projectGitOrg} projectGitRepo={projectGitRepo} />
                            </ListingTable.Cell>
                            <ListingTable.Cell>
                              {!init && (
                                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                  {c.description?.trim() || ''}
                                </Typography>
                              )}
                            </ListingTable.Cell>
                            <ListingTable.Cell>{!init && <Typography variant="body2">{getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null)}</Typography>}</ListingTable.Cell>
                            <ListingTable.Cell>
                              {!init && (
                                <Typography variant="body2" color="text.secondary">
                                  {formatDistanceToNow(c.lastBuildDate)}
                                </Typography>
                              )}
                            </ListingTable.Cell>
                          </ListingTable.Row>
                        </Tooltip>
                      );
                    })}
                  </ListingTable.Body>
                </ListingTable>
              </ListingTable.Container>
            </>
          )}
        </>
      )}

      {deleting && <DeleteDialog component={deleting} scope={scope} projectId={projectId} onClose={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />}
    </section>
  );
}

function buildProjectRepoUrl(gitProvider?: string, gitOrganization?: string, repository?: string, branch?: string): string | null {
  if (!gitOrganization || !repository) return null;
  const b = branch || 'main';
  switch (gitProvider?.toLowerCase()) {
    case 'github':
      return `https://github.com/${gitOrganization}/${repository}/tree/${b}`;
    case 'bitbucket':
      return `https://bitbucket.org/${gitOrganization}/${repository}/src/HEAD/?at=${b}`;
    case 'gitlab':
      return `https://gitlab.com/${gitOrganization}/${repository}`;
    default:
      return `https://github.com/${gitOrganization}/${repository}/tree/${b}`;
  }
}

export default function Project(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  const { data: projectByHandle, isLoading: loadingByHandle } = useProjectByHandler(isUuid ? '' : scope.project);
  const { data: allProjects = [], isLoading: loadingProjects, isFetching: fetchingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = isUuid ? projectById : (projectByHandle ?? projectFromList);
  const isOrgScopeReady = useIsOrgScopeReady();
  // Right after fresh onboarding, asgardeoOrgNumericId isn't recovered yet, so the project
  // queries above are disabled and report isLoading: false — indistinguishable from "we checked
  // and there's genuinely no project" unless we also wait on org-scope readiness here. Without
  // this, the page briefly flashes "Project not found" before the real data arrives.
  // fetchingProjects covers the other route to the same flash: a refetch of the invalidated
  // list reports isLoading false while its data is still pre-creation.
  const loadingProject = !isOrgScopeReady || (!project && (isUuid ? loadingById : loadingByHandle || loadingProjects || fetchingProjects));
  const projectId = project?.id ?? '';
  useLoadProjectPermissions(scope.org, projectId);
  // Shared with AppLayout's left-nav hiding, so both surfaces hide on exactly the same one-shot
  // "just landed here right after onboarding" signal and can't drift out of sync. This only fires
  // on that first landing — navigating elsewhere and back always shows the header again, even if
  // the project is still empty, so it never vanishes on a repeat visit.
  const justProvisionedDefaultProject = useFreshDefaultProject();
  const { data: components = [], isLoading: loadingComponents, isFetching: fetchingComponents, isSuccess: isComponentsSuccess, refetch: refetchComponents } = useComponents(scope.org, projectId);
  // Avoids flashing the "has integrations" table chrome (search bar, Create button, table spinner)
  // before flipping to the true empty state once the components query resolves — the query
  // reporting isLoading: true otherwise makes `isEmpty` false by default, picking the wrong
  // branch until the real answer comes back. justProvisionedDefaultProject already guarantees
  // emptiness for the onboarding transition (the project was just created), and a per-project
  // sessionStorage cache covers repeat visits to any other empty project within the same tab
  // session, so only a genuinely first-ever visit to an empty non-onboarding project still waits.
  const emptyProjectCacheKey = projectId ? `project-overview-empty:${projectId}` : null;
  const cachedIsEmpty = emptyProjectCacheKey ? sessionStorage.getItem(emptyProjectCacheKey) === 'true' : false;

  useEffect(() => {
    if (!emptyProjectCacheKey || !isComponentsSuccess) return;
    sessionStorage.setItem(emptyProjectCacheKey, String(components.length === 0));
  }, [emptyProjectCacheKey, isComponentsSuccess, components.length]);

  const { data: orgs = [] } = useOrgs();
  const orgUuid = useOrgUuid() ?? orgs.find((o) => o.handle === scope.org)?.uuid ?? '';
  const { data: orgLimits } = useOrgComponentLimits(orgUuid);
  const { data: subscriptions } = useOrgSubscriptions(orgUuid);
  const isUpgraded = (subscriptions ?? []).some((s) => s.subscriptionType === 'devant-subscription' && s.subscriptionStatus === 'active');
  const orgDevantComponentCount = isUpgraded ? 0 : (orgLimits?.billableComponentCount ?? 0);
  const [linkRepoOpen, setLinkRepoOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const splitButtonRef = useRef<HTMLDivElement>(null);
  const [descEditing, setDescEditing] = useState(false);
  const [descHovered, setDescHovered] = useState(false);
  const [descValue, setDescValue] = useState('');
  const descInputRef = useRef<HTMLInputElement>(null);
  const { userId } = useAuth();
  const { features } = useFeaturePreview();
  const openInIntegratorEnabled = !!features['Project level Open in local Integrator'];
  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);
  const codeServerSample = useMemo(() => (sampleImages ?? []).find((img) => img.name === 'Code Server'), [sampleImages]);
  const updateProject = useUpdateProject();
  const { data: readmeContent } = useGitHubReadme(project?.gitOrganization, project?.repository);
  const [openEditorWarning, setOpenEditorWarning] = useState<'cloud' | 'integrator' | null>(null);
  const [excludedExpanded, setExcludedExpanded] = useState(true);
  const [primaryAction, setPrimaryAction] = useState<'cloud' | 'integrator'>('cloud');
  useEffect(() => {
    setDescValue(project?.description?.trim() ?? '');
  }, [project?.description]);

  if (loadingProject) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }
  if (!project) {
    return <NotFound message="Project not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Projects" />;
  }

  const isEmpty = justProvisionedDefaultProject || (isComponentsSuccess ? components.length === 0 : cachedIsEmpty);
  const isWorkspace = project.type === 'MONO_REPO';
  const openInCloudComponent =
    components.find((c) => {
      if (!isSupportedIntegration(c.displayType, c.componentSubType, c.buildpackType)) return false;
      if (!project.gitOrganization || !project.repository) return true;
      if (!c.repository?.organizationApp || !c.repository?.nameApp) return true;
      return c.repository.organizationApp.toLowerCase() === project.gitOrganization.toLowerCase() && c.repository.nameApp.toLowerCase() === project.repository.toLowerCase();
    }) ?? null;
  const projectRepoUrl = buildProjectRepoUrl(project.gitProvider, project.gitOrganization, project.repository, project.branch);

  const externalComponents =
    project.gitOrganization && project.repository
      ? components.filter((c) => !!c.repository?.organizationApp && !!c.repository?.nameApp && (c.repository.organizationApp.toLowerCase() !== project.gitOrganization!.toLowerCase() || c.repository.nameApp.toLowerCase() !== project.repository!.toLowerCase()))
      : [];

  const doOpenInCloud = () => {
    if (!codeServerSample || !openInCloudComponent) return;
    const params = new URLSearchParams({
      userId: userId ?? '',
      orgUuid,
      orgHandle: scope.org,
      projectId,
      componentId: openInCloudComponent.id,
      codeServerSample: JSON.stringify(codeServerSample),
    });
    window.open(`${window.location.origin}/editor?${params}`, '_blank', 'noopener,noreferrer');
    setSplitOpen(false);
    setOpenEditorWarning(null);
  };

  const doOpenInIntegrator = () => {
    if (!openInCloudComponent) return;
    const isMI = (openInCloudComponent.displayType ?? '').startsWith('mi');
    const extensionId = isMI ? 'WSO2.micro-integrator' : 'WSO2.ballerina';
    const params = new URLSearchParams({ project: project.handler, org: scope.org, component: openInCloudComponent.handler });
    window.open(`vscode://${extensionId}/open?${params}`, '_blank');
    setSplitOpen(false);
    setOpenEditorWarning(null);
  };

  const handleOpenInCloud = () => {
    if (!codeServerSample || !openInCloudComponent) return;
    if (externalComponents.length > 0) {
      setExcludedExpanded(true);
      setOpenEditorWarning('cloud');
      setSplitOpen(false);
      return;
    }
    doOpenInCloud();
  };

  const handleOpenInIntegrator = () => {
    if (!openInCloudComponent) return;
    if (externalComponents.length > 0) {
      setExcludedExpanded(true);
      setOpenEditorWarning('integrator');
      setSplitOpen(false);
      return;
    }
    doOpenInIntegrator();
  };

  const commitDescEdit = () => {
    const trimmed = descValue.trim();
    const original = project.description?.trim() ?? '';
    if (trimmed === original) {
      setDescEditing(false);
      return;
    }
    updateProject.mutate(
      { id: project.id, name: project.name, description: trimmed || ' ', version: project.version },
      {
        onSuccess: () => setDescEditing(false),
        onError: () => {
          setDescValue(original);
          setDescEditing(false);
        },
      },
    );
  };

  const cancelDescEdit = () => {
    setDescValue(project.description?.trim() ?? '');
    setDescEditing(false);
  };

  return (
    // Vertically centers the empty state for a fresh user's first landing on the auto-provisioned
    // project — the header is hidden in this state too, so this is the only content on the page,
    // and centering it reads as a deliberate welcome screen rather than content stuck at the top.
    <PageContent sx={justProvisionedDefaultProject ? { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}>
      {/* Hidden for a fresh user's still-empty auto-provisioned project — the name/description/
          repo-link controls have nothing to act on yet and only add noise to the empty state. */}
      {!justProvisionedDefaultProject && (
        <Stack component="header" direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: isEmpty ? 3 : 4 }}>
          <Stack sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="flex-start" gap={2}>
              <Avatar variant="rounded" sx={{ width: 58, height: 58, borderRadius: 1, fontSize: 24, bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>
                {project?.name?.[0]?.toUpperCase() ?? 'P'}
              </Avatar>
              <div>
                <Typography variant="h1" mb={1}>
                  {project.name}
                </Typography>
                <Stack direction="row" alignItems="flex-start" gap={1} onMouseEnter={() => setDescHovered(true)} onMouseLeave={() => setDescHovered(false)}>
                  <Box
                    sx={{ position: 'relative', flex: 1, cursor: 'text', mt: 0.25 }}
                    onClick={() => {
                      if (!descEditing) {
                        setDescEditing(true);
                        setTimeout(() => descInputRef.current?.focus(), 0);
                      }
                    }}>
                    <Typography
                      variant="body2"
                      component="div"
                      sx={{
                        visibility: descEditing ? 'hidden' : 'visible',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: descValue ? 'text.secondary' : 'primary.main',
                        minHeight: '1.4em',
                      }}>
                      {descValue || '+ Add Description'}
                      {descValue && (
                        <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'middle', ml: 0.5 }}>
                          <Tooltip title="Edit description">
                            <IconButton
                              size="small"
                              sx={{ p: 0.25, opacity: descHovered ? 1 : 0, transition: 'opacity 0.15s' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDescEditing(true);
                                setTimeout(() => descInputRef.current?.focus(), 0);
                              }}>
                              <Pencil size={12} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Typography>
                    {descEditing && (
                      <InputBase
                        inputRef={descInputRef}
                        multiline
                        autoFocus
                        value={descValue}
                        onChange={(e) => setDescValue(e.target.value)}
                        onBlur={commitDescEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelDescEdit();
                          }
                        }}
                        sx={(theme) => ({
                          position: 'absolute',
                          inset: '-4px',
                          padding: '4px',
                          border: `2px solid ${theme.palette.primary.main}`,
                          borderRadius: `${theme.shape.borderRadius}px`,
                          alignItems: 'flex-start',
                          '& textarea': { ...theme.typography.body2, padding: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent' },
                        })}
                        disabled={updateProject.isPending}
                        autoComplete="off"
                      />
                    )}
                  </Box>
                  {updateProject.isPending && <CircularProgress size={12} sx={{ mt: 0.25 }} />}
                </Stack>
              </div>
            </Stack>
            {/* Outside the text column so its left edge lines up with the avatar's. */}
            {projectRepoUrl ? (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 2 }}>
                <GitHub size={14} />
                <Link href={projectRepoUrl} target="_blank" rel="noreferrer" data-testid="project-repo-link-link" underline="hover" sx={{ color: 'primary.main', fontSize: '0.8125rem' }}>
                  {projectRepoUrl}
                </Link>
              </Stack>
            ) : (
              <Button
                size="small"
                variant="text"
                color="primary"
                startIcon={<Link2 size={14} />}
                onClick={() => setLinkRepoOpen(true)}
                sx={{ mt: 2, pl: 0, alignSelf: 'flex-start', textTransform: 'none', fontSize: '0.8125rem' }}>
                Link a Repository
              </Button>
            )}
          </Stack>
          {openInCloudComponent && projectRepoUrl && (
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              {openInIntegratorEnabled ? (
                <>
                  <ButtonGroup variant="outlined" size="small" ref={splitButtonRef}>
                    <Button
                      startIcon={
                        <Box component="span" sx={{ color: 'text.primary', display: 'flex' }}>
                          <IntegratorIcon width={16} height={16} />
                        </Box>
                      }
                      onClick={primaryAction === 'cloud' ? handleOpenInCloud : handleOpenInIntegrator}
                      disabled={primaryAction === 'cloud' ? !codeServerSample : !openInCloudComponent}
                      sx={{ whiteSpace: 'nowrap' }}>
                      {primaryAction === 'cloud' ? <>Open in Cloud</> : 'Open in Integrator'}
                    </Button>
                    <Button size="small" sx={{ px: 0.5 }} aria-label="More options" onClick={() => setSplitOpen((prev) => !prev)}>
                      <ChevronDown size={14} />
                    </Button>
                  </ButtonGroup>
                  <Popper open={splitOpen} anchorEl={splitButtonRef.current} placement="bottom-end" transition disablePortal style={{ zIndex: 1300 }}>
                    {({ TransitionProps }) => (
                      <Grow {...TransitionProps}>
                        <Paper elevation={3}>
                          <ClickAwayListener onClickAway={() => setSplitOpen(false)}>
                            <MenuList dense sx={{ minWidth: 200 }}>
                              <MenuItem
                                onClick={() => {
                                  setPrimaryAction('cloud');
                                  handleOpenInCloud();
                                }}
                                disabled={!codeServerSample}>
                                <Stack direction="row" alignItems="center" gap={1}>
                                  <IntegratorIcon width={16} height={16} />
                                  <Typography variant="body2">Open in Cloud</Typography>
                                </Stack>
                              </MenuItem>
                              <MenuItem
                                onClick={() => {
                                  setPrimaryAction('integrator');
                                  handleOpenInIntegrator();
                                }}>
                                <Stack direction="row" alignItems="center" gap={1}>
                                  <IntegratorIcon width={16} height={16} />
                                  <Typography variant="body2">Open in Integrator</Typography>
                                </Stack>
                              </MenuItem>
                            </MenuList>
                          </ClickAwayListener>
                        </Paper>
                      </Grow>
                    )}
                  </Popper>
                </>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    <Box component="span" sx={{ color: 'text.primary', display: 'flex' }}>
                      <IntegratorIcon width={16} height={16} />
                    </Box>
                  }
                  onClick={handleOpenInCloud}
                  disabled={!codeServerSample}
                  sx={{ whiteSpace: 'nowrap' }}>
                  Open in Cloud
                </Button>
              )}
            </Box>
          )}
        </Stack>
      )}

      {project && <LinkRepositoryDialog open={linkRepoOpen} onClose={() => setLinkRepoOpen(false)} project={project} orgHandler={scope.org} />}

      {isEmpty ? (
        <EmptyProjectView scope={scope} projectId={projectId} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 4,
            gridTemplateColumns: { xs: '1fr', md: '3fr 1fr' },
          }}>
          <Box>
            <IntegrationsTable
              components={components}
              isLoading={loadingComponents}
              isRefreshing={fetchingComponents && !loadingComponents}
              onRefresh={refetchComponents}
              scope={scope}
              projectId={projectId}
              orgDevantComponentCount={orgDevantComponentCount}
              isWorkspace={isWorkspace}
              projectGitOrg={project.gitOrganization}
              projectGitRepo={project.repository}
              onSelect={(handler) => navigate(componentOverviewUrl(scope.org, project?.handler ?? scope.project, handler))}
            />
            {readmeContent && (
              <Card sx={{ mt: 3 }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
                    <FileText size={16} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      README.md
                    </Typography>
                  </Stack>
                  <Suspense fallback={null}>
                    <Markdown>{readmeContent}</Markdown>
                  </Suspense>
                </CardContent>
              </Card>
            )}
          </Box>
          <Box>
            <Stack gap={3}>
              <ArchitectureCard projectId={projectId} components={components} isLoading={loadingComponents} isRefreshing={fetchingComponents && !loadingComponents} onRefresh={refetchComponents} />
              <IntegrationTypesCard components={components} />
              <ContributorsCard projectId={projectId} />
            </Stack>
          </Box>
        </Box>
      )}

      <Dialog open={!!openEditorWarning} onClose={() => setOpenEditorWarning(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pb: 1 }}>
          <Info size={22} style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography variant="h6" component="span" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            Integrations from external repositories will not be available
          </Typography>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {openEditorWarning === 'cloud' ? 'The Cloud Editor only opens integrations that belong to the project repository.' : 'The Integrator only opens integrations that belong to the project repository.'}
          </DialogContentText>
          {projectRepoUrl && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Opening
              </Typography>
              <GitBranch size={14} />
              <Typography variant="body2">{projectRepoUrl}</Typography>
            </Stack>
          )}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" onClick={() => setExcludedExpanded((v) => !v)} sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', cursor: 'pointer', userSelect: 'none' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                The following integration{externalComponents.length !== 1 ? 's' : ''} will be excluded:
              </Typography>
              {excludedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Stack>
            {excludedExpanded && (
              <Box sx={{ px: 2, py: 1.5 }}>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {externalComponents.map((c) => (
                    <li key={c.id}>
                      <Typography variant="body2">{c.displayName}</Typography>
                    </li>
                  ))}
                </ul>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setOpenEditorWarning(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => (openEditorWarning === 'cloud' ? doOpenInCloud() : doOpenInIntegrator())} disabled={openEditorWarning === 'cloud' ? !codeServerSample : !openInCloudComponent}>
            Open {openEditorWarning === 'integrator' ? 'integrator' : 'editor'} anyway
          </Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
