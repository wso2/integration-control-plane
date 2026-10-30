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

import { toDatabaseOffering, toDatabaseServer, toDatabaseServerDetail } from './databases';

const server = { id: '11111111-0000-4000-8000-00000000000a', name: 'orders', status: 'ACTIVE', plan: 'standard', postgresVersion: '17', nodeCount: 2, storageGi: 5, createdAt: '2026-10-22T10:00:00Z' };

describe('toDatabaseServer', () => {
  it('keeps the BFF fields', () => {
    expect(toDatabaseServer(server)).toEqual(server);
  });

  // A status the console does not know has no safe action attached to it.
  it('treats an unknown status as an error', () => {
    expect(toDatabaseServer({ ...server, status: 'HIBERNATING' }).status).toBe('ERROR');
  });
});

describe('toDatabaseServerDetail', () => {
  it('defaults reconciling to false and keeps reachability', () => {
    const detail = toDatabaseServerDetail({ ...server, host: 'db.example', port: '5432', reachable: false });
    expect(detail.reconciling).toBe(false);
    expect(detail.reachable).toBe(false);
    expect(detail.host).toBe('db.example');
  });
});

describe('toDatabaseOffering', () => {
  // Go encodes an empty slice it never initialised as null.
  it('turns a null plan list into an empty one', () => {
    expect(toDatabaseOffering({ plans: null, postgresVersion: '17' }).plans).toEqual([]);
  });

  it('keeps plans, versions and the plane', () => {
    const offering = toDatabaseOffering({
      plans: [{ id: 'dev', nodeCount: 1, backups: false, monthlyPrice: 10.5, currency: 'USD' }],
      defaultPlan: 'dev',
      postgresVersion: '17',
      maxNameLength: 46,
      plane: { name: 'shared', region: 'local' },
    });
    expect(offering.plans[0]).toEqual({ id: 'dev', nodeCount: 1, backups: false, monthlyPrice: 10.5, currency: 'USD' });
    expect(offering.postgresVersion).toBe('17');
    expect(offering.plane?.region).toBe('local');
  });
});
