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
import type { CreateKnowledgeBaseDataSourceInput, CreateKnowledgeBaseInput, KnowledgeBase, KnowledgeBaseDataSource, UpdateKnowledgeBaseInput } from '../types/knowledgeBase';
import type { RetrievalQuery, RetrievedChunk, RetrieveResponse } from '../types/ragIngestion';
import { bff, items, seg, type ListResponse, type MessageResponse } from './_client';

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

/**
 * Query a knowledge base through the BFF, which forwards to its KB Service. The
 * service reads a form-encoded query and identifies the caller by
 * `rag_component_id`, the integration the query is made from.
 */
export const retrieveFromKnowledgeBase = (name: string, componentId: string, query: Pick<RetrievalQuery, 'userQuery' | 'maxChunks' | 'minSimilarity'>): Promise<RetrievedChunk[]> => {
  const body = new URLSearchParams({
    rag_component_id: componentId,
    user_query: query.userQuery,
    max_retrieve_chunks: String(query.maxChunks),
    min_similarity_threshold: String(query.minSimilarity),
  });
  // Bounded, so a request the BFF never answers fails instead of holding the chat busy.
  return bff.post<RetrieveResponse>(`/knowledge-bases/${seg(name)}/retrieve`, body, undefined, AbortSignal.timeout(RETRIEVE_TIMEOUT_MS)).then((r) => r.retrieved_chunks ?? []);
};
