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
import type { ProxyReconciliationStatus } from '../types/deployment';
import { isProxyReconciliationActive, proxyReconciliationNotice } from './proxyReconciliation';

const status = (partial: Partial<ProxyReconciliationStatus>): ProxyReconciliationStatus => ({ status: 'SUCCEEDED', component: 'c', environment: 'e', endpoints: [], ...partial });

describe('proxyReconciliationNotice', () => {
  it('says nothing once the gateway matches, or for components without an API', () => {
    expect(proxyReconciliationNotice(status({ status: 'SUCCEEDED' }))).toBeNull();
    expect(proxyReconciliationNotice(status({ status: 'NOT_APPLICABLE' }))).toBeNull();
    expect(proxyReconciliationNotice(undefined)).toBeNull();
  });

  it('reports an update in flight and keeps polling it', () => {
    expect(proxyReconciliationNotice(status({ status: 'RUNNING' }))).toEqual({ severity: 'info', text: 'Updating the API gateway…', retry: false });
    expect(isProxyReconciliationActive(status({ status: 'PENDING' }))).toBe(true);
    expect(isProxyReconciliationActive(status({ status: 'FAILED' }))).toBe(false);
  });

  it('words a known failure code without a retry, which would only fail the same way', () => {
    const notice = proxyReconciliationNotice(status({ status: 'FAILED', error: 'APIP_QUOTA_EXCEEDED' }));
    expect(notice?.text).toContain('reached its API limit');
    expect(notice).toMatchObject({ severity: 'error', retry: false });
    expect(proxyReconciliationNotice(status({ status: 'FAILED', error: 'APIP_SOURCE_BUILD_UNAVAILABLE' }))?.retry).toBe(false);
  });

  it('falls back to an endpoint code and shows an unknown one as is', () => {
    const notice = proxyReconciliationNotice(status({ status: 'DEGRADED', endpoints: [{ endpoint: 'http', status: 'FAILED', error: 'APIP_DEPLOYMENT_FAILED' }] }));
    expect(notice).toEqual({ severity: 'warning', text: 'The API gateway could not be updated (APIP_DEPLOYMENT_FAILED).', retry: true });
  });

  it('explains a change that waits for promotion without a retry', () => {
    expect(proxyReconciliationNotice(status({ status: 'PENDING_PROMOTION' }))).toMatchObject({ severity: 'info', retry: false });
  });
});
