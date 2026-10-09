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

import { ConnectionType } from '../../types/connections';
import type { ResourceTab } from '../../types/connections';

export const RESOURCE_TAB_LABELS: Record<ResourceTab, string> = {
  services: 'Services',
  databases: 'Databases',
  storage: 'Storage',
};

export const SERVICE_TYPE_FILTERS = ['Internal', 'Third Party'];
export const SERVICE_VISIBILITY_FILTERS = ['Project', 'Organization', 'Public'];
export const DB_STORAGE_TYPE_FILTERS = ['PostgreSQL', 'MySQL', 'Choreo Cache'];
export const DB_CLOUD_PROVIDER_FILTERS = ['DigitalOcean', 'GCP', 'AWS', 'Azure'];
export const CATEGORY_FILTERS = ['GenAI'];
export const RESOURCE_PAGE_SIZE = 9;

/** Human labels for a connection's resource/connection type shown in the listing. */
export const CONNECTION_TYPE_LABELS: Record<string, string> = {
  CHOREO_SERVICE: 'Service',
  SERVICE: 'Service',
  DATABASE: 'Database',
  STORAGE: 'Storage',
  THIRD_PARTY_SERVICE: 'Third Party',
  CHOREO_CONFIGURATION_GROUP: 'Configuration Group',
};

/** Label for a listing record's `resourceType` (defaults to Service). */
export function connectionTypeLabel(resourceType?: string | null): string {
  if (!resourceType) return CONNECTION_TYPE_LABELS.SERVICE;
  return CONNECTION_TYPE_LABELS[resourceType] ?? resourceType;
}

/** Map a listing record's `resourceType` to the enum that selects the delete route. */
export function toConnectionType(resourceType?: string | null): ConnectionType {
  switch (resourceType) {
    case 'DATABASE':
      return ConnectionType.DATABASE;
    case 'STORAGE':
      return ConnectionType.STORAGE;
    case 'THIRD_PARTY_SERVICE':
      return ConnectionType.THIRD_PARTY_SERVICE;
    case 'CHOREO_CONFIGURATION_GROUP':
      return ConnectionType.CHOREO_CONFIGURATION_GROUP;
    default:
      return ConnectionType.CHOREO_SERVICE;
  }
}

/** Connection banner + type images, shipped from Devant into `public/assets/images`. */
export const CONNECTION_IMAGES = {
  banner: `${import.meta.env.BASE_URL}assets/images/connections-banner.svg`,
  service: `${import.meta.env.BASE_URL}assets/images/connection-service.svg`,
  database: `${import.meta.env.BASE_URL}assets/images/connection-database.svg`,
  storage: `${import.meta.env.BASE_URL}assets/images/connection-storage.svg`,
} as const;

// Mirrors Devant's enableConnections/hideConnections: services, web-apps and external consumers
// get connections; proxy-like and MCP components do not.
const CONNECTIONS_DENIED_DISPLAY_TYPES = new Set(['proxy', 'gitProxy']);

export function areComponentConnectionsAllowed(displayType?: string | null, componentSubType?: string | null): boolean {
  if (!displayType) return false;
  if (componentSubType === 'MCP') return false;
  return !CONNECTIONS_DENIED_DISPLAY_TYPES.has(displayType);
}
