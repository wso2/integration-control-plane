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

import { Alert, Box, Button, CircularProgress, FormHelperText, Grid, IconButton, InputAdornment, Link, MenuItem, PageContent, Skeleton, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, GitBranch, RefreshCw, GitHub } from '@wso2/oxygen-ui-icons-react';
import { MENU_SEARCH_THRESHOLD } from '../components/MenuSearchField';
import { useState, useEffect, useMemo, useRef, type JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useCreateComponent } from '../hooks/useComponents';
import type { DisplayType } from '../types/component';
import { useGitHubUserRepos, useRepoBranches, useRepoContents, useRepoMetadata, useComponentNameAvailability } from '../hooks/useRepository';
import type { DetectedMode } from '../types/repository';
import DirectoryPickerField from '../components/DirectoryPicker';
import IntegrationTypeSelector from '../components/IntegrationCreate/IntegrationTypeSelector';
import TechnologySelector from '../components/IntegrationCreate/TechnologySelector';
import TechDetectionIcon from '../components/IntegrationCreate/TechDetectionIcon';
import BallerinaCentralTokenDrawer from '../components/IntegrationCreate/BallerinaCentralTokenDrawer';
import { useBallerinaCentralToken } from '../hooks/useBallerinaCentralToken';
import IntegrationCreationLoader from '../components/IntegrationCreationLoader';
import type { IntegrationType, SourceMode, LocationState } from '../types/import';
import { SAMPLE_REPO_URL } from '../constants/github';
import { external } from '../paths';
import { GH_SELECT_ACTION, organizationActionItems, repositoryActionItems, selectMenuHeader } from '../components/Import/gitHubSelectActions';
import { GitProvider, type GitCredential } from '../types/credentials';
import AddCredentialDialog from '../components/Settings/Credentials/AddCredentialDialog';
import { IS_CLOUD } from '../features';
import { gitProviderIcon, GIT_PROVIDER_LABEL } from '../constants/gitProviders';
import { credentialsForProvider } from '../utils/gitCredentials';
import { useGitCredentials } from '../hooks/useCredentials';
import CredentialSelectCard from '../components/Import/CredentialSelectCard';
import { buildRepoUrl } from '../utils/gitProviderUrl';
import { URL_DEBOUNCE_MS } from '../constants/project';
import { resourceUrl, narrow, newComponentUrl, type ProjectScope } from '../nav';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { toHandler, formatRepoNameToDisplayName } from '../utils/string';
import { parseGitHubUrl } from '../utils/github';
import { detectTechnology } from '../utils/technologyDetection';
import { useProjectId } from '../hooks/useProjects';

// Helper/error text rendered below the field+refresh row (not inside the field),
// so the refresh icon stays centred on the input box. Matches MUI's default
// helperText offset (14px left, 3px top).
const FIELD_HELPER_SX = {
  mx: 1.75,
  mt: 0.5,
} as const;

