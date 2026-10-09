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

import { describe, it, expect } from 'vitest';
import { toProjectInsightsData } from './projectInsights';
import type { ProjectComponentStat, ProjectInsightsRaw } from '../../types/insights';

const baseRaw = (over: Partial<ProjectInsightsRaw> = {}): ProjectInsightsRaw => ({
  totalRequests: 0,
  totalErrors: 0,
  totalTraffic: 0,
  totalTrafficErrors: 0,
  trend: [],
  activity: [],
  serviceActivity: [],
  eventActivity: [],
  automationActivity: [],
  serviceLatencyByKind: { api: 0, agent: 0, mcp: 0, webhook: 0 },
  autoDurationByKind: { auto: { avgMs: 0, p95Ms: 0 }, rag: { avgMs: 0, p95Ms: 0 } },
  components: [],
  taskStats: null,
  ...over,
});

const stat = (over: Partial<ProjectComponentStat> & Pick<ProjectComponentStat, 'id' | 'type'>): ProjectComponentStat => ({
  name: over.id!,
  handler: over.id!,
  requestCount: 0,
  errorCount: 0,
  errorRate: 0,
  latency: 0,
  ...over,
});

describe('toProjectInsightsData', () => {
  it('counts active integrations and builds the type mix, excluding deleted', () => {
    const data = toProjectInsightsData(baseRaw({ components: [stat({ id: 'a', type: 'api' }), stat({ id: 'b', type: 'auto', latency: null }), stat({ id: 'd', type: 'api', deleted: true })] }));
    const active = data.kpis.find((k) => k.key === 'activeIntegrations')!;
    expect(active.value).toBe('2');
    expect(active.typeMix).toEqual([
      { kind: 'api', count: 1 },
      { kind: 'auto', count: 1 },
    ]);
  });

  it('sorts top-by-volume descending and computes share', () => {
    const vol = toProjectInsightsData(baseRaw({ components: [stat({ id: 'a', type: 'api', requestCount: 75 }), stat({ id: 'b', type: 'api', requestCount: 25 })] })).topByVolume;
    expect(vol.map((v) => v.id)).toEqual(['a', 'b']);
    expect(vol[0].share).toBe(75);
  });

  it('ranks failing integrations by error rate and drops error-free ones', () => {
    const failing = toProjectInsightsData(
      baseRaw({ components: [stat({ id: 'a', type: 'api', requestCount: 100, errorCount: 10, errorRate: 10 }), stat({ id: 'b', type: 'api', requestCount: 100, errorCount: 40, errorRate: 40 }), stat({ id: 'c', type: 'api', requestCount: 100 })] }),
    ).topFailing;
    expect(failing.map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('always emits the automation, RAG, and four service latency rows', () => {
    const rows = toProjectInsightsData(baseRaw({ components: [stat({ id: 'a', type: 'api' })] })).latencyRows;
    expect(rows.map((r) => r.key)).toEqual(['automations', 'rag', 'api', 'agent', 'mcp', 'webhook']);
  });
});
