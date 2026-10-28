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

import { useQuery } from '@tanstack/react-query';
import { fetchThrottlingPolicies, fetchApiDocuments, fetchRuleAdherence } from '../api/marketplace';

export function useThrottlingPolicies() {
  return useQuery({
    queryKey: ['throttling-policies'],
    queryFn: fetchThrottlingPolicies,
    staleTime: 5 * 60_000,
  });
}

export function useApiDocuments(apimId: string | null) {
  return useQuery({
    queryKey: ['api-documents', apimId],
    queryFn: () => fetchApiDocuments(apimId!),
    enabled: !!apimId,
    staleTime: 5 * 60_000,
  });
}

export function useRuleAdherence(projectId: string, componentId: string, apimId: string | null) {
  return useQuery({
    queryKey: ['rule-adherence', projectId, componentId, apimId],
    queryFn: () => fetchRuleAdherence(projectId, componentId, apimId!),
    enabled: !!projectId && !!componentId && !!apimId,
    staleTime: 5 * 60_000,
  });
}
