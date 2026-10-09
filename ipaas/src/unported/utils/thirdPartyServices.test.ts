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

import { describe, it, expect } from 'vitest';
import { buildCreateThirdPartyRequest, deriveConnectionEntries, encodeServiceDef, extractServerUrl, thirdPartyServicesBase } from './thirdPartyServices';
import type { ThirdPartyServiceDraft } from '../../types/thirdPartyServices';
import type { EndpointConfigDraft } from '../../types/genaiServices';
import type { OrgScope, ProjectScope } from '../../nav';

const endpoints: EndpointConfigDraft[] = [
  { name: 'ProdEndpoint', serviceUrl: 'https://api.openai.com/v1', params: [{ key: 'APIKey', value: 'k1', isSensitive: true }], environmentIds: ['env-prod'] },
  { name: 'DevEndpoint', serviceUrl: 'https://dev.openai.com/v1', params: [{ key: 'APIKey', value: 'k2', isSensitive: true }], environmentIds: ['env-dev'] },
];

const draft: ThirdPartyServiceDraft = { name: 'orgtest', version: 'v1', summary: 'sum', serviceType: 'REST', serviceDefContent: 'AAA', endpoints };

describe('thirdPartyServicesBase', () => {
  it('uses different segments for org and project scope', () => {
    const orgScope: OrgScope = { level: 'organizations', org: 'acme' };
    const projectScope: ProjectScope = { level: 'projects', org: 'acme', project: 'p1' };
    expect(thirdPartyServicesBase(orgScope)).toBe('/organizations/acme/admin/third-party');
    expect(thirdPartyServicesBase(projectScope)).toBe('/organizations/acme/projects/p1/admin/third-party-services');
  });
});

describe('encodeServiceDef', () => {
  it('base64-encodes url-encoded text (round-trips)', () => {
    const enc = encodeServiceDef('openapi: 3.0.0');
    expect(decodeURIComponent(atob(enc))).toBe('openapi: 3.0.0');
  });
});

describe('extractServerUrl', () => {
  it('reads the first server url from a YAML OpenAPI definition', () => {
    expect(extractServerUrl('openapi: 3.0.0\nservers:\n    - url: https://api.openai.com/v1\n')).toBe('https://api.openai.com/v1');
  });
  it('reads the first server url from a JSON OpenAPI definition', () => {
    expect(extractServerUrl('{"openapi":"3.0.0","servers":[{"url":"https://api.openai.com/v1"}]}')).toBe('https://api.openai.com/v1');
  });
  it('returns empty when there is no server', () => {
    expect(extractServerUrl('openapi: 3.0.0')).toBe('');
    expect(extractServerUrl('')).toBe('');
  });
});

describe('deriveConnectionEntries', () => {
  it('produces ServiceURL plus distinct param entries with sensitivity preserved', () => {
    const entries = deriveConnectionEntries(endpoints);
    expect(entries[0]).toEqual({ name: 'ServiceURL', type: 'string', isOptional: false, isSensitive: false });
    // APIKey appears in both endpoints but is de-duplicated to a single entry.
    expect(entries.filter((e) => e.name === 'APIKey')).toHaveLength(1);
    expect(entries.find((e) => e.name === 'APIKey')).toMatchObject({ isSensitive: true });
  });

  it('marks a duplicated param sensitive when any occurrence is sensitive', () => {
    const eps: EndpointConfigDraft[] = [
      { name: 'a', serviceUrl: 'u', params: [{ key: 'Key', value: 'v', isSensitive: false }], environmentIds: ['e1'] },
      { name: 'b', serviceUrl: 'u', params: [{ key: 'Key', value: 'v', isSensitive: true }], environmentIds: ['e2'] },
    ];
    expect(deriveConnectionEntries(eps).find((e) => e.name === 'Key')).toMatchObject({ isSensitive: true });
  });
});

describe('buildCreateThirdPartyRequest', () => {
  it('builds the marketplace payload with the chosen service type, no GenAI tag/template, and the uploaded IDL', () => {
    const req = buildCreateThirdPartyRequest('org-uuid', draft, undefined);
    expect(req).toMatchObject({
      name: 'orgtest',
      version: 'v1',
      serviceType: 'REST',
      isThirdParty: true,
      tags: [],
      status: 'CREATED',
      resourceType: 'SERVICE',
      visibility: ['ORGANIZATION'],
      idl: { idlType: 'OpenAPI', content: 'AAA' },
    });
    // templateType must be omitted — the backend rejects an empty TemplateType.
    expect('templateType' in req).toBe(false);
    expect(req.connectionSchemas[0].entries.map((e) => e.name)).toEqual(['ServiceURL', 'APIKey']);
  });

  it('maps GraphQL/SOAP/gRPC to their IDL types and sets project visibility', () => {
    expect(buildCreateThirdPartyRequest('o', { ...draft, serviceType: 'GRAPHQL' }, 'p').idl.idlType).toBe('GraphQL');
    expect(buildCreateThirdPartyRequest('o', { ...draft, serviceType: 'SOAP' }, 'p').idl.idlType).toBe('WSDL');
    expect(buildCreateThirdPartyRequest('o', { ...draft, serviceType: 'GRPC' }, 'p').idl.idlType).toBe('Proto');
    expect(buildCreateThirdPartyRequest('o', draft, 'p').visibility).toEqual(['PROJECT']);
  });

  it('throws without an organization', () => {
    expect(() => buildCreateThirdPartyRequest('', draft)).toThrow(/organization/i);
  });
});
