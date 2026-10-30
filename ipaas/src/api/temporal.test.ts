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

import { toTemporalOffering, toTemporalServer, toTemporalServerDetail } from './temporal';

const server = { id: '22222222-0000-4000-8000-00000000000a', name: 'payments', status: 'ACTIVE', plan: 'dev', namespace: 'payments', createdAt: '2026-10-29T10:00:00Z' };

describe('toTemporalServer', () => {
  it('keeps the BFF fields', () => {
    expect(toTemporalServer(server)).toEqual(server);
  });

  // A status the console does not know has no safe action attached to it.
  it('treats an unknown status as an error', () => {
    expect(toTemporalServer({ ...server, status: 'HIBERNATING' }).status).toBe('ERROR');
  });
});

describe('toTemporalServerDetail', () => {
  it('keeps the address and reachability', () => {
    const detail = toTemporalServerDetail({ ...server, host: 'payments.svc.example', port: '443', reachable: true, runningVersion: '1.31.2' });
    expect(detail).toMatchObject({ host: 'payments.svc.example', port: '443', reachable: true, runningVersion: '1.31.2' });
  });
});

describe('toTemporalOffering', () => {
  // Go encodes an empty slice it never initialised as null.
  it('turns a null plan list into an empty one', () => {
    expect(toTemporalOffering({ plans: null }).plans).toEqual([]);
  });

  it('keeps plans, the version and the plane', () => {
    const offering = toTemporalOffering({
      plans: [{ id: 'dev', replicas: 1, cpu: '0.5', memory: '1.125Gi', historyShards: 1, storageGi: 2, monthlyPrice: 25, currency: 'USD' }],
      defaultPlan: 'dev',
      temporalVersion: '1.31.2',
      maxNameLength: 29,
      plane: { name: 'shared' },
    });
    expect(offering.plans[0].historyShards).toBe(1);
    expect(offering.temporalVersion).toBe('1.31.2');
    expect(offering.plane?.name).toBe('shared');
  });
});
