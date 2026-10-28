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

import { Alert, Box, Button, CircularProgress, Grid, IconButton, InputAdornment, MenuItem, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { PUBLIC_REPO_URL_HELP, PUBLIC_REPO_URL_PLACEHOLDER } from '../constants/import';
import TextField from '../components/common/TextField';
import { ArrowLeft, Building2, Check, CheckCircle2, Edit, GitHub, GitBranch } from '@wso2/oxygen-ui-icons-react';
import GitLogoIcon from '../assets/icons/GitLogoIcon';
import GitProviderCards from '../components/ProjectCreate/GitProviderCards';
import GitHubAuthArea from '../components/Import/GitHubAuthArea';
import { useState, useLayoutEffect, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import BusyFields from '../components/common/BusyFields';
import { useCreateMonoRepoProject } from '../hooks/useProjects';
import { useCreateComponent } from '../hooks/useComponents';
import { useOrgs, useOrgComponentLimits, useOrgSubscriptions } from '../hooks/useOrg';
import type { Project } from '../types/project';
import { useOrgUuid } from '../hooks/useOrgUuid';
import DirectoryPickerField from '../components/DirectoryPicker';
import WorkspaceModuleTable from '../components/ProjectCreate/WorkspaceModuleTable';
import { FREE_COMPONENT_LIMIT } from '../constants/project';
import { useProjectHandler } from '../hooks/useProjectHandler';
import { resourceUrl, narrow, type OrgScope } from '../nav';
import { external } from '../paths';
import { GH_SELECT_ACTION, organizationActionItems, repositoryActionItems } from '../components/Import/gitHubSelectActions';
import { toHandler } from '../utils/string';
import { validateProjectName, validateProjectHandler, normalizeProjectError } from '../utils/projectValidation';
import { buildRepoUrl } from '../utils/gitProviderUrl';
import { GitProvider as CredGitProvider } from '../types/credentials';
import { useGitRepoSource } from '../hooks/useGitRepoSource';

export default function ImportProject(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  const [isImporting, setIsImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    gitProvider,
    isPublicRepo,
    providerSelected,
    selectedOrg,
    setSelectedOrg,
    selectedRepo,
    setSelectedRepo,
    repoUrl,
    setRepoUrl,
    urlError,
    parsedOrg,
    selectedBranch,
    setSelectedBranch,
    subPath,
    setSubPath,
    activeOrg,
    activeRepo,
    showBranchAndSubPath,
    pathReady,
    isWorkspace,
    workspaceModules,
    setWorkspaceModules,
    userRepos,
    isReposLoading,
    refetchRepos,
    isAuthenticated,
    branches,
    isBranchesLoading,
    repoContents,
    isContentsLoading,
    isContentsError,
    refetchContents,
    authStatus,
    startGitHubAuth,
    startGitHubAppInstall,
    openGitHubManage,
    githubInstallUrl,
    isCheckingAuth,
    handleProviderSelect,
  } = useGitRepoSource();

  // Hold the repo pickers at md:3 so Organization/Repository keep their width when branch/subpath appear.
  const colSize = isPublicRepo ? 4 : 3;

  const { data: orgs = [] } = useOrgs();
  const orgUuid = useOrgUuid() ?? orgs.find((o) => o.handle === scope.org)?.uuid ?? '';
  const { data: orgLimits } = useOrgComponentLimits(orgUuid);
  const { data: subscriptions } = useOrgSubscriptions(orgUuid);
  const isUpgraded = (subscriptions ?? []).some((s) => s.subscriptionType === 'devant-subscription' && s.subscriptionStatus === 'active');
  const orgBillableCount = isUpgraded ? 0 : (orgLimits?.billableComponentCount ?? 0);
  const quotaRemaining = isUpgraded ? undefined : Math.max(0, FREE_COMPONENT_LIMIT - orgBillableCount);

  const { handler: effectiveHandler, handlerEdited, isCheckingAvailability, availability, availabilityError, startEditing, stopEditing, onHandlerChange } = useProjectHandler(displayName);
  const createMonoRepoProject = useCreateMonoRepoProject();
  const createComponent = useCreateComponent();
  const orgHomeUrl = resourceUrl(scope, 'overview');

  // Stabilize scrollbar gutter to prevent layout shift when content height changes
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('scrollbar-gutter', 'stable');
    return () => {
      document.documentElement.style.removeProperty('scrollbar-gutter');
    };
  }, []);

  const nameError = displayName ? validateProjectName(displayName) : null;
  const handlerError = effectiveHandler ? validateProjectHandler(effectiveHandler) : null;
  const handlerTaken = availability && !availability.handlerUnique ? 'This project id is already taken.' : null;

  const availabilityReady = !effectiveHandler || effectiveHandler.length < 2 || availability !== undefined || availabilityError;
  const canSubmit = !!displayName.trim() && !nameError && !!effectiveHandler && !handlerError && !handlerTaken && !isCheckingAvailability && availabilityReady && pathReady && isWorkspace && workspaceModules.length > 0;

  const handleImport = async () => {
    setIsImporting(true);
    setSubmitError(null);

    // Step 1: create the project. Any failure here is surfaced immediately.
    let project: Project;
    try {
      project = await createMonoRepoProject.mutateAsync({
        name: displayName.trim(),
        handler: effectiveHandler,
        description: description.trim(),
        orgHandler: scope.org,
        repository: activeRepo,
        gitOrganization: activeOrg,
        branch: selectedBranch,
        directoryPath: subPath === '/' ? '' : subPath.replace(/^\//, ''),
        gitProvider: isPublicRepo ? 'public' : 'github',
        isPublicRepo,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setSubmitError(normalizeProjectError(message));
      setIsImporting(false);
      return;
    }

    // Step 2: create workspace module components. The project already exists, so individual
    // component failures don't block navigation — the user can manage them from the project page.
    if (workspaceModules.length > 0) {
      const srcGitRepoUrl = buildRepoUrl(CredGitProvider.GITHUB, activeOrg, activeRepo);
      await Promise.allSettled(
        workspaceModules.map((module) =>
          createComponent.mutateAsync({
            displayName: module.displayName || module.name,
            name: toHandler(module.displayName || module.name),
            description: '',
            orgHandler: scope.org,
            projectId: project.id,
            displayType: module.integrationType === 'automation' ? 'scheduledTask' : 'ballerinaService',
            srcGitRepoUrl,
            repositoryBranch: selectedBranch,
            repositorySubPath: module.path,
            isPublicRepo,
          }),
        ),
      );
    }

    navigate(resourceUrl(narrow(scope, project.handler), 'overview'));
  };

  const renderHandlerHelperText = () => {
    // handlerError first: it is a fault in the value itself (reserved, malformed), which
    // stands regardless of what the availability call says about uniqueness.
    if (handlerError) return handlerError;
    if (handlerTaken) {
      const alt = availability?.alternateHandlerCandidate;
      return alt ? `This project id is already taken. Try "${alt}" instead.` : handlerTaken;
    }
    return undefined;
  };

  const orgOptions = userRepos?.map((o) => o.orgName) ?? [];
  const reposForOrg = userRepos?.find((o) => o.orgName === selectedOrg)?.repositories.map((r) => r.name) ?? [];

  const renderRepoPickers = () => (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      {isPublicRepo ? (
        <Grid size={{ xs: 12, md: colSize }}>
          <TextField
            label="Repository URL"
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            fullWidth
            error={!!urlError}
            placeholder={PUBLIC_REPO_URL_PLACEHOLDER}
            helperText={urlError || PUBLIC_REPO_URL_HELP}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <GitLogoIcon size={16} />
                  </InputAdornment>
                ),
                endAdornment:
                  isBranchesLoading && parsedOrg ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ) : undefined,
              },
            }}
          />
        </Grid>
      ) : (
        <>
          <Grid size={{ xs: 12, md: colSize }}>
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
                setSelectedOrg(v);
                setSelectedRepo('');
                setSelectedBranch('');
              }}
              fullWidth
              disabled={!isAuthenticated || isReposLoading}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Building2 size={18} />
                    </InputAdornment>
                  ),
                },
              }}>
              {organizationActionItems(!!githubInstallUrl)}
              {orgOptions.map((org) => (
                <MenuItem key={org} value={org}>
                  {org}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: colSize }}>
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
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box sx={{ color: 'text.primary', display: 'flex' }}>
                        <GitHub size={16} />
                      </Box>
                    </InputAdornment>
                  ),
                },
              }}>
              {repositoryActionItems(!!githubInstallUrl)}
              {reposForOrg.map((repo) => (
                <MenuItem key={repo} value={repo}>
                  {repo}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </>
      )}

      {showBranchAndSubPath && (
        <Grid size={{ xs: 12, md: colSize }}>
          <TextField
            label="Branch"
            select
            required
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            fullWidth
            disabled={!activeRepo || isBranchesLoading}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <GitBranch size={18} />
                  </InputAdornment>
                ),
              },
            }}>
            {(branches ?? []).map((b) => (
              <MenuItem key={b.name} value={b.name}>
                {b.name}
                {b.isDefault ? ' (default)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      )}

      {showBranchAndSubPath && (
        <Grid size={{ xs: 12, md: colSize }}>
          <DirectoryPickerField
            repo={activeRepo}
            value={subPath}
            onChange={(path) => setSubPath(path)}
            isError={isContentsError}
            contents={repoContents}
            isFetching={isContentsLoading}
            onRefetch={refetchContents}
            disabled={!selectedBranch}
            reserveErrorSpace={false}
          />
          {isWorkspace && pathReady && !isContentsLoading && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.75, ml: 1.5 }}>
              <Box sx={{ color: 'success.main', display: 'flex' }}>
                <CheckCircle2 size={14} />
              </Box>
              <Typography variant="caption" color="success.main" fontWeight={500}>
                Ballerina Workspace Detected
              </Typography>
            </Stack>
          )}
        </Grid>
      )}
    </Grid>
  );

  return (
    <PageContent sx={{ pt: 5, '& .MuiFormLabel-asterisk': { color: 'error.main' } }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(orgHomeUrl)} sx={{ mb: 2 }}>
        Back to Home
      </Button>

      <Typography variant="h1" sx={{ mb: 1 }}>
        Import a Project
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Choose a repository with your existing Ballerina workspace project.
      </Typography>

      {submitError && (
        <Alert severity="error" role="alert" sx={{ mb: 3 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <BusyFields busy={isImporting}>
        {/* Source Repository — always visible first */}
        {!providerSelected ? (
          <Box sx={{ mb: 4 }}>
            <GitProviderCards
              onGitHubSelect={() => {
                handleProviderSelect('github');
                startGitHubAuth(refetchRepos);
              }}
              onPublicSelect={() => handleProviderSelect('public')}
            />
          </Box>
        ) : (
          <Box sx={{ mb: 1 }}>
            {gitProvider === 'github' && <GitHubAuthArea authStatus={authStatus} isCheckingAuth={isCheckingAuth} isAuthenticated={isAuthenticated} onAuthorize={() => startGitHubAuth(refetchRepos)} onInstall={() => startGitHubAppInstall(refetchRepos)} />}
            {renderRepoPickers()}
            {pathReady && !isContentsLoading && !isContentsError && !isWorkspace && (
              <Alert severity="info" sx={{ mb: 3 }}>
                No Ballerina workspace detected in the selected directory. Select a directory that contains a Ballerina workspace (a root <code>Ballerina.toml</code> with subdirectories that each have their own <code>Ballerina.toml</code>).
              </Alert>
            )}
          </Box>
        )}

        {/* Project Details — shown after workspace detection */}
        {isWorkspace && (
          <>
            <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
              Project Details
            </Typography>
            <Grid container columnSpacing={3} rowSpacing={1} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Project Name"
                  required
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setSubmitError(null);
                  }}
                  fullWidth
                  error={!!nameError}
                  helperText={nameError}
                  slotProps={{ htmlInput: { 'aria-label': 'Project Name' } }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Project Id"
                  value={effectiveHandler}
                  onChange={(e) => onHandlerChange(e.target.value)}
                  fullWidth
                  disabled={!handlerEdited}
                  error={!!handlerError || !!handlerTaken}
                  helperText={renderHandlerHelperText()}
                  slotProps={{
                    htmlInput: { 'aria-label': 'Project Id' },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          {isCheckingAvailability ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Tooltip title={handlerEdited ? 'Done' : 'Edit project id'} placement="top">
                              <IconButton
                                size="small"
                                aria-label={handlerEdited ? 'Confirm project id' : 'Edit project id'}
                                onClick={() => (handlerEdited ? stopEditing() : startEditing())}
                                sx={handlerEdited ? { color: 'success.main' } : { color: 'primary.main' }}>
                                {handlerEdited ? <Check size={16} /> : <Edit size={16} />}
                              </IconButton>
                            </Tooltip>
                          )}
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Description (Optional)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={1} slotProps={{ htmlInput: { 'aria-label': 'Description' } }} />
              </Grid>
            </Grid>
          </>
        )}

        {/* Configure Integrations — shown after workspace detection */}
        {isWorkspace && <WorkspaceModuleTable repoName={activeRepo} repoContents={repoContents} modules={workspaceModules} onChange={setWorkspaceModules} quotaRemaining={quotaRemaining} alertWhenEmpty />}
      </BusyFields>

      <Stack direction="row" gap={2} sx={{ mt: 2 }}>
        <Button variant="outlined" onClick={() => navigate(orgHomeUrl)} disabled={isImporting}>
          Cancel
        </Button>
        {isWorkspace && (
          <Button variant="contained" onClick={handleImport} disabled={!canSubmit || isImporting} startIcon={isImporting ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {isImporting ? 'Importing…' : 'Import Project'}
          </Button>
        )}
      </Stack>
    </PageContent>
  );
}
