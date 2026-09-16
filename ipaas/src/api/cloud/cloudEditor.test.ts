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
 * Guards the create → poll handoff of the Cloud Editor API.
 *
 * POST /code-server is an idempotent get-or-create whose first-time path can
 * outlast the request. The handoff is what makes that survivable, and it has
 * failed in production in both directions: a BFF wait longer than the fronting
 * gateway's route timeout turned every cold create into a 504, and because the
 * POST rejected, the poll loop that would have recovered never ran — leaving a
 * perfectly healthy editor behind an error screen.
 *
 * So the contract asserted here is: a *lost response* falls through to polling,
 * while a real verdict (quota, auth) still propagates. Distinguishing the two is
 * the whole point — polling through a 402 would hide it until the poll expired.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// The API module graph evaluates the build-time __PRODUCT__ at module scope, and
// nothing substitutes it under vitest.
vi.hoisted(() => {
  (globalThis as unknown as { __PRODUCT__: string }).__PRODUCT__ = 'cloud';
});

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

// BffError stays real — the code under test branches on `instanceof`, so a stub
// would make every test pass regardless of the classification being correct.
vi.mock('./_client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_client')>()),
  bff: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { BffError } from './_client';
import { callCreateCodeServer, getCodeServer } from './cloudEditor';
import { CLOUD_EDITOR_TIMEOUT_MESSAGE } from '../../constants/cloudEditor';

const params = {
  userId: 'u-1',
  organizationId: 'org-1',
  projectId: 'proj-1',
  componentId: 'comp-1',
  orgHandle: 'acme',
  imageUrl: 'registry.example.com/editor:latest',
  registryId: 'openchoreo-default',
};

const EDITOR_URL = 'https://editor-abc.gateway.example.com/?tkn=t';

/**
 * The poll sleeps between attempts, so the loop only advances under fake timers.
 * runAllTimersAsync drains microtasks between firings, which is what lets the
 * awaited bff.get resolve before the next sleep is scheduled.
 */
