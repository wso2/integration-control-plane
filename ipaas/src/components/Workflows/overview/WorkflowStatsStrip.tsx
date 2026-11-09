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

import { Avatar, Box, ButtonBase, Skeleton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleCheck, CirclePause, CirclePlay, CircleX, ClipboardCheck, ListTodo } from '@wso2/oxygen-ui-icons-react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import type { WorkflowClient } from '../api/client';
import { retryWorkflowRead } from '../api/http';
import { CALLS_CARRY_ROLES, humanTasksComingSoon } from '../connection/workflowCredential';
import type { Page, WorkflowStatusFilter } from '../api/types';
import type { WorkItemKind } from '../routing/useWorkflowRoutes';
import { whenAutoRefresh } from '../shared/autoRefresh';
import { WORKFLOW_STATUS_CHIP_COLOR, type StatusChipColor } from '../shared/workflowStatus';
import { workflowTimeRangeFrom, type WorkflowTimeRange } from '../shared/workflowTimeRangeFilter';
import { COUNT_PAGE, countOf, countText, workflowCountKey, type FigureCount } from './workflowStats';
import * as styles from './WorkflowStatsStrip.styles';

const COUNT_POLL_MS = 30_000;
/** The window of the Failed and Completed figures. */
const CLOSED_WITHIN: WorkflowTimeRange = '24h';

interface WorkflowStatsStripProps {
  client: WorkflowClient;
  scopeId: string;
  /** The definition the figures describe; absent for the whole integration. */
  workflowType?: string;
  /** The Workflows list, filtered to the status a figure counts and, for closed runs, the window. */
  runsLink: (status: WorkflowStatusFilter, closedWithin?: WorkflowTimeRange) => string;
  /** Human Tasks, filtered to the kind of work item a figure counts. */
  tasksLink: (kind: WorkItemKind) => string;
  /** Whether ipaas-service serves the User Portal here, which the human task figures point to while the console has none. */
  portalServed?: boolean;
}

interface Figure {
  /** Names the figure in its test id. */
  key: string;
  label: string;
  icon: ReactNode;
  /** The palette colour of its icon. */
  tone: string;
  count: FigureCount;
  help: string;
  /** The list behind the figure; none while that list is not available. */
  href?: string;
  /** Failures to look at: drawn in the error tone while there are any. */
  alarm?: boolean;
  /** Work waiting on a person: drawn as a notification count while there is any. */
  notify?: boolean;
}

const ICON_SIZE = 16;

/** A status chip colour as a palette colour; the neutral chip has no `main` shade. */
const toneOf = (color: StatusChipColor): string => (color === 'default' ? 'text.secondary' : `${color}.main`);

/**
 * One figure: the first page of a listing, counted, and read again while the card stays open.
 * `keep` narrows the page in the console, for what the engine cannot filter by. A listing that is
 * not `readable` is never sent, and its figure shows as unknown.
 */
function usePageCount<T>(queryKey: QueryKey, fetchPage: () => Promise<Page<T> | null>, keep?: (item: T) => boolean, readable = true): FigureCount {
  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: fetchPage,
    enabled: readable,
    retry: retryWorkflowRead,
    refetchInterval: () => whenAutoRefresh(COUNT_POLL_MS),
  });
  // A figure that cannot be read shows as unknown, not as a zero.
  if (!readable || isError) return null;
  if (isPending) return undefined;
  return countOf(data, keep);
}

/**
 * The runs in one status. A close-time window is turned into its bound on each read, so the window
 * moves with the clock while the card polls. The definition is counted here, never sent: the
 * listing is shared by every definition, and counted for the one selected.
 */
function useRunCount(client: WorkflowClient, scopeId: string, workflowType: string | undefined, status: WorkflowStatusFilter, closedWithin: WorkflowTimeRange = ''): FigureCount {
  return usePageCount(
    workflowCountKey(scopeId, 'instances', status, closedWithin),
    () => client.instances.list({ status, closeTimeFrom: workflowTimeRangeFrom(closedWithin), limit: COUNT_PAGE }),
    (run) => !workflowType || run.workflowType === workflowType,
  );
}

function FigureTile({ figure }: { figure: Figure }): JSX.Element {
  const { key, label, icon, tone, count, help, href, alarm, notify } = figure;
  const text = countText(count);
  let value: ReactNode = text;
  if (count === undefined) value = <Skeleton variant="text" sx={styles.valueSkeleton} />;
  else if (notify)
    value = (
      <Box component="span" sx={styles.badge} data-testid={`workflow-stat-${key}-badge`}>
        {text}
      </Box>
    );

  const content = (
    <>
      <Avatar sx={styles.icon(tone)}>{icon}</Avatar>
      <Box sx={styles.text}>
        <Typography variant="caption" color="text.secondary" sx={styles.label}>
          {label}
        </Typography>
        <Typography variant="h6" component="div" color={alarm ? 'error.main' : 'text.primary'} sx={styles.value}>
          {value}
        </Typography>
      </Box>
    </>
  );
  return (
    <Tooltip title={help} describeChild placement="top">
      {href ? (
        <ButtonBase component={RouterLink} to={href} data-testid={`workflow-stat-${key}`} sx={alarm ? [styles.tile, styles.alarmTile] : styles.tile}>
          {content}
        </ButtonBase>
      ) : (
        // Focusable, so the help that says why there is no count reaches a keyboard too.
        <Box tabIndex={0} data-testid={`workflow-stat-${key}`} sx={styles.staticTile}>
          {content}
        </Box>
      )}
    </Tooltip>
  );
}

