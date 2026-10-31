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

import type { ResourceLink } from '../types/configuration';

/** Where a linked configurable's value comes from in one environment. */
export interface LinkedSource {
  resource: string;
  /** Set when the resource has no values in the environment yet. */
  noValuesIn?: string;
}

/** Config key → the link that supplies the configurable in env: the links env's release carries. */
export const linkedConfigurables = (links: ResourceLink[], env: string): Map<string, LinkedSource> =>
  new Map(
    links.flatMap((l) => {
      const e = l.environments.find((x) => x.name === env);
      if (!e?.inRelease) return [];
      const source: LinkedSource = e.hasValues ? { resource: l.resourceType } : { resource: l.resourceType, noValuesIn: env };
      return Object.keys(e.configurables).map((key) => [key, source] as const);
    }),
  );

/** One link as a Configure form row: what it delivers in env, and whether it can be unlinked. */
export interface LinkRow {
  resourceType: string;
  notes: string[];
  canUnlink: boolean;
}

export const linkRows = (links: ResourceLink[], env: string): LinkRow[] =>
  links.flatMap((l) => {
    const e = l.environments.find((x) => x.name === env);
    if (!l.linked && !e?.inRelease) return [];
    const notes: string[] = [];
    if (!l.linked) notes.push("not linked · this environment's release still delivers it");
    else if (!l.connection) notes.push('linked from WSO2 Cloud under its own key names');
    else notes.push(`through ${l.connection}`);
    if (l.linked && e && !e.inRelease) notes.push('next release');
    if (e && !e.hasValues) notes.push(`no values in ${env}`);
    return [{ resourceType: l.resourceType, notes, canUnlink: l.linked }];
  });
