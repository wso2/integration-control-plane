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

import { Alert, Chip, CircularProgress, ListingTable, Snackbar, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Workflow } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useProjectRuntimes, type GqlRuntime } from '../../api/queries';
import { fetchedAtOf, invalidateWorkflowQueries, isPreparing, isRefreshing, pendingWorkItemsQueryOptions, useWorkflowDefinitionsAcross, valueOf } from '../../api/workflows';
import { narrow, resourceUrl, type ProjectScope } from '../../nav';
import { formatClock, formatDistanceToNow } from '../../utils/time';
import { useTimeZone } from '../../contexts/TimeZoneContext';
import { ReviewActivityDetailDialog, type Toast } from './AdminPortal';
import { TaskDetailDialog, toWorkItem, WorkItemTable, type WorkItem } from './UserPortal';
import { HeaderCell, ListFooter, rowOpenProps } from './shared';
import type { WorkflowIntegrationEntry } from './useWorkflowPageScope';
import { countText, numberText, sumOf, totalOf, useIntegrationStats, useSinceWindow, type IntegrationStats } from './WorkflowStats';

// The project level: one row (or one queue) per integration, since no single runtime can list a project's work.
export default function ProjectWorkflowDashboard({
  scope,
  projectId,
  environmentId,
  integrations,
  resource,
  canViewHumanTasks,
  canViewWorkflows,
}: {
  scope: ProjectScope;
  projectId: string;
  environmentId: string;
  integrations: WorkflowIntegrationEntry[];
  resource: 'tasks' | 'workflows';
  canViewHumanTasks: boolean;
  canViewWorkflows: boolean;
}): JSX.Element {
  const { data: runtimes, isPending: runtimesPending } = useProjectRuntimes(environmentId, projectId);
  const runtimeByComponent = useMemo(() => latestRuntimeByComponent(runtimes), [runtimes]);
  const deployedIds = runtimes === undefined || runtimesPending ? undefined : new Set(runtimeByComponent.keys());
  if (integrations.length === 0) {
    return <Typography sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>No workflow integrations in this project yet. An integration that declares workflows appears here after its first heartbeat.</Typography>;
  }
  const common = { scope, environmentId, integrations, runtimeByComponent, deployedIds, canViewHumanTasks, canViewWorkflows };
  return resource === 'workflows' ? <WorkflowStatsTable {...common} /> : <ProjectInbox {...common} />;
}

function latestRuntimeByComponent(runtimes: GqlRuntime[] | undefined): Map<string, GqlRuntime> {
  const byComponent = new Map<string, GqlRuntime>();
  for (const r of runtimes ?? []) {
    const id = r.component?.id;
    if (!id) continue;
    const current = byComponent.get(id);
    if (!current || (r.lastHeartbeat ?? '') > (current.lastHeartbeat ?? '')) byComponent.set(id, r);
  }
  return byComponent;
}

interface TableProps {
  scope: ProjectScope;
  environmentId: string;
  integrations: WorkflowIntegrationEntry[];
  runtimeByComponent: Map<string, GqlRuntime>;
  // Undefined while the environment's runtimes are still resolving.
  deployedIds: Set<string> | undefined;
  canViewHumanTasks: boolean;
  canViewWorkflows: boolean;
}

const offlineCount = (deployed: WorkflowIntegrationEntry[], runtimeByComponent: Map<string, GqlRuntime>): number => deployed.filter((d) => (runtimeByComponent.get(d.componentId)?.status ?? '').toUpperCase() !== 'RUNNING').length;

const plural = (n: number, word: string): string => `${word}${n === 1 ? '' : 's'}`;

function LinkedCount({ text, onClick }: { text: string; onClick: () => void }): JSX.Element {
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{ textDecoration: 'underline', textDecorationStyle: 'dotted', cursor: 'pointer', fontVariantNumeric: 'tabular-nums', '&:hover': { color: 'primary.main' } }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}>
      {text}
    </Typography>
  );
}