const settle = async <T>(promise: Promise<T>): Promise<T> => {
  // Attach exactly one handler up front and replay the outcome afterwards.
  // Re-rejecting instead (promise.catch(Promise.reject)) leaves the original
  // unhandled, which vitest reports as an error even though every assertion
  // passes.
  const captured = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const outcome = await captured;
  if (outcome.ok) return outcome.value;
  throw outcome.error;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('callCreateCodeServer', () => {
  it('returns the URL directly when the create answers with one', async () => {
    post.mockResolvedValue({ componentName: 'cs-1', status: 'created', editorUrl: EDITOR_URL, ready: true });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ url: EDITOR_URL, ready: true });
    expect(get).not.toHaveBeenCalled();
  });

  // The cold path: the address exists minutes before the editor does.
  it('returns a not-ready address without polling', async () => {
    post.mockResolvedValue({ componentName: 'cs-1', status: 'starting', pendingEditorUrl: EDITOR_URL, ready: false });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ url: EDITOR_URL, ready: false });
    expect(get).not.toHaveBeenCalled();
  });

  it('polls until an address exists, ready or not', async () => {
    post.mockResolvedValue({ componentName: 'cs-1', status: 'provisioning' });
    get.mockResolvedValueOnce({ componentName: 'cs-1', status: 'provisioning' }).mockResolvedValueOnce({ componentName: 'cs-1', status: 'starting', pendingEditorUrl: EDITOR_URL, ready: false });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ url: EDITOR_URL, ready: false });
  });

  // Both directions of the `ready` compat seam.
  it('treats an editorUrl from a BFF with no ready field as ready', async () => {
    post.mockResolvedValue({ componentName: 'cs-1', status: 'created', editorUrl: EDITOR_URL });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ ready: true });
  });

  it('honours an explicit ready:false even alongside an editorUrl', async () => {
    post.mockResolvedValue({ componentName: 'cs-1', status: 'starting', editorUrl: EDITOR_URL, ready: false });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ ready: false });
  });

  it('polls when the create reports provisioning', async () => {
    post.mockResolvedValue({ componentName: 'cs-1', status: 'provisioning' });
    get.mockResolvedValueOnce({ componentName: 'cs-1', status: 'provisioning' }).mockResolvedValueOnce({ componentName: 'cs-1', status: 'created', editorUrl: EDITOR_URL });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ url: EDITOR_URL });
    expect(get).toHaveBeenCalledTimes(2);
  });

  // The regression: the gateway cancelled the POST at its route timeout, so the
  // browser saw a 504 for a create that had in fact already provisioned an editor.
  it.each([
    ['504 gateway timeout', new BffError(504, 'upstream request timeout')],
    ['502 bad gateway', new BffError(502, 'upstream connect error')],
    ['408 request timeout', new BffError(408, '')],
    ['network failure', new TypeError('Failed to fetch')],
  ])('recovers by polling when the create response is lost (%s)', async (_label, err) => {
    post.mockRejectedValue(err);
    get.mockResolvedValue({ componentName: 'cs-1', status: 'created', editorUrl: EDITOR_URL });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ url: EDITOR_URL });
    expect(get).toHaveBeenCalled();
  });

  // Polling through these would replace an actionable message with a timeout
  // three minutes later — the quota rejection is exactly that case.
  it.each([
    ['402 quota exhausted', new BffError(402, '{"message":"You have reached the Cloud Editor limit for your plan."}')],
    ['401 unauthorized', new BffError(401, '')],
    ['403 forbidden', new BffError(403, '')],
    ['500 server fault', new BffError(500, 'failed to provision cloud editor')],
  ])('propagates a real verdict without polling (%s)', async (_label, err) => {
    post.mockRejectedValue(err);

    await expect(settle(callCreateCodeServer(params))).rejects.toBe(err);
    expect(get).not.toHaveBeenCalled();
  });

  it('gives up once the poll budget is spent', async () => {
    post.mockRejectedValue(new BffError(504, 'upstream request timeout'));
    get.mockResolvedValue({ componentName: 'cs-1', status: 'provisioning' });

    await expect(settle(callCreateCodeServer(params))).rejects.toThrow(CLOUD_EDITOR_TIMEOUT_MESSAGE);
    // 90s budget at a 3s interval, so the loop must actually have kept trying.
    expect(get.mock.calls.length).toBeGreaterThan(20);
  });

  // A 404 after a lost POST is control-plane lag, not a create that never landed.
  it('keeps polling through 404s that clear within the tolerance', async () => {
    post.mockRejectedValue(new BffError(504, 'upstream request timeout'));
    get
      .mockRejectedValueOnce(new BffError(404, 'no cloud editor exists for this user and project'))
      .mockRejectedValueOnce(new BffError(404, 'no cloud editor exists for this user and project'))
      .mockRejectedValueOnce(new BffError(404, 'no cloud editor exists for this user and project'))
      .mockRejectedValueOnce(new BffError(404, 'no cloud editor exists for this user and project'))
      .mockResolvedValue({ componentName: 'cs-1', status: 'created', editorUrl: EDITOR_URL });

    await expect(settle(callCreateCodeServer(params))).resolves.toMatchObject({ url: EDITOR_URL });
  });

  // Sustained 404s mean the POST died before creating anything.
  it('reports the lost create when the editor never appears', async () => {
    const lost = new BffError(504, 'upstream request timeout');
    post.mockRejectedValue(lost);
    get.mockRejectedValue(new BffError(404, 'no cloud editor exists for this user and project'));

    await expect(settle(callCreateCodeServer(params))).rejects.toBe(lost);
    expect(get.mock.calls.length).toBeLessThan(50);
  });
});

describe('getCodeServer', () => {
  it('reports readiness once the editor is serving', async () => {
    get.mockResolvedValue({ componentName: 'cs-1', status: 'created', editorUrl: EDITOR_URL, ready: true });

    await expect(getCodeServer({ userId: 'u-1', projectId: 'proj-1', componentId: 'comp-1' })).resolves.toMatchObject({ url: EDITOR_URL, ready: true });
  });

  it('reports a known address that is not serving yet', async () => {
    get.mockResolvedValue({ componentName: 'cs-1', status: 'starting', pendingEditorUrl: EDITOR_URL, ready: false });

    await expect(getCodeServer({ userId: 'u-1', projectId: 'proj-1', componentId: 'comp-1' })).resolves.toMatchObject({ url: EDITOR_URL, ready: false });
  });

  // null, not a throw: the caller polls this in its hot path.
  it('returns null when no editor exists', async () => {
    get.mockRejectedValue(new BffError(404, 'no cloud editor exists for this user and project'));

    await expect(getCodeServer({ userId: 'u-1', projectId: 'proj-1', componentId: 'comp-1' })).resolves.toBeNull();
  });

  it('returns null while the editor has no address at all', async () => {
    get.mockResolvedValue({ componentName: 'cs-1', status: 'provisioning' });

    await expect(getCodeServer({ userId: 'u-1', projectId: 'proj-1', componentId: 'comp-1' })).resolves.toBeNull();
  });

  // Anything that is not a 404 propagates.
  it('propagates a non-404 failure', async () => {
    const err = new BffError(500, 'failed to provision cloud editor');
    get.mockRejectedValue(err);

    await expect(getCodeServer({ userId: 'u-1', projectId: 'proj-1', componentId: 'comp-1' })).rejects.toBe(err);
  });
});
