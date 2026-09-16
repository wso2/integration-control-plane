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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UUID_RE } from '../utils/string';
import { trackEvent } from '../utils/tracking';
import { fetchProjects, fetchProject, fetchProjectContributors, fetchProjectComponentLabels, fetchProjectHandlerAvailability, createProject, createMonoRepoProject, linkProjectRepository, updateProject, deleteProject } from '#api/projects';
import type { Project, CreateProjectInput, CreateMonoRepoProjectInput, LinkProjectRepositoryInput, UpdateProjectInput } from '../types/project';
import { useOrgs } from './useOrg';
import { pollWhileDeleting } from '../utils/deletionPolling';
import { IS_CLOUD } from '../features';

function orgId(): number {
  return window.API_CONFIG?.asgardeoOrgNumericId ?? 0;
}

// In cloud, Thunder does not issue an asgardeoOrgNumericId, so the legacy
// numeric-ID gate (id > 0) blocks every project query indefinitely. The org
// scope is carried by the JWT, so the cloud variant's fetchProjects family
// ignores the numericId argument — we just need to let the queries fire.
const isOrgScopeReady = (id: number): boolean => IS_CLOUD || id > 0;

/**
 * Whether the queries in this file are actually enabled yet (WIP only — cloud is always ready).
 * Right after fresh onboarding, `asgardeoOrgNumericId` isn't recovered immediately (see
 * AppLayout.tsx's ID-recovery effect), so `orgId()` reads 0 for a beat. A caller that treats
 * "not loading" as "definitely doesn't exist" during that gap — instead of "we haven't been able
 * to check yet" — can flash a false not-found state. Use this to extend a loading condition
 * through that window instead.
 */
export function useIsOrgScopeReady(): boolean {
  return isOrgScopeReady(orgId());
}

const projectsQuery = (id: number) => ({
  queryKey: ['projects', id],
  queryFn: () => fetchProjects(id),
  enabled: isOrgScopeReady(id),
  refetchInterval: pollWhileDeleting,
});

export function useProjects() {
  return useQuery(projectsQuery(orgId()));
}

/**
 * Projects for pickers and navigation targets; `useProjects` keeps the finalizing ones that scope resolution and name-uniqueness checks need.
 */
export function useActiveProjects() {
  return useQuery({ ...projectsQuery(orgId()), select: (list: Project[]) => list.filter((p) => !p.deleting) });
}

export function useProjectsByOrg(orgHandle: string) {
  const { data: orgs } = useOrgs();
  const numericId = orgs?.find((o) => o.handle === orgHandle)?.numericId ?? 0;
  return useQuery({
    queryKey: ['projects', numericId],
    queryFn: () => fetchProjects(numericId),
    enabled: isOrgScopeReady(numericId),
    refetchInterval: pollWhileDeleting,
  });
}

export function useProject(projectId: string) {
  const id = orgId();
  return useQuery({
    queryKey: ['project', projectId, id],
    queryFn: () => fetchProject(id, projectId),
    enabled: !!projectId && isOrgScopeReady(id),
  });
}

export function useProjectByHandler(handler: string) {
  const { data: projects = [], isLoading } = useProjects();
  const data = handler && !UUID_RE.test(handler) ? (projects.find((p) => p.handler === handler) ?? undefined) : undefined;
  return { data, isLoading: !data && isLoading && !!handler && !UUID_RE.test(handler) };
}

export function useProjectContributors(projectId: string) {
  const id = orgId();
  return useQuery({
    queryKey: ['projectContributors', projectId, id],
    queryFn: () => fetchProjectContributors(id, projectId),
    enabled: !!projectId && isOrgScopeReady(id),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectComponentLabels(projectId: string) {
  const id = orgId();
  return useQuery({
    queryKey: ['projectComponentLabels', projectId, id],
    queryFn: () => fetchProjectComponentLabels(id, projectId),
    enabled: !!projectId && isOrgScopeReady(id),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectHandlerAvailability(candidate: string, enabled: boolean) {
  const id = orgId();
  return useQuery({
    queryKey: ['projectHandlerAvailability', id, candidate],
    queryFn: () => fetchProjectHandlerAvailability(id, candidate),
    enabled: enabled && isOrgScopeReady(id) && !!candidate && candidate.length >= 2,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => {
      trackEvent('project-create-start');
      return createProject(input);
    },
    onSuccess: () => {
      trackEvent('project-create-end');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: async (_result, projectId) => {
      // An in-flight fetch would resolve after the mark below and overwrite it.
      await qc.cancelQueries({ queryKey: ['projects'] });
      // The delete is only accepted here, so mark the row rather than dropping it.
      qc.setQueriesData<Project[]>({ queryKey: ['projects'] }, (list) => list?.map((p) => (p.id === projectId ? { ...p, deleting: true } : p)));
      qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
    },
  });
}

export function useCreateMonoRepoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMonoRepoProjectInput) => {
      trackEvent('project-create-start');
      return createMonoRepoProject(input);
    },
    onSuccess: () => {
      trackEvent('project-create-end');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useLinkProjectRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkProjectRepositoryInput) => linkProjectRepository(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
    },
  });
}

export function useGitHubReadme(gitOrganization?: string, repository?: string) {
  return useQuery({
    queryKey: ['githubReadme', gitOrganization, repository],
    queryFn: async () => {
      const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(gitOrganization!)}/${encodeURIComponent(repository!)}/readme`);
      if (!res.ok) return null;
      const data = (await res.json()) as { content: string; encoding: string };
      if (data.encoding !== 'base64') return null;
      const binary = atob(data.content.replace(/\n/g, ''));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    },
    enabled: !!gitOrganization && !!repository,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useProjectId(projectIdentifier: string) {
  const isProjectUuid = UUID_RE.test(projectIdentifier);
  const { data: projectById, isLoading: loadingById } = useProject(isProjectUuid ? projectIdentifier : '');
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();

  const projectFromList = !isProjectUuid ? (allProjects.find((p) => p.handler === projectIdentifier) ?? null) : null;
  const project = isProjectUuid ? projectById : (projectFromList ?? undefined);

  return {
    projectId: project?.id ?? '',
    project,
    isLoading: !!projectIdentifier && !project && (isProjectUuid ? loadingById : loadingProjects),
  };
}
