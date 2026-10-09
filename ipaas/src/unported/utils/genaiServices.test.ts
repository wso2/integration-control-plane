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
import { buildConnectionConfigPayload, buildCreateServiceRequest, connectionConfigToEndpoints, connectionSchemaName, endpointsToConfigRequest, formatServiceCreatedTime, inferProviderLogo, normalizeIdlContent, templateToDraft } from './genaiServices';
import type { ConnectionConfigResponse, ConnectionSchemaEntry, GenAiProviderTemplateDetail } from '../../types/genaiServices';

const openAiTemplate: GenAiProviderTemplateDetail = {
  templateId: 't1',
  name: 'Open AI',
  description: 'desc',
  templateType: 'GenAI',
  version: 'v1.0',
  serviceType: 'REST',
  spec: { specType: 'OpenAPI', content: 'YmFzZTY0' },
  defaultConfigs: [{ key: 'serviceUrl', value: 'https://api.openai.com/v1' }],
  userDefinedConfigs: [{ name: 'OPENAI_API_KEY', isSensitive: true, configType: 'string' }],
};

describe('templateToDraft', () => {
  it('derives connection entries (user configs + ServiceURL) and locks the prefilled URL', () => {
    const draft = templateToDraft(openAiTemplate);
    expect(draft.serviceUrl).toBe('https://api.openai.com/v1');
    expect(draft.serviceUrlLocked).toBe(true);
    expect(draft.serviceDefContent).toBe('YmFzZTY0');
    expect(draft.version).toBe('v1');
    const names = draft.connectionEntries.map((e) => e.name);
    expect(names).toEqual(['OPENAI_API_KEY', 'ServiceURL']);
    expect(draft.connectionEntries.find((e) => e.name === 'OPENAI_API_KEY')?.isSensitive).toBe(true);
    expect(draft.connectionEntries.find((e) => e.name === 'ServiceURL')?.isSensitive).toBe(false);
  });

  it('leaves the URL unlocked when the template provides no default', () => {
    const draft = templateToDraft({ ...openAiTemplate, defaultConfigs: [] });
    expect(draft.serviceUrl).toBe('');
    expect(draft.serviceUrlLocked).toBe(false);
  });
});

describe('connectionSchemaName', () => {
  it('mirrors Devant naming', () => {
    expect(connectionSchemaName('Test service')).toBe('Test service - Connection Configuration');
  });
});

describe('buildCreateServiceRequest', () => {
  it('assembles the org-scoped GenAI payload', () => {
    const draft = templateToDraft(openAiTemplate);
    draft.name = 'Test service';
    const req = buildCreateServiceRequest('org-123', draft);
    expect(req.organizationId).toBe('org-123');
    expect(req.projectId).toBe('');
    expect(req.serviceType).toBe('REST');
    expect(req.tags).toEqual(['GenAI']);
    expect(req.visibility).toEqual(['ORGANIZATION']);
    expect(req.isThirdParty).toBe(true);
    expect(req.idl).toEqual({ idlType: 'OpenAPI', content: 'YmFzZTY0', environmentId: 'third-party-service' });
    expect(req.resourceType).toBe('SERVICE');
    expect(req.status).toBe('CREATED');
    expect(req.templateType).toBe('GenAI');
    expect(req.connectionSchemas[0].name).toBe('Test service - Connection Configuration');
    expect(req.connectionSchemas[0].isDefault).toBe(true);
  });

  it('throws when the org is missing or blank', () => {
    const draft = templateToDraft(openAiTemplate);
    expect(() => buildCreateServiceRequest('', draft)).toThrow();
    expect(() => buildCreateServiceRequest('   ', draft)).toThrow();
  });

  it('scopes to a project with PROJECT visibility when a projectId is given', () => {
    const draft = templateToDraft(openAiTemplate);
    draft.name = 'Test service';
    const req = buildCreateServiceRequest('org-123', draft, 'proj-9');
    expect(req.projectId).toBe('proj-9');
    expect(req.visibility).toEqual(['PROJECT']);
  });
});

