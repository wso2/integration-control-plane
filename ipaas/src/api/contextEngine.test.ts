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

/**
 * The BFF side of Context Engines: engines map from the BFF's shape and are keyed by environment
 * and name, and a new engine's setup sends upload sources to the engine and connector sources to
 * the BFF as integrations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bff, engineRequest } = vi.hoisted(() => ({
  bff: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  engineRequest: vi.fn(),
}));

vi.mock('./_client', async (importOriginal) => ({ ...(await importOriginal<typeof import('./_client')>()), bff }));
vi.mock('./_contextEngineAccess', async (importOriginal) => ({ ...(await importOriginal<typeof import('./_contextEngineAccess')>()), engineRequest }));

import { BffError } from './_client';
import { createContextEngine, deleteContextEngine, getContextEngine, listContextEngines, setUpContextEngine } from './contextEngine';
import type { ContextSourceConfig, CreateContextEngineInput } from '../types/contextEngine';

const ENGINE = 'development/docs';
const bffEngine = { name: 'docs', displayName: 'Docs', description: 'Product docs', environment: 'development', status: 'running', createdAt: '2026-10-29T00:00:00Z', consoleApiUrl: 'https://gw/c', publicApiUrl: 'https://gw/p/' };

beforeEach(() => {
  Object.values(bff).forEach((f) => f.mockReset());
  engineRequest.mockReset();
});

describe('engines', () => {
  it('lists one environment and keys each engine by environment and name', async () => {
    bff.get.mockResolvedValueOnce({ items: [bffEngine, { name: 'hr', environment: 'development', status: 'unknown', statusReason: 'could not read' }] });

    const engines = await listContextEngines('development');

    expect(bff.get).toHaveBeenCalledWith('/context-engines?environment=development');
    expect(engines[0]).toMatchObject({ id: ENGINE, handle: 'docs', name: 'Docs', state: 'ready', publicApiUrl: 'https://gw/p' });
    expect(engines[1]).toMatchObject({ id: 'development/hr', name: 'hr', state: 'unknown', statusReason: 'could not read', description: '' });
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it('reads an engine that is still starting from the BFF alone', async () => {
    bff.get.mockResolvedValueOnce({ ...bffEngine, status: 'starting' });

    const engine = await getContextEngine(ENGINE);

    expect(bff.get).toHaveBeenCalledWith('/context-engines/docs/environments/development');
    expect(engine).toMatchObject({ state: 'starting', sources: [], queryRoles: [] });
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it('creates through the BFF with the description and the models it accepts', async () => {
    bff.post.mockResolvedValueOnce({ ...bffEngine, status: 'provisioning' });
    const input: CreateContextEngineInput = {
      name: 'Docs',
      description: 'Product docs',
      environment: 'development',
      sources: [],
      roles: [],
      embedding: { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'e', azureBaseUrl: '', azureApiVersion: '' },
      llm: { provider: 'openai', model: 'gpt-4.1', apiKey: 'l', azureBaseUrl: '', azureApiVersion: '' },
      answers: { enabled: true, model: { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'a', azureBaseUrl: '', azureApiVersion: '' } },
      storage: { vector: { mode: 'managed' }, relational: { mode: 'managed' }, graph: { mode: 'managed' } },
    };

    await expect(createContextEngine(input)).resolves.toMatchObject({ id: ENGINE, state: 'provisioning' });
    expect(bff.post).toHaveBeenCalledWith('/context-engines', {
      name: 'docs',
      displayName: 'Docs',
      description: 'Product docs',
      environment: 'development',
      models: {
        llm: { provider: 'openai', model: 'gpt-4.1', apiKey: 'l' },
        embedding: { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'e' },
        answer: { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'a' },
        answersEnabled: true,
      },
    });
  });

  it('turns a BFF refusal into an HttpError with its status', async () => {
    bff.delete.mockRejectedValueOnce(new BffError(403, JSON.stringify({ message: 'not permitted' })));
    await expect(deleteContextEngine(ENGINE)).rejects.toMatchObject({ status: 403, message: 'not permitted' });
  });
});

describe('setting up a new engine', () => {
  const upload: ContextSourceConfig = { type: 'upload', name: 'Handbook', values: {}, audience: [] };
  const docs: ContextSourceConfig = { type: 'docs_sync', name: 'Team Docs', values: { folder: 'docs' }, audience: [{ group: 'eng', role: 'eng' }] };

  it('grants the creator, registers each source where it runs, and grants the roles', async () => {
    engineRequest.mockImplementation(async (_id: string, method: string, path: string) => {
      if (path === '/v1/auth/me') return { id: 'user-1', kind: 'user', groups: [] };
      if (method === 'POST' && path === '/v1/sources') return { id: 'src-upload', name: 'Handbook', type: 'upload', state: 'ready' };
      return {};
    });
    bff.post.mockResolvedValueOnce({ name: 'team-docs', type: 'docs_sync', shape: 'automation', sourceId: 'src-docs', status: 'scheduled' });

    const result = await setUpContextEngine(ENGINE, { sources: [upload, docs], roles: ['eng'] });

    expect(result).toEqual({ sources: { Handbook: 'src-upload', 'Team Docs': 'src-docs' }, warnings: [] });
    expect(engineRequest).toHaveBeenCalledWith(ENGINE, 'PUT', '/v1/resources/engine/grants/owner-user-1', expect.objectContaining({ principalId: 'user-1' }));
    expect(bff.post).toHaveBeenCalledWith('/context-engines/docs/environments/development/integrations', {
      name: 'team-docs',
      type: 'docs_sync',
      settings: { folder: 'docs' },
      source: { audience: ['eng'], audienceMapping: { eng: 'eng' } },
    });
    expect(engineRequest).toHaveBeenCalledWith(ENGINE, 'PUT', '/v1/resources/engine/grants/role-eng', { group: 'eng', actions: expect.any(Array) });
  });

  it('reports a refused step and keeps going', async () => {
    engineRequest.mockImplementation(async (_id: string, _method: string, path: string) => {
      if (path === '/v1/auth/me') return { id: 'user-1', kind: 'user', groups: [] };
      return { id: 'src-upload', name: 'Handbook', type: 'upload', state: 'ready' };
    });
    bff.post.mockRejectedValueOnce(new BffError(400, JSON.stringify({ message: 'unknown integration type' })));

    const result = await setUpContextEngine(ENGINE, { sources: [docs, upload], roles: [] });

    expect(result.sources).toEqual({ Handbook: 'src-upload' });
    expect(result.warnings).toEqual(['Register source “Team Docs”: unknown integration type']);
  });
});
