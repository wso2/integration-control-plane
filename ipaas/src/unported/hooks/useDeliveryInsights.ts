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
import { addDeliveryConfiguration, fetchDeliveryConfigurations, fetchDeliveryDataPlanes, fetchDeliveryInsights, updateDeliveryRejectorCriteria, updateDeliverySelectorCriteria } from '#api/delivery';
import type { DeliveryGranularity, DeliveryInsightsRaw, DeliveryRange } from '../../types/delivery';

/** ISO from/to for a range, computed at fetch time (mirrors Devant's timeValues). */
export function rangeToTimeValues(range: DeliveryRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  // Clamp at month boundaries so e.g. Mar 31 − 1M lands on Feb 28/29, not Mar 3.
  const shiftMonths = (months: number) => {
    const day = from.getDate();
    from.setDate(1);
    from.setMonth(from.getMonth() - months);
    from.setDate(Math.min(day, new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate()));
  };
  if (range === '1M') shiftMonths(1);
  else if (range === '3M') shiftMonths(3);
  else if (range === '6M') shiftMonths(6);
  else from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Incident-source configuration — null means "not configured", which gates the
 * CFR/MTTR widgets and shows the Configure banner. */
export function useDeliveryConfig(orgUuid: string) {
  const query = useQuery({
    queryKey: ['deliveryConfig', orgUuid],
    queryFn: () => fetchDeliveryConfigurations(orgUuid),
    enabled: !!orgUuid,
    staleTime: 60_000,
    retry: false,
  });
  return { config: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}

const EMPTY: DeliveryInsightsRaw = {
  deploymentFrequency: null,
  leadTimeSummary: null,
  failureRateSummary: null,
  recoveryTimeSummary: null,
  deployments: [],
  leadTimes: [],
  failureRates: [],
  recoveryTimes: [],
  topProjects: [],
};

export function useDeliveryInsights(orgUuid: string, projectId: string | undefined, range: DeliveryRange, granularity: DeliveryGranularity, configured: boolean, configReady: boolean) {
  const query = useQuery({
    queryKey: ['deliveryInsights', orgUuid, projectId ?? 'org', range, granularity, configured],
    queryFn: () => {
      const { from, to } = rangeToTimeValues(range);
      return fetchDeliveryInsights(from, to, granularity, configured, projectId);
    },
    enabled: !!orgUuid && configReady,
    staleTime: 60_000,
  });
  return { data: query.data ?? EMPTY, isLoading: query.isLoading, isError: query.isError };
}

export function useDeliveryDataPlanes(orgUuid: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['deliveryDataPlanes', orgUuid],
    queryFn: () => fetchDeliveryDataPlanes(orgUuid),
    enabled: !!orgUuid && enabled,
    staleTime: 300_000,
  });
  return { dataPlanes: query.data ?? [], isLoading: query.isLoading };
}

export function useSaveDeliveryConfig(orgUuid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dataPlaneId, selectorCriteria, rejectorCriteria }: { dataPlaneId: string; selectorCriteria: string; rejectorCriteria: string }) => addDeliveryConfiguration(orgUuid, dataPlaneId, selectorCriteria, rejectorCriteria),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deliveryConfig', orgUuid] });
      void queryClient.invalidateQueries({ queryKey: ['deliveryInsights'] });
    },
  });
}

export function useUpdateDeliveryConfig(orgUuid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ selectorCriteria, rejectorCriteria, previous }: { selectorCriteria: string; rejectorCriteria: string; previous: { selectorCriteria: string; rejectorCriteria: string } }) => {
      if (selectorCriteria !== previous.selectorCriteria) await updateDeliverySelectorCriteria(orgUuid, selectorCriteria);
      if (rejectorCriteria !== previous.rejectorCriteria) await updateDeliveryRejectorCriteria(orgUuid, rejectorCriteria);
    },
    // onSettled, not onSuccess: the two updates aren't atomic, so a failure on
    // the second can still leave the first applied server-side — refresh caches either way.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deliveryConfig', orgUuid] });
      void queryClient.invalidateQueries({ queryKey: ['deliveryInsights'] });
    },
  });
}