function IntegrationRow({
  integration,
  isDeployed,
  runtime,
  span,
  onOpen,
  children,
}: {
  integration: WorkflowIntegrationEntry;
  isDeployed: boolean | undefined;
  runtime: GqlRuntime | undefined;
  span: number;
  onOpen: () => void;
  children: ReactNode;
}): JSX.Element {
  const clickable = isDeployed === true;
  const offline = isDeployed === true && (runtime?.status ?? '').toUpperCase() !== 'RUNNING';
  return (
    <ListingTable.Row hover={clickable} {...(clickable ? rowOpenProps(onOpen) : {})}>
      <ListingTable.Cell>
        <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
          <Workflow size={16} />
          <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {integration.name}
          </Typography>
        </Stack>
      </ListingTable.Cell>
      {isDeployed === undefined ? (
        <ListingTable.Cell colSpan={span}>
          <Typography variant="caption" color="text.secondary">
            Loading…
          </Typography>
        </ListingTable.Cell>
      ) : isDeployed === false ? (
        <ListingTable.Cell colSpan={span}>
          <Typography variant="caption" color="text.disabled">
            Not deployed in this environment.
          </Typography>
        </ListingTable.Cell>
      ) : offline ? (
        <ListingTable.Cell colSpan={span}>
          <Typography variant="caption" color="warning.main">
            Runtime offline{runtime?.lastHeartbeat ? ` — last heartbeat ${formatDistanceToNow(runtime.lastHeartbeat)}` : ''}. Figures return when it heartbeats again.
          </Typography>
        </ListingTable.Cell>
      ) : (
        children
      )}
    </ListingTable.Row>
  );
}

// ── Workflow Executions ──

