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

import { Alert, Box, Button, CircularProgress, Grid, IconButton, InputAdornment, PageContent, PageTitle, Stack, Tooltip, Typography, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft, Check, CheckCircle2, Edit } from '@wso2/oxygen-ui-icons-react';
import GitProviderCards from '../components/ProjectCreate/GitProviderCards';
import GitHubAuthArea from '../components/Import/GitHubAuthArea';
import { useState, useLayoutEffect, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import BusyFields from '../components/common/BusyFields';
import { useCreateMonoRepoProject } from '../hooks/useProjects';
import { useCreateComponent } from '../hooks/useComponents';
import { useOrgs, useOrgComponentLimits, useOrgSubscriptions } from '../hooks/useOrg';
import type { Project } from '../types/project';
import { useOrgUuid } from '../hooks/useOrgUuid';
import RepoSourceFields from '../components/ProjectCreate/RepoSourceFields';
import WorkspaceModuleTable from '../components/ProjectCreate/WorkspaceModuleTable';
import { FREE_COMPONENT_LIMIT } from '../constants/project';
import { useProjectHandler } from '../hooks/useProjectHandler';
import { resourceUrl, narrow, type OrgScope } from '../nav';
import { orgProjectsUrl } from '../paths';
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

  const source = useGitRepoSource();
  const {
    gitProvider,
    isPublicRepo,
    providerSelected,
    selectedRepo,
    repoUrl,
    selectedBranch,
    subPath,
    activeOrg,
    activeRepo,
    pathReady,
    isWorkspace,
    workspaceModules,
    setWorkspaceModules,
    refetchRepos,
    isAuthenticated,
    repoContents,
    isContentsLoading,
    isContentsError,
    authStatus,
    canConnect,
    startGitHubAuth,
    startGitHubAppInstall,
    isCheckingAuth,
    handleProviderSelect,
  } = source;

  const { data: orgs = [] } = useOrgs();
  const orgUuid = useOrgUuid() ?? orgs.find((o) => o.handle === scope.org)?.uuid ?? '';
  const { data: orgLimits } = useOrgComponentLimits(orgUuid);
  const { data: subscriptions } = useOrgSubscriptions(orgUuid);
  const isUpgraded = (subscriptions ?? []).some((s) => s.subscriptionType === 'devant-subscription' && s.subscriptionStatus === 'active');
  const orgBillableCount = isUpgraded ? 0 : (orgLimits?.billableComponentCount ?? 0);
  const quotaRemaining = isUpgraded ? undefined : Math.max(0, FREE_COMPONENT_LIMIT - orgBillableCount);

  const { handler: effectiveHandler, handlerEdited, isCheckingAvailability, availability, availabilityError, handlerTaken: isHandlerTaken, replacedHandler, startEditing, stopEditing, onHandlerChange } = useProjectHandler(displayName);
  const createMonoRepoProject = useCreateMonoRepoProject();
  const canCreate = useCan()(Scopes.PROJECT_CREATE);
  const createComponent = useCreateComponent();
  const projectsUrl = orgProjectsUrl(scope.org);
  // The provider choice and the auto-selected GitHub org are not input the user would lose.
  const allowLeave = useUnsavedChanges(displayName !== '' || description !== '' || effectiveHandler !== '' || repoUrl !== '' || selectedRepo !== '');

  // Stabilize scrollbar gutter to prevent layout shift when content height changes
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('scrollbar-gutter', 'stable');
    return () => {
      document.documentElement.style.removeProperty('scrollbar-gutter');
    };
  }, []);

  const nameError = displayName ? validateProjectName(displayName) : null;
  const handlerError = effectiveHandler ? validateProjectHandler(effectiveHandler) : null;
  const handlerTaken = isHandlerTaken ? 'This project id is already taken.' : null;

  const availabilityReady = !effectiveHandler || effectiveHandler.length < 2 || availability !== undefined || availabilityError;
  const canSubmit = canCreate && !!displayName.trim() && !nameError && !!effectiveHandler && !handlerError && !handlerTaken && !isCheckingAvailability && availabilityReady && pathReady && isWorkspace && workspaceModules.length > 0;

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
            creation: { method: 'import-repo' },
          }),
        ),
      );
    }

    allowLeave();
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
    if (replacedHandler) return `"${replacedHandler}" is taken, so "${effectiveHandler}" is used instead.`;
    return undefined;
  };

  const workspaceHint =
    isWorkspace && pathReady && !isContentsLoading ? (
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.75, ml: 1.5 }}>
        <Box sx={{ color: 'success.main', display: 'flex' }}>
          <CheckCircle2 size={14} />
        </Box>
        <Typography variant="caption" color="success.main" fontWeight={500}>
          WSO2 Integrator: Default workspace detected
        </Typography>
      </Stack>
    ) : null;

  return (
    <PageContent fullWidth sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(projectsUrl)} sx={{ mb: 2 }}>
        Back to projects
      </Button>

      <PageTitle>
        <PageTitle.Header>Import a project</PageTitle.Header>
      </PageTitle>

      <Alert severity="info" sx={{ mb: 3 }}>
        Import currently supports WSO2 Integrator: Default projects only.
      </Alert>

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
            {gitProvider === 'github' && (
              <GitHubAuthArea authStatus={authStatus} isCheckingAuth={isCheckingAuth} isAuthenticated={isAuthenticated} canConnect={canConnect} onAuthorize={() => startGitHubAuth(refetchRepos)} onInstall={() => startGitHubAppInstall(refetchRepos)} />
            )}
            <RepoSourceFields source={source} directoryHint={workspaceHint} />
            {pathReady && !isContentsLoading && !isContentsError && !isWorkspace && (
              <Alert severity="info" sx={{ mb: 3 }}>
                No WSO2 Integrator: Default workspace detected in the selected directory. Select a directory that contains a WSO2 Integrator: Default workspace.
              </Alert>
            )}
          </Box>
        )}

        {/* Project Details — shown after workspace detection */}
        {isWorkspace && (
          <>
            <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
              Project details
            </Typography>
            <Grid container columnSpacing={3} rowSpacing={1} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  labelPlacement="top"
                  label="Project name"
                  required
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setSubmitError(null);
                  }}
                  fullWidth
                  error={!!nameError}
                  helperText={nameError}
                  slotProps={{ htmlInput: { 'aria-label': 'Project name' } }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  labelPlacement="top"
                  label="Project ID"
                  value={effectiveHandler}
                  onChange={(e) => onHandlerChange(e.target.value)}
                  fullWidth
                  disabled={!handlerEdited}
                  error={!!handlerError || !!handlerTaken}
                  helperText={renderHandlerHelperText()}
                  slotProps={{
                    htmlInput: { 'aria-label': 'Project ID' },
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
                <TextField labelPlacement="top" label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={1} slotProps={{ htmlInput: { 'aria-label': 'Description' } }} />
              </Grid>
            </Grid>
          </>
        )}

        {/* Configure Integrations — shown after workspace detection */}
        {isWorkspace && <WorkspaceModuleTable repoName={activeRepo} repoContents={repoContents} modules={workspaceModules} onChange={setWorkspaceModules} quotaRemaining={quotaRemaining} alertWhenEmpty />}
      </BusyFields>

      <Stack direction="row" gap={2} sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => {
            allowLeave();
            navigate(projectsUrl);
          }}
          disabled={isImporting}>
          Cancel
        </Button>
        {isWorkspace && (
          <Button variant="contained" onClick={handleImport} disabled={!canSubmit || isImporting} startIcon={isImporting ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {isImporting ? 'Importing…' : 'Import project'}
          </Button>
        )}
      </Stack>
    </PageContent>
  );
}
