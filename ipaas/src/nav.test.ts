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

import { beforeAll, describe, it, expect } from 'vitest';
import type { FC } from 'react';
import {
  hasProject,
  hasComponent,
  broaden,
  narrow,
  resourceUrl,
  sidebarItems,
  generateMatrixRoutes,
  newProjectUrl,
  importProjectUrl,
  newEnvironmentUrl,
  orgCdPipelinesUrl,
  cdPipelineEditorUrl,
  newComponentUrl,
  generateMcpUrl,
  type Matrix,
  type OrgScope,
  type ProjectScope,
  type ComponentScope,
} from './nav';

const orgScope: OrgScope = { level: 'organizations', org: 'acme' };
const projectScope: ProjectScope = { level: 'projects', org: 'acme', project: 'p1' };
const componentScope: ComponentScope = { level: 'components', org: 'acme', project: 'p1', component: 'c1' };

describe('scope type guards', () => {
  it('hasProject is false only for organizations scope', () => {
    expect(hasProject(orgScope)).toBe(false);
    expect(hasProject(projectScope)).toBe(true);
    expect(hasProject(componentScope)).toBe(true);
  });

  it('hasComponent is true only for components scope', () => {
    expect(hasComponent(orgScope)).toBe(false);
    expect(hasComponent(projectScope)).toBe(false);
    expect(hasComponent(componentScope)).toBe(true);
  });
});

describe('broaden', () => {
  it('drops one level at a time, organizations -> null', () => {
    expect(broaden(componentScope)).toEqual(projectScope);
    expect(broaden(projectScope)).toEqual(orgScope);
    expect(broaden(orgScope)).toBeNull();
  });
});

describe('narrow', () => {
  it('adds one level at a time using the given childId', () => {
    expect(narrow(orgScope, 'p2')).toEqual({ level: 'projects', org: 'acme', project: 'p2' });
    expect(narrow(projectScope, 'c2')).toEqual({ level: 'components', org: 'acme', project: 'p1', component: 'c2' });
  });

  it('is a no-op on an already-deepest (components) scope', () => {
    expect(narrow(componentScope, 'whatever')).toEqual(componentScope);
  });
});

describe('pure URL builders', () => {
  it('newProjectUrl', () => expect(newProjectUrl({ org: 'acme' })).toBe('/organizations/acme/projects/new'));
  it('importProjectUrl', () => expect(importProjectUrl({ org: 'acme' })).toBe('/organizations/acme/projects/import'));
  it('newEnvironmentUrl', () => expect(newEnvironmentUrl({ org: 'acme' })).toBe('/organizations/acme/environments/new'));
  it('orgCdPipelinesUrl', () => expect(orgCdPipelinesUrl({ org: 'acme' })).toBe('/organizations/acme/admin/cd-pipelines'));
  it('newComponentUrl', () => expect(newComponentUrl({ org: 'acme', project: 'p1' })).toBe('/organizations/acme/projects/p1/components/new'));

  describe('cdPipelineEditorUrl', () => {
    it('without a pipelineId -> the create route', () => expect(cdPipelineEditorUrl({ org: 'acme' })).toBe('/organizations/acme/admin/cd-pipelines/new'));
    it('with a pipelineId -> the edit route', () => expect(cdPipelineEditorUrl({ org: 'acme' }, 'pipe-1')).toBe('/organizations/acme/admin/cd-pipelines/pipe-1/edit'));
  });

  describe('generateMcpUrl', () => {
    const scope = { org: 'acme', project: 'p1' };
    it('with neither optional param -> no query string', () => expect(generateMcpUrl(scope)).toBe('/organizations/acme/projects/p1/components/new/generate-mcp'));
    it('with only sourceApiId', () => expect(generateMcpUrl(scope, 'api-1')).toBe('/organizations/acme/projects/p1/components/new/generate-mcp?sourceApiId=api-1'));
    it('with both params', () => expect(generateMcpUrl(scope, 'api-1', 'handler-1')).toBe('/organizations/acme/projects/p1/components/new/generate-mcp?sourceApiId=api-1&sourceHandler=handler-1'));
  });
});