function WorkflowStatsTable({ scope, environmentId, integrations, runtimeByComponent, deployedIds, canViewHumanTasks, canViewWorkflows }: TableProps): JSX.Element {
  const navigate = useNavigate();
  const since = useSinceWindow();
  const deployed = useMemo(() => integrations.filter((i) => deployedIds?.has(i.componentId)), [integrations, deployedIds]);
  const canSeeWork = canViewHumanTasks || canViewWorkflows;
  const rows = useIntegrationStats(
    deployed.map((d) => ({ componentId: d.componentId, environmentId })),
    since,
    { instances: true, reviews: canSeeWork, tasks: canViewHumanTasks, myTasks: false },
  );
  const statsByComponent = new Map<string, IntegrationStats>(deployed.map((d, i) => [d.componentId, rows[i]]));
  // Definitions come from heartbeat metadata, not the runtime.
  const definitions = useWorkflowDefinitionsAcross(
    deployed.map((d) => ({ componentId: d.componentId, componentName: d.name, handler: d.routeHandler })),
    environmentId,
  );
  const typesByComponent = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of definitions.items) m.set(d.componentId, (m.get(d.componentId) ?? 0) + 1);
    return m;
  }, [definitions.items]);

  const offline = offlineCount(deployed, runtimeByComponent);
  const failedTotal = totalOf(rows, (s) => s.failed);
  const reviewsTotal = totalOf(rows, (s) => s.reviews);
  const tasksTotal = sumOf(rows, (s) => s.tasks);

  const openExecutions = (integration: WorkflowIntegrationEntry) => navigate(`${resourceUrl(narrow(scope, integration.routeHandler), 'workflows')}?env=${encodeURIComponent(environmentId)}`);
  const openTasks = (integration: WorkflowIntegrationEntry, tab?: 'reviews') => navigate(`${resourceUrl(narrow(scope, integration.routeHandler), 'tasks')}${tab ? `?tab=${tab}&` : '?'}env=${encodeURIComponent(environmentId)}`);

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Open an integration to start, inspect and manage its executions. Pending reviews and tasks open in Human Tasks.
      </Typography>

      {deployedIds !== undefined && deployed.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
            Needs attention:
          </Typography>
          <Chip size="small" variant={offline > 0 ? 'filled' : 'outlined'} color={offline > 0 ? 'warning' : 'default'} label={`${offline} ${plural(offline, 'runtime')} offline`} />
          <Chip size="small" variant={failedTotal.count > 0 ? 'filled' : 'outlined'} color={failedTotal.count > 0 ? 'error' : 'default'} label={`${failedTotal.text} failed in 24h`} />
          {canSeeWork && <Chip size="small" variant={reviewsTotal.count > 0 ? 'filled' : 'outlined'} color={reviewsTotal.count > 0 ? 'primary' : 'default'} label={`${reviewsTotal.text} ${plural(reviewsTotal.count, 'review')} waiting`} />}
          {canViewHumanTasks && <Chip size="small" variant={tasksTotal.count > 0 ? 'filled' : 'outlined'} color={tasksTotal.count > 0 ? 'primary' : 'default'} label={`${tasksTotal.text} ${plural(tasksTotal.count, 'task')} waiting`} />}
        </Stack>
      )}

      <ListingTable>
        <ListingTable.Head>
          <ListingTable.Row>
            <HeaderCell label="Integration" help="A workflow integration in this project. Open it to work with its executions." />
            <HeaderCell label="Workflow Types" help="Workflow definitions this integration publishes, from its heartbeat metadata." />
            <HeaderCell label="Running" help="Instances currently executing or parked. A '+' means more than the first page." />
            <HeaderCell label="Suspended" help="Instances paused by an operator, waiting to be resumed." />
            <HeaderCell label="Failed (24h)" help="Instances that finished as FAILED in the last 24 hours." />
            <HeaderCell label="Completed (24h)" help="Instances that finished successfully in the last 24 hours." />
            {canSeeWork && <HeaderCell label="Pending Reviews" help="Review activities waiting for a decision — approval gates and failed-activity reviews. Decided in Human Tasks." />}
            {canViewHumanTasks && <HeaderCell label="Pending Tasks" help="Human tasks waiting for anyone in any role — the project total, unlike the Human Tasks page, which shows only the work you can act on." />}
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {integrations.map((integration) => {
            const s = statsByComponent.get(integration.componentId) ?? {};
            const types = typesByComponent.get(integration.componentId);
            return (
              <IntegrationRow
                key={integration.componentId}
                integration={integration}
                isDeployed={deployedIds?.has(integration.componentId)}
                runtime={runtimeByComponent.get(integration.componentId)}
                span={5 + (canSeeWork ? 1 : 0) + (canViewHumanTasks ? 1 : 0)}
                onOpen={() => openExecutions(integration)}>
                <ListingTable.Cell>{definitions.isLoading && types === undefined ? '…' : (types ?? 0)}</ListingTable.Cell>
                <ListingTable.Cell>{countText(s.running)}</ListingTable.Cell>
                <ListingTable.Cell>{countText(s.suspended)}</ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography variant="body2" component="span" sx={{ color: s.failed && s.failed.count > 0 ? 'error.main' : 'inherit', fontWeight: s.failed && s.failed.count > 0 ? 600 : 400 }}>
                    {countText(s.failed)}
                  </Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>{countText(s.completed)}</ListingTable.Cell>
                {canSeeWork && (
                  <ListingTable.Cell>
                    <LinkedCount text={countText(s.reviews)} onClick={() => openTasks(integration, 'reviews')} />
                  </ListingTable.Cell>
                )}
                {canViewHumanTasks && (
                  <ListingTable.Cell>
                    <LinkedCount text={numberText(s.tasks)} onClick={() => openTasks(integration)} />
                  </ListingTable.Cell>
                )}
              </IntegrationRow>
            );
          })}
        </ListingTable.Body>
      </ListingTable>
    </Stack>
  );
}

// ── Human Tasks: the project inbox ──

interface SourceState {
  integration: WorkflowIntegrationEntry;
  status: 'offline' | 'fetching' | 'refreshing' | 'ready' | 'failed';
  count: number;
  fetchedAt?: number;
  hasMore?: boolean;
  nextToken?: string;
  loadingMore?: boolean;
}

// How long slow sources are waited for before the list is shown with what has arrived.
const HOLD_MS = 6000;

