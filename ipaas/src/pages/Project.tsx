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
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  ListingTable,
  PageContent,
  Stack,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { ArrowRight, Bitbucket, GitHub, GitLab, Link2, Plus, PlugZap, RefreshCw, Trash2 } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import IntegrationTypesCard from '../components/IntegrationTypesCard';
import ArchitectureCard from '../components/ArchitectureCard';
import ContributorsCard from '../components/ContributorsCard';
import SearchField from '../components/SearchField';
import IDEMockup from '../components/IDEMockup/IDEMockup';
import PillTabs from '../components/PillTabs';
import PrebuiltCard from '../components/PrebuiltCard';
import SampleRowCard from '../components/SampleRowCard';
import IntegrationCreationLoader from '../components/IntegrationCreationLoader';
import GitIcon from '../assets/icons/GitIcon';
import AzureIcon from '../assets/icons/AzureIcon';
import { useNavigate } from 'react-router';
import { useState, type JSX } from 'react';
import { useProject, useProjectByHandler, useProjects } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useOrgs, useOrgComponentLimits, useOrgSubscriptions } from '../hooks/useOrg';
import { useChoreoSampleImages } from '../hooks/useRepository';
import type { Component } from '../types/component';
import { useDeleteComponent, useCreateComponent } from '../hooks/useComponents';
import NotFound from '../components/NotFound';
import { formatDistanceToNow } from '../utils/time';
import { resourceUrl, broaden, narrow, newComponentUrl, type ProjectScope } from '../nav';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '../auth/oauthState';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useAuth } from '../auth/AuthContext';
import { componentOverviewUrl, importComponentUrl, browseSamplesUrl, prebuiltIntegrationsUrl, importComingSoonUrl, buildGitHubOAuthUrl } from '../paths';
import { Permissions } from '../constants/permissions';
import { isSupportedIntegration, getDisplayLabel, displayTypeFromSample } from '../constants/integrations';
import { GITHUB_AUTH } from '../constants/github';
import { CARD_HOVER_SX, PROVIDER_ICON_SX } from '../constants/styles';
import Authorized from '../components/Authorized';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useLoadProjectPermissions } from '../hooks/usePermissionLoader';
import { UUID_RE, toHandler } from '../utils/string';
import { useSamples } from '../hooks/useSamples';
import { usePrebuiltIntegrations } from '../hooks/usePrebuiltIntegrations';
import type { Sample } from '../types/samples';

const FREE_COMPONENT_LIMIT = 5;

