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
 * The engine call path: every call carries the console key and the platform token, the key is
 * fetched again before it expires, and a key the gateway refuses is replaced once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post, authenticatedFetch, getAccessToken } = vi.hoisted(() => ({ post: vi.fn(), authenticatedFetch: vi.fn(), getAccessToken: vi.fn() }));

vi.mock('./_client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_client')>()),
  bff: { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../auth', () => ({ authenticatedFetch, getAccessToken }));

import { BffError } from './_client';
import { engineRequest, engineUpload, forgetConsoleAccess } from './_contextEngineAccess';
import { HttpError } from '../types/http';

const ENGINE = 'development/docs';
const URL_BASE = 'https://gw.example.com/docs-console';
const HOUR = 60 * 60 * 1000;

const access = (apiKey: string, expiresInMs = HOUR) => ({ consoleApiUrl: `${URL_BASE}/`, apiKey, expiresAt: new Date(Date.now() + expiresInMs).toISOString() });
const response = (status: number, body: unknown = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const engineRefusal = { code: 'unauthenticated', message: 'Sign in again', traceId: 't-1' };
const keyOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

beforeEach(() => {
  forgetConsoleAccess(ENGINE);
  post.mockReset();
  authenticatedFetch.mockReset();
  getAccessToken.mockReset().mockResolvedValue('platform-token');
});

afterEach(() => vi.useRealTimers());

describe('engineRequest', () => {
  it('asks the BFF for console access and calls the gateway with the key', async () => {
    post.mockResolvedValueOnce(access('k1'));
    authenticatedFetch.mockResolvedValueOnce(response(200, [{ id: 's1' }]));

    await expect(engineRequest(ENGINE, 'GET', '/v1/sources')).resolves.toEqual([{ id: 's1' }]);

    expect(post).toHaveBeenCalledWith('/context-engines/docs/environments/development/console-access', {});
    const [url, init] = authenticatedFetch.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/v1/sources`);
    expect(keyOf(authenticatedFetch.mock.calls[0])['X-API-Key']).toBe('k1');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('shares one key across calls until it nears expiry', async () => {
    vi.useFakeTimers();
    post.mockResolvedValueOnce(access('k1', 10 * 60 * 1000)).mockResolvedValueOnce(access('k2'));
    authenticatedFetch.mockImplementation(async () => response(200));

    await engineRequest(ENGINE, 'GET', '/v1/engine');
    await engineRequest(ENGINE, 'GET', '/v1/engine');
    expect(post).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(9 * 60 * 1000);
    await engineRequest(ENGINE, 'GET', '/v1/engine');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({});
    expect(keyOf(authenticatedFetch.mock.calls[2])['X-API-Key']).toBe('k2');
  });

  it('replaces a key the gateway refuses and retries once', async () => {
    post.mockResolvedValueOnce(access('stale')).mockResolvedValueOnce(access('fresh'));
    authenticatedFetch.mockResolvedValueOnce(response(401, 'Unauthorized')).mockResolvedValueOnce(response(200, { ok: true }));

    await expect(engineRequest(ENGINE, 'POST', '/v1/queries', { question: 'q' })).resolves.toEqual({ ok: true });

    expect(post.mock.calls[1][1]).toEqual({ staleApiKey: 'stale' });
    expect(keyOf(authenticatedFetch.mock.calls[1])['X-API-Key']).toBe('fresh');
  });

  it("does not retry the engine's own 401", async () => {
    post.mockResolvedValueOnce(access('k1'));
    authenticatedFetch.mockResolvedValueOnce(response(401, engineRefusal));

    await expect(engineRequest(ENGINE, 'GET', '/v1/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry', async () => {
    post.mockResolvedValueOnce(access('k1')).mockResolvedValueOnce(access('k2'));
    authenticatedFetch.mockResolvedValue(response(401, ''));

    await expect(engineRequest(ENGINE, 'GET', '/v1/sources')).rejects.toBeInstanceOf(HttpError);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  });

  it('renews a refused key once for calls that fail together', async () => {
    post.mockResolvedValueOnce(access('stale')).mockResolvedValueOnce(access('fresh'));
    authenticatedFetch.mockImplementation(async (_url: string, init: RequestInit) => ((init.headers as Record<string, string>)['X-API-Key'] === 'stale' ? response(401, '') : response(200)));

    await Promise.all([engineRequest(ENGINE, 'GET', '/v1/a'), engineRequest(ENGINE, 'GET', '/v1/b')]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('surfaces a BFF refusal as an HttpError with its status', async () => {
    post.mockRejectedValueOnce(new BffError(409, JSON.stringify({ message: 'the context engine is not running yet' })));

    await expect(engineRequest(ENGINE, 'GET', '/v1/sources')).rejects.toMatchObject({ status: 409, message: 'the context engine is not running yet' });
  });
});

describe('engineUpload', () => {
  const sent: { url: string; headers: Record<string, string> }[] = [];
  let statuses: [number, string][] = [];

  class FakeXhr {
    status = 0;
    responseText = '';
    upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private url = '';
    private headers: Record<string, string> = {};
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send() {
      sent.push({ url: this.url, headers: this.headers });
      const [status, text] = statuses.shift() ?? [200, '{}'];
      this.status = status;
      this.responseText = text;
      queueMicrotask(() => this.onload?.());
    }
    abort() {}
  }

  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the console key and the platform token', async () => {
    post.mockResolvedValueOnce(access('k1'));
    statuses = [[202, JSON.stringify({ jobId: 'j1', statusUrl: '/v1/jobs/j1' })]];

    await expect(engineUpload(ENGINE, '/v1/sources/s1/ingestions', new FormData(), { 'Idempotency-Key': 'i' })).resolves.toEqual({ jobId: 'j1', statusUrl: '/v1/jobs/j1' });
    expect(sent[0]).toEqual({ url: `${URL_BASE}/v1/sources/s1/ingestions`, headers: { 'Idempotency-Key': 'i', 'X-API-Key': 'k1', Authorization: 'Bearer platform-token' } });
  });

  it('retries once with a new key when the gateway refuses', async () => {
    post.mockResolvedValueOnce(access('stale')).mockResolvedValueOnce(access('fresh'));
    statuses = [
      [401, 'Unauthorized'],
      [202, JSON.stringify({ jobId: 'j1', statusUrl: '/v1/jobs/j1' })],
    ];

    await engineUpload(ENGINE, '/v1/sources/s1/ingestions', new FormData(), {});
    expect(sent.map((s) => s.headers['X-API-Key'])).toEqual(['stale', 'fresh']);
    expect(post.mock.calls[1][1]).toEqual({ staleApiKey: 'stale' });
  });

  it("passes the engine's refusal on with its status", async () => {
    post.mockResolvedValueOnce(access('k1'));
    statuses = [[413, JSON.stringify({ code: 'payload_too_large', message: 'Request body is too large', traceId: 't' })]];

    await expect(engineUpload(ENGINE, '/v1/sources/s1/ingestions', new FormData(), {})).rejects.toMatchObject({ status: 413 });
    expect(sent).toHaveLength(1);
  });
});
