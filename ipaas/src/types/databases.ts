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

/**
 * Managed PostgreSQL databases, provisioned on WSO2 PaaS through the BFF. A
 * database belongs to the organization.
 *
 * These replace the platform-services types in `platformServices.ts` for the
 * live Databases pages; those stay for the unported Vector Database and Message
 * Broker pages.
 */

export type DatabaseStatus = 'CREATING' | 'ACTIVE' | 'DELETING' | 'DELETED' | 'ERROR';

export interface DatabaseAvailability {
  available: boolean;
  /** `NOT_CONFIGURED` when this deployment has no database provider. */
  reason?: string;
}

export interface DatabasePlan {
  id: string;
  nodeCount: number;
  maxNodeCount?: number;
  /** Per-node CPU, as Kubernetes quantities ("500m", "2"). */
  cpu?: string;
  memory?: string;
  defaultStorageGi?: number;
  maxStorageGi?: number;
  backups: boolean;
  /** List price at the plan's default node count and storage; absent when unpriced. */
  monthlyPrice?: number;
  currency?: string;
}

/** Where new databases run. Region and cloud are absent when the provider records none. */
export interface DatabasePlane {
  name: string;
  displayName?: string;
  region?: string;
  cloud?: string;
}

export interface DatabaseOffering {
  plans: DatabasePlan[];
  defaultPlan?: string;
  /** The major every new database gets; set by the deployment, not chosen. */
  postgresVersion: string;
  /** The longest name the provider accepts; absent when it publishes none. */
  maxNameLength?: number;
  plane?: DatabasePlane;
}

export interface DatabaseServer {
  /** Opaque id, used only in URLs and BFF paths. */
  id: string;
  name: string;
  status: DatabaseStatus;
  statusMessage?: string;
  plan?: string;
  postgresVersion?: string;
  nodeCount?: number;
  storageGi?: number;
  createdAt?: string;
}

export interface DatabaseBackupPolicy {
  enabled: boolean;
  schedule?: string;
  retentionDays?: number;
}

export interface DatabaseServerDetail extends DatabaseServer {
  host?: string;
  port?: string;
  /**
   * Whether `host` is reachable from integrations. When false, it is the
   * address inside the database's own platform only.
   */
  reachable: boolean;
  runningVersion?: string;
  cpu?: string;
  memory?: string;
  /** True while a change is still being applied. */
  reconciling: boolean;
  backup?: DatabaseBackupPolicy;
  backupState?: string;
  lastBackupAt?: string;
}

export interface CreateDatabaseInput {
  name: string;
  plan?: string;
}

/** The admin login, revealed fresh on every request and never cached. */
export interface DatabaseCredentials {
  username: string;
  password: string;
  database?: string;
  caCertificate?: string;
}
