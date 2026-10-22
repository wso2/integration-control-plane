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
import { deleteEnvGroup, getEnvGroup, listEnvGroups, putEnvGroup } from '../api/envGroups';
import type { MiConfig, MiConfigSavePlan } from '../types/envGroups';
import { MI_ENV_VARS_GROUP, miSecretGroup, toMiConfig } from '../utils/miConfigs';

/**
 * The MI configuration (environment variables + secret keys) of one environment.
 * Gate on `enabled` while the component has no deployment there: the groups live
 * on the environment's ReleaseBinding.
 */
export function useMiConfig(projectId: string, componentId: string, envId: string, enabled = true) {
  return useQuery<MiConfig>({
    queryKey: ['miConfig', projectId, componentId, envId],
    queryFn: async () => {
      const groups = await listEnvGroups(projectId, componentId, envId);
      const hasEnvVars = groups.some((g) => g.name === MI_ENV_VARS_GROUP && !g.sensitive);
      const values = hasEnvVars ? (await getEnvGroup(projectId, componentId, envId, MI_ENV_VARS_GROUP)).data : {};
      return toMiConfig(groups, values);
    },
    enabled: enabled && !!projectId && !!componentId && !!envId,
  });
}

/** Applies a save plan from `planMiConfigSave`. */
export function useSaveMiConfig(projectId: string, componentId: string, envId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Sequential on purpose: each write is a read-modify-write of the same
    // ReleaseBinding annotation in the BFF, so parallel writes would race.
    // Removals go before writes: deleting a group also drops its keys from the
    // container env, so a key moved between groups (a secret turned into an env
    // var, or back) must leave its old group before its new one sets it.
    mutationFn: async (plan: MiConfigSavePlan) => {
      for (const key of plan.secretsToDelete) await deleteEnvGroup(projectId, componentId, envId, miSecretGroup(key));
      if (plan.envVars === null) await deleteEnvGroup(projectId, componentId, envId, MI_ENV_VARS_GROUP);
      else if (plan.envVars) await putEnvGroup(projectId, componentId, envId, MI_ENV_VARS_GROUP, false, plan.envVars);
      for (const s of plan.secretsToPut) await putEnvGroup(projectId, componentId, envId, miSecretGroup(s.key), true, { [s.key]: s.value });
    },
    // Settled, not success: a partial failure has still changed some groups.
    // The miConfig refetch is returned so the caller's onSuccess (which closes the
    // drawer) runs only after fresh data is in; a quick reopen would otherwise seed
    // from the stale cache, and its next save would undo this one.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['devopsConfigs'] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
      return qc.invalidateQueries({ queryKey: ['miConfig', projectId, componentId, envId] });
    },
  });
}
