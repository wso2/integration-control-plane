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

import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { instanceCountQueryOptions, pendingReviewCountQueryOptions, pendingTaskCountQueryOptions, pendingWorkItemCountQueryOptions, totalPendingTaskCountQueryOptions, valueOf, type CappedCount, type PendingReviewCount } from '../../api/workflows';

// Figures shared by the project tables and the integration overview; one bounded request per integration per metric.

interface StatsScope {
  componentId: string;
  environmentId: string;
}

// One integration's numbers. `undefined` is still loading; a metric that failed to load is `null`.
export interface IntegrationStats {
  running?: CappedCount | null;
  suspended?: CappedCount | null;
  failed?: CappedCount | null;
  completed?: CappedCount | null;
  reviews?: PendingReviewCount | null;
  // Pending human tasks across all roles, not just the caller's.
  tasks?: number | null;
  myTasks?: number | null;
  // Per-definition only: `tasks` came from a page that filled, so the real number is at least that.
  tasksCapped?: boolean;
}

// Which figures a view actually shows; the others are not requested.
export interface StatsSelection {
  instances: boolean;
  reviews: boolean;
  tasks: boolean;
  myTasks: boolean;
}

// The 24h window for finished-instance counts, fixed per mount: it is part of the query key.
export function useSinceWindow(): string {
  return useMemo(() => new Date(Date.now() - 24 * 3600_000).toISOString(), []);
}

// The selected figures per scope, one batch per metric; the result is aligned with `scopes`.
export function useIntegrationStats(scopes: StatsScope[], since: string, include: StatsSelection): IntegrationStats[] {
  const running = useQueries({ queries: scopes.map((s) => ({ ...instanceCountQueryOptions(s, { status: 'RUNNING' }), enabled: include.instances })) });
  const suspended = useQueries({ queries: scopes.map((s) => ({ ...instanceCountQueryOptions(s, { status: 'SUSPENDED' }), enabled: include.instances })) });
  const failed = useQueries({ queries: scopes.map((s) => ({ ...instanceCountQueryOptions(s, { status: 'FAILED', closeTimeFrom: since }), enabled: include.instances })) });
  const completed = useQueries({ queries: scopes.map((s) => ({ ...instanceCountQueryOptions(s, { status: 'COMPLETED', closeTimeFrom: since }), enabled: include.instances })) });
  const reviews = useQueries({ queries: scopes.map((s) => ({ ...pendingReviewCountQueryOptions(s), enabled: include.reviews })) });
  const tasks = useQueries({ queries: scopes.map((s) => ({ ...totalPendingTaskCountQueryOptions(s), enabled: include.tasks })) });
  const myTasks = useQueries({ queries: scopes.map((s) => ({ ...pendingTaskCountQueryOptions(s), enabled: include.myTasks })) });

  const settle = <T>(r: { data?: unknown; error: unknown } | undefined): T | null | undefined => {
    if (!r) return undefined;
    if (r.error) return null;
    return valueOf(r.data as Parameters<typeof valueOf>[0]) as T | undefined;
  };
  return scopes.map((_, i) => ({
    running: settle<CappedCount>(running[i]),
    suspended: settle<CappedCount>(suspended[i]),
    failed: settle<CappedCount>(failed[i]),
    completed: settle<CappedCount>(completed[i]),
    reviews: settle<PendingReviewCount>(reviews[i]),
    tasks: settle<number>(tasks[i]),
    myTasks: settle<number>(myTasks[i]),
  }));
}

// The same figures for one workflow definition; pending work comes from the work-items listing filtered by parent type.
export function useDefinitionStats(scope: StatsScope, workflowType: string, since: string, include: { reviews: boolean; tasks: boolean }): IntegrationStats {
  const filters = { workflowType };
  const running = useQuery(instanceCountQueryOptions(scope, { ...filters, status: 'RUNNING' }));
  const suspended = useQuery(instanceCountQueryOptions(scope, { ...filters, status: 'SUSPENDED' }));
  const failed = useQuery(instanceCountQueryOptions(scope, { ...filters, status: 'FAILED', closeTimeFrom: since }));
  const completed = useQuery(instanceCountQueryOptions(scope, { ...filters, status: 'COMPLETED', closeTimeFrom: since }));
  const reviews = useQuery({ ...pendingWorkItemCountQueryOptions(scope, { kind: 'REVIEW_ACTIVITY', parentWorkflowType: workflowType }), enabled: include.reviews });
  const tasks = useQuery({ ...pendingWorkItemCountQueryOptions(scope, { kind: 'HUMAN_TASK', parentWorkflowType: workflowType, allRoles: true }), enabled: include.tasks });
  const settle = <T>(r: { data?: unknown; error: unknown }): T | null | undefined => (r.error ? null : (valueOf(r.data as Parameters<typeof valueOf>[0]) as T | undefined));
  const taskPage = settle<CappedCount>(tasks);
  return {
    running: settle<CappedCount>(running),
    suspended: settle<CappedCount>(suspended),
    failed: settle<CappedCount>(failed),
    completed: settle<CappedCount>(completed),
    reviews: settle<CappedCount>(reviews),
    // `tasks` is a plain number in the shared shape; the cap travels beside it.
    tasks: taskPage === undefined || taskPage === null ? taskPage : taskPage.count,
    tasksCapped: taskPage?.capped ?? false,
  };
}

export const countText = (c: CappedCount | PendingReviewCount | null | undefined): string => (c === undefined ? '…' : c === null ? '—' : `${c.count}${c.capped ? '+' : ''}`);
export const numberText = (n: number | null | undefined): string => (n === undefined ? '…' : n === null ? '—' : String(n));

export function totalOf(rows: IntegrationStats[], pick: (s: IntegrationStats) => CappedCount | PendingReviewCount | null | undefined): { text: string; count: number } {
  let count = 0;
  let capped = false;
  let pending = false;
  for (const row of rows) {
    const v = pick(row);
    if (v === undefined) pending = true;
    else if (v) {
      count += v.count;
      capped = capped || v.capped;
    }
  }
  return { text: pending ? '…' : `${count}${capped ? '+' : ''}`, count };
}

export function sumOf(rows: IntegrationStats[], pick: (s: IntegrationStats) => number | null | undefined): { text: string; count: number } {
  let count = 0;
  let pending = false;
  for (const row of rows) {
    const v = pick(row);
    if (v === undefined) pending = true;
    else if (typeof v === 'number') count += v;
  }
  return { text: pending ? '…' : String(count), count };
}
