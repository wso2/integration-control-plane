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
import { createKnowledgeBase, createKnowledgeBaseDataSource, deleteKnowledgeBase, fetchKnowledgeBase, fetchKnowledgeBases, retrieveFromKnowledgeBase, updateKnowledgeBase } from '../api/knowledgeBases';
import type { CreateKnowledgeBaseDataSourceInput, CreateKnowledgeBaseInput, KnowledgeBase, UpdateKnowledgeBaseInput } from '../types/knowledgeBase';
import type { RetrievalQuery } from '../types/ragIngestion';

// A KB Service and its data sources take a while to roll out after a write, so
// a knowledge base still deploying is polled until it settles.
const SETTLING_REFETCH_MS = 5000;
const isSettling = (kb: KnowledgeBase): boolean => kb.status === '' || kb.status === 'IN_PROGRESS' || kb.dataSources.some((d) => d.status === '' || d.status === 'IN_PROGRESS');

export function useKnowledgeBases() {
  return useQuery({
    queryKey: ['knowledgeBases'],
    queryFn: fetchKnowledgeBases,
    refetchInterval: (query) => (query.state.data?.some(isSettling) ? SETTLING_REFETCH_MS : false),
  });
}

export function useKnowledgeBase(name: string) {
  return useQuery({
    queryKey: ['knowledgeBase', name],
    queryFn: () => fetchKnowledgeBase(name),
    enabled: !!name,
    refetchInterval: (query) => (query.state.data && isSettling(query.state.data) ? SETTLING_REFETCH_MS : false),
  });
}

export function useCreateKnowledgeBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKnowledgeBaseInput) => createKnowledgeBase(input),
    onSuccess: (kb) => {
      qc.setQueryData(['knowledgeBase', kb.name], kb);
      qc.invalidateQueries({ queryKey: ['knowledgeBases'] });
    },
  });
}

export function useUpdateKnowledgeBase(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateKnowledgeBaseInput) => updateKnowledgeBase(name, input),
    onSuccess: (kb) => {
      qc.setQueryData(['knowledgeBase', name], kb);
      qc.invalidateQueries({ queryKey: ['knowledgeBases'] });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteKnowledgeBase(name),
    onSuccess: (_r, name) => {
      qc.removeQueries({ queryKey: ['knowledgeBase', name] });
      qc.invalidateQueries({ queryKey: ['knowledgeBases'] });
    },
  });
}

export function useCreateKnowledgeBaseDataSource(knowledgeBase: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKnowledgeBaseDataSourceInput) => createKnowledgeBaseDataSource(knowledgeBase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledgeBase', knowledgeBase] });
      qc.invalidateQueries({ queryKey: ['knowledgeBases'] });
      // The source is also an integration of the knowledge base's project.
      qc.invalidateQueries({ queryKey: ['components'] });
    },
  });
}

export function useRetrieveFromKnowledgeBase(knowledgeBase: string, componentId: string) {
  return useMutation({
    mutationFn: (query: Pick<RetrievalQuery, 'userQuery' | 'maxChunks' | 'minSimilarity'>) => retrieveFromKnowledgeBase(knowledgeBase, componentId, query),
  });
}
