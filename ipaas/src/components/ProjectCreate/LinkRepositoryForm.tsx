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

import { Alert, Box, Button, CircularProgress, Stack } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import BusyFields from '../common/BusyFields';
import GitHubAuthArea from '../Import/GitHubAuthArea';
import GitProviderCards from './GitProviderCards';
import RepoSourceFields from './RepoSourceFields';
import { useGitRepoSource } from '../../hooks/useGitRepoSource';
import { useLinkProjectRepository } from '../../hooks/useProjects';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import type { Project } from '../../types/project';

interface LinkRepositoryFormProps {
  project: Project;
  orgHandler: string;
  /** Leaves the page: after linking, or on Cancel. */
  onDone: () => void;
}

export default function LinkRepositoryForm({ project, orgHandler, onDone }: LinkRepositoryFormProps): JSX.Element {
  const [error, setError] = useState('');
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
    refetchRepos,
    isAuthenticated,
    authStatus,
    canConnect,
    startGitHubAuth,
    startGitHubAppInstall,
    isCheckingAuth,
    handleProviderSelect,
    resetSource,
  } = source;
  const link = useLinkProjectRepository();

  // The provider choice and the auto-selected GitHub org are not input the user would lose.
  const allowLeave = useUnsavedChanges(repoUrl !== '' || selectedRepo !== '');

  const leave = () => {
    allowLeave();
    onDone();
  };

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
        gitProvider: isPublicRepo ? 'public' : 'github',
        directoryPath: subPath === '/' ? '' : subPath.replace(/^\//, ''),
        isPublicRepo,
      },
      {
        onSuccess: leave,
        onError: (e) => setError(e.message || 'Failed to link the repository.'),
      },
    );
  };

  return (
    <>
      {error && (
        <Alert severity="error" role="alert" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <BusyFields busy={link.isPending}>
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
            <Button startIcon={<ArrowLeft size={14} />} size="small" onClick={resetSource} sx={{ mb: 2 }}>
              Choose a different provider
            </Button>
            {gitProvider === 'github' && (
              <GitHubAuthArea authStatus={authStatus} isCheckingAuth={isCheckingAuth} isAuthenticated={isAuthenticated} canConnect={canConnect} onAuthorize={() => startGitHubAuth(refetchRepos)} onInstall={() => startGitHubAppInstall(refetchRepos)} />
            )}
            <RepoSourceFields source={source} />
          </Box>
        )}
      </BusyFields>

      <Stack direction="row" gap={2} sx={{ mt: 2 }}>
        <Button variant="outlined" color="inherit" onClick={leave} disabled={link.isPending}>
          Cancel
        </Button>
        {providerSelected && (
          <Button variant="contained" onClick={handleLink} disabled={!pathReady || link.isPending} startIcon={link.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {link.isPending ? 'Linking…' : 'Link repository'}
          </Button>
        )}
      </Stack>
    </>
  );
}
