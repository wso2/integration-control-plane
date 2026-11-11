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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, post } };
});

import { retrieveFromKnowledgeBase, toKnowledgeBase, toKnowledgeBaseDataSource } from './knowledgeBases';

describe('toKnowledgeBase', () => {
  it('fills the fields the BFF omits when empty', () => {
    expect(toKnowledgeBase({ name: 'docs-kb', projectName: 'ai-services', environment: 'production' })).toEqual({
      name: 'docs-kb',
      displayName: 'docs-kb',
      description: '',
      projectName: 'ai-services',
      environment: 'production',
      config: {},
      secretKeys: [],
      status: '',
      error: '',
      serviceUrl: '',
      dataSources: [],
      createdAt: '',
      updatedAt: '',
    });
  });

  it("keeps a data source's first run that did not start", () => {
    const kb = toKnowledgeBase({ name: 'docs-kb', projectName: 'ai-services', environment: 'development', dataSources: [{ name: 'docs-s3', firstRunError: 'not started' }] });
    expect(kb.dataSources[0].firstRunError).toBe('not started');
  });

  it('keeps how publishing the service on the gateway is going', () => {
    const apiStatus = { status: 'FAILED', error: 'GATEWAY_UNAVAILABLE', nextRetryAt: '2026-11-08T10:00:00Z' };
    expect(toKnowledgeBase({ name: 'docs-kb', projectName: 'ai-services', environment: 'development', apiStatus }).apiStatus).toEqual(apiStatus);
  });

  it('maps data sources, keeping a stopped schedule as none', () => {
    const kb = toKnowledgeBase({
      name: 'docs-kb',
      projectName: 'ai-services',
      environment: 'production',
      secretKeys: ['PINECONE_APIKEY'],
      dataSources: [{ name: 'docs-s3', displayName: 'Docs S3', config: { DATASOURCE: 'amazons3' }, secretKeys: ['AWS_ACCESS_KEY_ID'], status: 'ACTIVE' }],
    });
    expect(kb.secretKeys).toEqual(['PINECONE_APIKEY']);
    expect(kb.dataSources).toEqual([
      { name: 'docs-s3', displayName: 'Docs S3', config: { DATASOURCE: 'amazons3' }, secretKeys: ['AWS_ACCESS_KEY_ID'], cronExpression: '', cronTimezone: '', status: 'ACTIVE', error: '', firstRunError: '', releaseName: '', createdAt: '' },
    ]);
  });
});

describe('toKnowledgeBaseDataSource', () => {
  it('keeps why a create failed', () => {
    expect(toKnowledgeBaseDataSource({ name: 'docs-drive', status: 'FAILED', error: 'link refused' })).toMatchObject({ status: 'FAILED', error: 'link refused' });
    expect(toKnowledgeBaseDataSource({ name: 'docs-drive' })).toMatchObject({ status: '', error: '' });
  });
});

describe('retrieveFromKnowledgeBase', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const key = { header: 'X-API-Key', apiKey: 'test-key' };

  it('sends the query form-encoded to the gateway with the test key, never through the BFF', async () => {
    fetchMock.mockResolvedValue(answer(200, { retrieved_chunks: [{ chunk: 'a' }] }));
    await expect(retrieveFromKnowledgeBase('https://gw.example.com/docs-kb/', key, 'orders', { userQuery: 'leave & pay', maxChunks: 5, minSimilarity: 0.4 })).resolves.toEqual([{ chunk: 'a' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gw.example.com/docs-kb/retrieve');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded', 'X-API-Key': 'test-key' });
    expect((init.body as URLSearchParams).toString()).toBe('rag_component_id=orders&user_query=leave+%26+pay&max_retrieve_chunks=5&min_similarity_threshold=0.4');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(post).not.toHaveBeenCalled();
  });

  it('sends no key header for an API that takes none', async () => {
    fetchMock.mockResolvedValue(answer(200, {}));
    await expect(retrieveFromKnowledgeBase('https://gw.example.com/docs-kb', { header: 'X-API-Key', apiKey: null }, 'orders', { userQuery: 'q', maxChunks: 5, minSimilarity: 0 })).resolves.toEqual([]);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
  });

  it('rejects a refusal with its status', async () => {
    fetchMock.mockResolvedValue(answer(401, { message: 'invalid key' }));
    await expect(retrieveFromKnowledgeBase('https://gw.example.com/docs-kb', key, 'orders', { userQuery: 'q', maxChunks: 5, minSimilarity: 0 })).rejects.toMatchObject({ status: 401 });
  });
});
