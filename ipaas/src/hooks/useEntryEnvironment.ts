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
import { fetchProjectDeploymentPipelines } from '../api/deploymentPipelines';
import { useEnvironments } from './useEnvironments';
import { useOrgUuid } from './useOrgUuid';
import { entryEnvironmentIds, isEntryEnvironment } from '../utils/entryEnvironment';

/**
 * The project's entry environment ids, read from its deployment pipeline: the environments that take
 * API changes, later ones getting them by promotion. `tree` is undefined while the pipeline loads and
 * null when there is none to read (none, or the read failed); `ids` is then empty.
 */
export function useEntryEnvironmentIds(projectId: string) {
  const orgUuid = useOrgUuid() ?? '';
  const { data: pipelines, isError } = useQuery({
    queryKey: ['deploymentPipelines', 'project', orgUuid, projectId],
    queryFn: () => fetchProjectDeploymentPipelines(orgUuid, projectId),
    enabled: !!orgUuid && !!projectId,
  });
  // A failed read is "no pipeline", not "still loading": the BFF still guards the change.
  const tree = isError ? null : pipelines === undefined ? undefined : (pipelines[0]?.promotion_tree ?? null);
  return { tree, ids: entryEnvironmentIds(tree), loading: tree === undefined };
}

/**
 * Whether envId is one of the project's entry environments, and the entries' display names for copy that points there.
 * isEntry is false until the pipeline has loaded, so copy that claims an environment is not the entry waits for loading to clear.
 */
export function useEntryEnvironment(projectId: string, envId: string): { isEntry: boolean; loading: boolean; entryEnvironmentName: string } {
  const orgUuid = useOrgUuid() ?? '';
  const { tree, ids, loading } = useEntryEnvironmentIds(projectId);
  const { data: environments = [] } = useEnvironments(orgUuid, projectId);
  const entryNames = ids.map((id) => environments.find((env) => env.id === id)?.name ?? id);
  return { isEntry: isEntryEnvironment(tree, envId), loading, entryEnvironmentName: entryNames.length ? entryNames.join(' or ') : 'the first environment' };
}
