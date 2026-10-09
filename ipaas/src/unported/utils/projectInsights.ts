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

import { formatCount as fmt, formatDuration, formatLatencyMs } from './insightsFormat';
import { ACTIVITY_SERIES, INSIGHTS_KIND_DESC, KIND_DOT, UNIT_BY_KIND } from '../../constants/insights';
import type { InsightsApiRef, InsightsAutomationRef, ProjectComponentStat, ProjectFailingRow, ProjectInsightsData, ProjectInsightsRaw, ProjectLatencyRow, ProjectVolumeRow } from '../../types/insights';

const TYPE_MIX_KINDS = ['api', 'auto', 'rag', 'agent', 'mcp', 'webhook', 'event', 'file'] as const;

/** Zeroed raw aggregate that still lists every known integration as a placeholder
 * row, so the table isn't empty before the live query resolves. */
export function emptyProjectInsightsRaw(apis: InsightsApiRef[], automations: InsightsAutomationRef[], eventApis: InsightsApiRef[]): ProjectInsightsRaw {
  return {
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
    components: [
      ...apis.map((a): ProjectComponentStat => ({ id: a.id, name: a.name, handler: a.handler, type: a.kind, requestCount: 0, errorCount: 0, errorRate: 0, latency: 0 })),
      ...automations.map((a): ProjectComponentStat => ({ id: a.id, name: a.name, handler: a.handler, type: a.kind, requestCount: null, errorCount: null, errorRate: null, latency: null })),
      ...eventApis.map((a): ProjectComponentStat => ({ id: a.id, name: a.name, handler: a.handler, type: a.kind, requestCount: 0, errorCount: 0, errorRate: 0, latency: 0 })),
    ],
    taskStats: null,
  };
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

function buildTopByVolume(active: ProjectComponentStat[]): ProjectVolumeRow[] {
  const total = active.reduce((s, c) => s + (c.requestCount ?? 0), 0);
  return active
    .slice()
    .sort((a, b) => (b.requestCount ?? 0) - (a.requestCount ?? 0))
    .map((c) => ({ id: c.id, name: c.name, handler: c.handler, type: c.type, volume: fmt(c.requestCount ?? 0), unit: UNIT_BY_KIND[c.type], share: pct(c.requestCount ?? 0, total), color: KIND_DOT[c.type] }));
}

function buildTopFailing(active: ProjectComponentStat[]): ProjectFailingRow[] {
  return active
    .filter((c) => (c.errorCount ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, handler: c.handler, type: c.type, unit: UNIT_BY_KIND[c.type], errorRate: c.errorRate != null ? c.errorRate : pct(c.errorCount ?? 0, c.requestCount ?? 0), errorCount: fmt(c.errorCount ?? 0) }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 3);
}

// Latency & duration service sub-types, always shown in this order regardless of
// whether the project currently has an active integration of that type. Event /
// File integrations are intentionally excluded.
const SERVICE_LATENCY_SUBTYPES: { key: 'api' | 'agent' | 'mcp' | 'webhook'; label: string }[] = [
  { key: 'api', label: 'Integration as API' },
  { key: 'agent', label: 'AI Agents' },
  { key: 'mcp', label: 'MCP Servers' },
  { key: 'webhook', label: 'Webhooks' },
];

function buildLatencyRows(raw: ProjectInsightsRaw): ProjectLatencyRow[] {
  const rows: ProjectLatencyRow[] = [
    {
      key: 'automations',
      label: 'Automations',
      sub: 'Execution duration',
      color: KIND_DOT.auto,
      metrics: [
        { label: 'Avg', value: formatDuration(raw.autoDurationByKind.auto.avgMs / 1000) },
        { label: 'P95', value: formatDuration(raw.autoDurationByKind.auto.p95Ms / 1000) },
      ],
    },
    {
      key: 'rag',
      label: 'RAG Ingestions',
      sub: 'Execution duration',
      color: KIND_DOT.rag,
      metrics: [
        { label: 'Avg', value: formatDuration(raw.autoDurationByKind.rag.avgMs / 1000) },
        { label: 'P95', value: formatDuration(raw.autoDurationByKind.rag.p95Ms / 1000) },
      ],
    },
  ];
  SERVICE_LATENCY_SUBTYPES.forEach((t) => {
    rows.push({
      key: t.key,
      label: t.label,
      sub: 'Response time',
      color: KIND_DOT[t.key],
      metrics: [{ label: 'Avg latency', value: formatLatencyMs(raw.serviceLatencyByKind[t.key]) }],
    });
  });
  return rows;
}

/** Shape the raw project aggregate into the display model the Insights page renders. */
export function toProjectInsightsData(raw: ProjectInsightsRaw): ProjectInsightsData {
  const stats = raw.taskStats;
  const active = raw.components.filter((c) => !c.deleted);
  const okCount = Math.max(0, raw.totalRequests - raw.totalErrors) + (stats?.successfulJobs ?? 0);
  const failCount = raw.totalErrors + (stats?.failedJobs ?? 0);
  const timeoutCount = stats?.timeoutJobs ?? 0;
  const successRate = pct(okCount, okCount + failCount + timeoutCount);

  return {
    kpis: [
      { key: 'activeIntegrations', label: 'Active Integrations', value: String(active.length), sub: '', typeMix: TYPE_MIX_KINDS.map((k) => ({ kind: k, count: active.filter((c) => c.type === k).length })).filter((t) => t.count > 0) },
      { key: 'totalInvocations', label: 'Total Invocations', value: fmt(raw.totalTraffic + (stats?.totalExecutions ?? 0)), sub: 'Across all integrations' },
      { key: 'successRate', label: 'Success Rate', value: `${successRate.toFixed(1)}%`, sub: 'Across all integrations' },
      { key: 'errors', label: 'Errors', value: fmt(failCount + timeoutCount), sub: 'Across all integrations', danger: true },
    ],
    trend: raw.trend.map((p) => ({ label: p.label, apiRequests: p.apiRequests, automationRuns: p.automationRuns, automationErrors: p.automationErrors, errors: p.errors })),
    // One merged chart carrying every integration type's per-bucket count. The
    // four raw activity series (service / event / automation sub-splits + the
    // agent aggregate) are all bucket-aligned, so index i lines up across them.
    activityChart: {
      series: ACTIVITY_SERIES,
      points: raw.activity.map((p, i) => ({
        label: p.label,
        api: raw.serviceActivity[i]?.api ?? 0,
        mcp: raw.serviceActivity[i]?.mcp ?? 0,
        webhook: raw.serviceActivity[i]?.webhook ?? 0,
        agent: p.agents,
        event: raw.eventActivity[i]?.event ?? 0,
        file: raw.eventActivity[i]?.file ?? 0,
        auto: raw.automationActivity[i]?.auto ?? 0,
        rag: raw.automationActivity[i]?.rag ?? 0,
      })),
    },
    topByVolume: buildTopByVolume(active),
    topFailing: buildTopFailing(active),
    latencyRows: buildLatencyRows(raw),
    integrations: raw.components.map((c) => ({
      id: c.id,
      name: c.name,
      handler: c.handler,
      desc: c.deleted ? 'Deleted integration' : INSIGHTS_KIND_DESC[c.type],
      type: c.type,
      successCount: c.requestCount != null ? fmt(Math.max(0, (c.requestCount ?? 0) - (c.errorCount ?? 0))) : '—',
      errorCount: c.errorCount != null ? fmt(c.errorCount) : '—',
      latency: c.latency != null ? `${c.latency} ms` : '—',
      last: c.last ?? '—',
      deleted: c.deleted,
    })),
  };
}
