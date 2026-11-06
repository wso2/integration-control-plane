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

import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrgDatabases from '../../pages/OrgDatabases';
import TemporalServerDetail from '../../pages/TemporalServerDetail';
import OverviewTab from './OverviewTab';
import BackupsTab from './BackupsTab';
import AdvancedSettingsTab from './AdvancedSettingsTab';
import { button, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../../test/roles';
import type { DatabaseServerDetail } from '../../types/databases';
import type { TemporalServerDetail as TemporalDetail } from '../../types/temporal';

const database: DatabaseServerDetail = { id: 'db-1', name: 'orders', status: 'ACTIVE', plan: 'standard', reachable: true, reconciling: false };
const temporal: TemporalDetail = { id: 't-1', name: 'flows', status: 'ACTIVE', reachable: true, managed: false };
const idle = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, isSuccess: false };
vi.mock('../../hooks/useDatabases', () => ({
  useDatabaseAvailability: () => ({ data: { available: true } }),
  useDatabaseServers: () => ({ data: [database] }),
  useDatabaseOffering: () => ({ data: { plans: [{ id: 'standard', nodeCount: 1, backups: true }], postgresVersion: '16' } }),
  useRevealDatabaseCredentials: () => idle,
  useEnableDatabaseBackups: () => idle,
  useDeleteDatabaseServer: () => idle,
}));
vi.mock('../../hooks/useTemporal', () => ({
  useTemporalServers: () => ({ data: [] }),
  useTemporalOffering: () => ({ data: { plans: [] } }),
  useTemporalServer: () => ({ data: temporal }),
  useRevealTemporalCredentials: () => idle,
  useDeleteTemporalServer: () => idle,
}));
// The dialogs and copy field aren't what these tests are about.
vi.mock('./DeleteDatabaseDialog', () => ({ default: () => null }));
vi.mock('../Temporal/DeleteTemporalDialog', () => ({ default: () => null }));
vi.mock('./CopyField', () => ({ default: () => null }));
vi.mock('../../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('react-router', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router')>()), useParams: () => ({ temporalId: 't-1' }) }));

let unmount = () => {};
afterEach(() => unmount());

const org = { level: 'organizations', org: 'acme' } as const;
// Each place a platform-service write is offered, with the controls that make it.
const places: [string, ReactNode, string[]][] = [
  ['the service list', <OrgDatabases {...org} />, ['Create', 'Delete orders']],
  ['a database overview', <OverviewTab service={database} onRefresh={() => {}} isRefreshing={false} />, ['View Credentials', 'Download CA Certificate']],
  ['a database without backups', <BackupsTab service={database} />, ['Enable Backups']],
  ["a database's advanced settings", <AdvancedSettingsTab service={database} onDeleted={() => {}} />, ['Delete Server']],
  ['a Temporal server', <TemporalServerDetail {...org} />, ['View API Key', 'Advanced Settings']],
];

async function controls(ui: ReactNode, scopes: string[], names: string[]) {
  const r = await renderWithScopes(ui, scopes);
  unmount = r.unmount;
  return names.filter((name) => button(r.container, name));
}

describe('platform service writes', () => {
  it.each(places)('are offered on %s to a Platform Engineer, who holds cloud:resource-type:manage', async (_, ui, names) => {
    expect(await controls(ui, PLATFORM_ENGINEER, names)).toEqual(names);
  });

  it.each(places)('are not offered on %s to a Developer', async (_, ui, names) => {
    expect(await controls(ui, DEVELOPER, names)).toEqual([]);
  });
});
