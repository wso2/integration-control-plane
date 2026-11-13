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
import { defaultStorage } from '../constants/contextEngine';
import { contextEngineUrl, contextEnginesUrl, contextEvidenceUrl, newContextEngineUrl } from '../paths';
import { connectorFor, engineHandleFrom, integrationTypeFor, isGatewayKeyRefusal, modelsStepBlocker, storageStepBlocker, toIntegrationRequest } from './contextEngine';
import type { LlmConfig } from '../types/contextEngine';
import type { EmbeddingConfig } from '../types/ragIngestion';

describe('engine identity', () => {
  it('derives the BFF name from a display name', () => {
    expect(engineHandleFrom('Support Knowledge!')).toBe('support-knowledge');
    expect(engineHandleFrom('  Café  docs ')).toBe('cafe-docs');
    expect(engineHandleFrom('日本')).toBe('engine');
    const long = engineHandleFrom(`${'a'.repeat(62)} b`);
    expect(long).toHaveLength(62);
    expect(long).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
  });

  it('puts the name in the path', () => {
    expect(contextEngineUrl('acme', 'docs')).toBe('/organizations/acme/context-engines/docs/overview');
    expect(contextEngineUrl('acme', 'docs', 'playground', { q: 'a b&c' })).toBe('/organizations/acme/context-engines/docs/playground?q=a+b%26c');
    expect(contextEvidenceUrl('acme', 'docs', 'evi_1')).toBe('/organizations/acme/context-engines/docs/evidence/evi_1');
    expect(contextEnginesUrl('acme')).toBe('/organizations/acme/context-engines');
    expect(newContextEngineUrl('acme')).toBe('/organizations/acme/context-engines/new');
  });
});

describe('gateway key refusals', () => {
  it("tells the gateway's 401 from the engine's", () => {
    expect(isGatewayKeyRefusal(401, '')).toBe(true);
    expect(isGatewayKeyRefusal(401, 'Unauthorized')).toBe(true);
    expect(isGatewayKeyRefusal(401, JSON.stringify({ error: 'invalid api key' }))).toBe(true);
    expect(isGatewayKeyRefusal(401, JSON.stringify({ code: 'unauthenticated', message: 'm', traceId: 't' }))).toBe(false);
    expect(isGatewayKeyRefusal(403, '')).toBe(false);
  });
});

describe('integrations', () => {
  it('runs every connector but uploads as an integration', () => {
    expect(integrationTypeFor('upload')).toBeNull();
    expect(integrationTypeFor('mysql')).toBe('mysql');
    expect(integrationTypeFor('gdrive')).toBe('google_drive');
    expect(connectorFor('google_drive')?.id).toBe('gdrive');
  });

  it('sends the settings, secrets included, and labels records with each rule group', () => {
    const request = toIntegrationRequest({ type: 'mysql', name: 'Team DB', values: { tables: '' }, audience: [] }, 'mysql');
    expect(request).toEqual({ name: 'team-db', type: 'mysql', settings: {} });
    const mapped = toIntegrationRequest({ type: 'mysql', name: 'DB', values: { tables: '[{"tableName":"eng","primaryKey":"id"}]' }, audience: [{ group: 'eng', role: 'engineers' }] }, 'mysql');
    expect(mapped.source).toEqual({ audience: ['eng'], audienceMapping: { eng: 'engineers' } });
  });
});

describe('what the cloud cannot take yet', () => {
  const embedding: EmbeddingConfig = { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'k', azureBaseUrl: '', azureApiVersion: '' };
  const llm: LlmConfig = { provider: 'openai', model: 'gpt-4.1', apiKey: 'k', azureBaseUrl: '', azureApiVersion: '' };

  it('blocks Azure OpenAI models', () => {
    const azure = { ...llm, provider: 'azure_openai' as const, azureBaseUrl: 'https://x.openai.azure.com', azureApiVersion: '2024-06-01' };
    expect(modelsStepBlocker({ embedding, llm, shareApiKey: false, answersEnabled: true, answerLlm: null })).toBeNull();
    expect(modelsStepBlocker({ embedding, llm: azure, shareApiKey: false, answersEnabled: true, answerLlm: null })).toMatch(/not available yet/);
    expect(modelsStepBlocker({ embedding, llm, shareApiKey: false, answersEnabled: true, answerLlm: azure })).toMatch(/not available yet/);
    expect(modelsStepBlocker({ embedding, llm, shareApiKey: false, answersEnabled: false, answerLlm: azure })).toBeNull();
  });

  it('allows only engine managed storage', () => {
    expect(storageStepBlocker(defaultStorage())).toBeNull();
    expect(storageStepBlocker({ ...defaultStorage(), graph: { mode: 'external', uri: 'bolt://g:7687', database: 'neo4j', user: 'u', password: 'p' } })).toMatch(/engine managed/);
  });
});
