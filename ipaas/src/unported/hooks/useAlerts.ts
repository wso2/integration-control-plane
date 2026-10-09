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
import { createAlertRule, deleteAlertRule, getAlertRules, getAlertRulesCount, updateAlertRule, getAlertHistory } from '#api/alerts';
import { AlertComponentType, AlertTypeConstants } from '../../constants/alerts';
import type { AlertHistoryResponse, AlertRule, AlertRuleCountUsage } from '../../types/alerts';

export function useGetAlertRulesCount(alertingBaseUrl: string, componentId: string, environmentId: string, componentType: AlertComponentType = AlertComponentType.SERVICE): { data: AlertRuleCountUsage | undefined; isFetching: boolean; refetch: () => void } {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['getAlertRulesCount', componentId, environmentId, componentType],
    queryFn: () => getAlertRulesCount(alertingBaseUrl, componentId, environmentId, componentType),
    enabled: !!alertingBaseUrl && !!componentId && !!environmentId,
  });
  return { data, isFetching, refetch };
}

export function useGetAlertRules(alertingBaseUrl: string, componentId: string, environmentId: string, componentType: AlertComponentType = AlertComponentType.SERVICE) {
  return useQuery({
    queryKey: ['getAlertRules', componentId, environmentId, componentType],
    queryFn: async () => {
      const rules = await getAlertRules(alertingBaseUrl, componentId, environmentId, componentType);
      if (!rules || rules.length === 0) return undefined;

      const sorted = [...rules].sort((a, b) => new Date(b.createdTimestamp ?? '').getTime() - new Date(a.createdTimestamp ?? '').getTime());

      const processed: { [key in AlertTypeConstants]?: AlertRule[] } = {
        [AlertTypeConstants.LATENCY]: [],
        [AlertTypeConstants.TRAFFIC]: [],
        [AlertTypeConstants.STATUS_CODE]: [],
        [AlertTypeConstants.RESOURCES]: [],
        [AlertTypeConstants.LOGS]: [],
        [AlertTypeConstants.BUILD]: [],
      };

      sorted.forEach((rule) => {
        processed[rule.type]?.push(rule);
      });

      return {
        alertRules: processed,
        buildAlertRules: sorted.filter((r) => r.type === AlertTypeConstants.BUILD),
        alertRulesCount: sorted.length,
      };
    },
    enabled: !!alertingBaseUrl && !!componentId && !!environmentId,
  });
}

export function useCreateAlertRule(alertingBaseUrl: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertRule: AlertRule) => createAlertRule(alertingBaseUrl, alertRule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getAlertRules'] });
      queryClient.invalidateQueries({ queryKey: ['getAlertRulesCount'] });
    },
  });
}

export function useUpdateAlertRule(alertingBaseUrl: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (alertRule: AlertRule) => updateAlertRule(alertingBaseUrl, alertRule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getAlertRules'] });
    },
  });
  return {
    updateAlertRuleMutation: mutation.mutateAsync,
    isUpdateAlertRuleLoading: mutation.isPending,
  };
}

export function useDeleteAlertRule(alertingBaseUrl: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (alertRule: AlertRule) => deleteAlertRule(alertingBaseUrl, alertRule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getAlertRules'] });
      queryClient.invalidateQueries({ queryKey: ['getAlertRulesCount'] });
    },
  });
  return {
    deleteAlertRuleMutation: mutation.mutateAsync,
    isDeleteAlertRuleLoading: mutation.isPending,
  };
}

export function useGetAlertHistory(alertingBaseUrl: string, componentId: string, environmentId: string, startTime: string, endTime: string) {
  return useQuery<AlertHistoryResponse>({
    queryKey: ['getAlertHistory', componentId, environmentId, startTime, endTime],
    queryFn: () => getAlertHistory(alertingBaseUrl, componentId, environmentId, startTime, endTime),
    enabled: !!alertingBaseUrl && !!componentId && !!environmentId && !!startTime,
  });
}
