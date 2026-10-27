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
import { deriveProviders, deriveRegions, envLabel, isPlanAvailableInRegion, isValidCidr, logOffsetNs, matchesDatabaseFilter, metricsToChart, metricTitle, planRegionSpec, plansForProviderRegion, toCreateError } from './platformServices';
import type { DatabaseInfo, MetricSeries, ServicePlan } from '../types/platformServices';
import type { EnvTemplate } from '../types/deploymentPipeline';

const region = (cloud_provider: ServicePlan['regions'][number]['cloud_provider'], cloud_region: ServicePlan['regions'][number]['cloud_region'], extra: Partial<ServicePlan['regions'][number]> = {}) => ({
  cloud_provider,
  cloud_region,
  node_cpu_count: 1,
  node_ram_gb: 1,
  storage_gb: 8,
  monthly_price_usd: '11.68',
  hourly_price_usd: '0.02',
  ...extra,
});

const hobbyist: ServicePlan = {
  id: 'hobbyist',
  name: 'Hobbyist',
  description: 'Hobbyist plan',
  type: 'postgres',
  node_count: 1,
  backup_retention_days: 0,
  backup_interval_hours: 24,
  free_trial_available: true,
  regions: [region('digitalocean', 'eu'), region('digitalocean', 'us'), region('gcp', 'eu')],
};

const startup: ServicePlan = {
  id: 'startup',
  name: 'Startup 4',
  description: 'Startup plan',
  type: 'postgres',
  node_count: 1,
  backup_retention_days: 3,
  backup_interval_hours: 24,
  free_trial_available: false,
  regions: [region('aws', 'us', { hourly_price_usd: '0.14' }), region('digitalocean', 'eu', { hourly_price_usd: '0.10' })],
};

describe('deriveProviders', () => {
  it('returns offered providers in canonical display order (digitalocean, gcp, aws)', () => {
    expect(deriveProviders([hobbyist, startup])).toEqual(['digitalocean', 'gcp', 'aws']);
  });

  it('returns an empty list when no plans are given', () => {
    expect(deriveProviders([])).toEqual([]);
  });
});

describe('deriveRegions', () => {
  it('returns offered regions in canonical order (us before eu)', () => {
    expect(deriveRegions([hobbyist, startup])).toEqual(['us', 'eu']);
  });
});

describe('isPlanAvailableInRegion', () => {
  it('is true only for an offered provider+region pair', () => {
    expect(isPlanAvailableInRegion(hobbyist, 'digitalocean', 'eu')).toBe(true);
    expect(isPlanAvailableInRegion(hobbyist, 'digitalocean', 'aus')).toBe(false);
    expect(isPlanAvailableInRegion(hobbyist, 'aws', 'eu')).toBe(false);
  });
});

describe('plansForProviderRegion', () => {
  it('keeps only plans offered for the selected provider+region', () => {
    expect(plansForProviderRegion([hobbyist, startup], 'digitalocean', 'eu').map((p) => p.id)).toEqual(['hobbyist', 'startup']);
    expect(plansForProviderRegion([hobbyist, startup], 'aws', 'us').map((p) => p.id)).toEqual(['startup']);
    expect(plansForProviderRegion([hobbyist, startup], 'gcp', 'us')).toEqual([]);
  });
});

describe('planRegionSpec', () => {
  it('returns the provider+region-specific spec/pricing row', () => {
    expect(planRegionSpec(startup, 'aws', 'us')?.hourly_price_usd).toBe('0.14');
    expect(planRegionSpec(startup, 'digitalocean', 'eu')?.hourly_price_usd).toBe('0.10');
  });

  it('returns undefined for an unavailable combination', () => {
    expect(planRegionSpec(hobbyist, 'aws', 'us')).toBeUndefined();
  });
});

describe('metricTitle', () => {
  it('maps known metric keys and prettifies unknown ones', () => {
    expect(metricTitle('cpu_usage')).toBe('CPU Usage (%)');
    expect(metricTitle('some_new_metric')).toBe('Some New Metric');
  });
});

