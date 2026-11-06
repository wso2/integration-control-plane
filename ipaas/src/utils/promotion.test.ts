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
import type { EndpointExposure } from '../types/component';
import type { ProxyReconciliationStatus } from '../types/deployment';
import { pendingApiChange } from './promotion';

const reconciliation = (status: ProxyReconciliationStatus['status'], endpoints: Record<string, { buildId?: string; exposure?: EndpointExposure }>): ProxyReconciliationStatus => ({
  status,
  component: 'c',
  environment: 'e',
  endpoints: Object.entries(endpoints).map(([endpoint, fields]) => ({ endpoint, status: 'SUCCEEDED', ...fields })),
});

describe('pendingApiChange', () => {
  it('is nothing when both environments run the same API with the same visibility', () => {
    expect(pendingApiChange(reconciliation('SUCCEEDED', { http: { buildId: 'b1', exposure: 'public' } }), reconciliation('SUCCEEDED', { http: { buildId: 'b1', exposure: 'public' } }))).toBeNull();
  });

  it('carries a change the target waits on', () => {
    expect(pendingApiChange(reconciliation('SUCCEEDED', { http: { buildId: 'b1' } }), reconciliation('PENDING_PROMOTION', { http: { buildId: 'b1' } }))).toBe('pending-promotion');
  });

  it('carries API settings edited in the source', () => {
    expect(pendingApiChange(reconciliation('SUCCEEDED', { http: { buildId: 'b2' } }), reconciliation('SUCCEEDED', { http: { buildId: 'b1' } }))).toBe('api-settings');
  });

  it('carries a visibility changed in the source, which no build records', () => {
    expect(pendingApiChange(reconciliation('SUCCEEDED', { http: { buildId: 'b1', exposure: 'organization' } }), reconciliation('SUCCEEDED', { http: { buildId: 'b1', exposure: 'public' } }))).toBe('visibility');
  });

  it('never reads a field an older BFF does not report as a difference', () => {
    expect(pendingApiChange(reconciliation('SUCCEEDED', { http: { exposure: 'organization' } }), reconciliation('SUCCEEDED', { http: {} }))).toBeNull();
    expect(pendingApiChange(reconciliation('SUCCEEDED', { http: { buildId: 'b2' } }), undefined)).toBeNull();
  });
});
