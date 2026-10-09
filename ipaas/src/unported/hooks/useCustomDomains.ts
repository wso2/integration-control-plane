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
import { createUrlMapping, deleteUrlMapping, fetchComponentUrlMappings, fetchCustomDomains, updateUrlMapping } from '#api/customDomains';
import { urlSettingsEnabled } from '../../constants/componentSettingsSections';
import type { CreateUrlMappingInput, CustomDomain, CustomDomainType, CustomUrlMapping } from '../../types/customDomain';

const ROOT = 'customDomains';

export function useCustomDomains(type?: CustomDomainType, enabled = true) {
  return useQuery<CustomDomain[]>({
    queryKey: [ROOT, 'domains', type ?? null],
    queryFn: () => fetchCustomDomains(type),
    enabled: enabled && urlSettingsEnabled(),
  });
}

export function useComponentUrlMappings(componentId: string | undefined) {
  return useQuery<CustomUrlMapping[]>({
    queryKey: [ROOT, 'mappings', componentId],
    queryFn: () => fetchComponentUrlMappings(componentId!),
    enabled: !!componentId && urlSettingsEnabled(),
  });
}

export function useCreateUrlMapping(componentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUrlMappingInput) => createUrlMapping(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT, 'mappings', componentId] }),
  });
}

export function useUpdateUrlMapping(componentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ urlId, input }: { urlId: string; input: CreateUrlMappingInput }) => updateUrlMapping(urlId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT, 'mappings', componentId] }),
  });
}

export function useDeleteUrlMapping(componentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (urlId: string) => deleteUrlMapping(urlId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT, 'mappings', componentId] }),
  });
}
