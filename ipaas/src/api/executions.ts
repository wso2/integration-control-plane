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
 * Cloud (OpenChoreo) scheduled-task / execution API. Calls the ipaas-service BFF.
 *
 * OpenChoreo scopes scheduled tasks per environment, so the schedule spec and job
 * history are keyed by component + env (+ project), not by releaseId — the legacy
 * releaseId argument is ignored here.
 */

import { bff, q, seg } from './_client';
import { queryObsLogEntries, resolveComponentProject, type ObsLogEntry } from './logs';
import type { StopScheduleInput, ExecutionConfigs, TaskExecution, ExecutionLogEntry, ExecutionLogWindow, UpdateJobConfigsInput, TriggerComponentInput, TriggerRunResult, RuntimeArgument } from '../types/executions';
import type { TriggerTaskInput } from '../types/artifact';
import { HttpError } from '../types/http';

interface ExecutionArgument {
  argumentName: string;
  argumentValue: string;
}

// BFF Execution (k8s job) from GET /components/{name}/schedules/{envId}/executions.
interface BffExecution {
  jobId?: string;
  status?: string;
  startTime?: string;
  completionTime?: string;
  revisionId?: string;
}

// BFF Schedule (CronJob spec) from GET /components/{name}/schedules/{envId}.
interface BffSchedule {
  cronExpression: string;
  cronTimezone?: string;
  state?: string;
  backoffLimit?: number | null;
  activeDeadlineSeconds?: number | null;
  concurrencyPolicy?: string | null;
}

// The BFF returns ISO timestamps; the env card parses startTime/completionTime
// as unix seconds (parseInt * 1000), so convert.
function toUnixSeconds(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : String(Math.floor(t / 1000));
}

function toTaskExecution(e: BffExecution): TaskExecution {
  const jobId = e.jobId ?? '';
  return {
    id: jobId,
    runId: jobId,
    startTime: toUnixSeconds(e.startTime),
    completionTime: toUnixSeconds(e.completionTime),
    revisionId: e.revisionId ?? '',
    failedReason: '',
    status: e.status ?? '',
    arguments: null,
  };
}

// GET /components/{name}/schedules/{envId} — the CronJob's schedule spec, keyed by
// environment. Mapped onto ExecutionConfigs so the schedule UI (button state,
// next-run countdown, dialog prefill) reads it unchanged.
//
// Previously we used to send `projectName` param, now removed because it's not used in ipaas-service.
//
// An empty cronExpression means no schedule: the BFF owns the never-fires expression in both directions.
export const fetchExecutionConfigs = (componentId: string, _releaseId: string, envId = ''): Promise<ExecutionConfigs | null> => {
  if (!envId) return Promise.resolve(null);
  return bff
    .get<BffSchedule>(`/components/${seg(componentId)}/schedules/${seg(envId)}`)
    .then((s) => {
      if (!s.cronExpression) return null;
      return {
        cronjobFrequency: s.cronExpression,
        cronjobTimezone: s.cronTimezone || 'UTC',
        timeoutSeconds: s.activeDeadlineSeconds ?? undefined,
        retryCount: s.backoffLimit ?? undefined,
        // The ComponentType defaults concurrencyPolicy to Forbid, so an absent policy is not overlapping.
        cronjobAllowConcurrency: s.concurrencyPolicy === 'Allow',
      };
    })
    .catch(() => null);
};

// GET /components/{name}/environments/{envId}/executions/history — the CronJob's
// job runs (newest-first), keyed by component + env (+ project).
//
// Reconstructed from OpenChoreo Observer Kubernetes event logs (~30 days),
// replacing the resource-tree source which only saw the Jobs still live
// in-cluster (effectively the last few runs). The endpoint is cursor-paginated
// (capped per page); we follow `nextCursor` to accumulate history, bounded by
// HISTORY_MAX_PAGES so a high-frequency schedule can't pull an unbounded list
// into the table. The server already clamps the window to ~30 days, so normal
// cadences (hourly/daily) page to exhaustion well within the cap.
const HISTORY_PAGE_LIMIT = 100; // BFF caps the page size at 100
const HISTORY_MAX_PAGES = 10; // up to ~1000 most-recent runs

interface BffExecutionHistoryPage {
  items?: BffExecution[];
  nextCursor?: string;
}