export default function ImportIntegration(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation();

  const { projectId } = useProjectId(scope.project);

  const locationState = location.state as LocationState | null;
  const preAuthenticated = !!locationState?.authenticated;
  const pendingAuthCode = locationState?.authCode ?? null;

  const [sourceMode] = useState<SourceMode>(locationState?.mode ?? 'github');
  const isPublicRepo = sourceMode === 'public';

  // Non-GitHub credential-based provider (Bitbucket/GitLab/Azure) chosen on the
  // Create page. Captured once so it survives location-state clears. In this
  // mode the GitHub OAuth flow is replaced by a stored-credential picker, and
  // the selected credential's id is threaded as `secretRef` into every repo call.
  const [credProvider] = useState<GitProvider | null>(locationState?.provider ?? null);
  const isCredentialMode = !!credProvider && credProvider !== GitProvider.GITHUB;
  const [selectedCredential, setSelectedCredential] = useState<GitCredential | null>(null);
  const credentialId = selectedCredential?.id ?? '';
  const [showCredentialModal, setShowCredentialModal] = useState(false);

  // Existing credentials for the chosen provider drive the picker card: if the user already
  // has some, they select from the dropdown; if none exist, the authorize modal opens directly.
  const { data: allCredentials = [], isLoading: isCredsLoading } = useGitCredentials(isCredentialMode);
  const providerCredentials = useMemo(() => credentialsForProvider(allCredentials, credProvider ?? ''), [allCredentials, credProvider]);
  const hasCredentials = providerCredentials.length > 0;
  const autoOpenedModalRef = useRef(false);

  // No credentials yet → open the authorize modal once (the "prompt to add" path).
  useEffect(() => {
    if (!isCredentialMode || isCredsLoading || autoOpenedModalRef.current) return;
    if (!hasCredentials && !selectedCredential) {
      autoOpenedModalRef.current = true;
      setShowCredentialModal(true);
    }
  }, [isCredentialMode, isCredsLoading, hasCredentials, selectedCredential]);

  const { authStatus, startGitHubAuth, exchangeAuthCode, startGitHubAppInstall, openGitHubManage, githubInstallUrl } = useGitHubAuth(preAuthenticated ? 'done' : pendingAuthCode ? 'authenticating' : 'idle');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');

  const [repoUrl, setRepoUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [parsedOrg, setParsedOrg] = useState('');
  const [parsedRepo, setParsedRepo] = useState('');

  const [selectedBranch, setSelectedBranch] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [subPath, setSubPath] = useState('/');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [detectedMode, setDetectedMode] = useState<DetectedMode>(null);
  const [selectedTechnology, setSelectedTechnology] = useState<'MI' | 'BI' | null>(null);
  const [selectedIntegrationType, setSelectedIntegrationType] = useState<IntegrationType | null>(null);
  const [ballerinaTokenInput, setBallerinaTokenInput] = useState('');
  const [ballerinaDrawerOpen, setBallerinaDrawerOpen] = useState(false);
  const { data: ballerinaTokenStatus } = useBallerinaCentralToken();

  const activeOrg = isPublicRepo ? parsedOrg : selectedOrg;
  const activeRepo = isPublicRepo ? parsedRepo : selectedRepo;

  const createComponent = useCreateComponent();

  const displayNameAutoRef = useRef(false);

  // Exchange OAuth code on mount (GitHub mode only)
  const authCodeExchangedRef = useRef(false);
  useEffect(() => {
    if (isPublicRepo || !pendingAuthCode || authCodeExchangedRef.current) return;
    authCodeExchangedRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    exchangeAuthCode(pendingAuthCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // secretRef scopes every repo call to the chosen credential's provider account; '' keeps the GitHub OAuth path.
  const secretRef = isCredentialMode ? credentialId : '';

  const reposEnabled = !isPublicRepo && (isCredentialMode ? !!credentialId : authStatus === 'done' || preAuthenticated);
  const { data: userRepos, isLoading: isReposLoading, isError: isReposError, isSuccess: isReposSuccess, refetch: refetchRepos } = useGitHubUserRepos(reposEnabled, secretRef);

  // Authorization is proven by a successful repo query, not by a non-empty list —
  // an authorized account with no repositories is still authenticated.
  const isAuthenticated = !isPublicRepo && isReposSuccess;
  const hasRepos = (userRepos?.length ?? 0) > 0;
  const isCheckingAuth = !isPublicRepo && reposEnabled && isReposLoading;

  const { data: branches, isLoading: isBranchesLoading, refetch: refetchBranches } = useRepoBranches(activeOrg, activeRepo, isPublicRepo, secretRef);

  const showBranchAndSubPath = !!(activeOrg && activeRepo);
  const pathReady = !!(activeOrg && activeRepo && selectedBranch);

  const { data: repoContents = [], isLoading: isContentsLoading, isError: isContentsError, refetch: refetchContents } = useRepoContents(activeOrg, activeRepo, selectedBranch, isPublicRepo, secretRef);

  const { data: repoMetadata, isFetching: isValidating, refetch: refetchMetadata } = useRepoMetadata(activeOrg, activeRepo, selectedBranch, subPath, pathReady, isPublicRepo, secretRef);

  const handleRevalidate = () => {
    setDetectedMode(null);
    setSelectedTechnology(null);
    refetchMetadata();
  };

  // Helper to reset downstream state when source repo changes
  const resetDownstreamState = (options: { includeDisplayName?: boolean; includeTechnology?: boolean } = {}) => {
    setSelectedBranch('');
    setSubPath('/');
    if (options.includeTechnology) setSelectedTechnology(null);
    if (options.includeDisplayName) {
      setDisplayName('');
      displayNameAutoRef.current = false;
    }
  };

  const baseHandler = toHandler(displayName);
  const { data: nameAvailability, isFetching: isCheckingName } = useComponentNameAvailability(projectId, baseHandler);

  const effectiveHandler = (() => {
    if (!baseHandler || baseHandler.length < 3) return baseHandler;
    if (!nameAvailability) return baseHandler;
    return nameAvailability.componentNameUnique ? baseHandler : nameAvailability.alternateComponentName || baseHandler;
  })();

  const handlerValid = effectiveHandler.length >= 3 && effectiveHandler.length <= 64;

  // Technology detection
  useEffect(() => {
    if (!pathReady || isValidating) {
      setDetectedMode(null);
      return;
    }
    setDetectedMode(detectTechnology(repoMetadata));
  }, [pathReady, isValidating, repoMetadata]);

  // Project detected mode onto the selectable technology
  useEffect(() => {
    if (detectedMode === 'mi') setSelectedTechnology('MI');
    else if (detectedMode === 'ballerina') setSelectedTechnology('BI');
    else if (detectedMode === null) setSelectedTechnology(null);
  }, [detectedMode, activeRepo, selectedBranch, subPath]);

  // GitHub mode: reset downstream when repo changes.
  useEffect(() => {
    if (isPublicRepo) return;
    if (selectedRepo) {
      setDisplayName(formatRepoNameToDisplayName(selectedRepo));
      displayNameAutoRef.current = true;
    }
    resetDownstreamState();
    if (branches && branches.length > 0) {
      const def = branches.find((b) => b.isDefault);
      setSelectedBranch(def?.name ?? branches[0].name);
    }
  }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select the default branch when branches load, and reconcile a stale
  // selection after a refresh: replace an invalid branch with the default, or
  // clear it when no branches remain.
  useEffect(() => {
    if (!branches) return;
    if (branches.length === 0) {
      if (selectedBranch) setSelectedBranch('');
      return;
    }
    if (!selectedBranch || !branches.some((b) => b.name === selectedBranch)) {
      const def = branches.find((b) => b.isDefault);
      setSelectedBranch(def?.name ?? branches[0].name);
    }
  }, [branches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Public mode: debounced URL parsing
  useEffect(() => {
    if (!isPublicRepo) return;
    const id = setTimeout(() => {
      if (!repoUrl) {
        setUrlError('');
        setParsedOrg('');
        setParsedRepo('');
        resetDownstreamState({ includeDisplayName: true, includeTechnology: true });
        return;
      }
      const parsed = parseGitHubUrl(repoUrl);
      if (!parsed) {
        setUrlError('Enter a valid GitHub URL, e.g. https://github.com/org/repo');
        setParsedOrg('');
        setParsedRepo('');
        return;
      }
      setUrlError('');
      if (parsed.org !== parsedOrg || parsed.repo !== parsedRepo) {
        resetDownstreamState({ includeDisplayName: true, includeTechnology: true });
        setParsedOrg(parsed.org);
        setParsedRepo(parsed.repo);
      }
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // parsedOrg/parsedRepo intentionally omitted — compared only on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  // Public mode: auto-populate display name from parsed repo
  useEffect(() => {
    if (!isPublicRepo) return;
    if (parsedRepo && (!displayName || displayNameAutoRef.current)) {
      setDisplayName(formatRepoNameToDisplayName(parsedRepo));
      displayNameAutoRef.current = true;
    }
    // displayName intentionally omitted to avoid overwriting manual edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedRepo]);

  // Auto-update display name when sub path selection changes
  useEffect(() => {
    if (!displayNameAutoRef.current && displayName) return;
    const sourceName = isPublicRepo ? parsedRepo : selectedRepo;
    if (!sourceName) return;
    if (subPath && subPath !== '/') {
      const lastSegment = subPath.split('/').filter(Boolean).pop();
      if (lastSegment) {
        setDisplayName(formatRepoNameToDisplayName(lastSegment));
        displayNameAutoRef.current = true;
      }
    } else {
      setDisplayName(formatRepoNameToDisplayName(sourceName));
      displayNameAutoRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subPath]);

  const orgOptions = userRepos?.map((o) => o.orgName) ?? [];
  const reposForOrg = userRepos?.find((o) => o.orgName === selectedOrg)?.repositories.map((r) => r.name) ?? [];

  // Reconcile the selected org/repo after a refresh: if the chosen org or repo no
  // longer exists in the refreshed data, clear it and reset dependent state.
  useEffect(() => {
    if (isPublicRepo || !userRepos) return;
    if (selectedOrg && !orgOptions.includes(selectedOrg)) {
      setSelectedOrg('');
      setSelectedRepo('');
      resetDownstreamState({ includeDisplayName: true, includeTechnology: true });
      return;
    }
    if (selectedRepo && !reposForOrg.includes(selectedRepo)) {
      setSelectedRepo('');
      resetDownstreamState({ includeDisplayName: true, includeTechnology: true });
    }
  }, [userRepos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit handler
  //
  // File Integration shares displayType with a regular service
  // (`ballerinaService` / `miApiService`); the distinguishing signal is
  // `componentSubType` (`ballerinaFileIntegration` / `miFileIntegration`),
  // resolved by `resolveComponentSubType`. Event Integration is different —
  // it carries its identity in `displayType` (`ballerinaEventHandler` /
  // `miEventHandler`) with no subType, matching devant's create flow.
  // Automation and Integration as API don't need a subType.
  const resolveDisplayType = (): DisplayType => {
    if (selectedTechnology === 'BI') {
      if (selectedIntegrationType === 'automation') return 'scheduledTask';
      if (selectedIntegrationType === 'event-integration') return 'ballerinaEventHandler';
      return 'ballerinaService';
    }
    if (selectedIntegrationType === 'automation') return 'miCronjob';
    if (selectedIntegrationType === 'event-integration') return 'miEventHandler';
    return 'miApiService';
  };

  const resolveComponentSubType = (): string | undefined => {
    if (selectedIntegrationType === 'file-integration') return selectedTechnology === 'BI' ? 'ballerinaFileIntegration' : 'miFileIntegration';
    // AI Agent shares a generic service displayType (resolved above); `aiAgent`
    // is the discriminator, matching devant's create flow.
    if (selectedIntegrationType === 'ai-agent') return 'aiAgent';
    // MCP Server (from source) — also a generic service displayType + `MCP`
    // subtype. (The MCP *proxy* convert-from-API flow is separate.)
    if (selectedIntegrationType === 'mcp-server') return 'MCP';
    return undefined;
  };

  const canSubmit = Boolean(activeOrg && activeRepo && selectedBranch && selectedTechnology && selectedIntegrationType && displayName.trim() && handlerValid && projectId && (isPublicRepo || isAuthenticated));

  const handleSubmit = () => {
    createComponent.mutate(
      {
        displayName: displayName.trim(),
        name: effectiveHandler,
        description,
        orgHandler: scope.org,
        projectId,
        displayType: resolveDisplayType(),
        componentSubType: resolveComponentSubType(),
        srcGitRepoUrl: buildRepoUrl(isCredentialMode && selectedCredential ? (selectedCredential.type as GitProvider) : (credProvider ?? GitProvider.GITHUB), activeOrg, activeRepo, selectedCredential?.serverUrl),
        repositoryBranch: selectedBranch,
        repositorySubPath: subPath || '/',
        isPublicRepo,
        // Non-GitHub providers build through the stored credential (secretRef).
        ...(isCredentialMode ? { secretRef: credentialId } : {}),
        // Private repos in the cloud variant build through the GitHub App
        // installation that grants access; other variants keep their original
        // payload untouched.
        ...(isPublicRepo ? { enableAutoDeploy: true } : !isCredentialMode && IS_CLOUD ? { gitHubAppInstallationId: userRepos?.find((o) => o.orgName === activeOrg)?.installationId } : {}),
      },
      {
        onSuccess: (component) => navigate(resourceUrl(narrow(scope, component.handler), 'overview')),
        onError: () => {},
      },
    );
  };

  const backUrl = newComponentUrl(scope);

  // Render helpers

  const providerLabel = credProvider ? (GIT_PROVIDER_LABEL[credProvider] ?? 'Git provider') : 'Git provider';

  // Credential-mode auth is driven entirely by the (non-closable) authorize
  // modal. The only thing shown inline is a failure notice: if repos can't be
  // loaded with the just-authorized credential, offer a re-authorize retry.
  const credentialAuthFailed = isCredentialMode && !!credentialId && isReposError;
  const renderCredentialArea = () => {
    if (!credentialAuthFailed) return null;
    return (
      <Box sx={{ mb: 4, width: '50%' }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setSelectedCredential(null);
                setSelectedOrg('');
                setSelectedRepo('');
                setSelectedBranch('');
                setShowCredentialModal(true);
              }}>
              Retry
            </Button>
          }>
          Could not access your {providerLabel} repositories. Re-authorize and try again.
        </Alert>
      </Box>
    );
  };

  const renderGitHubArea = () => {
    if (isCredentialMode) return renderCredentialArea();
    if (isCheckingAuth) {
      return (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4, minHeight: 50 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Checking GitHub connection…
          </Typography>
        </Stack>
      );
    }
    // Authenticated: no status chrome — the Organization field itself carries
    // the provider icon and a reconnect (refresh) action. An authorized account
    // with no repositories still needs guidance to grant access.
    if (isAuthenticated) {
      if (hasRepos) return null;
      return (
        <Box sx={{ mb: 4 }}>
          <Alert
            severity="warning"
            action={
              githubInstallUrl ? (
                <Button color="inherit" size="small" onClick={() => openGitHubManage(githubInstallUrl, refetchRepos)}>
                  Connect
                </Button>
              ) : undefined
            }>
            No repositories found. Please check your GitHub access.
          </Alert>
        </Box>
      );
    }
    // Cloud only: authorized, but the GitHub App is not installed on any
    // account yet. The install popup must open from this button's click —
    // opening it straight from the token exchange gets popup-blocked (no
    // user gesture).
    if (IS_CLOUD && authStatus === 'needs-install') {
      return (
        <Box sx={{ mb: 4 }}>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            The GitHub App is not installed on any of your accounts yet. Install it on the account or organization that owns your repository, then authorize again.
          </Alert>
          <Button
            variant="outlined"
            startIcon={
              <Box sx={{ color: 'common.black', display: 'flex' }}>
                <GitHub size={16} />
              </Box>
            }
            onClick={() => startGitHubAppInstall(refetchRepos)}
            size="small">
            Install GitHub App
          </Button>
        </Box>
      );
    }

    // Failed: a single self-contained error Alert with an inline Retry action —
    // no separate button. The Organization field also renders in its error
    // (red) state (see renderRepoPickers).
    if (authStatus === 'failed') {
      return (
        <Box sx={{ mb: 4 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => startGitHubAuth(refetchRepos)}>
                Retry
              </Button>
            }>
            GitHub authorization failed.
          </Alert>
        </Box>
      );
    }

    // The authenticating/installing states never reach here — the page-level
    // early return above renders the full-page progress view for them.
    return (
      <Box sx={{ mb: 4 }}>
        <Button
          variant="outlined"
          startIcon={
            <Box sx={{ color: 'common.black', display: 'flex' }}>
              <GitHub size={16} />
            </Box>
          }
          onClick={() => startGitHubAuth(refetchRepos)}
          size="small">
          Authorize with GitHub
        </Button>
      </Box>
    );
  };

  // Row 1 source pickers — switches based on sourceMode:
  const renderRepoPickers = () => (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      {isPublicRepo ? (
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label="Repository URL"
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            fullWidth
            error={!!urlError}
            helperText={urlError || (isBranchesLoading && parsedOrg ? 'Fetching branches…' : 'e.g. https://github.com/org/repo')}
            slotProps={{
              input: {
                endAdornment:
                  isBranchesLoading && parsedOrg ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ) : undefined,
              },
            }}
          />
          {!parsedOrg && (
            <Button variant="text" size="small" sx={{ mt: 1, ml: 1.5, p: 0, minWidth: 0, textTransform: 'none', fontSize: 12 }} onClick={() => setRepoUrl(SAMPLE_REPO_URL)}>
              Try with a sample
            </Button>
          )}
        </Grid>
      ) : (
        <>
          <Grid size={{ xs: 12, md: 3 }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <TextField
                label="Organization"
                select
                required
                value={selectedOrg}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === GH_SELECT_ACTION.addOrg) {
                    openGitHubManage(githubInstallUrl, refetchRepos);
                    return;
                  }
                  // Switching organizations should reset every downstream field —
                  // the user explicitly asked for a fresh start on org change.
                  setSelectedOrg(v);
                  setSelectedRepo('');
                  setSelectedBranch('');
                  setSubPath('/');
                  setDisplayName('');
                  setDescription('');
                  setSelectedTechnology(null);
                  setSelectedIntegrationType(null);
                  displayNameAutoRef.current = false;
                }}
                fullWidth
                disabled={!isAuthenticated || isReposLoading}
                error={authStatus === 'failed' || credentialAuthFailed}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Box sx={{ color: 'common.black', display: 'flex' }}>{isCredentialMode ? gitProviderIcon(credProvider!, 16) : <GitHub size={16} />}</Box>
                      </InputAdornment>
                    ),
                  },
                }}>
                {!isCredentialMode && organizationActionItems(!!githubInstallUrl, isAuthenticated ? { label: 'Reconnect GitHub', onClick: () => startGitHubAuth(refetchRepos) } : undefined)}
                {orgOptions.map((org) => (
                  <MenuItem key={org} value={org}>
                    {org}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <FormHelperText error={authStatus === 'failed' || credentialAuthFailed} sx={FIELD_HELPER_SX}>
              {isCredentialMode ? `${providerLabel} organization` : 'GitHub organization'}
            </FormHelperText>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <TextField
                label="Repository"
                select
                required
                value={selectedRepo}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === GH_SELECT_ACTION.connectRepos) {
                    openGitHubManage(githubInstallUrl, refetchRepos);
                    return;
                  }
                  if (v === GH_SELECT_ACTION.createRepo) {
                    openGitHubManage(external.githubNew, refetchRepos);
                    return;
                  }
                  setSelectedRepo(v);
                }}
                fullWidth
                disabled={!selectedOrg || isReposLoading}
                slotProps={{
                  select: { onClose: () => setRepoSearch('') },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Box sx={{ color: 'common.black', display: 'flex' }}>{isCredentialMode ? gitProviderIcon(credProvider!, 16) : <GitHub size={16} />}</Box>
                      </InputAdornment>
                    ),
                  },
                }}>
                {selectMenuHeader(
                  { key: 'repo-search', value: repoSearch, onChange: setRepoSearch, placeholder: 'Search repositories', show: reposForOrg.length > MENU_SEARCH_THRESHOLD },
                  isAuthenticated ? { label: 'Refresh repositories', onClick: () => refetchRepos(), loading: isReposLoading } : undefined,
                )}
                {!isCredentialMode && repositoryActionItems(!!githubInstallUrl)}
                {reposForOrg
                  .filter((repo) => repo.toLowerCase().includes(repoSearch.trim().toLowerCase()))
                  .map((repo) => (
                    <MenuItem key={repo} value={repo}>
                      {repo}
                    </MenuItem>
                  ))}
              </TextField>
            </Stack>
            <FormHelperText sx={FIELD_HELPER_SX}>Select repository</FormHelperText>
          </Grid>
        </>
      )}

      {showBranchAndSubPath && (
        <Grid size={{ xs: 12, md: 3 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <TextField
              label="Branch"
              select
              required
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              fullWidth
              disabled={!activeRepo || isBranchesLoading}
              slotProps={{
                select: { onClose: () => setBranchSearch('') },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <GitBranch size={18} />
                    </InputAdornment>
                  ),
                },
              }}>
              {selectMenuHeader(
                { key: 'branch-search', value: branchSearch, onChange: setBranchSearch, placeholder: 'Search branches', show: (branches ?? []).length > MENU_SEARCH_THRESHOLD },
                { label: 'Refresh branches', onClick: () => refetchBranches(), loading: isBranchesLoading },
              )}
              {(branches ?? [])
                .filter((b) => b.name.toLowerCase().includes(branchSearch.trim().toLowerCase()))
                .map((b) => (
                  <MenuItem key={b.name} value={b.name}>
                    {b.name}
                    {b.isDefault ? ' (default)' : ''}
                  </MenuItem>
                ))}
            </TextField>
          </Stack>
          <FormHelperText sx={FIELD_HELPER_SX}>Select branch</FormHelperText>
        </Grid>
      )}

      {showBranchAndSubPath && (
        <Grid size={{ xs: 12, md: 3 }}>
          <Stack direction="row" alignItems="flex-start" gap={0.5}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DirectoryPickerField
                repo={activeRepo}
                value={subPath}
                onChange={(path) => {
                  setSubPath(path);
                  setDetectedMode(null);
                }}
                statusIcon={<TechDetectionIcon mode={detectedMode} isValidating={isValidating} isError={isContentsError} />}
                isValidating={isValidating}
                isError={isContentsError}
                contents={repoContents}
                isFetching={isContentsLoading}
                onRefetch={refetchContents}
                disabled={!selectedBranch}
              />
            </Box>
            {pathReady && (
              <Tooltip title="Re-validate technology detection for the selected path" placement="top">
                <span>
                  <IconButton size="small" disabled={isValidating} onClick={handleRevalidate} sx={{ mt: 1, color: 'primary.main' }}>
                    {isValidating ? <CircularProgress size={14} /> : <RefreshCw size={14} />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Grid>
      )}
    </Grid>
  );

  // Early returns

  if (!isPublicRepo && (authStatus === 'authenticating' || (IS_CLOUD && authStatus === 'installing'))) {
    return (
      <PageContent sx={{ pt: 5 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 3 }}>
          Back
        </Button>
        <Typography variant="h1" sx={{ mb: 0.5 }}>
          Import an Integration
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Connect your GitHub repository to start building.
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4, minHeight: 50 }}>
          <CircularProgress size={16} />
          <Typography color="text.secondary" variant="body2">
            {authStatus === 'installing' ? 'Install the GitHub App in the popup, then return here…' : 'Completing GitHub authorization…'}
          </Typography>
        </Stack>
        <Skeleton variant="rounded" sx={{ width: '25%', height: 56 }} />
      </PageContent>
    );
  }

  if (createComponent.isPending || createComponent.isSuccess || createComponent.isError) {
    const integrationLabel =
      selectedIntegrationType === 'automation'
        ? 'Automation'
        : selectedIntegrationType === 'file-integration'
          ? 'File Integration'
          : selectedIntegrationType === 'event-integration'
            ? 'Event Integration'
            : selectedIntegrationType === 'ai-agent'
              ? 'AI Agent'
              : selectedIntegrationType === 'mcp-server'
                ? 'MCP Server'
                : 'Integration as API';
    return (
      <PageContent sx={{ pt: 5, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <IntegrationCreationLoader
          label={integrationLabel}
          isPending={createComponent.isPending}
          isSuccess={createComponent.isSuccess}
          error={createComponent.isError ? (createComponent.error?.message ?? 'Something went wrong. Please try again.') : null}
          onBack={() => createComponent.reset()}
        />
      </PageContent>
    );
  }

  // Main form

  return (
    <PageContent sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 3 }}>
        Back
      </Button>

      <Typography variant="h1" sx={{ mb: 0.5 }}>
        Import an Integration
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 6 }}>
        {isPublicRepo ? 'Paste a public GitHub repository URL to get started.' : isCredentialMode ? `Connect your ${providerLabel} repository to start building.` : 'Connect your GitHub repository to start building.'}
      </Typography>

      {/* Credential picker card — only while there are credentials to pick and none is
          selected yet. No credentials → the authorize modal drives it; once authorized
          the card gives way to the org/repo pickers below. */}
      {isCredentialMode && credProvider && hasCredentials && !selectedCredential && (
        <Grid container spacing={3} sx={{ mb: 5 }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <CredentialSelectCard
              provider={credProvider}
              credentials={providerCredentials}
              selected={selectedCredential}
              onSelect={(c) => {
                setSelectedCredential(c);
                setSelectedOrg('');
                setSelectedRepo('');
                setSelectedBranch('');
              }}
              onAddCredential={() => setShowCredentialModal(true)}
            />
          </Grid>
        </Grid>
      )}
      {!isPublicRepo && renderGitHubArea()}

      {showCredentialModal && credProvider && (
        <AddCredentialDialog
          initialProvider={credProvider}
          lockProvider
          onClose={() => setShowCredentialModal(false)}
          onCancel={() => {
            setShowCredentialModal(false);
            // Cancelling the initial "no credentials" prompt leaves nothing to work with —
            // return to the Create page. Cancelling an "+ Add" from the picker just closes.
            if (!hasCredentials && !selectedCredential) navigate(backUrl);
          }}
          onAdded={() => {}}
          onAddedCredential={(c) => {
            setSelectedCredential(c);
            setSelectedOrg('');
            setSelectedRepo('');
            setSelectedBranch('');
            refetchRepos();
          }}
          onError={() => {}}
        />
      )}

      <Box sx={{ '& .MuiFormLabel-asterisk': { color: 'error.main' } }}>
        {/* Row 1 — source pickers (mode-aware) + Branch + Directory */}
        {renderRepoPickers()}

        {/* Row 2 — Display Name + auto-generated Name */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              label="Display Name"
              required
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                displayNameAutoRef.current = false;
              }}
              fullWidth
              error={!!displayName.trim() && !handlerValid}
              helperText={displayName.trim() && !handlerValid ? 'Must be 3–64 chars' : 'Display Name of the Integration'}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              label="Name"
              value={effectiveHandler}
              fullWidth
              disabled
              helperText={isCheckingName ? 'Checking availability…' : 'Auto-generated identifier'}
              slotProps={{
                input: {
                  endAdornment: isCheckingName ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
          </Grid>
        </Grid>

        {/* Row 3 — Description */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={1} helperText="Brief description" />
          </Grid>
        </Grid>

        {/* Technology */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ mb: 2, mt: 5 }}>
            Technology
          </Typography>
          <TechnologySelector selected={selectedTechnology} detectedMode={detectedMode} enabled={showBranchAndSubPath} onSelect={setSelectedTechnology} />
          {IS_CLOUD && selectedTechnology === 'BI' && (
            <>
              {!ballerinaTokenStatus?.configured && (
                <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Depend on private packages?
                  </Typography>
                  <Link component="button" type="button" variant="body2" underline="hover" onClick={() => setBallerinaDrawerOpen(true)} sx={{ fontWeight: 600 }}>
                    Add a Ballerina Central token
                  </Link>
                </Stack>
              )}
              <BallerinaCentralTokenDrawer open={ballerinaDrawerOpen} onClose={() => setBallerinaDrawerOpen(false)} tokenInput={ballerinaTokenInput} onTokenInputChange={setBallerinaTokenInput} />
            </>
          )}
        </Box>

        {/* Integration Type */}
        <Box sx={{ mb: 5 }}>
          <Typography variant="h5" sx={{ mb: 2, mt: 5 }}>
            Integration Type
          </Typography>
          <IntegrationTypeSelector selected={selectedIntegrationType} onSelect={setSelectedIntegrationType} />
        </Box>

        <Stack direction="row" gap={2} sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={() => navigate(backUrl)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || createComponent.isPending}>
            {createComponent.isPending ? <CircularProgress size={18} color="inherit" /> : 'Import Integration'}
          </Button>
        </Stack>
      </Box>
    </PageContent>
  );
}
