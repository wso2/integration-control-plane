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

import type { DatabaseStatus } from '../types/databases';

const DB_LOGO_BASE = 'assets/images/databases/';

export type PlatformServiceKind = 'postgres' | 'temporal';

export interface PlatformServiceTypeOption {
  id: PlatformServiceKind;
  name: string;
  description: string;
  /** Logo path, resolved against the app base URL by the UI; types without one show an icon. */
  logo?: string;
}

/** Service types shown on the create page. Only provisionable types are listed. */
export const PLATFORM_SERVICE_TYPES: PlatformServiceTypeOption[] = [
  { id: 'postgres', name: 'PostgreSQL', description: 'A highly performant, fully-managed object-relational database management system', logo: `${DB_LOGO_BASE}postgresql.svg` },
  { id: 'temporal', name: 'Temporal', description: 'A fully-managed Temporal server for durable, long-running workflows' },
];

export const POSTGRES_LOGO = `${DB_LOGO_BASE}postgresql.svg`;

export const DATABASE_STATUS_LABELS: Record<DatabaseStatus, string> = {
  CREATING: 'Creating',
  ACTIVE: 'Active',
  DELETING: 'Deleting',
  DELETED: 'Deleted',
  ERROR: 'Error',
};

/** oxygen-ui Chip colors keyed by database status. */
export const DATABASE_STATUS_COLORS: Record<DatabaseStatus, 'info' | 'success' | 'warning' | 'error'> = {
  CREATING: 'info',
  ACTIVE: 'success',
  DELETING: 'warning',
  DELETED: 'error',
  ERROR: 'error',
};

/**
 * What the database provider cannot do yet. The pages keep these controls
 * visible and disabled, each with this reason; enabling one is a matter of
 * wiring its BFF route and removing it here.
 */
export const DATABASE_UNAVAILABLE = {
  power: 'Powering databases on and off is not available yet.',
  maintenance: 'Maintenance windows are not available yet.',
  allowedIps: 'IP allow-lists are not available yet.',
  logicalDatabases: 'Creating databases and credentials inside a server is not available yet. Connect with the admin credentials on the Overview tab to create them yourself.',
  logs: 'Database logs are not available yet.',
  metrics: 'Database metrics are not available yet.',
} as const;
