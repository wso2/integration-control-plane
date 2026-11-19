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

import type { UseQueryResult } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { combineTraceSpans } from './useIntegrationTraces';
import type { SpanRow } from '../types/integrationTraces';

const span = (traceId: string): SpanRow => ({
  traceId,
  spanId: `${traceId}-s`,
  name: 'get /x',
  kind: 'SERVER',
  startTime: '2026-10-30T00:00:00Z',
  endTime: '2026-10-30T00:00:00Z',
  durationMs: 10,
  status: 'ok',
  serviceName: '/api',
  attributes: {},
});

const result = (state: 'success' | 'error' | 'pending', data?: SpanRow[]) => ({ isSuccess: state === 'success', isError: state === 'error', isPending: state === 'pending', data, refetch: vi.fn() }) as unknown as UseQueryResult<SpanRow[]>;

describe('combineTraceSpans', () => {
  it('joins the spans read so far and counts each state', () => {
    const results = [result('success', [span('a')]), result('error'), result('pending'), result('success', [span('b')])];

    const combined = combineTraceSpans(results);

    expect(combined.spans.map((s) => s.traceId)).toEqual(['a', 'b']);
    expect(combined).toMatchObject({ read: 2, failed: 1, pending: 1 });
  });

  it('retries only the failed queries', () => {
    const results = [result('success', []), result('error'), result('error')];

    combineTraceSpans(results).retryFailed();

    expect(results.map((r) => vi.mocked(r.refetch).mock.calls.length)).toEqual([0, 1, 1]);
  });
});
