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

/** Cloud (OpenChoreo) project API. Calls the ipaas-service BFF. */

import type { Project, ProjectContributor, ProjectHandlerAvailability, CreateProjectInput, CreateMonoRepoProjectInput, LinkProjectRepositoryInput, UpdateProjectInput } from '../types/project';
import { bff, items, q, seg, type ListResponse } from './_client';
import { fetchComponents } from './components';

// The org comes from the access token, so these take no org id.

export const fetchProjects = (): Promise<Project[]> => bff.get<ListResponse<Project>>('/projects').then(items);

export const fetchProject = (projectId: string): Promise<Project> => bff.get<Project>(`/projects/${seg(projectId)}`);

export const fetchProjectByHandler = (projectHandler: string): Promise<Project> => bff.get<Project>(`/projects/${seg(projectHandler)}`);

export const fetchProjectContributors = (projectId: string): Promise<ProjectContributor[]> => bff.get<ListResponse<ProjectContributor>>(`/projects/${seg(projectId)}/contributors`).then(items);

// Derived client-side rather than from GET /projects/{p}/labels: OpenChoreo has
// no label index, so the BFF would have to list every component and union the
// labels itself — exactly what this does, one hop later.
export const fetchProjectComponentLabels = async (projectId: string): Promise<string[]> => {
  const components = await fetchComponents('', projectId);
  const labels = new Set<string>();
  for (const c of components) {
    if (Array.isArray(c.labels)) c.labels.forEach((l) => labels.add(l));
  }
  return [...labels].sort();
};

export const fetchProjectHandlerAvailability = (candidate: string): Promise<ProjectHandlerAvailability> => bff.get<ProjectHandlerAvailability>(`/projects/handler-availability${q({ candidate })}`);

// OpenChoreo Project names are K8s resource names (RFC 1123: lowercase
// alphanumeric, '-' or '.'). The frontend separates `name` (display label)
// from `handler` (URL-safe slug); the BFF expects `name` to be the slug and
// `displayName` to be the label, so we remap before posting.
//
// The `deploymentPipeline` field is required by the BFF and must reference an
// existing DeploymentPipeline resource. We resolve it dynamically and cache
// the lookup for the session — pipelines are namespace-scoped and stable at
// runtime. On failure we drop the cache so the next create retries the lookup.
let defaultPipelinePromise: Promise<string> | null = null;
const fetchDefaultPipelineName = (): Promise<string> => {
  if (!defaultPipelinePromise) {
    defaultPipelinePromise = bff
      .get<ListResponse<{ name: string }>>('/deploymentpipelines')
      .then((r) => {
        const list = items(r);
        // deploymentPipeline is a required, non-empty BFF field; reject rather
        // than resolve to '' so a create never POSTs an invalid pipeline ref.
        if (!list.length) {
          defaultPipelinePromise = null;
          throw new Error('No deployment pipeline available');
        }
        return list.find((p) => p.name === 'default')?.name ?? list[0].name;
      })
      .catch((err) => {
        defaultPipelinePromise = null;
        throw err;
      });
  }
  return defaultPipelinePromise;
};

const toBffCreateProjectBody = async (input: CreateProjectInput) => ({
  name: input.handler,
  displayName: input.name,
  description: input.description,
  deploymentPipeline: await fetchDefaultPipelineName(),
});

const toBffCreateMonoRepoProjectBody = async (input: CreateMonoRepoProjectInput) => ({
  ...(await toBffCreateProjectBody(input)),
  monoRepo: true,
  repository: input.repository,
  gitOrganization: input.gitOrganization,
  branch: input.branch,
  directoryPath: input.directoryPath,
  gitProvider: input.gitProvider,
  isPublicRepo: input.isPublicRepo,
});

export const createProject = async (input: CreateProjectInput): Promise<Project> => bff.post<Project>('/projects', await toBffCreateProjectBody(input));

// The BFF update takes `displayName` — `name` is the immutable K8s metadata.name
// and is not a settable field, so sending it here silently dropped the rename.
// `version` has no OpenChoreo counterpart and is ignored upstream.
export const updateProject = (input: UpdateProjectInput): Promise<Project> => bff.put<Project>(`/projects/${seg(input.id)}`, { displayName: input.name, description: input.description });

export const deleteProject = (projectId: string): Promise<void> => bff.delete<void>(`/projects/${seg(projectId)}`);

export const createMonoRepoProject = async (input: CreateMonoRepoProjectInput): Promise<Project> => bff.post<Project>('/projects', await toBffCreateMonoRepoProjectBody(input));

// Links a repository to an existing project. Only the repository's own identity
// travels. `orgHandler` is dropped because the WSO2 organization comes from the
// access token — that is a different thing from `gitOrganization` below, which is
// the git account that owns the repository (the `acme` in github.com/acme/repo)
// and which the BFF rejects the request without. `name`/`description` are dropped
// because linking never edits them.
// `projectId` is the OpenChoreo project name — the same value updateProject uses
// as its path segment.
export const linkProjectRepository = (input: LinkProjectRepositoryInput): Promise<Project> =>
  bff.put<Project>(`/projects/${seg(input.projectId)}/repository`, {
    gitProvider: input.gitProvider,
    gitOrganization: input.gitOrganization,
    repository: input.repository,
    branch: input.branch,
    directoryPath: input.directoryPath,
    isPublicRepo: input.isPublicRepo,
  });
