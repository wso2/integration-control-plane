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

import { useEffect, useMemo, useState } from 'react';
import { useGitHubAuth } from './useGitHubAuth';
import { useGitHubUserRepos, useRepoBranches, useRepoContents } from './useRepository';
import { parseGitHubUrl } from '../utils/github';
import { isBallerinaWorkspace } from '../utils/technologyDetection';
import { URL_DEBOUNCE_MS } from '../constants/project';
import type { GitProvider, WorkspaceModule } from '../types/project';

/**
 * Shared git-repository source state for the project create/import forms: provider choice
 * (GitHub OAuth or public URL), the org/repo/branch/directory pickers, and Ballerina-workspace
 * detection.
 */
export function useGitRepoSource() {
  const [gitProvider, setGitProvider] = useState<GitProvider | null>(null);

  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [parsedOrg, setParsedOrg] = useState('');
  const [parsedRepo, setParsedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [subPath, setSubPath] = useState('/');
  const [isWorkspace, setIsWorkspace] = useState(false);
  const [workspaceModules, setWorkspaceModules] = useState<WorkspaceModule[]>([]);

  const isPublicRepo = gitProvider === 'public';
  const providerSelected = gitProvider !== null;

  const { authStatus, startGitHubAuth, startGitHubAppInstall, openGitHubManage, githubInstallUrl } = useGitHubAuth();

  const activeOrg = isPublicRepo ? parsedOrg : selectedOrg;
  const activeRepo = isPublicRepo ? parsedRepo : selectedRepo;
  const showBranchAndSubPath = !!(activeOrg && activeRepo);
  const pathReady = !!(activeOrg && activeRepo && selectedBranch);

  const reposEnabled = !isPublicRepo && authStatus === 'done';
  const { data: userRepos, isLoading: isReposLoading, isError: isReposError, refetch: refetchRepos } = useGitHubUserRepos(reposEnabled);
  const isAuthenticated = !isPublicRepo && !!userRepos && userRepos.length > 0;
  const isCheckingAuth = !isPublicRepo && reposEnabled && isReposLoading;

  const { data: branches, isLoading: isBranchesLoading } = useRepoBranches(activeOrg, activeRepo, isPublicRepo);
  const { data: repoContentsData, isLoading: isContentsLoading, isError: isContentsError, refetch: refetchContents } = useRepoContents(activeOrg, activeRepo, selectedBranch, isPublicRepo);
  // Stable reference so the workspace-detection effect below doesn't re-run every render.
  const repoContents = useMemo(() => repoContentsData ?? [], [repoContentsData]);

  // Pre-select the first org so the repo picker is usable right after authorizing.
  // Clearing the repo here feeds the reset effect below, which drops branch and sub-path.
  useEffect(() => {
    if (isPublicRepo || !userRepos?.length) return;
    const org = userRepos.find((o) => o.orgName === selectedOrg);
    if (!org) {
      setSelectedOrg(userRepos[0].orgName);
      setSelectedRepo('');
      return;
    }
    if (selectedRepo && !org.repositories.some((r) => r.name === selectedRepo)) setSelectedRepo('');
  }, [userRepos, isPublicRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select default branch; preserve an already-valid selection on refetch
  useEffect(() => {
    if (!branches || branches.length === 0) return;
    const stillExists = branches.some((b) => b.name === selectedBranch);
    if (!selectedBranch || !stillExists) {
      const def = branches.find((b) => b.isDefault);
      setSelectedBranch(def?.name ?? branches[0].name);
    }
  }, [branches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset downstream state when the selected repo changes
  useEffect(() => {
    if (isPublicRepo) return;
    setSelectedBranch('');
    setSubPath('/');
    setIsWorkspace(false);
    setWorkspaceModules([]);
  }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset workspace when branch changes
  useEffect(() => {
    setIsWorkspace(false);
    setWorkspaceModules([]);
  }, [selectedBranch]);

  // Public repo: debounced URL parsing
  useEffect(() => {
    if (!isPublicRepo) return;
    const id = setTimeout(() => {
      if (!repoUrl) {
        setUrlError('');
        setParsedOrg('');
        setParsedRepo('');
        setSelectedBranch('');
        setSubPath('/');
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
        setSelectedBranch('');
        setSubPath('/');
        setParsedOrg(parsed.org);
        setParsedRepo(parsed.repo);
      }
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // parsedOrg/parsedRepo intentionally omitted — compared only on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  // Workspace detection from repo contents
  useEffect(() => {
    if (!pathReady || isContentsLoading) {
      setIsWorkspace(false);
      setWorkspaceModules([]);
      return;
    }
    let nodes = repoContents;
    if (subPath && subPath !== '/') {
      const cleanPath = subPath.replace(/^\//, '');
      const target = repoContents.find((n) => n.path === cleanPath || n.subPath === cleanPath);
      nodes = target?.children ?? [];
    }
    const workspace = isBallerinaWorkspace(nodes);
    setIsWorkspace(workspace);
    if (!workspace) setWorkspaceModules([]);
  }, [repoContents, subPath, pathReady, isContentsLoading]);

  const resetPickers = () => {
    setSelectedOrg('');
    setSelectedRepo('');
    setRepoUrl('');
    setUrlError('');
    setParsedOrg('');
    setParsedRepo('');
    setSelectedBranch('');
    setSubPath('/');
    setIsWorkspace(false);
    setWorkspaceModules([]);
  };

  const resetSource = () => {
    setGitProvider(null);
    resetPickers();
  };

  const handleProviderSelect = (provider: GitProvider) => {
    resetPickers();
    setGitProvider(provider);
  };

  return {
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
    parsedRepo,
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
    isReposError,
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
    resetSource,
  };
}
