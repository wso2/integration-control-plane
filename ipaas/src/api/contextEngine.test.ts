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
 * The BFF side of Context Engines: engines map from the BFF's shape and are keyed by name, and a new engine's connector sources go to
 * the BFF with its create, which adds them as integrations once the engine runs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bff, engineRequest } = vi.hoisted(() => ({
  bff: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  engineRequest: vi.fn(),
}));

vi.mock('./_client', async (importOriginal) => ({ ...(await importOriginal<typeof import('./_client')>()), bff }));
vi.mock('./_contextEngineAccess', async (importOriginal) => ({ ...(await importOriginal<typeof import('./_contextEngineAccess')>()), engineRequest }));

import { BffError } from './_client';
import { checkContextEngineDatabase, createContextEngine, deleteContextEngine, getContextEngine, listContextEngines, queryContextEngine, setContextEngineAccess, toEngineManagedServer, updateContextModels } from './contextEngine';
import type { ContextSourceConfig, CreateContextEngineInput, ExternalDatabase } from '../types/contextEngine';

const ENGINE = 'docs';
const ownDb: ExternalDatabase = { host: 'db.example.com', port: 5432, database: 'context', username: 'engine', password: 'p', sslMode: 'require' };
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
    // An engine whose BFF names no database keeps its stores in its own pod, not on a managed server.
    expect(engines.map((e) => e.database)).toEqual(['engine', 'engine']);
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['managed', 'managed'],
    ['external', 'external'],
    ['', 'engine'],
    [undefined, 'engine'],
  ] as const)('reads the database %j as %s', async (database, want) => {
    bff.get.mockResolvedValueOnce({ items: [{ ...bffEngine, database }] });
    const [engine] = await listContextEngines();
    expect(engine.database).toBe(want);
  });

  it("takes API and MCP access from the BFF, not from the engine's own configuration", async () => {
    bff.get.mockResolvedValueOnce({ ...bffEngine, apiEnabled: false, mcpEnabled: true });
    engineRequest.mockImplementation((_id: string, _method: string, path: string) => Promise.resolve(path === '/v1/engine' ? { interfaces: { publicApi: true, mcp: false, answers: true } } : []));

    const engine = await getContextEngine(ENGINE);

    expect(engine.access).toEqual({ api: false, mcp: true });
    expect(engine.exposure).toEqual({ api: false, mcp: true, answers: true });
  });

  it('reads an engine that is restarting from the BFF alone', async () => {
    const restartedAt = new Date().toISOString();
    bff.get.mockResolvedValueOnce({ ...bffEngine, startedAt: '2026-11-06T09:00:00Z', restartedAt });

    const engine = await getContextEngine(ENGINE);

    expect(engine).toMatchObject({ state: 'ready', startedAt: '2026-11-06T09:00:00Z', restartedAt, sources: [] });
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it('saves the models through the BFF and returns when the restart began', async () => {
    bff.put.mockResolvedValueOnce({ restartedAt: '2026-11-11T09:00:00Z' });
    const input = { embeddingKey: 'sk-new' };

    await expect(updateContextModels({ engineId: ENGINE, ...input })).resolves.toEqual({ restartedAt: '2026-11-11T09:00:00Z' });
    expect(bff.put).toHaveBeenCalledWith('/context-engines/docs/models', input);
  });

  it('sets access through the BFF', async () => {
    bff.put.mockResolvedValueOnce({ api: true, mcp: false });

    await expect(setContextEngineAccess(ENGINE, { mcp: false })).resolves.toEqual({ api: true, mcp: false });
    expect(bff.put).toHaveBeenCalledWith('/context-engines/docs/access', { mcp: false });
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

  it("reads where an engine keeps its data, and names the user's own server on its PostgreSQL stores", async () => {
    bff.get.mockResolvedValueOnce({ ...bffEngine, database: 'external' });
    engineRequest.mockImplementation((_id: string, _method: string, path: string) => Promise.resolve(path === '/v1/engine' ? { storage: { vector: { provider: 'pgvector' }, relational: { provider: 'postgres' }, graph: { provider: 'kuzu' } } } : []));

    const engine = await getContextEngine(ENGINE);

    expect(engine.database).toBe('external');
    expect(engine.storage).toMatchObject({ vector: { label: 'PostgreSQL + pgvector', detail: 'Your own PostgreSQL' }, relational: { detail: 'Your own PostgreSQL' }, graph: { detail: 'Engine managed · built in' } });
  });

  it('sends the own database with the create request', async () => {
    bff.post.mockResolvedValueOnce({ ...bffEngine, status: 'provisioning', database: 'external' });
    const model = { provider: 'openai', model: 'm', apiKey: 'k', azureBaseUrl: '', azureApiVersion: '' } as const;
    const input: CreateContextEngineInput = {
      name: 'Docs',
      description: '',
      sources: [],
      roles: [],
      embedding: model,
      llm: model,
      answers: { enabled: false, model: null },
      storage: { vector: { mode: 'managed' }, relational: { mode: 'managed' }, graph: { mode: 'managed' } },
      database: ownDb,
    };

    await expect(createContextEngine(input)).resolves.toMatchObject({ database: 'external' });
    expect(bff.post).toHaveBeenCalledWith('/context-engines', expect.objectContaining({ database: ownDb }));
  });

  it("surfaces the BFF's reason when it cannot use the own database", async () => {
    bff.post.mockRejectedValueOnce(new BffError(400, JSON.stringify({ error: 'database_unusable', message: 'The database has no pgvector extension.' })));
    await expect(checkContextEngineDatabase(ownDb)).rejects.toMatchObject({ status: 400, message: 'The database has no pgvector extension.' });
  });

  it('checks the own database with the bare details and returns the versions', async () => {
    bff.post.mockResolvedValueOnce({ ok: true, serverVersion: '17.2', pgvectorVersion: '0.8.0' });

    await expect(checkContextEngineDatabase(ownDb)).resolves.toEqual({ serverVersion: '17.2', pgvectorVersion: '0.8.0' });
    expect(bff.post).toHaveBeenCalledWith('/context-engine-database-checks', ownDb);
  });

  it('turns a BFF refusal into an HttpError with its status', async () => {
    bff.delete.mockRejectedValueOnce(new BffError(403, JSON.stringify({ message: 'not permitted' })));
    await expect(deleteContextEngine(ENGINE)).rejects.toMatchObject({ status: 403, message: 'not permitted' });
  });
});

describe('querying', () => {
  const stored = { queryId: 'qry_1', state: 'completed', evidence: [], traceId: 'trc_1' };

  it("reads a fact's sentence from its description", async () => {
    engineRequest.mockResolvedValue({ ...stored, facts: [{ subject: 'Finance', relation: 'approves', object: 'Refunds', evidenceIds: ['evi_1'], description: 'Finance approves every refund over $500.' }] });
    const result = await queryContextEngine({ engineId: ENGINE, question: 'Who approves refunds?', mode: 'answer' });
    expect(result.facts[0]).toEqual({ subject: 'Finance', relation: 'approves', object: 'Refunds', evidenceIds: ['evi_1'], text: 'Finance approves every refund over $500.' });
  });

});
describe('setting up a new engine', () => {
  const upload: ContextSourceConfig = { type: 'upload', name: 'Handbook', values: {}, audience: [] };
  const db: ContextSourceConfig = { type: 'mysql', name: 'Team DB', values: { tables: '[{"tableName":"articles","primaryKey":"id","columns":"","updatedAtColumn":""}]' }, audience: [{ group: 'eng', role: 'eng' }] };
  const input: CreateContextEngineInput = {
    name: 'Docs',
    description: '',
    sources: [upload, db],
    roles: [],
    embedding: { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'e', azureBaseUrl: '', azureApiVersion: '' },
    llm: { provider: 'openai', model: 'gpt-4.1', apiKey: 'l', azureBaseUrl: '', azureApiVersion: '' },
    answers: { enabled: true, model: null },
    storage: { vector: { mode: 'managed' }, relational: { mode: 'managed' }, graph: { mode: 'managed' } },
  };

  it('sends the connector sources with the create, and leaves the engine’s own sources out', async () => {
    bff.post.mockResolvedValueOnce({ ...bffEngine, status: 'provisioning', setup: { status: 'pending' } });

    await expect(createContextEngine(input)).resolves.toMatchObject({ setup: { status: 'pending', warnings: [] } });
    expect(bff.post).toHaveBeenCalledWith(
      '/context-engines',
      expect.objectContaining({
        setup: { sources: [{ name: 'team-db', type: 'mysql', settings: { tables: [{ name: 'articles', primaryKey: 'id' }] }, source: { audience: ['eng'], audienceMapping: { eng: 'eng' } } }] },
      }),
    );
    expect(engineRequest).not.toHaveBeenCalled();
  });

  it('reads the setup the BFF reports', async () => {
    bff.get.mockResolvedValueOnce({ ...bffEngine, status: 'starting', setup: { status: 'failed', warnings: ['Source "team-db" wasn\'t added.'] } });

    await expect(getContextEngine(ENGINE)).resolves.toMatchObject({ setup: { status: 'failed', warnings: ['Source "team-db" wasn\'t added.'] } });
  });
});
