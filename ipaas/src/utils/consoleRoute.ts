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

import { matchRoutes, type RouteObject } from 'react-router';

export interface RouteNode {
  path?: string;
  index?: boolean;
  children?: RouteNode[];
}

/**
 * The route template a path renders, e.g. `/organizations/acme/projects/shop` →
 * `/organizations/:orgHandler/projects/:projectHandler`. Telemetry reports the template, never the path: the path
 * carries the organization handle and the names customers chose for projects and integrations, and analytics wants
 * one bucket per page, not one per project. A path no route matches is reported as `/*`.
 */
export function routeTemplate(routes: RouteNode[], pathname: string): string {
  const matches = matchRoutes(routes as RouteObject[], pathname);
  if (!matches) return '/*';
  let template = '';
  for (const { route } of matches) {
    if (!route.path) continue;
    template = route.path.startsWith('/') ? route.path : `${template.replace(/\/$/, '')}/${route.path}`;
  }
  return template || '/';
}

export type EntityScope = 'organization' | 'project' | 'integration';

/** The navigation level a route template belongs to, or undefined outside an organization. */
export function entityScopeOf(template: string): EntityScope | undefined {
  if (template.includes(':componentHandler')) return 'integration';
  if (template.includes(':projectHandler')) return 'project';
  if (template.includes(':orgHandler')) return 'organization';
  return undefined;
}
