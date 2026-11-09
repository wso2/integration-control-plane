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

// RAG knowledge bases (`/knowledge-bases`). A data source is also an ordinary
// scheduled integration, so its schedule, runs and deletion go through the
// component, schedule and execution APIs.
import type { CreateKnowledgeBaseDataSourceInput, CreateKnowledgeBaseInput, KnowledgeBase, KnowledgeBaseApiStatus, KnowledgeBaseDataSource, UpdateKnowledgeBaseInput } from '../types/knowledgeBase';
import type { RetrievalQuery, RetrievedChunk, RetrieveResponse } from '../types/ragIngestion';
import { bff, items, seg, type ListResponse, type MessageResponse } from './_client';

/** The KB Service's endpoint, the one its API on the API Platform gateway fronts. */
export const KB_SERVICE_ENDPOINT = 'knowledge-base';

// The BFF omits empty strings and the subtype-specific fields it has no value for.
interface BffKnowledgeBaseDataSource {
  name: string;
  displayName?: string;
  config?: Record<string, string>;
  secretKeys?: string[];
  cronExpression?: string;
  cronTimezone?: string;
  status?: string;
  error?: string;
  firstRunError?: string;
  releaseName?: string;
  createdAt?: string;
}

interface BffKnowledgeBase {
  name: string;
  displayName?: string;
  description?: string;
  projectName: string;
  environment: string;
  config?: Record<string, string>;
  secretKeys?: string[];
  status?: string;
  error?: string;
  serviceUrl?: string;
  apiStatus?: KnowledgeBaseApiStatus;
  dataSources?: BffKnowledgeBaseDataSource[];
  createdAt?: string;
  updatedAt?: string;
}

export function toKnowledgeBaseDataSource(d: BffKnowledgeBaseDataSource): KnowledgeBaseDataSource {
  return {
    name: d.name,
    displayName: d.displayName || d.name,
    config: d.config ?? {},
    secretKeys: d.secretKeys ?? [],
    cronExpression: d.cronExpression ?? '',
    cronTimezone: d.cronTimezone ?? '',
    status: d.status ?? '',
    error: d.error ?? '',
    firstRunError: d.firstRunError ?? '',
    releaseName: d.releaseName ?? '',
    createdAt: d.createdAt ?? '',
  };
}

export function toKnowledgeBase(kb: BffKnowledgeBase): KnowledgeBase {
  return {
    name: kb.name,
    displayName: kb.displayName || kb.name,
    description: kb.description ?? '',
    projectName: kb.projectName,
    environment: kb.environment,
    config: kb.config ?? {},
    secretKeys: kb.secretKeys ?? [],
    status: kb.status ?? '',
    error: kb.error ?? '',
    serviceUrl: kb.serviceUrl ?? '',
    ...(kb.apiStatus ? { apiStatus: kb.apiStatus } : {}),
    dataSources: (kb.dataSources ?? []).map(toKnowledgeBaseDataSource),
    createdAt: kb.createdAt ?? '',
    updatedAt: kb.updatedAt ?? '',
  };
}

export const fetchKnowledgeBases = (): Promise<KnowledgeBase[]> => bff.get<ListResponse<BffKnowledgeBase>>('/knowledge-bases').then((r) => items(r).map(toKnowledgeBase));

export const fetchKnowledgeBase = (name: string): Promise<KnowledgeBase> => bff.get<BffKnowledgeBase>(`/knowledge-bases/${seg(name)}`).then(toKnowledgeBase);

export const createKnowledgeBase = (input: CreateKnowledgeBaseInput): Promise<KnowledgeBase> => bff.post<BffKnowledgeBase>('/knowledge-bases', input).then(toKnowledgeBase);

export const updateKnowledgeBase = (name: string, input: UpdateKnowledgeBaseInput): Promise<KnowledgeBase> => bff.put<BffKnowledgeBase>(`/knowledge-bases/${seg(name)}`, input).then(toKnowledgeBase);

export const deleteKnowledgeBase = (name: string): Promise<MessageResponse> => bff.delete<MessageResponse>(`/knowledge-bases/${seg(name)}`);

export const createKnowledgeBaseDataSource = (knowledgeBase: string, input: CreateKnowledgeBaseDataSourceInput): Promise<KnowledgeBaseDataSource> =>
  bff.post<BffKnowledgeBaseDataSource>(`/knowledge-bases/${seg(knowledgeBase)}/data-sources`, input).then(toKnowledgeBaseDataSource);

export const RETRIEVE_TIMEOUT_MS = 30_000;

/** The key the gateway takes, in the header it reads it from; no key for an API that takes none. */
export interface GatewayCredential {
  header: string;
  apiKey: string | null;
}

/**
 * Query a knowledge base on the API Platform gateway, as the console tests any API: with the
 * endpoint's test key. The service reads a form-encoded query and identifies the caller by
 * `rag_component_id`, the integration the query is made from.
 * A refusal carries its HTTP status as `status`.
 */
export async function retrieveFromKnowledgeBase(gatewayUrl: string, credential: GatewayCredential, componentId: string, query: Pick<RetrievalQuery, 'userQuery' | 'maxChunks' | 'minSimilarity'>): Promise<RetrievedChunk[]> {
  const body = new URLSearchParams({
    rag_component_id: componentId,
    user_query: query.userQuery,
    max_retrieve_chunks: String(query.maxChunks),
    min_similarity_threshold: String(query.minSimilarity),
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (credential.apiKey) headers[credential.header] = credential.apiKey;
  // Bounded, so a request the gateway never answers fails instead of holding the chat busy.
  const res = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/retrieve`, { method: 'POST', headers, body, signal: AbortSignal.timeout(RETRIEVE_TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`The knowledge base answered HTTP ${res.status}`), { status: res.status });
  const out = (await res.json()) as RetrieveResponse;
  return out.retrieved_chunks ?? [];
}
