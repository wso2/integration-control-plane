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
 * Pure transforms backing the create-database wizard: derive which cloud providers
 * and regions are offered from the service-plan list, and filter plans by the
 * selected provider+region. No React, no I/O. Mirrors Devant's convertPlatformSvcPlans.
 */

import { CLOUD_PROVIDERS, CLOUD_REGIONS, type DbMarketplaceFilter } from '../constants/platformServices';
import type { CloudProvider, CloudRegion, CreateError, CredentialFormValues, CredentialPayload, DatabaseInfo, MetricSeries, ServicePlan, ServicePlanRegion } from '../types/platformServices';
import type { EnvTemplate } from '../types/deploymentPipeline';

/** Providers offered across all plans, in the canonical display order. */
export function deriveProviders(plans: ServicePlan[]): CloudProvider[] {
  const offered = new Set<CloudProvider>();
  plans.forEach((plan) => plan.regions?.forEach((r) => offered.add(r.cloud_provider)));
  return CLOUD_PROVIDERS.filter((p) => offered.has(p.id)).map((p) => p.id);
}

/** Regions offered across all plans, in the canonical display order. */
export function deriveRegions(plans: ServicePlan[]): CloudRegion[] {
  const offered = new Set<CloudRegion>();
  plans.forEach((plan) => plan.regions?.forEach((r) => offered.add(r.cloud_region)));
  return CLOUD_REGIONS.filter((r) => offered.has(r.id)).map((r) => r.id);
}

/** Does the plan offer this exact provider+region combination? */
export function isPlanAvailableInRegion(plan: ServicePlan, provider: CloudProvider, region: CloudRegion): boolean {
  return !!plan.regions?.some((r) => r.cloud_provider === provider && r.cloud_region === region);
}

/** Plans available for the selected provider+region. */
export function plansForProviderRegion(plans: ServicePlan[], provider: CloudProvider, region: CloudRegion): ServicePlan[] {
  return plans.filter((plan) => isPlanAvailableInRegion(plan, provider, region));
}

/** The provider+region-specific spec/pricing row for a plan, if the combination exists. */
export function planRegionSpec(plan: ServicePlan, provider: CloudProvider, region: CloudRegion): ServicePlanRegion | undefined {
  return plan.regions?.find((r) => r.cloud_provider === provider && r.cloud_region === region);
}

/** Human title for a metric key returned by the metrics endpoint (fallback: prettified key). */
export const METRIC_TITLES: Record<string, string> = {
  cpu_usage: 'CPU Usage (%)',
  mem_usage: 'Memory Usage (%)',
  mem_available: 'Memory Available (%)',
  disk_usage: 'Disk Usage (%)',
  load_average: 'Load Average',
  diskio_read: 'Disk Read (bytes/s)',
  diskio_writes: 'Disk Write (bytes/s)',
  net_receive: 'Network Received (bytes/s)',
  net_send: 'Network Sent (bytes/s)',
};

export function metricTitle(key: string): string {
  return METRIC_TITLES[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface MetricChart {
  /** One row per time point: `{ time, [seriesName]: value }` — the recharts data shape. */
  data: Record<string, string | number | null>[];
  /** One line per node column (cols after the leading time column). */
  lines: { dataKey: string; name: string }[];
}

/**
 * Convert a metric's Google-Charts-style `{cols, rows}` datatable into the recharts
 * `LineChart` shape: `data` rows keyed by series name + a `time` label, and one line
 * per node column. The first column is always the time axis.
 */
export function metricsToChart(series: MetricSeries): MetricChart {
  const cols = series?.data?.cols ?? [];
  const rows = series?.data?.rows ?? [];
  const seriesCols = cols.slice(1); // drop the leading time column
  const lines = seriesCols.map((c) => ({ dataKey: c.label, name: c.label }));
  const data = rows.map((r) => {
    const point: Record<string, string | number | null> = { time: formatMetricTime(r.date) };
    seriesCols.forEach((c, i) => {
      point[c.label] = r.values[i] ?? null;
    });
    return point;
  });
  return { data, lines };
}

/** Short axis label for a metric timestamp (HH:MM). */
export function formatMetricTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Full local date-time for a log/backup timestamp (falls back to the raw string). */
export function formatServerDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/** Display label for an environment id: `env_name ( region )`, or the raw id if unknown. */
export function envLabel(environments: EnvTemplate[], id: string): string {
  const env = environments.find((e) => e.id === id);
  return env ? `${env.env_name} ( ${env.region} )` : id;
}

/** Milliseconds → the logs endpoint's nanosecond cursor (string, no precision loss). */
export function logOffsetNs(ms: number): string {
  return `${ms}000000`;
}

/** Validate an IPv4 CIDR block (e.g. `10.0.0.0/24`). */
export function isValidCidr(value: string): boolean {
  const match = value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  const prefix = Number(match[5]);
  return octets.every((o) => o <= 255) && prefix <= 32;
}

/** Map a thrown create-server error to a titled, user-facing message (recognising entitlement codes). */
export function toCreateError(err: unknown, serverNoun = 'database server'): CreateError {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('FREE_TRIAL_EXPIRED') || raw.includes('FREE_SUB_MAX_COUNT_EXCEEDED')) {
    return { title: 'Upgrade required', message: `Please upgrade your WSO2 Integration Platform subscription to create more ${serverNoun}s.`, upgrade: true };
  }
  if (raw.includes('RATE_LIMIT')) {
    return { title: 'Too many requests', message: 'Please retry after some time. If the issue persists, contact support.' };
  }
  if (raw.includes('HTTP 409')) {
    return { title: 'Name already in use', message: `A ${serverNoun} with this name already exists. Choose a different service name.` };
  }
  return { title: `Couldn't create ${serverNoun}`, message: `Something went wrong while provisioning the ${serverNoun}. Please try again.` };
}

/** OR-combine the selected Databases-tab marketplace/credential filters. */
export function matchesDatabaseFilter(db: DatabaseInfo, credentialCount: number, selected: DbMarketplaceFilter[]): boolean {
  return selected.some((filter) => {
    if (filter === 'Available in Marketplace') return db.display_on_marketplace;
    if (filter === 'Not Available in Marketplace') return !db.display_on_marketplace;
    if (filter === 'Credentials Added') return credentialCount > 0;
    return credentialCount === 0;
  });
}

/** Human-readable byte size (e.g. 33792215 → "32.2 MB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Flatten the credential form into the API request body. A super-admin credential
 * carries only the display name + environments; a custom one adds username/password/privileges.
 */
export function buildCredentialPayload(dbName: string, form: CredentialFormValues): CredentialPayload {
  if (form.isSuperAdmin) {
    return { database: dbName, display_name: form.displayName.trim(), is_super_admin: true, applicable_environments: form.environments };
  }
  return {
    database: dbName,
    username: form.username.trim(),
    password: form.password,
    display_name: form.displayName.trim(),
    privilege_levels: form.privileges,
    applicable_environments: form.environments,
  };
}
