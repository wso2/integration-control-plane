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

import type { CloudProvider, CloudRegion, MetricPeriod, ServerStatus, ServerVariant, ServiceType } from '../types/platformServices';

/** Service name: starts with a letter, alphanumeric + hyphens, max 64 chars. Mirrors Devant. */
export const SERVICE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/;
export const SERVICE_NAME_ERROR = 'Service name must consist of alphanumeric characters and hyphens, must begin with a letter, and cannot exceed 64 characters.';

/** Choreo Cache (Redis) creation is currently unavailable — the card is shown disabled. */
export const ENABLE_REDIS_CREATION = false;

/** Cloud providers a free (non-subscribed) org may NOT select — only DigitalOcean is free-tier. */
export const FREE_TIER_DISABLED_PROVIDERS: CloudProvider[] = ['aws', 'azure', 'gcp'];

/** Trademark disclaimer shown in the layout footer while on the Databases pages. */
export const DB_TRADEMARK_NOTICE = 'PostgreSQL and Temporal are trademarks and property of their respective owners. All product and service names used in this platform are for identification purposes only.';

/** Public path prefixes for the provider logos (shipped from Devant). */
const DB_LOGO_BASE = 'assets/images/databases/';
const CLOUD_LOGO_BASE = 'assets/images/cloud-providers/';

export interface ServiceTypeOption {
  id: ServiceType;
  name: string;
  description: string;
  /** Logo path under {@link DB_LOGO_BASE}, resolved against the app base URL by the UI. */
  logo: string;
  /** Dark-mode variant of `logo` — for monochrome brand marks (e.g. Kafka) that need a different color per theme. */
  logoDark?: string;
  disabled?: boolean;
}

/** Selectable database engines (Step 1). Redis shown but disabled while unavailable. */
export const SERVICE_TYPES: ServiceTypeOption[] = [
  { id: 'postgres', name: 'PostgreSQL', description: 'A highly performant, fully-managed object-relational database management system', logo: `${DB_LOGO_BASE}postgresql.svg` },
  { id: 'mysql', name: 'MySQL', description: "A fully-managed offering of the world's most popular relational database management system", logo: `${DB_LOGO_BASE}mysql.svg` },
  {
    id: 'redis',
    name: 'Choreo Cache',
    description: ENABLE_REDIS_CREATION ? 'A managed in-memory NoSQL database compatible with legacy Redis® OSS' : 'Choreo Caches are currently unavailable. Please select another service.',
    logo: `${DB_LOGO_BASE}redis.svg`,
    disabled: !ENABLE_REDIS_CREATION,
  },
];

/**
 * Selectable engines for a Vector Database — only PostgreSQL (pgvector) is offered.
 * Mirrors Devant, which filters the type picker to `postgres` and swaps in a
 * vector-specific description in vector mode.
 */
export const VECTOR_SERVICE_TYPES: ServiceTypeOption[] = [
  { id: 'postgres', name: 'PostgreSQL', description: 'A high-performance, fully-managed object-relational database management system, optimized for vector similarity search.', logo: `${DB_LOGO_BASE}postgresql.svg` },
];

/**
 * Describes one flavour of the managed-database feature. Both the regular
 * Databases pages and the Vector Databases pages are the same components driven
 * by one of these descriptors — the only real data difference is the
 * `is_vector_enabled` flag on the server object and the create payload.
 */
export interface DbServerKind {
  /** Value sent as `is_vector_enabled` on create and used to filter the server list. */
  isVector: boolean;
  /** Which platform-services server family an operation targets. */
  variant: ServerVariant;
  /** URL segment under `/admin` (`databases`, `vector-databases`, or `message-brokers`). */
  segment: 'databases' | 'vector-databases' | 'message-brokers';
  /** List-page heading. */
  listTitle: string;
  /** Create-page heading. */
  createTitle: string;
  /** Create-page "back to list" button label. */
  backToListLabel: string;
  /** Detail-page "back to list" button label. */
  backToDetailLabel: string;
  /** Empty-state banner headline. */
  emptyHeadline: string;
  /** Empty-state banner body (shown when nothing has been created yet). */
  emptyBody: string;
  /** Lowercase noun for messages, e.g. "database server" or "message broker". */
  serverNoun: string;
  /** When true, unsubscribed orgs see an upgrade prompt instead of the empty-state banner. */
  requiresPaidPlan?: boolean;
  /** Engines offered in the create wizard's type picker. */
  serviceTypes: ServiceTypeOption[];
}