describe('metricsToChart', () => {
  it('splits the time column out and builds one line per node column', () => {
    const series: MetricSeries = {
      data: {
        cols: [
          { label: 'time', type: 'date' },
          { label: 'node-1 (master)', type: 'number' },
        ],
        rows: [
          { date: '2026-07-06T11:00:30Z', values: [95.4] },
          { date: '2026-07-06T11:01:00Z', values: [27.2] },
        ],
      },
    };
    const chart = metricsToChart(series);
    expect(chart.lines).toEqual([{ dataKey: 'node-1 (master)', name: 'node-1 (master)' }]);
    expect(chart.data).toHaveLength(2);
    expect(chart.data[0]['node-1 (master)']).toBe(95.4);
    expect(typeof chart.data[0].time).toBe('string');
  });

  it('is safe on empty/missing data', () => {
    expect(metricsToChart({ data: { cols: [], rows: [] } })).toEqual({ data: [], lines: [] });
  });
});

describe('envLabel', () => {
  const envs = [{ id: 'e1', env_name: 'Production', region: 'US' }] as EnvTemplate[];
  it('formats a known environment', () => {
    expect(envLabel(envs, 'e1')).toBe('Production ( US )');
  });
  it('falls back to the raw id when unknown', () => {
    expect(envLabel(envs, 'missing')).toBe('missing');
  });
});

describe('logOffsetNs', () => {
  it('appends six zeros to convert ms → ns without precision loss', () => {
    expect(logOffsetNs(1783401839011)).toBe('1783401839011000000');
  });
});

describe('matchesDatabaseFilter', () => {
  const db = (display_on_marketplace: boolean): DatabaseInfo => ({ name: 'db', status: 'READY', display_on_marketplace });
  it('matches marketplace availability', () => {
    expect(matchesDatabaseFilter(db(true), 0, ['Available in Marketplace'])).toBe(true);
    expect(matchesDatabaseFilter(db(false), 0, ['Available in Marketplace'])).toBe(false);
    expect(matchesDatabaseFilter(db(false), 0, ['Not Available in Marketplace'])).toBe(true);
  });
  it('matches credential presence', () => {
    expect(matchesDatabaseFilter(db(false), 2, ['Credentials Added'])).toBe(true);
    expect(matchesDatabaseFilter(db(false), 0, ['Credentials Added'])).toBe(false);
    expect(matchesDatabaseFilter(db(false), 0, ['No Credentials'])).toBe(true);
  });
  it('OR-combines selected filters and excludes when none match', () => {
    expect(matchesDatabaseFilter(db(true), 0, ['Available in Marketplace', 'No Credentials'])).toBe(true);
    expect(matchesDatabaseFilter(db(false), 1, ['Available in Marketplace', 'No Credentials'])).toBe(false);
  });
});

describe('isValidCidr', () => {
  it('accepts valid IPv4 CIDR blocks', () => {
    expect(isValidCidr('10.0.0.0/24')).toBe(true);
    expect(isValidCidr('192.168.1.1/32')).toBe(true);
    expect(isValidCidr(' 0.0.0.0/0 ')).toBe(true);
  });
  it('rejects malformed or out-of-range values', () => {
    expect(isValidCidr('10.0.0.0')).toBe(false);
    expect(isValidCidr('256.0.0.0/24')).toBe(false);
    expect(isValidCidr('10.0.0.0/33')).toBe(false);
    expect(isValidCidr('not-a-cidr')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });
});

describe('toCreateError', () => {
  it('flags entitlement failures with an upgrade action', () => {
    expect(toCreateError(new Error('... FREE_TRIAL_EXPIRED ...'))).toMatchObject({ title: 'Upgrade required', upgrade: true });
    expect(toCreateError(new Error('FREE_SUB_MAX_COUNT_EXCEEDED')).upgrade).toBe(true);
  });
  it('recognises rate-limit and name-conflict errors', () => {
    expect(toCreateError(new Error('RATE_LIMIT')).title).toBe('Too many requests');
    expect(toCreateError(new Error('HTTP 409')).title).toBe('Name already in use');
  });
  it('falls back to a generic message and never sets upgrade', () => {
    const generic = toCreateError('boom');
    expect(generic.title).toBe("Couldn't create database server");
    expect(generic.upgrade).toBeUndefined();
  });
});
