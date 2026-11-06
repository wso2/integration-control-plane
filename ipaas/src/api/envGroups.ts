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

/**
 * Env-var groups on a (component, environment), served by the BFF at
 * /components/{c}/environments/{e}/env-groups[/{name}]. The groups live on the
 * environment's ReleaseBinding, so writes need the component to be deployed
 * there. A PUT replaces the whole group and needs at least one variable; to
 * empty a group, delete it.
 *
 * `devopsConfigs.ts` maps the same routes onto devant's ConfigMap/Secret shapes
 * for the Configs & Secrets page. This file is the plain, component-scoped view.
 */

import { bff, q, seg } from './_client';
import type { EnvGroup } from '../types/envGroups';

interface BffEnvGroup {
  name: string;
  sensitive: boolean;
  keys?: string[];
  data?: Record<string, string>;
}

const toEnvGroup = (g: BffEnvGroup): EnvGroup => ({ name: g.name, sensitive: g.sensitive, keys: g.keys ?? [], data: g.data ?? {} });

const groupsPath = (componentId: string, envId: string): string => `/components/${seg(componentId)}/environments/${seg(envId)}/env-groups`;

/** Lists the groups with their keys; values are not included. */
export const listEnvGroups = async (projectId: string, componentId: string, envId: string): Promise<EnvGroup[]> => {
  const r = await bff.get<{ groups?: BffEnvGroup[] }>(`${groupsPath(componentId, envId)}${q({ projectName: projectId })}`);
  return (r?.groups ?? []).map(toEnvGroup);
};

/** One group with its values (blank for a sensitive group). */
export const getEnvGroup = async (projectId: string, componentId: string, envId: string, name: string): Promise<EnvGroup> => toEnvGroup(await bff.get<BffEnvGroup>(`${groupsPath(componentId, envId)}/${seg(name)}${q({ projectName: projectId })}`));

export const putEnvGroup = async (projectId: string, componentId: string, envId: string, name: string, sensitive: boolean, data: Record<string, string>): Promise<void> => {
  await bff.put(`${groupsPath(componentId, envId)}/${seg(name)}${q({ projectName: projectId })}`, { name, sensitive, data });
};

export const deleteEnvGroup = async (projectId: string, componentId: string, envId: string, name: string): Promise<void> => {
  await bff.delete(`${groupsPath(componentId, envId)}/${seg(name)}${q({ projectName: projectId })}`);
};
