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
 * The BFF side of Context Engines: engines map from the BFF's shape and are keyed by name, and a new engine's setup sends upload sources to the engine and connector sources to
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
import { createContextEngine, deleteContextEngine, getContextEngine, listContextEngines, setContextEngineAccess, setUpContextEngine, toEngineManagedServer } from './contextEngine';
import type { ContextSourceConfig, CreateContextEngineInput } from '../types/contextEngine';

const ENGINE = 'docs';
const bffEngine = { name: 'docs', displayName: 'Docs', description: 'Product docs', status: 'running', createdAt: '2026-10-29T00:00:00Z', consoleApiUrl: 'https://gw/c', publicApiUrl: 'https://gw/p/' };

beforeEach(() => {
  Object.values(bff).forEach((f) => f.mockReset());
  engineRequest.mockReset();
});

describe('engine managed storage', () => {
  it.each([
    [{ server: 'postgres' }, 'postgres'],
    [{ server: 'embedded' }, 'embedded'],
    // A server this console does not know yet is described as the stores it knows without one.
    [{ server: 'aurora' }, 'embedded'],
    [{}, 'embedded'],
    [null, 'embedded'],
  ] as const)('reads %j as %s', (raw, want) => {
    expect(toEngineManagedServer(raw)).toBe(want);
  });
});

describe('engines', () => {
  it('lists the engines and keys each by name', async () => {
    bff.get.mockResolvedValueOnce({ items: [bffEngine, { name: 'hr', status: 'unknown', statusReason: 'could not read' }] });

    const engines = await listContextEngines();

    expect(bff.get).toHaveBeenCalledWith('/context-engines');
    expect(engines[0]).toMatchObject({ id: ENGINE, handle: 'docs', name: 'Docs', state: 'ready', publicApiUrl: 'https://gw/p' });
    expect(engines[1]).toMatchObject({ id: 'hr', name: 'hr', state: 'unknown', statusReason: 'could not read', description: '' });
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it("takes API and MCP access from the BFF, not from the engine's own configuration", async () => {
    bff.get.mockResolvedValueOnce({ ...bffEngine, apiEnabled: false, mcpEnabled: true });
    engineRequest.mockImplementation((_id: string, _method: string, path: string) => Promise.resolve(path === '/v1/engine' ? { interfaces: { publicApi: true, mcp: false, answers: true } } : []));

    const engine = await getContextEngine(ENGINE);

    expect(engine.access).toEqual({ api: false, mcp: true });
    expect(engine.exposure).toEqual({ api: false, mcp: true, answers: true });
  });

  it('sets access through the BFF', async () => {
    bff.put.mockResolvedValueOnce({ api: true, mcp: false });

    await expect(setContextEngineAccess(ENGINE, { mcp: false })).resolves.toEqual({ api: true, mcp: false });
    expect(bff.put).toHaveBeenCalledWith('/context-engines/docs/environments/development/access', { mcp: false });
  });

  it('reads an engine that is still starting from the BFF alone', async () => {
    bff.get.mockResolvedValueOnce({ ...bffEngine, status: 'starting' });

    const engine = await getContextEngine(ENGINE);

    expect(bff.get).toHaveBeenCalledWith('/context-engines/docs');
    expect(engine).toMatchObject({ state: 'starting', sources: [], queryRoles: [] });
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it('creates through the BFF with the description and the models it accepts', async () => {
    bff.post.mockResolvedValueOnce({ ...bffEngine, status: 'provisioning' });
    const input: CreateContextEngineInput = {
      name: 'Docs',
      description: 'Product docs',
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
  const db: ContextSourceConfig = { type: 'mysql', name: 'Team DB', values: { tableName: 'articles' }, audience: [{ group: 'eng', role: 'eng' }] };

  it('grants the creator, registers each source where it runs, and grants the roles', async () => {
    engineRequest.mockImplementation(async (_id: string, method: string, path: string) => {
      if (path === '/v1/auth/me') return { id: 'user-1', kind: 'user', groups: [] };
      if (method === 'POST' && path === '/v1/sources') return { id: 'src-upload', name: 'Handbook', type: 'upload', state: 'ready' };
      return {};
    });
    bff.post.mockResolvedValueOnce({ name: 'team-db', type: 'mysql', shape: 'service', sourceId: 'src-db', status: 'provisioning' });

    const result = await setUpContextEngine(ENGINE, { sources: [upload, db], roles: ['eng'] });

    expect(result).toEqual({ sources: { Handbook: 'src-upload', 'Team DB': 'src-db' }, warnings: [] });
    expect(engineRequest).toHaveBeenCalledWith(ENGINE, 'PUT', '/v1/resources/engine/grants/owner-user-1', expect.objectContaining({ principalId: 'user-1' }));
    expect(bff.post).toHaveBeenCalledWith('/context-engines/docs/integrations', {
      name: 'team-db',
      type: 'mysql',
      settings: { tableName: 'articles' },
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

    const result = await setUpContextEngine(ENGINE, { sources: [db, upload], roles: [] });

    expect(result.sources).toEqual({ Handbook: 'src-upload' });
    expect(result.warnings).toEqual(['Register source “Team DB”: unknown integration type']);
  });
});
