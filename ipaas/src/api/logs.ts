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
 * Cloud runtime-log API. Queries the wso2cloud observability proxy directly
 * (POST {observabilityUrl}/wso2cloud-obs/api/v1/logs/query). The devant
 * logsApiUrl argument is ignored — it is a Choreo system-API URL that does
 * not exist in the cloud deployment; the proxy base comes from config.
 *
 * In cloud, project / component / environment ids are the OpenChoreo K8s
 * resource names, so request ids map straight onto the proxy search scope.
 */

import { bff, items, obsClient, seg, type ListResponse } from './_client';
import { gatewayRequestLevel, parseAccessLine } from '../utils/gatewayLogs';
import type { LogsRequest, ComponentLogsRequest, GatewayLogsPage, GatewayLogsRequest, LogRow } from '../types/logs';

const LOGS_QUERY_PATH = '/wso2cloud-obs/api/v1/logs/query';

// Scope fields are independent label filters — any subset narrows the query
// (e.g. build logs filter on workflowRunName alone).
export interface ObsLogsScope {
  project?: string;
  component?: string;
  environment?: string;
  workflowRunName?: string;
}

// The proxy's logLevels filter matches a level parsed out of the log line, not
// the level the response carries — unlabelled stdout comes back as INFO yet
// matches no level. Any value for it therefore hides plain container output,
// which for a cron task is its entire output. Level filtering belongs on the
// returned rows, matched against the level actually displayed, so this query
// deliberately cannot narrow by level.
export interface ObsLogsQuery {
  searchScope: ObsLogsScope;
  startTime: string;
  endTime: string;
  limit: number;
  sortOrder: 'asc' | 'desc';
  searchPhrase: string;
}

// Kubernetes provenance the observer attaches to every component log entry.
// podName is the only handle on which workload produced a line: the log search
// scope stops at component + environment, so anything finer — a single cron
// run, say — has to be resolved from here.
export interface ObsLogMetadata {
  componentName?: string;
  projectName?: string;
  environmentName?: string;
  namespaceName?: string;
  componentUid?: string;
  projectUid?: string;
  environmentUid?: string;
  containerName?: string;
  podName?: string;
  podNamespace?: string;
}

// Proxy log entry: timestamp/level/log, the nested Kubernetes metadata block,
// plus whatever extended metadata fields the ingestion pipeline attached (same
// names as LogRow).
export interface ObsLogEntry extends Partial<Omit<LogRow, 'timestamp' | 'level' | 'logLine' | 'componentName' | 'containerName' | 'podName'>> {
  timestamp?: string;
  level?: string;
  log?: string;
  metadata?: ObsLogMetadata;
}

// LogRow has non-optional metadata fields the proxy may omit; fill explicit
// null/'' defaults so consumers can read them unconditionally.
const toLogRow = (e: ObsLogEntry): LogRow => ({
  timestamp: e.timestamp ?? '',
  level: e.level ?? '',
  logLine: e.log ?? '',
  class: e.class ?? null,
  logFilePath: e.logFilePath ?? null,
  appName: e.appName ?? null,
  module: e.module ?? null,
  serviceType: e.serviceType ?? null,
  app: e.app ?? null,
  deployment: e.deployment ?? null,
  artifactContainer: e.artifactContainer ?? null,
  product: e.product ?? null,
  icpRuntimeId: e.icpRuntimeId ?? null,
  logContext: e.logContext ?? null,
  componentVersion: e.componentVersion ?? '',
  componentVersionId: e.componentVersionId ?? '',
  gatewayCode: e.gatewayCode ?? null,
  statusCode: e.statusCode ?? null,
  // Provenance lives only in the nested metadata block; there is no top-level copy.
  componentName: e.metadata?.componentName ?? null,
  containerName: e.metadata?.containerName ?? null,
  podName: e.metadata?.podName ?? null,
  environment: e.metadata?.environmentName ?? null,
});

