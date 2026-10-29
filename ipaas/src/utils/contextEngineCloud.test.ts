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
import { connectorFor, contextEngineKey, engineHandleFrom, integrationTypeFor, isGatewayKeyRefusal, modelsStepBlocker, parseContextEngineKey, selectEnvironment, storageStepBlocker, toIntegrationRequest } from './contextEngine';
import type { LlmConfig } from '../types/contextEngine';
import type { EmbeddingConfig } from '../types/ragIngestion';

describe('engine identity', () => {
  it('keys an engine by environment and name, and reads the key back', () => {
    expect(contextEngineKey('development', 'docs')).toBe('development/docs');
    expect(parseContextEngineKey('development/docs')).toEqual({ environment: 'development', handle: 'docs' });
    expect(() => parseContextEngineKey('docs')).toThrow();
    expect(() => parseContextEngineKey('development/')).toThrow();
  });

  it('derives the BFF name from a display name', () => {
    expect(engineHandleFrom('Support Knowledge!')).toBe('support-knowledge');
    expect(engineHandleFrom('  Café  docs ')).toBe('cafe-docs');
    expect(engineHandleFrom('日本')).toBe('engine');
    const long = engineHandleFrom(`${'a'.repeat(62)} b`);
    expect(long).toHaveLength(62);
    expect(long).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
  });

  it('puts the name in the path and the environment in ?env=', () => {
    expect(contextEngineUrl('acme', 'development/docs')).toBe('/organizations/acme/context-engines/docs/overview?env=development');
    expect(contextEngineUrl('acme', 'development/docs', 'playground', { q: 'a b&c' })).toBe('/organizations/acme/context-engines/docs/playground?env=development&q=a+b%26c');
    expect(contextEvidenceUrl('acme', 'prod/docs', 'evi_1')).toBe('/organizations/acme/context-engines/docs/evidence/evi_1?env=prod');
    expect(contextEnginesUrl('acme')).toBe('/organizations/acme/context-engines');
    expect(contextEnginesUrl('acme', 'prod')).toBe('/organizations/acme/context-engines?env=prod');
    expect(newContextEngineUrl('acme', 'prod')).toBe('/organizations/acme/context-engines/new?env=prod');
  });
});

describe('environment selection', () => {
  const envs = ['development', 'production'];

  it('shows the picked environment, else the linked one, else the first', () => {
    expect(selectEnvironment(envs, null, null)).toBe('development');
    expect(selectEnvironment(envs, null, 'production')).toBe('production');
    expect(selectEnvironment(envs, 'development', 'production')).toBe('development');
    expect(selectEnvironment(envs, null, 'staging')).toBe('development');
    expect(selectEnvironment([], null, 'production')).toBe('');
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
    expect(integrationTypeFor('docs_sync')).toBe('docs_sync');
    expect(integrationTypeFor('gdrive')).toBe('google_drive');
    expect(connectorFor('google_drive')?.id).toBe('gdrive');
  });

  it('sends the settings, secrets included, and labels records with each rule group', () => {
    const request = toIntegrationRequest({ type: 'docs_sync', name: 'Team Docs', values: { folder: '' }, audience: [] }, 'docs_sync');
    expect(request).toEqual({ name: 'team-docs', type: 'docs_sync', settings: {} });
    const mapped = toIntegrationRequest({ type: 'docs_sync', name: 'Docs', values: { folder: 'eng' }, audience: [{ group: 'eng', role: 'engineers' }] }, 'docs_sync');
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
