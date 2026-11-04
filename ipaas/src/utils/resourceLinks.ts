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

/** Where a linked configurable's value comes from in one environment: a link, or the integration's workload.yaml. */
export interface LinkedSource {
  /** The resource's display name. */
  resource: string;
  key?: string;
  /** The field's own link beats its connection's. */
  overrides?: boolean;
  declared?: boolean;
  /** The environment the resource has no values in. */
  noValuesIn?: string;
  /** Where to add the missing values. */
  valuesHref?: string;
}

/** Config key → the link that supplies the configurable in env: the links env's release carries. */
export const linkedConfigurables = (links: ResourceLink[], env: string): Map<string, LinkedSource> =>
  new Map(
    links.flatMap((l) => {
      const e = l.environments.find((x) => x.name === env);
      if (!e?.inRelease) return [];
      const source: LinkedSource = { resource: l.resourceType, ...(l.sourceDefined && { declared: true }), ...(!e.hasValues && { noValuesIn: env }) };
      return Object.keys(e.configurables).map((key) => [key, source] as const);
    }),
  );

/** The latest link write of each resource: whether it left the resource linked, and until when development's release may take to reflect it. */
export type LinkRollouts = Record<string, { linked: boolean; until: number }>;

/** Whether development's release has yet to reflect a link write it is rolling out. */
export const rollingOut = (links: ResourceLink[] | undefined, rollouts: LinkRollouts | undefined, now = Date.now()): boolean => Object.entries(rollouts ?? {}).some(([type, r]) => now < r.until && !developmentReflects(links, type, r.linked));

const developmentReflects = (links: ResourceLink[] | undefined, type: string, linked: boolean) => {
  const l = links?.find((x) => x.resourceType === type);
  const e = l?.environments[0];
  return linked ? !!l?.linked && !!e?.inRelease && (!l.connection || e.connection === l.connection) : !e?.inRelease;
};

/**
 * One link as a Configure form row: the connection env's release follows (the link's, unless the release has another),
 * what else to say, whether only the release still delivers it, whether the resource has no values there, and whether
 * it can be unlinked.
 */
export interface LinkRow {
  resourceType: string;
  name: string;
  package?: string;
  connection?: string;
  notes: string[];
  unlinked: boolean;
  noValues: boolean;
  canUnlink: boolean;
}

export const linkRows = (links: ResourceLink[], env: string): LinkRow[] =>
  links.flatMap((l) => {
    const e = l.environments.find((x) => x.name === env);
    if (!l.linked && !l.sourceDefined && !e?.inRelease) return [];
    // Where the release carries the resource, under whatever names, the environment is linked.
    const pending = l.linked && !l.sourceDefined && !!e && !e.inRelease;
    const releaseConnection = e?.inRelease ? e.connection : undefined;
    const otherConnection = l.linked && !!l.connection && !!releaseConnection && releaseConnection !== l.connection;
    const notes: string[] = [];
    if (!l.linked && l.sourceDefined) notes.push('declared in workload.yaml');
    else if (l.linked && !l.connection) notes.push('linked from WSO2 Cloud');
    else if (otherConnection) notes.push(`link now uses ${l.connection}`);
    if (pending) notes.push('next release');
    if (l.sourceDefined && l.linked) notes.push('overridden by workload.yaml');
    else if (l.namesFromWso2Cloud && l.connection) notes.push('names overridden on WSO2 Cloud');
    return [
      {
        resourceType: l.resourceType,
        name: l.displayName || l.resourceType,
        ...(l.package && { package: l.package }),
        connection: l.linked && !otherConnection ? l.connection : releaseConnection,
        notes,
        unlinked: !l.linked && !l.sourceDefined,
        noValues: !!e && !e.hasValues,
        canUnlink: !!l.connection,
      },
    ];
  });
