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
// Read inside the functions, never at module scope: `routes` statically imports
// the layouts, the same reason preloadRoute.ts gives.
import routes from '../../config/routes';
import { withBase } from '../../utils/basePath';

/** Tells the consoles apart in the WSO2 Cloud-wide GA4 property and Clarity project. */
export const PRODUCT = 'integration';

/** Reported for a path no route declares, so the raw path is never sent. */
export const UNMATCHED_ROUTE = '/(unmatched)';
/** Reported for a catch-all route, top-level (`*`) or nested (`.../*`), so unknown pages read as not found. */
export const NOT_FOUND_ROUTE = '/(not-found)';

/**
 * The route pattern behind an app path, e.g. `/organizations/:orgHandler/projects`
 * for `/organizations/acme/projects`. Built only from route definitions, never from
 * the path itself, so org, project and component names cannot leak into analytics.
 */
export function routePattern(pathname: string): string {
  // matchRoutes only reads path/index/children; see preloadRoute.ts.
  const matched = matchRoutes(routes as unknown as RouteObject[], pathname);
  if (!matched) return UNMATCHED_ROUTE;
  let pattern = '';
  for (const { route } of matched) {
    if (!route.path) continue;
    if (route.path === '*' || route.path.endsWith('/*')) return NOT_FOUND_ROUTE;
    pattern = route.path.startsWith('/') ? route.path : `${pattern.replace(/\/$/, '')}/${route.path}`;
  }
  return pattern || '/';
}

// Only the origin of an outside referrer: its path and query belong to another site and may name the user's org.
function externalReferrer(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : '';
  } catch {
    return '';
  }
}

let lastPathname: string | null = null;
let previousPageLocation: string | null = null;

/**
 * Pushes a `virtual_page_view` to the GTM dataLayer with a PII-free address: the route
 * pattern, no query string or hash. The GA4 tag in GTM must fire on this event and read
 * page_location / page_path / page_referrer from it, with GA4's automatic page views and
 * history-change page views turned off, or GA4 still sends the real URL.
 *
 * Queued entries wait in the dataLayer until GTM loads, which only happens after analytics consent.
 */
export function trackPageView(pathname: string): void {
  if (window.API_CONFIG?.trackingEnv === 'off') return;
  // A query or hash change on the same page is not a new page view, and StrictMode re-runs effects in dev.
  if (pathname === lastPathname) return;
  lastPathname = pathname;

  const pagePath = withBase(routePattern(pathname));
  const pageLocation = `${window.location.origin}${pagePath}`;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'virtual_page_view',
    product: PRODUCT,
    page_path: pagePath,
    page_location: pageLocation,
    page_referrer: previousPageLocation ?? externalReferrer(),
  });
  previousPageLocation = pageLocation;
}

/** Test-only: forget the last page, as a fresh page load would. */
export function resetPageViewTracking(): void {
  lastPathname = null;
  previousPageLocation = null;
}
