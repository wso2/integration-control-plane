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

import { useEnvironments } from './useEnvironments';
import { useOrgUuid } from './useOrgUuid';
import { useProjectDeploymentPipelines } from './useDeploymentPipelines';
import { entryEnvironmentIds, isEntryEnvironment } from '../utils/entryEnvironment';

/** Whether envId is one of the project's entry environments, and the entries' display names for copy that points there. */
export function useEntryEnvironment(projectId: string, envId: string): { isEntry: boolean; entryEnvironmentName: string } {
  const { data: pipelines, isError } = useProjectDeploymentPipelines(projectId);
  const { data: environments = [] } = useEnvironments(useOrgUuid() ?? '', projectId);
  // A failed read is "no pipeline", not "still loading": the BFF still guards the change.
  const tree = isError ? null : pipelines === undefined ? undefined : (pipelines[0]?.promotion_tree ?? null);
  const entryNames = entryEnvironmentIds(tree).map((id) => environments.find((env) => env.id === id)?.name ?? id);
  return { isEntry: isEntryEnvironment(tree, envId), entryEnvironmentName: entryNames.length ? entryNames.join(' or ') : 'the first environment' };
}
