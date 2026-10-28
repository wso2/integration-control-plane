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
import { getAutoscaling, updateAutoscaling } from '../api/scaling';
import { useOrgUuid } from './useOrgUuid';
import { pollsAutoscaling } from '../utils/autoscaling';
import type { AutoscalingWriteData } from '../types/scaling';

const ROOT = 'scaling';

const AUTOSCALING_POLL_MS = 10_000;

export function useAutoscaling(projectId: string, componentId: string | undefined, environmentId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'autoscaling', orgUuid, projectId, componentId, environmentId],
    queryFn: () => getAutoscaling(orgUuid!, projectId, componentId!, environmentId),
    enabled: !!orgUuid && !!projectId && !!componentId && !!environmentId,
    retry: false,
    refetchInterval: (query) => (pollsAutoscaling(query.state.data) ? AUTOSCALING_POLL_MS : false),
  });
}

export function useUpdateAutoscaling(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, environmentId, data }: { componentId: string; environmentId: string; data: AutoscalingWriteData }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateAutoscaling(orgUuid, projectId, componentId, environmentId, data);
    },
    // Resync after failures too: a rejected write leaves the saved setting as the truth to show.
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT, 'autoscaling'] }),
  });
}
