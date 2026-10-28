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

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchComponentRepository, fetchCommitHistory, fetchGitHubUserRepos, fetchRepoBranches, fetchRepoMetadata, fetchChoreoSampleImages, updateBuildpackConfigs, obtainGithubToken, fetchRepoContents } from '../api/repository';
import { fetchComponentNameAvailability } from '../api/components';
import type { UpdateBuildpackConfigsInput } from '../types/build';
import type { Repository } from '../types/repository';

export function useComponentRepository(projectId: string, componentHandler: string) {
  return useQuery({
    queryKey: ['componentRepository', projectId, componentHandler],
    queryFn: () => fetchComponentRepository(projectId, componentHandler),
    enabled: !!projectId && !!componentHandler,
    retry: false,
  });
}

/**
 * Repositories of several integrations, keyed by handler, sharing the cache with
 * `useComponentRepository`. A value is `undefined` until its lookup settles and `null`
 * when the integration has no repository.
 */
export function useComponentRepositories(projectId: string, componentHandlers: string[], enabled: boolean): Map<string, Repository | null | undefined> {
  const results = useQueries({
    queries: componentHandlers.map((handler) => ({
      queryKey: ['componentRepository', projectId, handler],
      queryFn: () => fetchComponentRepository(projectId, handler),
      enabled: enabled && !!projectId && !!handler,
      retry: false,
    })),
  });
  return new Map(componentHandlers.map((handler, i) => [handler, results[i].data]));
}

export function useCommitHistory(componentId: string, branch: string) {
  return useQuery({
    queryKey: ['commitHistory', componentId, branch],
    queryFn: () => fetchCommitHistory(componentId, branch),
    enabled: !!componentId && !!branch,
  });
}

export function useGitHubUserRepos(enabled: boolean) {
  return useQuery({
    queryKey: ['githubUserRepos'],
    queryFn: () => fetchGitHubUserRepos(),
    enabled,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useRepoBranches(repoOrg: string, repoName: string, isPublicRepo: boolean) {
  return useQuery({
    queryKey: ['repoBranches', repoOrg, repoName, isPublicRepo],
    queryFn: () => fetchRepoBranches(repoOrg, repoName, isPublicRepo),
    enabled: !!repoOrg && !!repoName,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useRepoMetadata(org: string, repo: string, branch: string, subPath: string, enabled: boolean, isPublicRepo = false) {
  return useQuery({
    queryKey: ['repoMetadata', org, repo, branch, subPath, isPublicRepo],
    queryFn: () => fetchRepoMetadata(org, repo, branch, subPath, isPublicRepo),
    enabled: enabled && !!org && !!repo && !!branch,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useRepoContents(org: string, repo: string, branch: string, isPublicRepo = false) {
  return useQuery({
    queryKey: ['repoContents', org, repo, branch, isPublicRepo],
    queryFn: () => fetchRepoContents(org, repo, branch, isPublicRepo),
    enabled: !!org && !!repo && !!branch,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useChoreoSampleImages(orgUuid: string, projectId: string) {
  return useQuery({
    queryKey: ['choreoSampleImages', orgUuid, projectId],
    queryFn: () => fetchChoreoSampleImages(orgUuid, projectId),
    enabled: !!orgUuid && !!projectId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useComponentNameAvailability(projectId: string, componentNameCandidate: string) {
  return useQuery({
    queryKey: ['componentNameAvailability', projectId, componentNameCandidate],
    queryFn: () => fetchComponentNameAvailability(projectId, componentNameCandidate),
    enabled: !!projectId && !!componentNameCandidate && componentNameCandidate.length >= 3,
    staleTime: 0,
    retry: false,
  });
}

export function useUpdateBuildpackConfigs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBuildpackConfigsInput) => updateBuildpackConfigs(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['componentRepository'] });
      qc.invalidateQueries({ queryKey: ['deploymentStatus', input.componentId] });
    },
  });
}

export function useObtainGithubToken() {
  return useMutation({
    mutationFn: (authorizationCode: string) => obtainGithubToken(authorizationCode),
  });
}