export const BROKER_SERVICE_TYPES: ServiceTypeOption[] = [
  {
    id: 'kafka',
    name: 'Apache Kafka',
    description: 'A fully-managed distributed event streaming platform for high-performance data pipelines and pub/sub messaging.',
    logo: `${DB_LOGO_BASE}kafka.svg`,
    logoDark: `${DB_LOGO_BASE}kafka-dark.svg`,
  },
];

export const DATABASE_KIND: DbServerKind = {
  isVector: false,
  variant: 'db-servers',
  segment: 'databases',
  listTitle: 'Databases',
  createTitle: 'Create Database Server',
  backToListLabel: 'Back to database server list',
  backToDetailLabel: 'Back to Database List',
  emptyHeadline: 'Create fully-managed PostgreSQL, MySQL databases and WSO2 Integration Platform-Managed Caches (compatible with legacy Redis® OSS)',
  emptyBody: 'No database services have been created yet.',
  serverNoun: 'database server',
  serviceTypes: SERVICE_TYPES,
};

export const VECTOR_DATABASE_KIND: DbServerKind = {
  isVector: true,
  variant: 'db-servers',
  segment: 'vector-databases',
  listTitle: 'Vector Databases',
  createTitle: 'Create Vector Database Server',
  backToListLabel: 'Back to vector database server list',
  backToDetailLabel: 'Back to Vector Database List',
  emptyHeadline: 'Create fully-managed vector databases (PostgreSQL)',
  emptyBody: 'No vector database services have been created yet.',
  serverNoun: 'vector database server',
  serviceTypes: VECTOR_SERVICE_TYPES,
};

export const MESSAGE_BROKER_KIND: DbServerKind = {
  isVector: false,
  variant: 'brokers',
  segment: 'message-brokers',
  listTitle: 'Message Brokers',
  createTitle: 'Create Message Broker',
  backToListLabel: 'Back to message broker list',
  backToDetailLabel: 'Back to Message Broker List',
  emptyHeadline: 'No message brokers yet',
  emptyBody: 'Create a managed Apache Kafka broker to publish and subscribe to event streams from your integrations.',
  serverNoun: 'message broker',
  requiresPaidPlan: true,
  serviceTypes: BROKER_SERVICE_TYPES,
};

/** Cloud providers in display order — DigitalOcean & GCP first (they carry the hobbyist plans). */
export const CLOUD_PROVIDERS: { id: CloudProvider; name: string; logo: string }[] = [
  { id: 'digitalocean', name: 'DigitalOcean', logo: `${CLOUD_LOGO_BASE}digitalocean.svg` },
  { id: 'gcp', name: 'GCP', logo: `${CLOUD_LOGO_BASE}gcp.svg` },
  { id: 'aws', name: 'AWS', logo: `${CLOUD_LOGO_BASE}aws.svg` },
  { id: 'azure', name: 'Azure', logo: `${CLOUD_LOGO_BASE}azure.svg` },
];

export const CLOUD_REGIONS: { id: CloudRegion; name: string }[] = [
  { id: 'us', name: 'United States' },
  { id: 'eu', name: 'Europe' },
  { id: 'africa', name: 'Africa' },
  { id: 'aus', name: 'Australia' },
];

