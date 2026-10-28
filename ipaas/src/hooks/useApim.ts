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
import {
  changeLifecycleState,
  createApimDocument,
  deleteApimDocument,
  deploySettingsV2,
  fetchApimApi,
  fetchApimDocumentContent,
  fetchApimDocuments,
  fetchApimOverview,
  fetchApimSwagger,
  fetchApimThumbnail,
  fetchLifecycleHistory,
  fetchLifecycleState,
  fetchMarketplaceService,
  generateTestKey,
  saveApimOverview,
  saveApimThumbnail,
  saveMarketplaceService,
  updateApimApi,
  updateApimDocument,
} from '../api/apim';
import type { ApimApiInfo, DeploySettingsV2Payload, GeneratedTestKey, LifecycleHistory, LifecycleState, MarketplaceService } from '../types/apim';
import type { ApiDocument } from '../types/marketplace';
import type { EnvEndpoint } from '../types/component';

export function useApimApi(apimId: string | undefined | null) {
  return useQuery<ApimApiInfo | null>({
    queryKey: ['apimApi', apimId],
    queryFn: () => fetchApimApi(apimId!),
    enabled: !!apimId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLifecycleState(apimId: string | undefined | null) {
  return useQuery<LifecycleState | null>({
    queryKey: ['lifecycleState', apimId],
    queryFn: () => fetchLifecycleState(apimId!),
    enabled: !!apimId,
    staleTime: 0,
    retry: false,
  });
}

export function useLifecycleHistory(apimId: string | undefined | null) {
  return useQuery<LifecycleHistory | null>({
    queryKey: ['lifecycleHistory', apimId],
    queryFn: () => fetchLifecycleHistory(apimId!),
    enabled: !!apimId,
    staleTime: 0,
    retry: false,
  });
}

export function useChangeLifecycleState(apimId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action }: { action: string }) => {
      if (!apimId) return Promise.reject(new Error('apimId is required'));
      return changeLifecycleState(apimId, action);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lifecycleState', apimId] });
      qc.invalidateQueries({ queryKey: ['lifecycleHistory', apimId] });
    },
  });
}

export function useApimOverview(apimId: string | undefined | null) {
  return useQuery<string>({
    queryKey: ['apimOverview', apimId],
    queryFn: () => fetchApimOverview(apimId!),
    enabled: !!apimId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useUpdateApimOverview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ apimId, content }: { apimId: string; content: string }) => saveApimOverview(apimId, content),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['apimOverview', vars.apimId] });
    },
  });
}

export function useMarketplaceService(componentId: string | undefined | null, version: string | undefined | null, endpoint: EnvEndpoint | null | undefined) {
  return useQuery<MarketplaceService | null>({
    queryKey: ['marketplaceService', componentId, version, endpoint?.id],
    queryFn: () => fetchMarketplaceService(componentId!, version!, endpoint!),
    enabled: !!componentId && !!version && !!endpoint,
    staleTime: 30_000,
    retry: false,
  });
}

export function useUpdateMarketplaceService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, service }: { serviceId: string; service: MarketplaceService }) => saveMarketplaceService(serviceId, service),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplaceService'] });
    },
  });
}

export function useUpdateApimApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ apimId, body }: { apimId: string; body: ApimApiInfo }) => updateApimApi(apimId, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['apimApi', vars.apimId] });
    },
  });
}

export function useDeploySettingsV2() {
  return useMutation({
    mutationFn: ({ componentId, versionId, payload }: { componentId: string; versionId: string; payload: DeploySettingsV2Payload }) => deploySettingsV2(componentId, versionId, payload),
  });
}

export function useGenerateTestKey() {
  return useMutation<GeneratedTestKey | null, Error, { apimId: string; keyType: 'Development' | 'Production' }>({
    mutationFn: ({ apimId, keyType }) => generateTestKey(apimId, keyType),
  });
}

export function useApimSwagger(apimId: string | undefined | null) {
  return useQuery<unknown>({
    queryKey: ['apimSwagger', apimId],
    queryFn: () => fetchApimSwagger(apimId!),
    enabled: !!apimId,
    staleTime: 60_000,
    retry: false,
  });
}

export function useApimDocuments(apimId: string | null | undefined) {
  return useQuery<ApiDocument[]>({
    queryKey: ['apimDocuments', apimId],
    queryFn: () => fetchApimDocuments(apimId!),
    enabled: !!apimId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useApimDocumentContent(apimId: string | null | undefined, docId: string | null | undefined, enabled = true) {
  return useQuery<string>({
    queryKey: ['apimDocumentContent', apimId, docId],
    queryFn: () => fetchApimDocumentContent(apimId!, docId!),
    enabled: !!apimId && !!docId && enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreateApimDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ apimId, doc, content }: { apimId: string; doc: Omit<ApiDocument, 'documentId'>; content: string }) => createApimDocument(apimId, doc, content),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['apimDocuments', vars.apimId] });
    },
  });
}

export function useUpdateApimDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ apimId, docId, doc, content }: { apimId: string; docId: string; doc: ApiDocument; content?: string }) => updateApimDocument(apimId, docId, doc, content),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['apimDocuments', vars.apimId] });
      qc.invalidateQueries({ queryKey: ['apimDocumentContent', vars.apimId, vars.docId] });
    },
  });
}

export function useDeleteApimDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ apimId, docId }: { apimId: string; docId: string }) => deleteApimDocument(apimId, docId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['apimDocuments', vars.apimId] });
    },
  });
}

export function useApimThumbnail(apimId: string | null | undefined, hasThumbnail: boolean) {
  return useQuery<string | null>({
    queryKey: ['apimThumbnail', apimId],
    queryFn: () => fetchApimThumbnail(apimId!),
    enabled: !!apimId && hasThumbnail,
    staleTime: 60_000,
    retry: false,
  });
}

export function useUpdateApimThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ apimId, file }: { apimId: string; file: File }) => saveApimThumbnail(apimId, file),
    onSuccess: (_data, { apimId }) => {
      queryClient.invalidateQueries({ queryKey: ['apimThumbnail', apimId] });
    },
  });
}