export const fetchTaskExecutions = async (_releaseId: string, componentId = '', envId = '', projectId = ''): Promise<TaskExecution[]> => {
  if (!componentId || !envId) return [];
  const base = `/components/${seg(componentId)}/environments/${seg(envId)}/executions/history`;

  const all: TaskExecution[] = [];
  let before: string | undefined;
  try {
    for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
      const res = await bff.get<BffExecutionHistoryPage>(`${base}${q({ projectName: projectId, limit: HISTORY_PAGE_LIMIT, before })}`);
      all.push(...(res?.items ?? []).map(toTaskExecution));
      before = res?.nextCursor || undefined;
      if (!before) break;
    }
  } catch (error) {
    // A later page failing still leaves usable history, so keep what was gathered.
    // The first page failing means we have nothing — surface that instead of
    // returning an empty list the UI would render as "no executions yet".
    if (all.length === 0) throw error;
  }
  return all;
};

export const fetchExecutionArguments = (runId: string, componentId: string, _releaseId: string): Promise<ExecutionArgument[]> =>
  bff
    .get<ExecutionArgument[]>(`/components/${seg(componentId)}/executions/${seg(runId)}/arguments`)
    .then((r) => r ?? [])
    .catch(() => []);

// Padding around a run's bounds. The history row's startTime is the earliest
// Kubernetes event for the Job, which the kubelet's image-pull and startup
// lines can predate; its completionTime is the Job's Completed event, which the
// container's final flush can trail. Both are also subject to ingestion lag.
const LOG_WINDOW_LEAD_MS = 60_000;
const LOG_WINDOW_TRAIL_MS = 5 * 60_000;

const LOG_WINDOW_FALLBACK_MS = 24 * 3600_000;

// The observer's own per-query ceiling.
const EXECUTION_LOG_LIMIT = 1000;

// The observer applies that ceiling before the console can filter by pod, and
// its log scope reaches only component + environment — there is no pod or job
// selector (workflowRunName matches Argo workflow runs, not a CronJob's Jobs).
// So a window crowded by concurrent runs of a chatty task can push this run's
// output past the ceiling, and the only way to reach it is to walk the window a
// page at a time. The cap bounds that walk for a window that is busier still.
const EXECUTION_LOG_MAX_PAGES = 10;

// The observer answers a scoped query with this code, as a 5xx, when the org
// has nothing indexed at all. That is an empty result, not a failure.
const NO_INDEXED_DATA_CODE = 'OBS-V1-L-04';

// TaskExecution timestamps are unix seconds in string form (see toTaskExecution).
function fromUnixSeconds(value: string | undefined): number | undefined {
  const seconds = Number(value);
  if (!value || !Number.isFinite(seconds)) return undefined;
  return seconds * 1000;
}

/**
 * The observer window to read a single run's logs over. A run still in flight
 * (no completionTime) reads up to now.
 */
export function executionLogWindow(run?: ExecutionLogWindow): { startTime: string; endTime: string } {
  const now = Date.now();
  const started = fromUnixSeconds(run?.startTime);
  const completed = fromUnixSeconds(run?.completionTime);
  if (started === undefined) {
    return { startTime: new Date(now - LOG_WINDOW_FALLBACK_MS).toISOString(), endTime: new Date(now).toISOString() };
  }
  const end = completed === undefined ? now : completed + LOG_WINDOW_TRAIL_MS;
  return {
    startTime: new Date(started - LOG_WINDOW_LEAD_MS).toISOString(),
    endTime: new Date(Math.max(end, started)).toISOString(),
  };
}

/**
 * Whether a pod's logs belong to the given Job. A Job names its pods
 * `<jobName>-<suffix>`, which is the only link between a log line and a run —
 * the observer's log search scope stops at component + environment. The
 * trailing hyphen is what keeps job `x-297` from claiming pod `x-2971-abc`.
 */
export function podBelongsToJob(podName: string, jobId: string): boolean {
  if (!podName || !jobId) return false;
  return podName === jobId || podName.startsWith(`${jobId}-`);
}

export function toExecutionLogEntry(e: ObsLogEntry): ExecutionLogEntry {
  return {
    timestamp: e.timestamp ?? '',
    message: e.log ?? '',
    level: e.level ?? '',
    container: e.metadata?.containerName ?? '',
  };
}

function isNoIndexedData(error: unknown): boolean {
  return error instanceof HttpError && error.status >= 500 && error.message.includes(NO_INDEXED_DATA_CODE);
}