const TYPE_LABELS: Record<ServiceType, string> = { postgres: 'PostgreSQL', mysql: 'MySQL', redis: 'Choreo Cache', kafka: 'Kafka' };
const PROVIDER_LABELS: Record<CloudProvider, string> = { aws: 'Amazon Web Services', azure: 'Microsoft Azure', gcp: 'Google Cloud Platform', digitalocean: 'Digital Ocean' };
const REGION_LABELS: Record<CloudRegion, string> = { us: 'United States', eu: 'Europe', aus: 'Australia', africa: 'Africa' };
const STATUS_LABELS: Record<ServerStatus, string> = {
  CREATING: 'Creating',
  ACTIVE: 'Active',
  POWERED_OFF: 'Powered Off',
  RESUMING: 'Resuming',
  DELETING: 'Deleting',
  DELETED: 'Deleted',
  ERROR: 'Error',
};

/** oxygen-ui Chip colors keyed by server status. */
export const STATUS_COLORS: Record<ServerStatus, 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  CREATING: 'info',
  ACTIVE: 'success',
  POWERED_OFF: 'warning',
  RESUMING: 'info',
  DELETING: 'warning',
  DELETED: 'error',
  ERROR: 'error',
};

export const serviceTypeLabel = (type: ServiceType): string => TYPE_LABELS[type] ?? 'Unknown';
export const providerLabel = (provider: CloudProvider): string => PROVIDER_LABELS[provider] ?? 'Unknown';
export const regionLabel = (region: CloudRegion): string => REGION_LABELS[region] ?? 'Unknown';
export const statusLabel = (status: ServerStatus): string => STATUS_LABELS[status] ?? 'Error';

/** Whether a server row is clickable — terminal/erroring servers have no detail page. */
export const isServerAccessible = (status: ServerStatus): boolean => !['ERROR', 'DELETED', 'DELETING'].includes(status);

/** Statuses where power/edit actions are disabled while the server transitions. */
export const TRANSITIONAL_STATUSES: ServerStatus[] = ['CREATING', 'RESUMING', 'DELETING'];

/** `DatabaseInfo.status` values (distinct from the server-level `ServerStatus`). */
export const DB_STATUS = { READY: 'READY', NOT_FOUND_IN_SERVER: 'NOT_FOUND_IN_SERVER' } as const;

// --- Detail-view option lists ---

/** Privilege levels selectable for a custom (non-super-admin) database credential. */
export const CREDENTIAL_PRIVILEGES = ['Read', 'Write', 'Admin'];

/** Placeholder shown for a super-admin credential's password (never the real value). */
export const MASKED_PASSWORD = '******************';

/** Line colors for the metric charts, one per node series. */
export const METRIC_CHART_COLORS = ['#4C82F7', '#2E9E83', '#8E44AD', '#F2994A', '#C0392B'];

/** Metric time-window options (maps to the `period` query param). */
export const METRIC_PERIODS: { value: MetricPeriod; label: string }[] = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

/** Log time-range filter options (the window paged back from "now"). */
export const LOG_TIME_RANGES: { label: string; minutes: number }[] = [
  { label: 'Past 10 minutes', minutes: 10 },
  { label: 'Past 1 hour', minutes: 60 },
  { label: 'Past 24 hours', minutes: 24 * 60 },
  { label: 'Past 7 days', minutes: 7 * 24 * 60 },
];

/** Maintenance-window day options (`value` is the API day key). */
export const MAINTENANCE_DAYS: { value: string; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

/** Hourly maintenance-window time options (`00:00` … `23:00`). */
export const MAINTENANCE_TIMES: string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/** Marketplace/credential filters for the Databases tab (OR-combined). */
export const DB_MARKETPLACE_FILTERS = ['Available in Marketplace', 'Not Available in Marketplace', 'Credentials Added', 'No Credentials'] as const;
export type DbMarketplaceFilter = (typeof DB_MARKETPLACE_FILTERS)[number];

/** Human label for a maintenance day key (e.g. `monday` → `Monday`). */
export const maintenanceDayLabel = (day: string): string => MAINTENANCE_DAYS.find((d) => d.value === day)?.label ?? day;
