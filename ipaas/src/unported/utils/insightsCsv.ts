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

import type { ApiTrendPoint, AutomationTrendPoint, ProjectTrendPoint } from '../../types/insights';

/** Quote a single CSV cell, escaping embedded quotes (RFC-4180 style). String
 * values starting with a formula trigger (= + - @ tab CR) get a leading
 * apostrophe so spreadsheets treat them as text rather than executable
 * formulas; numeric values pass through unchanged. */
export function escapeCsvCell(v: unknown): string {
  const s = String(v ?? '');
  const guarded = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/** Join rows into a CSV string. Each inner array is a row; an empty array is a blank line. */
export function toCsv(lines: unknown[][]): string {
  return lines.map((cells) => cells.map(escapeCsvCell).join(',')).join('\r\n');
}

/** Trigger a browser download of `csv` as `filename` via a transient blob URL. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** One integration row for the project report. `typeLabel` is resolved by the
 * caller (which owns the kind→label constant) so this util stays UI-free. */
export interface ProjectInsightsReportRow {
  name: string;
  typeLabel: string;
  successCount: string;
  errorCount: string;
  latency: string;
  last: string;
  status: string;
}

interface ProjectInsightsReport {
  kpis: { label: string; value: string }[];
  trend: ProjectTrendPoint[];
  integrations: ProjectInsightsReportRow[];
}

export function downloadProjectInsightsCsv(projectName: string, envName: string, range: string, data: ProjectInsightsReport): void {
  const lines: unknown[][] = [
    ['Project Insights Report'],
    ['Project', projectName],
    ['Environment', envName],
    ['Period', range],
    ['Generated', new Date().toISOString()],
    [],
    ['KPI', 'Value'],
    ...data.kpis.map((k) => [k.label, k.value]),
    [],
    ['Bucket', 'API Requests', 'API Errors', 'Automation Runs', 'Automation Failures'],
    ...data.trend.map((p) => [p.label, p.apiRequests, p.errors, p.automationRuns, p.automationErrors]),
    [],
    ['Integration', 'Type', 'Success Count', 'Error Count', 'Avg Latency', 'Last Run', 'Status'],
    ...data.integrations.map((r) => [r.name, r.typeLabel, r.successCount, r.errorCount, r.latency, r.last, r.status]),
  ];
  const filename = `insights-${projectName}-${envName}-${range}.csv`.replace(/\s+/g, '-').toLowerCase();
  downloadCsv(filename, toCsv(lines));
}

interface IntegrationCsvMeta {
  integrationName: string;
  typeLabel: string;
  handler: string;
  envName: string;
  range: string;
}

function integrationReportHeader(meta: IntegrationCsvMeta, kpis: { label: string; value: string }[]): unknown[][] {
  return [
    ['Integration Insights Report'],
    ['Integration', meta.integrationName],
    ['Type', meta.typeLabel],
    ['Environment', meta.envName],
    ['Period', meta.range],
    ['Generated', new Date().toISOString()],
    [],
    ['KPI', 'Value'],
    ...kpis.map((k) => [k.label, k.value]),
    [],
  ];
}

function integrationFilename(meta: IntegrationCsvMeta): string {
  return `insights-${meta.handler || 'integration'}-${meta.envName || 'env'}-${meta.range}.csv`.replace(/\s+/g, '-').toLowerCase();
}

export function downloadApiInsightsCsv(meta: IntegrationCsvMeta, data: { kpis: { label: string; value: string }[]; trend: ApiTrendPoint[] }): void {
  const lines: unknown[][] = [...integrationReportHeader(meta, data.kpis), ['Bucket', 'Requests', 'Errors', 'Latency (ms)'], ...data.trend.map((p) => [p.label, p.requests, p.errors, p.latency ?? ''])];
  downloadCsv(integrationFilename(meta), toCsv(lines));
}

export function downloadAutomationInsightsCsv(meta: IntegrationCsvMeta, data: { kpis: { label: string; value: string }[]; trend: AutomationTrendPoint[] }): void {
  const lines: unknown[][] = [...integrationReportHeader(meta, data.kpis), ['Bucket', 'Success', 'Failed', 'Timeout'], ...data.trend.map((p) => [p.label, p.success, p.failure, p.timeout])];
  downloadCsv(integrationFilename(meta), toCsv(lines));
}

export function downloadOrgInsightsCsv(orgName: string, envName: string, range: string, data: { kpis: { label: string; value: string }[]; trend: { label: string; apiRequests: number; errors: number }[] }): void {
  const lines: unknown[][] = [
    ['Organization Usage Insights Report'],
    ['Organization', orgName],
    ['Environment', envName],
    ['Range', range],
    ['Generated', new Date().toISOString()],
    [],
    ['KPI', 'Value'],
    ...data.kpis.map((k) => [k.label, k.value]),
    [],
    ['Date', 'API Requests', 'Errors'],
    ...data.trend.map((p) => [p.label, p.apiRequests, p.errors]),
  ];
  const filename = `org-insights-${orgName}-${range}.csv`.replace(/\s+/g, '-').toLowerCase();
  downloadCsv(filename, toCsv(lines));
}