const joinNames = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function ProjectInbox({ scope, environmentId, integrations, runtimeByComponent, deployedIds }: TableProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { zone } = useTimeZone();
  const [toast, setToast] = useState<Toast>(null);
  const [openTask, setOpenTask] = useState<WorkItem | null>(null);
  const [openReview, setOpenReview] = useState<WorkItem | null>(null);

  const deployed = useMemo(() => integrations.filter((i) => deployedIds?.has(i.componentId)), [integrations, deployedIds]);
  const online = (d: WorkflowIntegrationEntry) => (runtimeByComponent.get(d.componentId)?.status ?? '').toUpperCase() === 'RUNNING';
  // One page of 50 per source; Load more asks every source that still has more for its next page.
  const [moreTokens, setMoreTokens] = useState<Record<string, string[]>>({});
  const results = useQueries({
    queries: deployed.map((d) => ({ ...pendingWorkItemsQueryOptions({ componentId: d.componentId, environmentId }), enabled: online(d) })),
  });
  const pageDescriptors = useMemo(() => deployed.flatMap((d) => (moreTokens[d.componentId] ?? []).map((token) => ({ componentId: d.componentId, token }))), [deployed, moreTokens]);
  const moreResults = useQueries({
    queries: pageDescriptors.map((pd) => ({ ...pendingWorkItemsQueryOptions({ componentId: pd.componentId, environmentId }, 50, pd.token), refetchInterval: false as const })),
  });

  // Order is frozen once every reachable source has answered or the hold expires, so rows never move under the reader.
  const orderRef = useRef<Map<string, number>>(new Map());
  const seqRef = useRef(0);
  const [settled, setSettled] = useState(false);
  const [lateIds, setLateIds] = useState<Set<string>>(new Set());
  const answeredAtSettleRef = useRef<Set<string>>(new Set());

  const statusOf = (d: WorkflowIntegrationEntry, i: number): SourceState['status'] => {
    const r = results[i];
    if (!online(d)) return 'offline';
    if (r?.error) return 'failed';
    if (r?.isPending || isPreparing(r?.data)) return 'fetching';
    if (isRefreshing(r?.data)) return 'refreshing';
    return 'ready';
  };
  const statuses = deployed.map((d, i) => statusOf(d, i));
  const allAnswered = deployedIds !== undefined && statuses.every((st) => st !== 'fetching');

  useEffect(() => {
    orderRef.current = new Map();
    setMoreTokens({});
    seqRef.current = 0;
    answeredAtSettleRef.current = new Set();
    setLateIds(new Set());
    setSettled(false);
  }, [environmentId]);

  useEffect(() => {
    if (settled || deployedIds === undefined) return;
    if (allAnswered) {
      answeredAtSettleRef.current = new Set(deployed.map((d) => d.componentId));
      setSettled(true);
      return;
    }
    const t = setTimeout(() => {
      answeredAtSettleRef.current = new Set(deployed.filter((_, i) => statuses[i] !== 'fetching').map((d) => d.componentId));
      setSettled(true);
    }, HOLD_MS);
    return () => clearTimeout(t);
    // statuses is derived from results, which is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, deployedIds, allAnswered, ...statuses]);

  // A source answering after the hold is late: its items land at the bottom of the frozen order.
  useEffect(() => {
    if (!settled) return;
    const late = deployed.filter((d, i) => (statuses[i] === 'ready' || statuses[i] === 'refreshing') && !answeredAtSettleRef.current.has(d.componentId)).map((d) => d.componentId);
    if (late.some((id) => !lateIds.has(id))) setLateIds((prev) => new Set([...prev, ...late]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, ...statuses]);

  const { items, labels, sources } = useMemo(() => {
    const merged: WorkItem[] = [];
    const labels = new Map<string, string>();
    const sources: SourceState[] = [];
    deployed.forEach((d, i) => {
      const r = results[i];
      labels.set(d.componentId, d.name);
      const first = valueOf(r?.data);
      const later = pageDescriptors.map((pd, j) => (pd.componentId === d.componentId ? valueOf(moreResults[j]?.data) : undefined)).filter((pg) => pg !== undefined);
      const loadingMore = pageDescriptors.some((pd, j) => pd.componentId === d.componentId && (moreResults[j]?.isPending || isPreparing(moreResults[j]?.data)));
      const last = later.length ? later[later.length - 1] : first;
      const rows = [...(first?.items ?? []), ...later.flatMap((pg) => pg?.items ?? [])];
      const status = statuses[i];
      sources.push({ integration: d, status, count: rows.length, fetchedAt: fetchedAtOf(r?.data), hasMore: last?.hasMore === true, nextToken: last?.nextPageToken ?? undefined, loadingMore });
      if (status === 'offline' || status === 'failed') return;
      for (const row of rows) {
        const item = toWorkItem(row);
        item.componentId = d.componentId;
        if (item.taskQueue) labels.set(item.taskQueue, d.name);
        else item.taskQueue = d.componentId;
        merged.push(item);
      }
    });
    // Oldest first; items without a start time sort last.
    merged.sort((a, b) => (a.startTime ?? '\uffff').localeCompare(b.startTime ?? '\uffff'));
    if (!settled) return { items: merged, labels, sources };
    const order = orderRef.current;
    for (const w of merged) if (!order.has(w.id)) order.set(w.id, ++seqRef.current);
    merged.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { items: merged, labels, sources };
    // `results` is a fresh array each render; recomputing is cheap and keeps the list current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployed, runtimeByComponent, settled, pageDescriptors, ...results.map((r) => r.data), ...results.map((r) => r.error), ...results.map((r) => r.isPending), ...moreResults.map((r) => r.data), ...moreResults.map((r) => r.isPending)]);

  const anyMore = sources.some((src) => src.hasMore && src.nextToken && (src.status === 'ready' || src.status === 'refreshing'));
  const anyLoadingMore = sources.some((src) => src.loadingMore);
  const loadMore = () =>
    setMoreTokens((prev) => {
      const next = { ...prev };
      for (const src of sources) {
        if (!src.hasMore || !src.nextToken) continue;
        const list = next[src.integration.componentId] ?? [];
        if (!list.includes(src.nextToken)) next[src.integration.componentId] = [...list, src.nextToken];
      }
      return next;
    });

  const answered = sources.filter((s) => s.status === 'ready' || s.status === 'refreshing');
  const answering = sources.filter((s) => s.status === 'fetching');
  const offline = sources.filter((s) => s.status === 'offline');
  const failed = sources.filter((s) => s.status === 'failed');
  const late = sources.filter((s) => lateIds.has(s.integration.componentId) && s.count > 0);
  const resolving = deployedIds === undefined;
  const undeployed = resolving ? 0 : integrations.length - deployed.length;
  const tasks = items.filter((w) => w.kind === 'task').length;
  const reviews = items.length - tasks;
  const holding = !resolving && !settled;

  const summary = (() => {
    if (resolving) return 'Finding the integrations deployed in this environment…';
    if (deployed.length === 0) return 'No workflow integration is deployed in this environment.';
    const reachable = deployed.length - offline.length;
    if (holding) return `Collecting tasks from ${reachable} integration${reachable === 1 ? '' : 's'}… The list appears once they have answered, so it does not shift while you read it.`;
    const parts: string[] = [];
    parts.push(
      `Showing ${items.length} item${items.length === 1 ? '' : 's'} — ${tasks} task${tasks === 1 ? '' : 's'}, ${reviews} review${reviews === 1 ? '' : 's'} — from ${answered.length} of ${deployed.length} integration${deployed.length === 1 ? '' : 's'}, oldest first.`,
    );
    if (answering.length) parts.push(`${joinNames(answering.map((s) => s.integration.name))} ${answering.length === 1 ? 'is' : 'are'} still answering; ${answering.length === 1 ? 'its' : 'their'} work is added at the bottom when it arrives.`);
    if (late.length)
      parts.push(
        `${joinNames(late.map((s) => s.integration.name))} answered after the list was shown — ${late.length === 1 ? 'its' : 'their'} ${late.reduce((n, s) => n + s.count, 0)} item${late.reduce((n, s) => n + s.count, 0) === 1 ? ' is' : 's are'} at the bottom, not in time order.`,
      );
    if (offline.length) parts.push(`${joinNames(offline.map((s) => s.integration.name))} ${offline.length === 1 ? 'is' : 'are'} offline — ${offline.length === 1 ? 'its' : 'their'} tasks are not included.`);
    const withMore = sources.filter((src) => src.hasMore && (src.status === 'ready' || src.status === 'refreshing'));
    if (withMore.length) parts.push(`${joinNames(withMore.map((src) => src.integration.name))} ${withMore.length === 1 ? 'has' : 'have'} more than the ${withMore.map((src) => src.count).join(' and ')} shown — load more below.`);
    if (failed.length) parts.push(`${joinNames(failed.map((s) => s.integration.name))} could not be reached — ${failed.length === 1 ? 'its' : 'their'} tasks are not included.`);
    return parts.join(' ');
  })();

  const refresh = () => invalidateWorkflowQueries(queryClient, environmentId);
  const openQueue = (integration: WorkflowIntegrationEntry) => navigate(`${resourceUrl(narrow(scope, integration.routeHandler), 'tasks')}?env=${encodeURIComponent(environmentId)}`);

  const sourceChip = (s: SourceState) => {
    const name = s.integration.name;
    const updated = s.fetchedAt ? `updated ${formatClock(s.fetchedAt * 1000, { zone })}` : '';
    switch (s.status) {
      case 'ready':
        return s.hasMore
          ? { label: `${name} · ${s.count}+`, color: 'default' as const, variant: 'outlined' as const, tip: `Showing the first ${s.count} from ${name}; it has more. Load more below, or open its queue.${updated ? ` ${updated}.` : ''}` }
          : { label: `${name} · ${s.count}`, color: 'default' as const, variant: 'outlined' as const, tip: `${s.count} pending from ${name}${updated ? ` — ${updated}` : ''}. Open its queue.` };
      case 'refreshing':
        return { label: `${name} · ${s.count} · updating…`, color: 'default' as const, variant: 'outlined' as const, tip: `${name} answered ${updated}; a fresh copy is on its way after a change.` };
      case 'fetching':
        return { label: `${name} · answering…`, color: 'default' as const, variant: 'outlined' as const, tip: `${name}'s runtime is preparing its list. Its items join the queue when it answers.` };
      case 'offline':
        return { label: `${name} · offline`, color: 'warning' as const, variant: 'filled' as const, tip: `${name}'s runtime is not heartbeating. Its tasks are not in this list until it is back.` };
      case 'failed':
        return { label: `${name} · unreachable`, color: 'error' as const, variant: 'filled' as const, tip: `${name} did not answer. Its tasks are not in this list.` };
    }
  };

  return (
    <Stack gap={2}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        {(holding || answering.length > 0) && <CircularProgress size={14} />}
        <Typography variant="body2" color="text.secondary">
          {summary}
          {undeployed > 0 ? ` ${undeployed} integration${undeployed === 1 ? ' is' : 's are'} not deployed in this environment.` : ''}
        </Typography>
      </Stack>

      {sources.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
            Sources:
          </Typography>
          {sources.map((s) => {
            const c = sourceChip(s);
            return (
              <Tooltip key={s.integration.componentId} title={c.tip}>
                <Chip size="small" variant={c.variant} color={c.color} label={c.label} onClick={() => openQueue(s.integration)} sx={{ cursor: 'pointer' }} />
              </Tooltip>
            );
          })}
        </Stack>
      )}

      {resolving || holding ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : items.length === 0 ? (
        <Typography sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
          {answered.length === 0 ? 'No integration could be asked for its tasks right now.' : `Nothing is waiting for you across ${answered.length === 1 ? 'this integration' : `these ${answered.length} integrations`}.`}
        </Typography>
      ) : (
        <>
          <WorkItemTable items={items} onOpen={(w) => (w.kind === 'review' ? setOpenReview(w) : setOpenTask(w))} environmentId={environmentId} integrationLabel={(q) => labels.get(q ?? '') ?? q ?? '—'} />
          <ListFooter count={items.length} singular="item" plural="items" hasMore={anyMore} loadingMore={anyLoadingMore} onLoadMore={loadMore} />
        </>
      )}

      {openTask?.componentId && (
        <TaskDetailDialog
          scope={{ componentId: openTask.componentId, environmentId }}
          taskId={openTask.id}
          actionable={!openTask.readOnly}
          onClose={() => {
            setOpenTask(null);
            refresh();
          }}
          onToast={setToast}
        />
      )}
      {openReview?.componentId && (
        <ReviewActivityDetailDialog
          scope={{ componentId: openReview.componentId, environmentId }}
          taskId={openReview.id}
          onClose={() => {
            setOpenReview(null);
            refresh();
          }}
          onToast={setToast}
        />
      )}

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}
