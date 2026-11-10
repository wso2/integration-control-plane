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

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real route tree pulls in every page; a stub with the same shapes keeps this a unit test.
vi.mock('../../config/routes', () => ({
  default: [
    { path: '/', element: null },
    { path: '/signin', element: null },
    {
      element: null,
      children: [
        {
          element: null,
          children: [
            { path: 'organizations/:orgHandler/projects', element: null },
            { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview', element: null },
          ],
        },
      ],
    },
    { path: '*', element: null },
  ],
}));

const { routePattern, trackPageView, resetPageViewTracking, NOT_FOUND_ROUTE } = await import('./pageView');

const pushed = (): Record<string, unknown>[] => (window.dataLayer ?? []) as Record<string, unknown>[];

describe('routePattern', () => {
  it('replaces org, project and component names with their parameters', () => {
    expect(routePattern('/organizations/acme/projects/payroll/components/sap-sync/overview')).toBe('/organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview');
  });

  it('joins relative child paths under pathless layouts', () => {
    expect(routePattern('/organizations/acme/projects')).toBe('/organizations/:orgHandler/projects');
  });

  it('keeps absolute top-level paths as they are', () => {
    expect(routePattern('/signin')).toBe('/signin');
    expect(routePattern('/')).toBe('/');
  });

  it('never echoes a path that only the catch-all matches', () => {
    expect(routePattern('/organizations/acme/secret-thing')).toBe(NOT_FOUND_ROUTE);
  });
});

describe('trackPageView', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).dataLayer;
    window.API_CONFIG = { trackingEnv: 'prod' } as typeof window.API_CONFIG;
    resetPageViewTracking();
  });

  it('pushes the route pattern, not the real path', () => {
    trackPageView('/organizations/acme/projects');
    expect(pushed()).toEqual([
      expect.objectContaining({ event: 'virtual_page_view', product: 'integration', page_path: '/organizations/:orgHandler/projects', page_location: `${window.location.origin}/organizations/:orgHandler/projects` }),
    ]);
    expect(JSON.stringify(pushed())).not.toContain('acme');
  });

  it('uses the previous clean address as the referrer', () => {
    trackPageView('/organizations/acme/projects');
    trackPageView('/organizations/acme/projects/payroll/components/sap-sync/overview');
    expect(pushed()[1].page_referrer).toBe(`${window.location.origin}/organizations/:orgHandler/projects`);
  });

  it('pushes once per page, so query changes and StrictMode re-runs add nothing', () => {
    trackPageView('/signin');
    trackPageView('/signin');
    expect(pushed()).toHaveLength(1);
  });

  it('pushes nothing when tracking is off', () => {
    window.API_CONFIG = { trackingEnv: 'off' } as typeof window.API_CONFIG;
    trackPageView('/signin');
    expect(pushed()).toEqual([]);
  });
});
