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

import { Box, CircularProgress, Grid, InputAdornment, MenuItem, TextField } from '@wso2/oxygen-ui';
import { Building2, GitBranch, GitHub } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import GitLogoIcon from '../../assets/icons/GitLogoIcon';
import { PUBLIC_REPO_URL_HELP, PUBLIC_REPO_URL_PLACEHOLDER } from '../../constants/import';
import type { useGitRepoSource } from '../../hooks/useGitRepoSource';
import { external } from '../../paths';
import DirectoryPickerField from '../DirectoryPicker';
import { GH_SELECT_ACTION, organizationActionItems, repositoryActionItems } from '../Import/gitHubSelectActions';

interface RepoSourceFieldsProps {
  source: ReturnType<typeof useGitRepoSource>;
  /** Shown under the directory picker, e.g. what was detected at the chosen path. */
  directoryHint?: ReactNode;
}

/** The repository source pickers shared by the project import and link flows. */
export default function RepoSourceFields({ source, directoryHint }: RepoSourceFieldsProps): JSX.Element {
  const {
    isPublicRepo,
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
    activeRepo,
    showBranchAndSubPath,
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
    openGitHubManage,
    githubInstallUrl,
  } = source;

  // Hold the repo pickers at md:3 so Organization/Repository keep their width when branch/subpath appear.
  const colSize = isPublicRepo ? 4 : 3;
  const orgOptions = userRepos?.map((o) => o.orgName) ?? [];
  const reposForOrg = userRepos?.find((o) => o.orgName === selectedOrg)?.repositories.map((r) => r.name) ?? [];

  return (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      {isPublicRepo ? (
        <Grid size={{ xs: 12, md: colSize }}>
          <TextField
            labelPlacement="top"
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
              labelPlacement="top"
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
              labelPlacement="top"
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
            labelPlacement="top"
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
          {directoryHint}
        </Grid>
      )}
    </Grid>
  );
}