// Raw entries, metadata intact. LogRow keeps only a flattened subset of the
// Kubernetes block, so callers needing the whole of it read the query here.
export async function queryObsLogEntries(query: ObsLogsQuery): Promise<ObsLogEntry[]> {
  const json = await obsClient.post<{ logs?: ObsLogEntry[] }>(LOGS_QUERY_PATH, query);
  return json?.logs ?? [];
}

export async function queryObsLogs(query: ObsLogsQuery): Promise<LogRow[]> {
  const entries = await queryObsLogEntries(query);
  return entries.map(toLogRow);
}

// Component-scoped log queries must carry the owning project, but the console
// addresses components by id alone. The BFF surfaces the project as WorkflowRun
// metadata (build.projectName), so resolve it from the component's latest build
// and memoize — runtime logs poll on an interval and the value is stable per
// component.
const projectByComponent = new Map<string, Promise<string | undefined>>();

export async function resolveComponentProject(componentId: string): Promise<string | undefined> {
  let pending = projectByComponent.get(componentId);
  if (!pending) {
    pending = bff
      .get<ListResponse<{ projectName?: string }>>(`/components/${seg(componentId)}/builds`)
      .then((r) => items(r)[0]?.projectName)
      .catch(() => undefined);
    projectByComponent.set(componentId, pending);
  }
  const project = await pending;
  // Don't cache an empty result — let a later call retry once builds exist.
  if (!project) projectByComponent.delete(componentId);
  return project;
}

export function fetchLogs(req: LogsRequest, _logsApiUrl: string): Promise<LogRow[]> {
  // A single entry means a specific integration was selected; multiple entries
  // mean "all in project", which the project scope already covers.
  const selectedComponent = req.componentIdList.length === 1 ? req.componentIdList[0] : undefined;
  return queryObsLogs({
    searchScope: {
      project: req.projectId,
      ...(selectedComponent ? { component: selectedComponent } : {}),
      environment: req.environmentId.toLowerCase(),
    },
    startTime: req.startTime,
    endTime: req.endTime,
    limit: req.limit,
    sortOrder: req.sort,
    searchPhrase: req.searchPhrase,
  });
}

export async function fetchComponentLogs(req: ComponentLogsRequest, _logsApiUrl: string): Promise<LogRow[]> {
  const project = await resolveComponentProject(req.componentId);
  if (!project) return [];
  return queryObsLogs({
    searchScope: { project, component: req.componentId, ...(req.environmentId ? { environment: req.environmentId.toLowerCase() } : {}) },
    startTime: req.startTime,
    endTime: req.endTime,
    limit: req.limit,
    sortOrder: req.sort,
    searchPhrase: req.searchPhrase,
  });
}

// The log query cannot select the gateway, so a row's container is the only proof it came from one.
const isGatewayContainer = (containerName: string | undefined): boolean => containerName?.startsWith('gateway-') === true;

/** Scoped by the caller's token alone: gateway pods carry no project or component to narrow by. */
export async function fetchGatewayLogs(req: GatewayLogsRequest): Promise<GatewayLogsPage> {
  const entries = await queryObsLogEntries({
    // environment omitted rather than empty: the Observer resolves the name and rejects a miss.
    searchScope: req.environmentId ? { environment: req.environmentId.toLowerCase() } : {},
    startTime: req.startTime,
    endTime: req.endTime,
    limit: req.limit,
    sortOrder: req.sort,
    searchPhrase: req.searchPhrase,
  });
  const rows = entries
    .filter((entry) => isGatewayContainer(entry.metadata?.containerName))
    .map((entry) => {
      const row = toLogRow(entry);
      const request = parseAccessLine(row.logLine);
      return { ...row, source: 'gateway' as const, request, level: gatewayRequestLevel(request, row.level) };
    });
  if (entries.length < req.limit) return { rows };
  // A full page is only continued from its last timestamp; without one the rest would be skipped silently.
  const nextCursor = entries[entries.length - 1]?.timestamp;
  if (!nextCursor) throw new Error('Gateway log page ended on an entry with no timestamp, so older lines cannot be reached.');
  return { rows, nextCursor };
}
