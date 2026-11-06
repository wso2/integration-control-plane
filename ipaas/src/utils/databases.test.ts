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

import { BffError } from '../api/_client';
import { caCertificateFileName, cpuLabel, databaseBackupView, databaseNameError, isDatabaseOpenable, isBackupStarting, isTransitionalDatabaseStatus, memoryLabel, nodeDescription, planLabel, planPrice, planSpecLine, toCreateDatabaseError } from './databases';

describe('databaseNameError', () => {
  it.each([
    ['orders', ''],
    ['orders-db-2', ''],
    ['', ''],
    ['Orders', 'Use lowercase letters'],
    ['orders-', 'Use lowercase letters'],
    ['-orders', 'Use lowercase letters'],
    ['orders_db', 'Use lowercase letters'],
  ])('%s', (name, expected) => {
    const error = databaseNameError(name, []);
    if (expected) expect(error).toContain(expected);
    else expect(error).toBe('');
  });

  it('enforces the provider limit when one is published', () => {
    expect(databaseNameError('a'.repeat(47), [], 46)).toBe('Use at most 46 characters.');
    expect(databaseNameError('a'.repeat(47), [])).toBe('');
  });

  it('rejects a name already used in the organization', () => {
    expect(databaseNameError('orders', ['orders'])).toContain('already exists');
  });
});

describe('statuses', () => {
  it('polls only while the provider is still working', () => {
    expect(isTransitionalDatabaseStatus('CREATING')).toBe(true);
    expect(isTransitionalDatabaseStatus('DELETING')).toBe(true);
    expect(isTransitionalDatabaseStatus('ACTIVE')).toBe(false);
  });

  // A failed database stays openable so its reason can be read.
  it('opens everything but a database being or already removed', () => {
    expect(isDatabaseOpenable('ERROR')).toBe(true);
    expect(isDatabaseOpenable('ACTIVE')).toBe(true);
    expect(isDatabaseOpenable('DELETING')).toBe(false);
    expect(isDatabaseOpenable('DELETED')).toBe(false);
  });
});

describe('planPrice', () => {
  it('quotes the monthly price and the hourly one from it', () => {
    expect(planPrice({ monthlyPrice: 73, currency: 'USD' })).toEqual({ monthly: '$73.00', hourly: '$0.1000' });
  });

  it('has no price for an unpriced plan', () => {
    expect(planPrice({})).toBeUndefined();
  });
});

describe('toCreateDatabaseError', () => {
  it('shows a provider refusal as written', () => {
    const error = toCreateDatabaseError(new BffError(409, JSON.stringify({ error: 'Conflict', message: 'an instance named "orders" already exists' })));
    expect(error.message).toBe('an instance named "orders" already exists');
  });

  it('explains a suspended subscription', () => {
    expect(toCreateDatabaseError(new BffError(403, '{}')).title).toBe('Your subscription is suspended');
  });

  // The BFF says why: no provider here, or the organization's databases still being prepared.
  it('shows why the provider is unavailable', () => {
    const error = toCreateDatabaseError(new BffError(503, JSON.stringify({ message: 'databases are still being prepared for this organization; try again in a few seconds' })));
    expect(error.title).toBe('Databases are unavailable right now');
    expect(error.message).toContain('still being prepared');
  });
});

describe('labels', () => {
  it('formats plans, nodes and the CA file name', () => {
    expect(planLabel('standard')).toBe('Standard');
    expect(nodeDescription(1)).toBe('1 node (not highly available)');
    expect(nodeDescription(3)).toBe('3 nodes (high availability)');
    expect(caCertificateFileName('orders')).toBe('orders-ca.pem');
  });
});

describe('plan summaries for the list', () => {
  it('formats the provider quantities', () => {
    expect(memoryLabel('2Gi')).toBe('2 GB');
    expect(memoryLabel('512Mi')).toBe('512 MB');
    expect(memoryLabel('1.5G')).toBe('1.5G');
    expect(cpuLabel('2')).toBe('2 vCPU');
    expect(cpuLabel('0.5')).toBe('0.5 vCPU');
    expect(cpuLabel('500m')).toBe('0.5 vCPU');
  });

  it('sums up a plan, preferring the database own storage', () => {
    const standard = { cpu: '1', memory: '2Gi', defaultStorageGi: 5, backups: true };
    expect(planSpecLine(standard)).toBe('1 vCPU · 2 GB RAM · 5 GB storage · daily backups');
    expect(planSpecLine(standard, 10)).toBe('1 vCPU · 2 GB RAM · 10 GB storage · daily backups');
    expect(planSpecLine({ cpu: '0.5', memory: '512Mi', defaultStorageGi: 1, backups: false })).toBe('0.5 vCPU · 512 MB RAM · 1 GB storage');
    expect(planSpecLine({ backups: false })).toBe('');
  });
});

describe('databaseBackupView', () => {
  const off = { backup: { enabled: false }, backupState: 'NotScheduled' };
  const on = (backupState: string) => ({ backup: { enabled: true, retentionDays: 7 }, backupState, lastBackupAt: '2026-10-27T02:00:00Z' });

  it('offers enabling when backups are off', () => {
    expect(databaseBackupView(off, true, false)).toEqual({ kind: 'off' });
    expect(databaseBackupView({}, undefined, false)).toEqual({ kind: 'off' });
  });

  it('says a plan without backups cannot have them', () => {
    expect(databaseBackupView(off, false, false)).toEqual({ kind: 'notOffered' });
  });

  it('shows enabling until the detail reflects the change', () => {
    expect(databaseBackupView(off, true, true)).toEqual({ kind: 'enabling' });
  });

  it.each([
    ['Configured', 'ok'],
    ['FirstBackupPending', 'starting'],
    ['ArchivingPending', 'starting'],
    ['NotScheduled', 'starting'],
    ['BackupFailed', 'failing'],
    ['NoPlaneStore', 'failing'],
  ])('reports %s as %s once enabled', (state, health) => {
    expect(databaseBackupView(on(state), true, false)).toEqual({ kind: 'on', health, retentionDays: 7, lastBackupAt: '2026-10-27T02:00:00Z' });
  });

  // Enabled wins over the plan check: the detail is the provider's own word.
  it('trusts an enabled detail over the plan', () => {
    expect(databaseBackupView(on('Configured'), false, false).kind).toBe('on');
  });

  it('polls faster only while enabled backups are starting', () => {
    const enabled = (backupState?: string) => ({ backup: { enabled: true }, backupState });
    expect(isBackupStarting(enabled('FirstBackupPending'))).toBe(true);
    // The minute right after enabling, before the provider schedules them.
    expect(isBackupStarting(enabled('NotScheduled'))).toBe(true);
    expect(isBackupStarting(enabled('Configured'))).toBe(false);
    expect(isBackupStarting(enabled(undefined))).toBe(false);
    // Backups off reads NotScheduled too; that must not poll fast forever.
    expect(isBackupStarting({ backup: { enabled: false }, backupState: 'NotScheduled' })).toBe(false);
    expect(isBackupStarting({ backupState: 'NotScheduled' })).toBe(false);
    expect(isBackupStarting(undefined)).toBe(false);
  });
});
