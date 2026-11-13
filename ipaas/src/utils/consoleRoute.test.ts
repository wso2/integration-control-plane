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

import { describe, expect, it } from 'vitest';
import { entityScopeOf, routeTemplate } from './consoleRoute';

const routes = [
  { path: '/', element: null },
  { children: [{ path: '/login' }] },
  {
    children: [
      {
        children: [
          { path: 'organizations/:orgHandler' },
          { path: 'organizations/:orgHandler/projects/:projectHandler/home' },
          { path: 'organizations/:orgHandler/projects/:projectHandler/components/new' },
          { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview' },
          { path: 'organizations/:orgHandler/projects/:projectHandler/*' },
        ],
      },
    ],
  },
  { path: 'nested', children: [{ path: 'child/:id' }] },
  { path: '*' },
];

describe('routeTemplate', () => {
  it.each([
    ['/organizations/acme', '/organizations/:orgHandler'],
    ['/organizations/acme/projects/shop/home', '/organizations/:orgHandler/projects/:projectHandler/home'],
    ['/organizations/acme/projects/shop/components/new', '/organizations/:orgHandler/projects/:projectHandler/components/new'],
    ['/organizations/acme/projects/shop/components/orders/overview', '/organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview'],
    ['/organizations/acme/projects/shop/retired-page', '/organizations/:orgHandler/projects/:projectHandler/*'],
    ['/nested/child/42', '/nested/child/:id'],
    ['/login', '/login'],
    ['/', '/'],
    ['/somewhere/else', '/*'],
  ])('%s → %s', (path, template) => {
    expect(routeTemplate(routes, path)).toBe(template);
  });

  it('never returns a concrete handle', () => {
    expect(routeTemplate(routes, '/organizations/acme/projects/shop/components/orders/overview')).not.toMatch(/acme|shop|orders/);
  });

  it('is /* when nothing matches', () => {
    expect(routeTemplate([{ path: '/login' }], '/organizations/acme')).toBe('/*');
  });
});

describe('entityScopeOf', () => {
  it.each([
    ['/organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview', 'integration'],
    ['/organizations/:orgHandler/projects/:projectHandler/home', 'project'],
    ['/organizations/:orgHandler/settings', 'organization'],
    ['/login', undefined],
  ])('%s → %s', (template, scope) => {
    expect(entityScopeOf(template)).toBe(scope);
  });
});
