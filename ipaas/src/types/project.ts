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

export interface Project {
  id: string;
  orgId: number;
  name: string;
  handler: string;
  description: string;
  version: string;
  createdDate: string;
  updatedAt: string;
  region: string;
  type: string;
  defaultDeploymentPipelineId: string;
  gitOrganization?: string;
  repository?: string;
  branch?: string;
  gitProvider?: string;
  /** Path within the repository; '' addresses the repository root. */
  directoryPath?: string;
  isPublicRepo?: boolean;
  /** Org-owner display name — used by Delivery insights' Top Performing Projects table. */
  owner?: string;
  /** Set while the project's delete is accepted but its finalizers have not cleared yet. */
  deleting?: boolean;
}

export interface ProjectContributor {
  id: number;
  displayName: string;
  email: string;
  pictureUrl: string | null;
  totalContributions: number;
}

export interface ProjectHandlerAvailability {
  handlerUnique: boolean;
  alternateHandlerCandidate?: string;
}

export interface CreateProjectInput {
  name: string;
  handler: string;
  description: string;
  orgHandler: string;
}

export interface UpdateProjectInput {
  id: string;
  name: string;
  description: string;
  /** The project's current version (optimistic concurrency). */
  version: string;
}

export interface CreateMonoRepoProjectInput extends CreateProjectInput {
  repository: string;
  gitOrganization: string;
  branch: string;
  directoryPath: string;
  gitProvider: string;
  isPublicRepo: boolean;
}

/** Link a git repository to an EXISTING project (Devant `createProjectRepository`). */
export interface LinkProjectRepositoryInput {
  projectId: string;
  name: string;
  handler: string;
  description: string;
  orgHandler: string;
  repository: string;
  gitOrganization: string;
  branch: string;
  gitProvider: string;
  directoryPath: string;
  isPublicRepo: boolean;
}

export type GitProvider = 'github' | 'public';

export type WorkspaceIntegrationType = 'service' | 'automation' | 'file-integration' | 'event-integration' | 'ai-agent' | 'mcp-server';

export interface ProjectGitSource {
  provider: GitProvider;
  org: string;
  repo: string;
  branch: string;
  subPath: string;
  isPublicRepo: boolean;
}

export interface WorkspaceModule {
  path: string;
  name: string;
  displayName: string;
  integrationType: WorkspaceIntegrationType;
}