function EmptyProjectView({ scope, projectId }: { scope: ProjectScope; projectId: string }) {
  const navigate = useNavigate();
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

  const [isCloudEditorCardHovered, setIsCloudEditorCardHovered] = useState(false);
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
      navigate(importUrl);
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
          gridTemplateColumns: '1fr',
          '@container (min-width: 900px)': {
            gridTemplateColumns: '6fr 4fr',
          },
        }}>
        {/* Left column: Cloud Editor + Import */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <Tooltip title={creationBlocked ? blockedTooltip : ''} placement="top">
            <Box sx={creationBlocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
              <Card sx={{ ...CARD_HOVER_SX, ...(creationBlocked ? { pointerEvents: 'none' } : {}) }} onMouseEnter={() => setIsCloudEditorCardHovered(true)} onMouseLeave={() => setIsCloudEditorCardHovered(false)} onClick={handleOpenCloudEditor}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', p: 3, '&:last-child': { pb: 3 } }}>
                  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="h2">Create an Integration</Typography>
                    <Chip label="Beta" size="small" color="primary" variant="outlined" />
                  </Stack>
                  <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                    Start developing in a complete, browser-based development environment.
                  </Typography>
                  <Box sx={{ height: 260, overflow: 'hidden' }}>
                    <IDEMockup isHovered={isCloudEditorCardHovered} onOpenClick={handleOpenCloudEditor} />
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

function LinkRepositoryDialog({ open, onClose }: { scope: ProjectScope; open: boolean; onClose: () => void }) {
  const PROVIDER_CARD_SX = {
    cursor: 'pointer',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    p: 2.5,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    transition: 'border-color 0.15s, box-shadow 0.15s',
    '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
  };

  const DISABLED_CARD_SX = {
    ...PROVIDER_CARD_SX,
    cursor: 'not-allowed',
    opacity: 0.5,
    pointerEvents: 'none',
    '&:hover': {},
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Link a Repository</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          This feature is currently under development.
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Select a Git Provider
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {/* GitHub */}
          <Box sx={DISABLED_CARD_SX}>
            <GitHub size={28} />
            <Typography variant="body2" fontWeight={500}>
              Authorize with GitHub
            </Typography>
          </Box>

          {/* Bitbucket */}
          <Box sx={DISABLED_CARD_SX}>
            <Bitbucket size={28} />
            <Box>
              <Typography variant="body2" fontWeight={500}>
                Authorize with Bitbucket
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Select a Credential
              </Typography>
            </Box>
          </Box>

          {/* GitLab */}
          <Box sx={DISABLED_CARD_SX}>
            <GitLab size={28} />
            <Box>
              <Typography variant="body2" fontWeight={500}>
                Authorize with GitLab
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Select a Credential
              </Typography>
            </Box>
          </Box>

          {/* Public GitHub */}
          <Box sx={DISABLED_CARD_SX}>
            <GitHub size={28} />
            <Typography variant="body2" fontWeight={500}>
              Use Public GitHub Repository
            </Typography>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ component, scope, projectId, onClose }: { component: Component; scope: ProjectScope; projectId: string; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const mutation = useDeleteComponent();
  const confirmed = confirmation === component.displayName;

  const handleDelete = () => {
    mutation.mutate({ orgHandler: scope.org, componentId: component.id, projectId }, { onSuccess: onClose });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Are you sure you want to remove the integration &lsquo;<strong>{component.displayName}</strong>&rsquo; ?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>This action will be irreversible and all related details will be lost. Please type in the integration name below to confirm.</DialogContentText>
        {mutation.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {mutation.error.message || 'Failed to delete integration. Please try again.'}
          </Alert>
        )}
        <TextField autoFocus fullWidth placeholder="Enter integration name to confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" color="error" disabled={!confirmed || mutation.isPending} startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={handleDelete}>
          {mutation.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
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
  onSelect,
}: {
  components: Component[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  scope: ProjectScope;
  projectId: string;
  orgDevantComponentCount: number;
  onSelect: (handler: string) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [deleting, setDeleting] = useState<Component | null>(null);
  const quotaReached = orgDevantComponentCount >= FREE_COMPONENT_LIMIT;
  const q = query.trim().toLowerCase();
  const filtered = components
    .filter((c) => {
      if (!q) return true;
      const label = getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null);
      return c.displayName.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aSupported = isSupportedIntegration(a.displayType ?? '', a.componentSubType ?? null);
      const bSupported = isSupportedIntegration(b.displayType ?? '', b.componentSubType ?? null);
      if (aSupported === bSupported) return 0;
      return aSupported ? -1 : 1;
    });
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

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
        <SearchField value={query} onChange={setQuery} placeholder="Search" sx={{ flex: 1 }} />
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

      {isLoading ? (
        <CircularProgress size={24} color="primary" sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : filtered.length === 0 ? (
        <EmptyListing icon={<PlugZap size={48} />} title="No integrations found" description={query ? 'Try adjusting your search' : 'Create your first integration to get started'} />
      ) : (
        <ListingTable.Container disablePaper>
          <ListingTable variant="card" density="compact">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell>Type</ListingTable.Cell>
                <ListingTable.Cell>Last Updated</ListingTable.Cell>
                <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                  <ListingTable.Cell width={60}>Action</ListingTable.Cell>
                </Authorized>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {paginated.map((c) => {
                const isSupported = isSupportedIntegration(c.displayType ?? '', c.componentSubType ?? null);
                return (
                  <ListingTable.Row
                    key={c.id}
                    variant="card"
                    clickable={isSupported}
                    hover={isSupported}
                    tabIndex={isSupported ? 0 : -1}
                    aria-label={`View details for ${c.displayName}`}
                    aria-disabled={!isSupported}
                    onClick={isSupported ? () => onSelect(c.handler) : undefined}
                    onKeyDown={
                      isSupported
                        ? (e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              if (e.key === ' ') e.preventDefault();
                              onSelect(c.handler);
                            }
                          }
                        : undefined
                    }
                    sx={!isSupported ? { opacity: 0.45, cursor: 'default' } : undefined}>
                    <ListingTable.Cell>
                      <Stack direction="row" alignItems="center" gap={1.5}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'action.hover', color: 'text.primary' }}>{c.displayName[0].toUpperCase()}</Avatar>
                        {c.displayName}
                      </Stack>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                        {c.description || ''}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>{getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null)}</ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDistanceToNow(c.lastBuildDate)}
                      </Typography>
                    </ListingTable.Cell>
                    <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                      <ListingTable.Cell>
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
                      </ListingTable.Cell>
                    </Authorized>
                  </ListingTable.Row>
                );
              })}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
      {filtered.length > 10 && (
        <TablePagination
          component="div"
          count={filtered.length}
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

      {deleting && <DeleteDialog component={deleting} scope={scope} projectId={projectId} onClose={() => setDeleting(null)} />}
    </section>
  );
}

export default function Project(scope: ProjectScope): JSX.Element {
  const navigate = useNavigate();
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  const { data: projectByHandle, isLoading: loadingByHandle } = useProjectByHandler(isUuid ? '' : scope.project);
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = isUuid ? projectById : (projectByHandle ?? projectFromList);
  const loadingProject = !project && (isUuid ? loadingById : loadingByHandle || loadingProjects);
  const projectId = project?.id ?? '';
  useLoadProjectPermissions(scope.org, projectId);
  const { data: components = [], isLoading: loadingComponents, isFetching: fetchingComponents, refetch: refetchComponents } = useComponents(scope.org, projectId);
  const { data: orgs = [] } = useOrgs();
  const orgUuid = useOrgUuid() ?? orgs.find((o) => o.handle === scope.org)?.uuid ?? '';
  const { data: orgLimits } = useOrgComponentLimits(orgUuid);
  const { data: subscriptions } = useOrgSubscriptions(orgUuid);
  const isUpgraded = (subscriptions ?? []).some((s) => s.subscriptionType === 'devant-subscription' && s.subscriptionStatus === 'active');
  const orgDevantComponentCount = isUpgraded ? 0 : (orgLimits?.billableComponentCount ?? 0);
  const [linkRepoOpen, setLinkRepoOpen] = useState(false);

  if (loadingProject) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }
  if (!project) {
    return <NotFound message="Project not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Projects" />;
  }

  const isEmpty = !loadingComponents && components.length === 0;

  return (
    <PageContent sx={{ 'container-type': 'inline-size' }}>
      <Stack component="header" direction="row" alignItems="center" gap={2} sx={{ mb: isEmpty ? 3 : 4 }}>
        <Avatar sx={{ width: 56, height: 56, fontSize: 24, bgcolor: 'text.primary', color: 'background.paper' }}>{project?.name?.[0]?.toUpperCase() ?? 'P'}</Avatar>
        <div>
          <Typography variant="h1">{project.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {project.description}
          </Typography>
          <Button size="small" variant="text" color="primary" startIcon={<Link2 size={14} />} onClick={() => setLinkRepoOpen(true)} sx={{ mt: 0.5, pl: 0, textTransform: 'none', fontSize: '0.8125rem' }}>
            Link a Repository
          </Button>
        </div>
      </Stack>

      <LinkRepositoryDialog scope={scope} open={linkRepoOpen} onClose={() => setLinkRepoOpen(false)} />

      {isEmpty ? (
        <EmptyProjectView scope={scope} projectId={projectId} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: '1fr',
            '@container (min-width: 900px)': {
              gridTemplateColumns: '2fr 1fr',
            },
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
              onSelect={(handler) => navigate(componentOverviewUrl(scope.org, project?.handler ?? scope.project, handler))}
            />
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
    </PageContent>
  );
}
