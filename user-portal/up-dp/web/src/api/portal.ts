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

import { accessToken } from '../auth/tokens';
import type { Deployment, Execution, ExecutionArg, ExecutionPage, Integration, IntegrationKind, IntegrationPage, Project } from '../types/portal';
import { request, type RequestOptions } from './http';

/** UP-DP's own API. Every route needs the signed-in user's access token. */

const API = '/api/v1';

async function authed<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(`${API}${path}`, { ...options, token: await accessToken() });
}

const trackPath = (integrationId: string, trackId: string) =>
  `/integrations/${encodeURIComponent(integrationId)}/deployment-tracks/${encodeURIComponent(trackId)}`;

export interface IntegrationQuery {
  kind?: IntegrationKind;
  /** Keeps the integrations in any of these projects, by id. */
  projects?: string[];
  /** Matches the display name and the description. */
  search?: string;
  limit?: number;
  cursor?: string;
}

export async function fetchIntegrations({ kind, projects, search, limit, cursor }: IntegrationQuery = {}): Promise<IntegrationPage> {
  const query = new URLSearchParams();
  if (kind) query.set('kind', kind);
  projects?.forEach((project) => query.append('project', project));
  if (search) query.set('search', search);
  if (limit) query.set('limit', String(limit));
  if (cursor) query.set('cursor', cursor);
  const page = await authed<IntegrationPage | null>(`/integrations${query.size ? `?${query}` : ''}`);
  return { items: page?.items ?? [], nextCursor: page?.nextCursor, totalCount: page?.totalCount ?? 0 };
}

export async function fetchProjects(): Promise<Project[]> {
  return (await authed<Project[] | null>('/projects')) ?? [];
}

export function fetchIntegration(id: string): Promise<Integration> {
  return authed<Integration>(`/integrations/${encodeURIComponent(id)}`);
}

export function fetchDeployment(integrationId: string, trackId: string): Promise<Deployment> {
  return authed<Deployment>(`${trackPath(integrationId, trackId)}/deployment`);
}

export async function fetchExecutions(integrationId: string, trackId: string, limit: number, before?: string): Promise<ExecutionPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before) query.set('before', before);
  return (await authed<ExecutionPage | null>(`${trackPath(integrationId, trackId)}/executions?${query}`)) ?? { items: [] };
}

export function triggerExecution(integrationId: string, trackId: string, args: ExecutionArg[]): Promise<Execution> {
  return authed<Execution>(`${trackPath(integrationId, trackId)}/executions`, { method: 'POST', body: { args } });
}
