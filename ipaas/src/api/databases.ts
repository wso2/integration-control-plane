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

/** Managed PostgreSQL databases. Calls the BFF's /db-servers routes, which provision on WSO2 PaaS. */

import type { CreateDatabaseInput, DatabaseAvailability, DatabaseBackupPolicy, DatabaseCredentials, DatabaseOffering, DatabasePlan, DatabaseServer, DatabaseServerDetail, DatabaseStatus } from '../types/databases';
import { bff, items, seg, type ListResponse } from './_client';

interface BffAvailability {
  available: boolean;
  reason?: string;
}

interface BffPlan {
  id: string;
  nodeCount: number;
  maxNodeCount?: number;
  cpu?: string;
  memory?: string;
  defaultStorageGi?: number;
  maxStorageGi?: number;
  backups: boolean;
  monthlyPrice?: number;
  currency?: string;
}

interface BffOffering {
  plans: BffPlan[] | null;
  defaultPlan?: string;
  postgresVersion: string;
  maxNameLength?: number;
  plane?: { name: string; displayName?: string; region?: string; cloud?: string };
}

interface BffServer {
  id: string;
  name: string;
  status: string;
  statusMessage?: string;
  plan?: string;
  postgresVersion?: string;
  nodeCount?: number;
  storageGi?: number;
  createdAt?: string;
}

interface BffServerDetail extends BffServer {
  host?: string;
  port?: string;
  reachable: boolean;
  runningVersion?: string;
  cpu?: string;
  memory?: string;
  reconciling?: boolean;
  backup?: { enabled: boolean; schedule?: string; retentionDays?: number };
  backupState?: string;
  lastBackupAt?: string;
}

interface BffCredentials {
  username: string;
  password: string;
  database?: string;
  caCertificate?: string;
}

const DATABASE_STATUSES: readonly DatabaseStatus[] = ['CREATING', 'ACTIVE', 'DELETING', 'DELETED', 'ERROR'];

// An unknown status is shown as an error rather than trusted: a value this
// console does not know has no safe action attached to it.
const toStatus = (status: string): DatabaseStatus => ((DATABASE_STATUSES as readonly string[]).includes(status) ? (status as DatabaseStatus) : 'ERROR');

export const toDatabaseServer = (s: BffServer): DatabaseServer => ({
  id: s.id,
  name: s.name,
  status: toStatus(s.status),
  statusMessage: s.statusMessage,
  plan: s.plan,
  postgresVersion: s.postgresVersion,
  nodeCount: s.nodeCount,
  storageGi: s.storageGi,
  createdAt: s.createdAt,
});

export const toDatabaseServerDetail = (s: BffServerDetail): DatabaseServerDetail => ({
  ...toDatabaseServer(s),
  host: s.host,
  port: s.port,
  reachable: s.reachable,
  runningVersion: s.runningVersion,
  cpu: s.cpu,
  memory: s.memory,
  reconciling: s.reconciling ?? false,
  backup: s.backup,
  backupState: s.backupState,
  lastBackupAt: s.lastBackupAt,
});

const toPlan = (p: BffPlan): DatabasePlan => ({ ...p });

export const toDatabaseOffering = (o: BffOffering): DatabaseOffering => ({
  plans: (o.plans ?? []).map(toPlan),
  defaultPlan: o.defaultPlan,
  postgresVersion: o.postgresVersion,
  maxNameLength: o.maxNameLength,
  plane: o.plane,
});

export const fetchDatabaseAvailability = (): Promise<DatabaseAvailability> => bff.get<BffAvailability>('/db-servers/availability');

export const fetchDatabaseOffering = (): Promise<DatabaseOffering> => bff.get<BffOffering>('/db-servers/offering').then(toDatabaseOffering);

export const fetchDatabaseServers = (): Promise<DatabaseServer[]> => bff.get<ListResponse<BffServer>>('/db-servers').then((r) => items(r).map(toDatabaseServer));

export const fetchDatabaseServer = (serverId: string): Promise<DatabaseServerDetail> => bff.get<BffServerDetail>(`/db-servers/${seg(serverId)}`).then(toDatabaseServerDetail);

export const createDatabaseServer = (input: CreateDatabaseInput): Promise<DatabaseServer> => bff.post<BffServer>('/db-servers', input).then(toDatabaseServer);

// Each call asks the provider for the credentials again; the BFF keeps nothing.
export const revealDatabaseCredentials = (serverId: string): Promise<DatabaseCredentials> => bff.get<BffCredentials>(`/db-servers/${seg(serverId)}/credentials`);

// Starts tearing the database down, its backups with it. It lists as DELETING
// until the provider finishes, then drops out of the list.
export const deleteDatabaseServer = (serverId: string): Promise<void> => bff.delete<void>(`/db-servers/${seg(serverId)}`);

// Turns on daily backups at the BFF's fixed retention. The provider applies it
// asynchronously; the server detail shows it once it lands.

export const enableDatabaseBackups = (serverId: string): Promise<DatabaseBackupPolicy> => bff.post<DatabaseBackupPolicy>(`/db-servers/${seg(serverId)}/backups/enable`);
