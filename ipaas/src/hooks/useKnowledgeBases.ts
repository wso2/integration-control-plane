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

import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createKnowledgeBase, createKnowledgeBaseDataSource, deleteKnowledgeBase, fetchKnowledgeBase, fetchKnowledgeBases, KB_SERVICE_ENDPOINT, retrieveFromKnowledgeBase, updateKnowledgeBase } from '../api/knowledgeBases';
import type { EndpointRef } from '../types/consumers';
import type { CreateKnowledgeBaseDataSourceInput, CreateKnowledgeBaseInput, KnowledgeBase, UpdateKnowledgeBaseInput } from '../types/knowledgeBase';
import type { RetrievalQuery } from '../types/ragIngestion';
import { httpStatusOf } from '../utils/apiErrors';
import { endpointSecurityQueryKey } from './useConsumers';
import { useEndpointTestAccess } from './useEndpointTestAccess';

// A create finishes in the background, and a KB Service and its data sources take a
// while to roll out after a write, so a knowledge base still being created or
// deploying is polled until it settles.
const SETTLING_REFETCH_MS = 5000;
// While the KB Service's API is not on the gateway, or its security could not be read, it is read
// again this often: the read is not retried by itself, and a service being published answers 409.
const SECURITY_RECHECK_MS = 15_000;

const SETTLING = new Set(['', 'CREATING', 'IN_PROGRESS']);
const isSettling = (kb: KnowledgeBase): boolean => SETTLING.has(kb.status) || kb.dataSources.some((d) => SETTLING.has(d.status));

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

/**
 * Retrieval from a knowledge base's service on the API Platform gateway, queried as `componentId`.
 * The test key is minted, and renewed after a refusal, as for any API the console tests; `access`
 * says whether a query can be sent yet. `enabled` false mints nothing, as while the service is not
 * active.
 */
export function useRetrieveFromKnowledgeBase(kb: Pick<KnowledgeBase, 'name' | 'environment'>, componentId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const ref = useMemo<EndpointRef>(() => ({ componentName: kb.name, environmentName: kb.environment, endpointName: KB_SERVICE_ENDPOINT, deploymentTrackId: '' }), [kb.name, kb.environment]);
  // No fallback URL: a key goes only to the URL the gateway's own security read names.
  const access = useEndpointTestAccess(ref, { enabled });

  const offGateway = enabled && (!!access.securityError || (access.mode !== null && !access.gatewayUrl));
  useEffect(() => {
    if (!offGateway) return undefined;
    const timer = setInterval(() => void queryClient.invalidateQueries({ queryKey: endpointSecurityQueryKey(ref) }), SECURITY_RECHECK_MS);
    return () => clearInterval(timer);
  }, [offGateway, queryClient, ref]);

  const retrieve = useMutation({
    mutationFn: async (query: Pick<RetrievalQuery, 'userQuery' | 'maxChunks' | 'minSimilarity'>) => {
      const send = (apiKey: string | null) => retrieveFromKnowledgeBase(access.gatewayUrl, { header: access.authHeader, apiKey }, componentId, query);
      const used = access.apiKey;
      try {
        return await send(used);
      } catch (err) {
        // A held key expires, and another view's mint can revoke it. The key this query was refused
        // with is renewed, or the one another view renewed it to is taken, and the query is sent once
        // more: one renewal per query the user sends, so a 401 with another cause can't mint on its own.
        if (httpStatusOf(err) !== 401 || !used || access.mode !== 'api-key') throw err;
        const renewed = await access.renewKey(used);
        if (!renewed || renewed === used) throw err;
        return send(renewed);
      }
    },
  });
  return { retrieve, access };
}