describe('buildConnectionConfigPayload', () => {
  it('keys configs by endpoint name and drops blank values / unnamed endpoints', () => {
    const payload = buildConnectionConfigPayload([
      { name: 'prod', environmentIds: ['env-1', 'env-2'], values: { OPENAI_API_KEY: 'sk-x', ServiceURL: 'https://api.openai.com/v1', EMPTY: '  ' } },
      { name: '', environmentIds: ['env-3'], values: { OPENAI_API_KEY: 'y' } },
    ]);
    expect(Object.keys(payload.configs)).toEqual(['prod']);
    const grp = payload.configs.prod;
    expect(grp.environmentTemplateIds).toEqual(['env-1', 'env-2']);
    expect(grp.values).toEqual([
      { key: 'OPENAI_API_KEY', value: 'sk-x' },
      { key: 'ServiceURL', value: 'https://api.openai.com/v1' },
    ]);
  });
});

describe('normalizeIdlContent', () => {
  it('percent-decodes only when encoded', () => {
    expect(normalizeIdlContent('openapi: 3.0.0')).toBe('openapi: 3.0.0');
    expect(normalizeIdlContent('a%20b')).toBe('a b');
  });
});

describe('connectionConfigToEndpoints / endpointsToConfigRequest', () => {
  const entries: ConnectionSchemaEntry[] = [
    { name: 'OPENAI_API_KEY', type: 'string', isOptional: false, isSensitive: true },
    { name: 'ServiceURL', type: 'string', isOptional: false, isSensitive: false },
  ];
  const config: ConnectionConfigResponse = {
    message: '',
    configs: {
      prod: {
        name: 'prod',
        environmentTemplateIds: ['env-1'],
        values: [
          { key: 'OPENAI_API_KEY', value: 'sk' },
          { key: 'ServiceURL', value: 'https://api.openai.com/v1' },
        ],
      },
    },
  };

  it('splits the endpoint URL out and marks sensitive params', () => {
    const [ep] = connectionConfigToEndpoints(config, entries);
    expect(ep.name).toBe('prod');
    expect(ep.serviceUrl).toBe('https://api.openai.com/v1');
    expect(ep.params).toEqual([{ key: 'OPENAI_API_KEY', value: 'sk', isSensitive: true }]);
    expect(ep.environmentIds).toEqual(['env-1']);
  });

  it('round-trips back into a config request (URL first), dropping unnamed endpoints', () => {
    const endpoints = connectionConfigToEndpoints(config, entries);
    const req = endpointsToConfigRequest([...endpoints, { name: '  ', serviceUrl: 'x', params: [], environmentIds: [] }]);
    expect(Object.keys(req.configs)).toEqual(['prod']);
    expect(req.configs.prod.values).toEqual([
      { key: 'ServiceURL', value: 'https://api.openai.com/v1' },
      { key: 'OPENAI_API_KEY', value: 'sk' },
    ]);
  });
});

describe('inferProviderLogo', () => {
  it('maps connection-param names to a provider logo (Azure before OpenAI)', () => {
    expect(inferProviderLogo(['OPENAI_API_KEY', 'ServiceURL'])).toBe('openai.svg');
    expect(inferProviderLogo(['AZURE_OPENAI_API_KEY'])).toBe('azure-openai.svg');
    expect(inferProviderLogo(['ANTHROPIC_API_KEY'])).toBe('anthropic.svg');
    expect(inferProviderLogo(['MISTRAL_API_KEY'])).toBe('mistral.svg');
    expect(inferProviderLogo(['SOME_CUSTOM_TOKEN'])).toBeUndefined();
  });
});

describe('formatServiceCreatedTime', () => {
  it('formats a unix-seconds string and guards invalid input', () => {
    expect(formatServiceCreatedTime('0')).toBe('—');
    expect(formatServiceCreatedTime('')).toBe('—');
    expect(formatServiceCreatedTime('abc')).toBe('—');
    expect(formatServiceCreatedTime('1783069813')).not.toBe('—');
  });
});
