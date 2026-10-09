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
import { buildChoreoConnectionRequest, buildThirdPartyConnectionRequest, buildVisibilities, componentConnectionsBase, projectConnectionsBase } from './connections';
import type { ConnectionSchemaEntry } from '../../types/connections';

const ORG = 'org-uuid-1';
const PROJ = 'proj-uuid-1';
const ENVS = [
  { id: 'env-dev', critical: false },
  { id: 'env-prod', critical: true },
];

describe('buildVisibilities', () => {
  it('project mode carries org + project uuid', () => {
    expect(buildVisibilities('Project', ORG, PROJ)).toEqual([{ organizationUuid: ORG, projectUuid: PROJ }]);
  });
  it('always carries org + project uuid (access mode is conveyed separately)', () => {
    expect(buildVisibilities('Organization', ORG, PROJ)).toEqual([{ organizationUuid: ORG, projectUuid: PROJ }]);
    expect(buildVisibilities('Public', ORG, PROJ)).toEqual([{ organizationUuid: ORG, projectUuid: PROJ }]);
  });
  it('component-scoped connections carry the component uuid regardless of mode', () => {
    expect(buildVisibilities('Organization', ORG, PROJ, { uuid: 'comp-1' })).toEqual([{ organizationUuid: ORG, projectUuid: PROJ, componentUuid: 'comp-1' }]);
  });
});

describe('buildChoreoConnectionRequest (component-scoped)', () => {
  const req = buildChoreoConnectionRequest({
    name: 'c',
    serviceId: 's',
    schemaReference: 'sr',
    accessMode: 'Project',
    organizationUuid: ORG,
    projectUuid: PROJ,
    orgIdInteger: 1,
    environments: ENVS,
    component: { uuid: 'comp-1', type: 'service' },
  });
  it('uses component visibility and the component type', () => {
    expect(req.visibilities).toEqual([{ organizationUuid: ORG, projectUuid: PROJ, componentUuid: 'comp-1' }]);
    expect(req.componentType).toBe('service');
  });
});

describe('buildChoreoConnectionRequest', () => {
  const req = buildChoreoConnectionRequest({
    name: '  My Conn  ',
    description: '  desc  ',
    serviceId: 'svc-1',
    schemaReference: 'schema-1',
    accessMode: 'Project',
    organizationUuid: ORG,
    projectUuid: PROJ,
    orgIdInteger: 10562,
    environments: ENVS,
  });

  it('trims name/description and sets the core fields', () => {
    expect(req.name).toBe('My Conn');
    expect(req.description).toBe('desc');
    expect(req.serviceId).toBe('svc-1');
    expect(req.schemaReference).toBe('schema-1');
    expect(req.orgIdInteger).toBe(10562);
    expect(req.componentType).toBe('non-component');
    expect(req.requestingServiceVisibility).toBe('PROJECT');
  });

  it('maps each environment to {id,isCritical,providerEnvId} with providerEnvId === id', () => {
    expect(req.environments).toEqual([
      { id: 'env-dev', isCritical: false, providerEnvId: 'env-dev' },
      { id: 'env-prod', isCritical: true, providerEnvId: 'env-prod' },
    ]);
  });

  it('drops an empty description to undefined', () => {
    const r = buildChoreoConnectionRequest({ name: 'n', description: '   ', serviceId: 's', schemaReference: 'sr', accessMode: 'Organization', organizationUuid: ORG, projectUuid: PROJ, orgIdInteger: 1, environments: ENVS });
    expect(r.description).toBeUndefined();
    expect(r.requestingServiceVisibility).toBe('ORGANIZATION');
  });
});

describe('buildThirdPartyConnectionRequest', () => {
  const entries: ConnectionSchemaEntry[] = [
    { name: 'ApiKey', type: 'string', isSensitive: true, isOptional: false },
    { name: 'BaseUrl', type: 'string', isSensitive: false, isOptional: false },
  ];
  const req = buildThirdPartyConnectionRequest({
    name: 'tp',
    serviceId: 'svc-tp',
    schemaReference: 'schema-tp',
    accessMode: 'Project',
    organizationUuid: ORG,
    projectUuid: PROJ,
    environments: ENVS,
    entries,
  });

  it('builds per-environment configurations with empty entry values and correct sensitivity/file flags', () => {
    expect(req.configurations['env-dev']).toEqual({
      environmentUuid: 'env-dev',
      isCritical: false,
      entries: {
        ApiKey: { key: 'ApiKey', value: '', isSensitive: true, isFile: false },
        BaseUrl: { key: 'BaseUrl', value: '', isSensitive: false, isFile: false },
      },
    });
    expect(req.configurations['env-prod'].isCritical).toBe(true);
    expect(req.configurations['env-prod'].entries.ApiKey.value).toBe('');
  });

  it('self-references each environment in envMapping', () => {
    expect(req.envMapping).toEqual({
      'env-dev': { resourceId: 'env-dev', parameterReference: 'env-dev' },
      'env-prod': { resourceId: 'env-prod', parameterReference: 'env-prod' },
    });
  });
});

describe('projectConnectionsBase', () => {
  it('builds the project connections URL', () => {
    expect(projectConnectionsBase('acme', 'store')).toBe('/organizations/acme/projects/store/admin/connections');
  });
});

describe('componentConnectionsBase', () => {
  it('builds the component connections URL', () => {
    expect(componentConnectionsBase('acme', 'store', 'checkout')).toBe('/organizations/acme/projects/store/components/checkout/admin/connections');
  });
});