// Synthetic fixture shaped like (but intentionally decoupled from) the real
// MATRIX in src/config/routes.tsx — it exercises generateMatrixRoutes'
// algorithm (level availability, segment-to-pattern, access-control's :tab
// substitution), not "does this match production routes today".
const OrgPage: FC<OrgScope> = () => null;
const ProjectPage: FC<ProjectScope> = () => null;
const ComponentPage: FC<ComponentScope> = () => null;

const TEST_MATRIX: Matrix = {
  overview: { segment: '', pages: { organizations: OrgPage, projects: ProjectPage, components: ComponentPage } },
  build: { segment: 'build', pages: { organizations: OrgPage, projects: ProjectPage, components: ComponentPage } },
  deploy: { segment: 'deploy', pages: { organizations: OrgPage, projects: ProjectPage, components: ComponentPage } },
  alerts: { segment: 'alerts', pages: { components: ComponentPage } },
  logs: { segment: 'logs', pages: { projects: ProjectPage, components: ComponentPage } },
  environments: { segment: 'environments', pages: { organizations: OrgPage, projects: ProjectPage } },
  'access-control': { segment: 'settings/access-control/:tab', pages: { organizations: OrgPage, projects: ProjectPage, components: ComponentPage } },
};

describe('generateMatrixRoutes + resourceUrl + sidebarItems (matrix-driven)', () => {
  beforeAll(() => {
    // resourceUrl/sidebarItems read module-level state populated by this call —
    // it must run before any test in this file that uses them.
    generateMatrixRoutes(TEST_MATRIX);
  });

  it('generates one route per (resource, level) pair the matrix defines', () => {
    const routes = generateMatrixRoutes(TEST_MATRIX);
    // 3 + 3 + 3 + 1 + 2 + 2 + 3 = 17
    expect(routes).toHaveLength(17);
    expect(routes.map((r) => r.path)).toContain('organizations/:orgHandler/build');
    expect(routes.map((r) => r.path)).toContain('organizations/:orgHandler/projects/:projectHandler/logs');
    expect(routes.map((r) => r.path)).toContain('organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/alerts');
  });

  it('builds the URL for a resource available at the scope level', () => {
    expect(resourceUrl(orgScope, 'build')).toBe('/organizations/acme/build');
    expect(resourceUrl(componentScope, 'alerts')).toBe('/organizations/acme/projects/p1/components/c1/alerts');
  });

  it('overview has an empty segment, so its URL is just the scope prefix', () => {
    expect(resourceUrl(orgScope, 'overview')).toBe('/organizations/acme');
  });

  it('falls back to overview when the resource is not available at the scope level', () => {
    // 'alerts' only has a 'components' page in TEST_MATRIX
    expect(resourceUrl(orgScope, 'alerts')).toBe(resourceUrl(orgScope, 'overview'));
    expect(resourceUrl(projectScope, 'alerts')).toBe(resourceUrl(projectScope, 'overview'));
  });

  describe('access-control :tab substitution', () => {
    it("organizations level -> 'users'", () => expect(resourceUrl(orgScope, 'access-control')).toBe('/organizations/acme/settings/access-control/users'));
    it("projects level -> 'roles'", () => expect(resourceUrl(projectScope, 'access-control')).toBe('/organizations/acme/projects/p1/settings/access-control/roles'));
    it("components level -> 'roles'", () => expect(resourceUrl(componentScope, 'access-control')).toBe('/organizations/acme/projects/p1/components/c1/settings/access-control/roles'));
  });

  it('sidebarItems lists only resources available at the scope level, with the active flag and a capitalized label', () => {
    const items = sidebarItems(orgScope, 'build');
    expect(items.map((i) => i.resource).sort()).toEqual(['access-control', 'build', 'deploy', 'environments', 'overview'].sort());
    expect(items.find((i) => i.resource === 'build')).toMatchObject({ active: true, label: 'Build' });
    expect(items.find((i) => i.resource === 'access-control')).toMatchObject({ active: false, label: 'Access-control' });
  });

  it('sidebarItems excludes resources unavailable at a narrower/wider level than they support', () => {
    const orgItems = sidebarItems(orgScope, null).map((i) => i.resource);
    expect(orgItems).not.toContain('alerts');
    expect(orgItems).not.toContain('logs');

    const componentItems = sidebarItems(componentScope, null).map((i) => i.resource);
    expect(componentItems).not.toContain('environments');
  });
});
