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

const session = vi.hoisted(() => ({ current: {} as unknown }));
vi.mock('../../auth', () => ({ getSession: () => session.current }));

const post = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../api/telemetry', () => ({ postConsoleActions: post }));

import { ConsoleAction, FLUSH_INTERVAL_MS, MAX_BATCH_SIZE, flushConsoleActions, resetConsoleActionsForTest, setCurrentPage, trackConsoleAction } from './consoleActions';
import type { ConsoleActionPayload } from '../../types/telemetry';

const sent = (): ConsoleActionPayload[][] => post.mock.calls.map((call) => (call as unknown as [ConsoleActionPayload[]])[0]);
const quota = { limit: 5, interaction: 'shown', surface: 'create-page' } as const;

beforeEach(() => {
  vi.useFakeTimers();
  resetConsoleActionsForTest();
  post.mockClear();
  session.current = {};
  (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { consoleAnalyticsEnabled: true };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('trackConsoleAction', () => {
  it('sends nothing when console analytics is off', () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { consoleAnalyticsEnabled: false };
    trackConsoleAction(ConsoleAction.QuotaBlocked, quota);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    expect(post).not.toHaveBeenCalled();
  });

  it('batches actions and sends them after the flush interval', () => {
    setCurrentPage('/organizations/:orgHandler/projects/:projectHandler/components/new');
    trackConsoleAction(ConsoleAction.QuotaBlocked, quota);
    trackConsoleAction(ConsoleAction.CreateOptionSelected, { option: 'sample', surface: 'empty-project' });
    expect(post).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

    expect(post).toHaveBeenCalledTimes(1);
    const [batch] = sent();
    expect(batch.map((a) => a.action)).toEqual([ConsoleAction.QuotaBlocked, ConsoleAction.CreateOptionSelected]);
    expect(batch[0]).toMatchObject({ page: '/organizations/:orgHandler/projects/:projectHandler/components/new', dimensions: quota });
    expect(batch[0].sessionId).toBe(batch[1].sessionId);
    expect(new Date(batch[0].occurredAt).toString()).not.toBe('Invalid Date');
  });

  it('sends at once when a batch is full', () => {
    for (let i = 0; i < MAX_BATCH_SIZE; i++) trackConsoleAction(ConsoleAction.QuotaBlocked, quota);
    expect(post).toHaveBeenCalledTimes(1);
    expect(sent()[0]).toHaveLength(MAX_BATCH_SIZE);
  });

  it('leaves out dimensions that are not scalars', () => {
    trackConsoleAction(ConsoleAction.ErrorShown, { operation: 'create-integration', status: Number.NaN, error_code: undefined });
    flushConsoleActions();
    expect(sent()[0][0].dimensions).toEqual({ operation: 'create-integration' });
  });

  it('drops the batch without a session', () => {
    session.current = null;
    trackConsoleAction(ConsoleAction.QuotaBlocked, quota);
    flushConsoleActions();
    session.current = {};
    flushConsoleActions();
    expect(post).not.toHaveBeenCalled();
  });

  it('flushes with keepalive when the tab is hidden', () => {
    trackConsoleAction(ConsoleAction.QuotaBlocked, quota);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(post).toHaveBeenCalledWith(expect.any(Array), true);
  });

  it('never throws when sending fails', async () => {
    post.mockRejectedValueOnce(new Error('offline'));
    trackConsoleAction(ConsoleAction.QuotaBlocked, quota);
    expect(() => flushConsoleActions()).not.toThrow();
    await vi.runAllTimersAsync();
  });
});