/**
 * One execution's container logs, queried from the observability proxy and
 * narrowed to the pods the run owns. `run` supplies the time window; without it
 * the query falls back to a fixed lookback and may find nothing for an older
 * run.
 */
export const fetchExecutionLogs = async (componentId: string, _deploymentTrackId: string, executionId: string, environmentId: string, run?: ExecutionLogWindow): Promise<ExecutionLogEntry[]> => {
  if (!componentId || !executionId || !environmentId) return [];
  // The observer rejects a component-scoped query that carries no project, and
  // a component with no build to resolve one from has never produced a run.
  const project = await resolveComponentProject(componentId);
  if (!project) return [];
  const searchScope = {
    project,
    component: componentId,
    environment: environmentId.toLowerCase(),
  };
  const { startTime, endTime } = executionLogWindow(run);
  const matched: ObsLogEntry[] = [];
  let from = startTime;

  for (let page = 0; page < EXECUTION_LOG_MAX_PAGES; page++) {
    let entries: ObsLogEntry[];
    try {
      entries = await queryObsLogEntries({
        searchScope,
        startTime: from,
        endTime,
        limit: EXECUTION_LOG_LIMIT,
        // Ascending so the drawer reads top-to-bottom, the order the task emitted.
        sortOrder: 'asc',
        // A run's output is wanted whole, and the proxy's level filter matches a
        // level parsed from the line, so it drops output that never labelled one.
        searchPhrase: '',
      });
    } catch (error) {
      if (isNoIndexedData(error)) break;
      throw error;
    }

    // An entry with no podName cannot be attributed, and a concurrent run's
    // lines would land in this drawer if it were kept.
    for (const entry of entries) {
      if (podBelongsToJob(entry.metadata?.podName ?? '', executionId)) matched.push(entry);
    }

    // A short page is the whole remainder of the window.
    if (entries.length < EXECUTION_LOG_LIMIT) break;
    const last = entries[entries.length - 1]?.timestamp;
    // Both ends of the range are exclusive, so resuming at the last timestamp
    // cannot repeat an entry already seen. The range has only second
    // granularity, so this does give up any entry sharing that same second
    // beyond the page — a bounded loss, where stopping here would drop the rest
    // of the window outright. An unadvanceable cursor means the whole page
    // shares one second and there is no way forward.
    if (!last || last === from) break;
    from = last;
  }

  return matched.map(toExecutionLogEntry);
};

// OpenChoreo has no runtime-arguments schema
// endpoint, so surface it as unsupported rather than fabricating an empty schema.
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] executions.${name}: not implemented`));
export const fetchRuntimeArguments = (_componentId: string, _deploymentTrackId: string, _commitHash: string): Promise<RuntimeArgument[]> => ni('fetchRuntimeArguments');

// No dedicated count endpoint; approximate from the listed job runs.
export const fetchTaskExecutionCount = (releaseId: string, componentId = '', envId = '', projectId = ''): Promise<number | null> =>
  fetchTaskExecutions(releaseId, componentId, envId, projectId)
    .then((items) => items.length)
    .catch(() => null);

export const updateJobConfigs = (input: UpdateJobConfigsInput): Promise<boolean> => bff.put<{ success?: boolean }>(`/components/${seg(input.componentId)}/job-configs`, input).then((r) => r?.success ?? true);

// Empty cron = stop firing; the BFF substitutes the never-fires expression and leaves deployment state alone.
export const stopSchedule = (input: StopScheduleInput): Promise<void> => bff.post<void>(`/components/${seg(input.componentId)}/schedules`, { environment: input.envId, cronExpression: '' }).then(() => undefined);

// MI artifact trigger — no API Manager / MI runtime on the OpenChoreo stack.
export const triggerTask = (_input: TriggerTaskInput): Promise<{ status: string; message: string; successCount: number; failedCount: number; details: string[] }> =>
  Promise.resolve({ status: 'skipped', message: 'Task triggering is not supported in this build.', successCount: 0, failedCount: 0, details: [] });

// POST /components/{name}/releases/{releaseId}/executions — BFF resolves the env.
// The BFF takes positional string args; map the name/value pairs to their values.
// OpenChoreo does not return a run id from this endpoint, so runId is null.
export const triggerComponentRun = (input: TriggerComponentInput): Promise<TriggerRunResult> =>
  bff
    .post(`/components/${seg(input.componentId)}/releases/${seg(input.releaseId)}/executions`, {
      args: (input.args ?? []).map((a) => a.argument_value),
    })
    .then(() => ({ runId: null }));
