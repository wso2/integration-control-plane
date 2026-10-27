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

import { act, type JSX } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_ENGINE_FILES_KEY_PREFIX, UPLOAD_CHECK_CONCURRENCY, UPLOAD_CHECK_RETRY_DETAIL } from '../constants/contextEngine';
import { HttpError } from '../types/http';
import type { UploadEntry } from '../types/contextEngine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  getContextRecordStatus: vi.fn(),
  getContextJob: vi.fn(),
  ingestContextFile: vi.fn(),
  sendContextRecordEvent: vi.fn(),
  updateContextSource: vi.fn(),
}));
vi.mock('#api/contextEngine', () => api);

import { refreshUploads, useSourceUploads } from './contextUploads';

const INDEXED = { recordId: 'f0', state: 'active', indexState: 'indexed', currentVersion: '1' };
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  localStorage.clear();
  api.getContextRecordStatus.mockReset();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

/** Files this browser "uploaded" earlier, as the drawer remembers them. */
function remember(sourceId: string, n: number): void {
  const files = Array.from({ length: n }, (_, i) => ({ recordId: `f${i}`, name: `f${i}`, size: 1, contentType: 'text/plain', audience: [], version: '1', uploadedAt: '2026-01-01T00:00:00Z' }));
  localStorage.setItem(`${CONTEXT_ENGINE_FILES_KEY_PREFIX}${sourceId}`, JSON.stringify(files));
}

/** Render a subscriber and hand every snapshot it sees to `onRender`. */
function mount(sourceId: string, onRender: (entries: UploadEntry[]) => void): void {
  function Probe(): JSX.Element | null {
    onRender(useSourceUploads('e1', sourceId));
    return null;
  }
  act(() => root.render(<Probe />));
}

/** Advance the clock, then one more millisecond so the store's batched notification (a 0 ms timer) is delivered. */
const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
};

// Module maps are keyed per source, so every test uses its own source id.
describe('useSourceUploads status reads', () => {
  it('keeps the last status when a read throws something that is not an engine answer', async () => {
    remember('s-throw', 1);
    api.getContextRecordStatus.mockRejectedValueOnce(new Error('Maximum update depth exceeded')).mockResolvedValue(INDEXED);
    let latest: UploadEntry[] = [];
    mount('s-throw', (e) => (latest = e));
    await settle();
    expect(latest[0]).toMatchObject({ status: 'indexing', check: 'retrying', detail: UPLOAD_CHECK_RETRY_DETAIL });
    await settle(3000);
    expect(latest[0]).toMatchObject({ status: 'searchable' });
    expect(latest[0].check).toBeUndefined();
  });

  it('reads a restored list a few files at a time, once each, and tells subscribers in batches', async () => {
    remember('s-burst', 54);
    let inFlight = 0;
    let peak = 0;
    api.getContextRecordStatus.mockImplementation(async (_sourceId: string, recordId: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { ...INDEXED, recordId };
    });
    let renders = 0;
    let latest: UploadEntry[] = [];
    mount('s-burst', (e) => {
      renders += 1;
      latest = e;
    });
    refreshUploads('e1', 's-burst');
    await settle();
    await settle();
    await settle();
    expect(api.getContextRecordStatus).toHaveBeenCalledTimes(54);
    expect(peak).toBeLessThanOrEqual(UPLOAD_CHECK_CONCURRENCY);
    expect(latest).toHaveLength(54);
    expect(latest.every((e) => e.status === 'searchable')).toBe(true);
    expect(renders).toBeLessThan(10);
  });

  it('never shows Failed for a status read the engine could not answer', async () => {
    remember('s-503', 1);
    api.getContextRecordStatus.mockRejectedValueOnce(new HttpError(503, 'HTTP 503: unavailable')).mockResolvedValue(INDEXED);
    const seen: string[] = [];
    mount('s-503', (e) => {
      if (e[0]) seen.push(e[0].status);
    });
    await settle();
    expect(api.getContextRecordStatus).toHaveBeenCalledTimes(1);
    await settle(2997);
    expect(api.getContextRecordStatus).toHaveBeenCalledTimes(1);
    await settle(2);
    expect(api.getContextRecordStatus).toHaveBeenCalledTimes(2);
    expect(seen).not.toContain('failed');
    expect(seen.at(-1)).toBe('searchable');
  });
});