/**
 * The selected definition's figures on the overview:
 * what is running, suspended, failed or completed in the last day, and what waits on a person.
 * Each figure links to the list behind it. Figures, not a list of runs: the Workflows page is where
 * individual runs are read.
 */
export default function WorkflowStatsStrip({ client, scopeId, workflowType, runsLink, tasksLink, portalServed = true }: WorkflowStatsStripProps): JSX.Element {
  const running = useRunCount(client, scopeId, workflowType, 'RUNNING');
  const suspended = useRunCount(client, scopeId, workflowType, 'SUSPENDED');
  const failed = useRunCount(client, scopeId, workflowType, 'FAILED', CLOSED_WITHIN);
  const completed = useRunCount(client, scopeId, workflowType, 'COMPLETED', CLOSED_WITHIN);

  // Reviews cannot be listed by workflow type, so the page is narrowed here; a runtime before
  // workflow 0.10 reports no parent type, and its reviews are counted rather than dropped.
  // The engine lists no review or task to a caller without roles, so until calls carry roles
  // (CALLS_CARRY_ROLES) neither is read, and neither figure claims a zero it can't know.
  const reviews = usePageCount(
    workflowCountKey(scopeId, 'reviews'),
    () => client.reviews.list({ status: 'PENDING', limit: COUNT_PAGE }),
    (review) => !workflowType || !review.parentWorkflowType || review.parentWorkflowType === workflowType,
    CALLS_CARRY_ROLES,
  );
  const tasks = usePageCount(workflowCountKey(scopeId, 'tasks', workflowType ?? ''), () => client.humanTasks.list({ status: 'PENDING', parentWorkflowType: workflowType, limit: COUNT_PAGE }), undefined, CALLS_CARRY_ROLES);

  // The help texts name the selected definition, or workflows in general without one.
  const subject = workflowType || 'Workflow';
  const figures: Figure[] = [
    {
      key: 'Running',
      label: 'Running',
      icon: <CirclePlay size={ICON_SIZE} />,
      tone: toneOf(WORKFLOW_STATUS_CHIP_COLOR.RUNNING),
      count: running,
      help: `${subject} instances executing or waiting. Opens the Workflows list.`,
      href: runsLink('RUNNING'),
    },
    {
      key: 'Suspended',
      label: 'Suspended',
      icon: <CirclePause size={ICON_SIZE} />,
      tone: toneOf(WORKFLOW_STATUS_CHIP_COLOR.SUSPENDED),
      count: suspended,
      help: `${subject} instances paused by an operator, waiting to be resumed.`,
      href: runsLink('SUSPENDED'),
    },
    {
      key: 'Failed (24h)',
      label: 'Failed (24h)',
      icon: <CircleX size={ICON_SIZE} />,
      tone: toneOf(WORKFLOW_STATUS_CHIP_COLOR.FAILED),
      count: failed,
      help: `${subject} instances that finished as failed in the last 24 hours.`,
      href: runsLink('FAILED', CLOSED_WITHIN),
      alarm: (failed?.count ?? 0) > 0,
    },
    {
      key: 'Completed (24h)',
      label: 'Completed (24h)',
      icon: <CircleCheck size={ICON_SIZE} />,
      tone: toneOf(WORKFLOW_STATUS_CHIP_COLOR.COMPLETED),
      count: completed,
      help: `${subject} instances that finished successfully in the last 24 hours.`,
      href: runsLink('COMPLETED', CLOSED_WITHIN),
    },
    {
      key: 'Pending Reviews',
      label: 'Pending Reviews',
      icon: <ClipboardCheck size={ICON_SIZE} />,
      tone: 'primary.main',
      count: reviews,
      help: CALLS_CARRY_ROLES ? 'Approval gates and failed activities waiting for a decision. Opens Human Tasks.' : humanTasksComingSoon(portalServed),
      href: CALLS_CARRY_ROLES ? tasksLink('review') : undefined,
      notify: (reviews?.count ?? 0) > 0,
    },
    {
      key: 'Pending Tasks',
      label: 'Pending Tasks',
      icon: <ListTodo size={ICON_SIZE} />,
      tone: 'primary.main',
      count: tasks,
      help: CALLS_CARRY_ROLES ? 'Human tasks you can act on, waiting for a person. Opens Human Tasks.' : humanTasksComingSoon(portalServed),
      href: CALLS_CARRY_ROLES ? tasksLink('task') : undefined,
      notify: (tasks?.count ?? 0) > 0,
    },
  ];

  return (
    <Box sx={styles.strip}>
      {figures.map((figure) => (
        <FigureTile key={figure.key} figure={figure} />
      ))}
    </Box>
  );
}
