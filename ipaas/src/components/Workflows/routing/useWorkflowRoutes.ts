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

import { useLocation } from 'react-router';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { withTrackParam } from '../../../hooks/useSelectedTrack';
import { componentHumanTasksUrl, componentWorkflowsUrl, hasComponent, overviewUrl, useScope, type ComponentScope } from '../../../nav';
import type { WorkflowStatusFilter } from '../api/types';
import type { WorkflowTimeRange } from '../shared/workflowTimeRangeFilter';

/**
 * Links to the workflow pages, which sit under the integration's Operate group at `/workflows`
 * (a run's execution view at `/workflows/:runId`) and `/human-tasks`. The URLs come from `nav.ts`;
 * this adds the query each page reads its link from, and keeps the deployment track shown, as
 * every integration page does.
 */

/** The Workflows page's definition filter, carried in the URL. */
export const WORKFLOW_TYPE_PARAM = 'type';
/** The environment a workflow page opens on; without it, the first one. */
export const WORKFLOW_ENV_PARAM = 'env';
/** A workflow whose newest run the Workflows page opens. */
export const WORKFLOW_ID_PARAM = 'workflowId';
/** The status the Workflows page opens filtered to, for a link that counts runs in one status. */
export const WORKFLOW_STATUS_PARAM = 'status';
/** The window a figure of closed runs counts in (`24h`): the Workflows page lists the runs closed within it. */
export const WORKFLOW_CLOSED_PARAM = 'closed';
/** The kind of work item (task or review) the Human Tasks page opens filtered to. */
export const WORK_ITEM_TYPE_PARAM = 'type';
/**
 * The definition the Human Tasks page opens filtered to. Not `type`, which there names the kind of
 * work item; the environment is carried in `env`, as for the Workflows page.
 */
export const WORK_ITEM_WORKFLOW_TYPE_PARAM = 'workflowType';

/** The two kinds of work the Human Tasks queue holds. */
export type WorkItemKind = 'task' | 'review';
/** The queue's kind filter: one kind, or both. */
export type WorkItemTypeFilter = '' | WorkItemKind;

export interface WorkflowRunsLink {
  workflowType?: string;
  status?: WorkflowStatusFilter;
  /** Lists only the runs closed within this window, as the Failed and Completed figures count them. */
  closedWithin?: WorkflowTimeRange;
  envId?: string;
  /** Opens that run's execution view. */
  runId?: string;
  /** Opens the newest run of that workflow, for a link that knows only the workflow (a task's parent). */
  workflowId?: string;
}

export interface HumanTasksLink {
  type?: WorkItemTypeFilter;
  envId?: string;
  workflowType?: string;
}

function withQuery(url: string, params: Record<string, string | undefined>, search: string): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const qs = query.toString();
  return withTrackParam(qs ? `${url}?${qs}` : url, search);
}

/** The Workflows page on the named environment, filtered and opened as the link names. */
export function workflowRunsUrl(scope: ComponentScope, { workflowType, status, closedWithin, envId, runId, workflowId }: WorkflowRunsLink = {}, search = ''): string {
  return withQuery(
    componentWorkflowsUrl(scope, runId),
    {
      [WORKFLOW_TYPE_PARAM]: workflowType,
      [WORKFLOW_STATUS_PARAM]: status,
      [WORKFLOW_CLOSED_PARAM]: closedWithin,
      [WORKFLOW_ENV_PARAM]: envId,
      // A run id already names the run; the workflow id would only open its newest one instead.
      [WORKFLOW_ID_PARAM]: runId ? undefined : workflowId,
    },
    search,
  );
}

/** The Human Tasks page on the named environment, filtered to the named kind and definition. */
export function humanTasksUrl(scope: ComponentScope, { type, envId, workflowType }: HumanTasksLink = {}, search = ''): string {
  return withQuery(
    componentHumanTasksUrl(scope),
    {
      [WORK_ITEM_TYPE_PARAM]: type,
      [WORK_ITEM_WORKFLOW_TYPE_PARAM]: workflowType,
      [WORKFLOW_ENV_PARAM]: envId,
    },
    search,
  );
}

export function useWorkflowRoutes() {
  const scope = useScope();
  const navigate = useAppNavigate();
  const { search } = useLocation();
  const ready = hasComponent(scope);

  return {
    ready,
    /** The integration's overview. */
    overviewPath: ready ? withTrackParam(overviewUrl(scope), search) : '',
    workflowRunsPath: ready ? workflowRunsUrl(scope, {}, search) : '',
    humanTasksPath: ready ? humanTasksUrl(scope, {}, search) : '',
    /**
     * Opens the Workflows page: on the named environment, filtered to the named definition and
     * status, and with the named run's execution view open, or the newest run of the named
     * workflow, when only its workflow id is known.
     */
    goToWorkflowRuns: (link: WorkflowRunsLink = {}) => {
      if (ready) navigate(workflowRunsUrl(scope, link, search));
    },
    /** Opens the Human Tasks page: on the named environment, filtered to the named kind and definition. */
    goToHumanTasks: (link: HumanTasksLink = {}) => {
      if (ready) navigate(humanTasksUrl(scope, link, search));
    },
  };
}
