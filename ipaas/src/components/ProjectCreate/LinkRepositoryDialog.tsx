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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import BusyFields from '../common/BusyFields';
import { CLOUD_COMING_SOON_PROVIDERS, providerComingSoonLabel } from '../../constants/gitProviders';
import { ArrowLeft, GitBranch, GitHub, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import GitLogoIcon from '../../assets/icons/GitLogoIcon';
import GitLabIcon from '../../assets/icons/GitLabIcon';
import BitbucketIcon from '../../assets/icons/BitbucketIcon';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { useGitHubUserRepos, useRepoBranches } from '../../hooks/useRepository';
import { useLinkProjectRepository } from '../../hooks/useProjects';
import { gitProviderIcon } from '../../constants/gitProviders';
import { parseGitHubUrl } from '../../utils/github';
import { GitProvider } from '../../types/credentials';
import type { Project } from '../../types/project';
import GitHubAuthArea from '../Import/GitHubAuthArea';

/** `null` = provider not chosen yet; otherwise GitHub or a public URL. Other providers show as coming soon. */
type LinkProvider = GitProvider | 'public' | null;

const PROVIDER_CARDS: { key: LinkProvider; label: string; icon: JSX.Element }[] = [
  { key: GitProvider.GITHUB, label: 'Authorize with GitHub', icon: <GitHub size={26} /> },
  { key: GitProvider.BITBUCKET_CLOUD, label: 'Authorize with Bitbucket', icon: <BitbucketIcon size={26} /> },
  { key: GitProvider.GITLAB_SELF_MANAGED, label: 'Authorize with GitLab', icon: <GitLabIcon size={26} /> },
  { key: 'public', label: 'Connect a Public Git Repository', icon: <GitLogoIcon size={26} /> },
];

const CARD_SX = {
  cursor: 'pointer',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 2,
  p: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  transition: 'border-color 0.15s, box-shadow 0.15s',
  '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
} as const;

export default function LinkRepositoryDialog({ open, onClose, project, orgHandler }: { open: boolean; onClose: () => void; project: Project; orgHandler: string }): JSX.Element {
  const [provider, setProvider] = useState<LinkProvider>(null);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [directoryPath, setDirectoryPath] = useState('/');
  const [error, setError] = useState('');

  const { authStatus, startGitHubAuth, startGitHubAppInstall } = useGitHubAuth();
  const link = useLinkProjectRepository();

  const isGitHub = provider === GitProvider.GITHUB;
  const isPublic = provider === 'public';

  const parsed = useMemo(() => (isPublic && repoUrl ? parseGitHubUrl(repoUrl) : null), [isPublic, repoUrl]);
  const activeOrg = isPublic ? (parsed?.org ?? '') : selectedOrg;
  const activeRepo = isPublic ? (parsed?.repo ?? '') : selectedRepo;

  const reposEnabled = isGitHub && authStatus === 'done';
  const { data: userRepos, isLoading: reposLoading, isError: reposError, refetch: refetchRepos } = useGitHubUserRepos(reposEnabled);
  const { data: branches } = useRepoBranches(activeOrg, activeRepo, isPublic);

  const orgOptions = userRepos?.map((o) => o.orgName) ?? [];
  const reposForOrg = userRepos?.find((o) => o.orgName === selectedOrg)?.repositories.map((r) => r.name) ?? [];

  // Keep the auth area up while GitHub is authorizing AND when authorization completed
  // but the repo list came back empty/errored — otherwise the pickers render with nothing
  // to pick and no way to recover.
  const gitHubReposReady = isGitHub && authStatus === 'done' && !reposLoading && !reposError && orgOptions.length > 0;
  const showGitHubAuthArea = isGitHub && !gitHubReposReady;

  // Matches what every manual org/repo change below does; this file has no reset effect.
  const clearRepoSelection = () => {
    setSelectedRepo('');
    setSelectedBranch('');
    setDirectoryPath('/');
  };

  // Pre-select the first org so the repo picker is usable right after authorizing.
  useEffect(() => {
    if (isPublic || !userRepos?.length) return;
    const org = userRepos.find((o) => o.orgName === selectedOrg);
    if (!org) {
      setSelectedOrg(userRepos[0].orgName);
      clearRepoSelection();
      return;
    }
    if (selectedRepo && !org.repositories.some((r) => r.name === selectedRepo)) clearRepoSelection();
  }, [userRepos, isPublic]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPickers = () => {
    setSelectedOrg('');
    setSelectedRepo('');
    setRepoUrl('');
    setSelectedBranch('');
    setDirectoryPath('/');
    setError('');
  };

  const handleClose = () => {
    setProvider(null);
    resetPickers();
    onClose();
  };

  const chooseProvider = (key: LinkProvider) => {
    setProvider(key);
    resetPickers();
    if (key === GitProvider.GITHUB) startGitHubAuth(refetchRepos);
  };

  const providerIcon = isPublic ? <GitLogoIcon size={16} /> : provider ? gitProviderIcon(provider, 16) : null;

  const canLink = !!activeOrg && !!activeRepo && !!selectedBranch && !link.isPending;

  const handleLink = () => {
    setError('');
    link.mutate(
      {
        projectId: project.id,
        name: project.name,
        handler: project.handler,
        description: project.description,
        orgHandler,
        repository: activeRepo,
        gitOrganization: activeOrg,
        branch: selectedBranch,
        gitProvider: isPublic ? 'public' : (provider as string),
        directoryPath: directoryPath === '/' ? '' : directoryPath.replace(/^\//, ''),
        isPublicRepo: isPublic,
      },
      {
        onSuccess: () => handleClose(),
        onError: (e) => setError(e.message || 'Failed to link the repository.'),
      },
    );
  };

  const authorized = isPublic || (isGitHub && authStatus === 'done');

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <IconButton aria-label="Close" onClick={handleClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
        <X size={18} />
      </IconButton>
      <DialogTitle sx={{ pb: 1 }}>Link a Repository</DialogTitle>
      <DialogContent>
        <BusyFields busy={link.isPending}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {provider == null ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select a Git provider to link a repository to this project.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {PROVIDER_CARDS.map((c) => {
                  const soon = typeof c.key === 'string' && CLOUD_COMING_SOON_PROVIDERS.has(c.key);
                  return (
                    <Tooltip key={String(c.key)} title={soon ? providerComingSoonLabel(c.key as string) : ''} placement="top">
                      <Box
                        role={soon ? undefined : 'button'}
                        tabIndex={soon ? undefined : 0}
                        aria-disabled={soon || undefined}
                        onClick={soon ? undefined : () => chooseProvider(c.key)}
                        onKeyDown={soon ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && chooseProvider(c.key)}
                        sx={{ ...CARD_SX, ...(soon && { cursor: 'default', opacity: 0.5, '&:hover': {} }) }}>
                        {c.icon}
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {c.label}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </>
          ) : (
            <Stack gap={2}>
              <Button startIcon={<ArrowLeft size={14} />} size="small" onClick={() => setProvider(null)} sx={{ alignSelf: 'flex-start', pl: 0, textTransform: 'none' }}>
                Choose a different provider
              </Button>

              {showGitHubAuthArea ? (
                <GitHubAuthArea authStatus={authStatus} isCheckingAuth={authStatus === 'done' && reposLoading} isAuthenticated={false} onAuthorize={() => startGitHubAuth(refetchRepos)} onInstall={() => startGitHubAppInstall(refetchRepos)} />
              ) : (
                <>
                  {isPublic ? (
                    <TextField
                      label="Repository URL"
                      required
                      value={repoUrl}
                      onChange={(e) => {
                        setRepoUrl(e.target.value);
                        setSelectedBranch('');
                        setDirectoryPath('/');
                      }}
                      fullWidth
                      size="small"
                      helperText="Public repository URL"
                    />
                  ) : (
                    <Stack direction="row" gap={2}>
                      <TextField
                        select
                        label="Organization"
                        required
                        value={selectedOrg}
                        onChange={(e) => {
                          setSelectedOrg(e.target.value);
                          setSelectedRepo('');
                          setSelectedBranch('');
                          setDirectoryPath('/');
                        }}
                        fullWidth
                        size="small"
                        disabled={reposLoading || orgOptions.length === 0}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">{providerIcon}</InputAdornment> } }}>
                        {orgOptions.map((o) => (
                          <MenuItem key={o} value={o}>
                            {o}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Repository"
                        required
                        value={selectedRepo}
                        onChange={(e) => {
                          setSelectedRepo(e.target.value);
                          setSelectedBranch('');
                          setDirectoryPath('/');
                        }}
                        fullWidth
                        size="small"
                        disabled={!selectedOrg}>
                        {reposForOrg.map((r) => (
                          <MenuItem key={r} value={r}>
                            {r}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  )}

                  <Stack direction="row" gap={2}>
                    <TextField
                      select
                      label="Branch"
                      required
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      fullWidth
                      size="small"
                      disabled={!activeOrg || !activeRepo}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <GitBranch size={16} />
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
                    <TextField label="Project Directory" value={directoryPath} onChange={(e) => setDirectoryPath(e.target.value || '/')} fullWidth size="small" helperText="Path within the repository" />
                  </Stack>
                </>
              )}
            </Stack>
          )}
        </BusyFields>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={link.isPending}>
          Cancel
        </Button>
        {provider != null && authorized && (
          <Button variant="contained" onClick={handleLink} disabled={!canLink} startIcon={link.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {link.isPending ? 'Linking…' : 'Link Repository'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
