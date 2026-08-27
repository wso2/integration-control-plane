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
 * releaseId argument is carried only to satisfy the shared contract and is ignored
 * here. Per-execution logs remain safe-defaulted (pod-log plumbing via
 * resource-tree is not wired yet), and triggerTask (MI) is unsupported.
 */

import { bff, BffError, items, q, seg, type ListResponse } from './_client';
import type { ExecutionConfigs, TaskExecution, ExecutionLogEntry, UpdateJobConfigsInput, TriggerComponentInput, TriggerRunResult, RuntimeArgument } from '../../types/executions';
import type { TriggerTaskInput } from '../../types/artifact';

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
// Stopping a schedule undeploys the underlying ReleaseBinding (state "Undeploy")
// but leaves its cron spec intact, so the endpoint keeps returning a cronExpression.
// Report a stopped schedule as no active schedule so the UI reflects "not running"
// rather than treating the lingering cron as live.
export const fetchExecutionConfigs = (componentId: string, _releaseId: string, envId = ''): Promise<ExecutionConfigs | null> => {
  if (!envId) return Promise.resolve(null);
  return bff
    .get<BffSchedule>(`/components/${seg(componentId)}/schedules/${seg(envId)}`)
    .then((s) => {
      if (s.state === 'Undeploy') return null;
      return {
        cronjobFrequency: s.cronExpression,
        cronjobTimezone: s.cronTimezone || 'UTC',
        timeoutSeconds: s.activeDeadlineSeconds ?? undefined,
        retryCount: s.backoffLimit ?? undefined,
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

// GET /components/{name}/executions/{runId}/arguments?releaseId= — the arguments a
// run was triggered with, read off the Job that ran it. releaseId identifies the
// environment; the BFF resolves it.
//
// Coverage is partial by design: history is reconstructed from Observer events
// (~30 days) while the Job is garbage-collected once it falls outside the CronJob's
// history limits, so older runs legitimately return nothing. Kubernetes args are
// positional, so argumentName is always empty — consumers must read argumentValue.
export const fetchExecutionArguments = (runId: string, componentId: string, releaseId: string): Promise<ExecutionArgument[]> =>
  bff
    .get<ListResponse<ExecutionArgument>>(`/components/${seg(componentId)}/executions/${seg(runId)}/arguments${q({ releaseId })}`)
    .then(items)
    .catch(() => []);

// awaits: BFF execution-log plumbing (pod logs via resource-tree).
export const fetchExecutionLogs = (_componentId: string, _deploymentTrackId: string, _executionId: string, _environmentId: string): Promise<ExecutionLogEntry[]> => Promise.resolve([]);

// The runtime-arguments schema is a wip-only feature; OpenChoreo has no equivalent
// endpoint, so surface it as unsupported rather than fabricating an empty schema.
const ni = (name: string): never => {
  throw new Error(`[cloud] executions.${name}: not implemented`);
};
export const fetchRuntimeArguments = (_componentId: string, _deploymentTrackId: string, _commitHash: string): Promise<RuntimeArgument[]> => ni('fetchRuntimeArguments');

// No dedicated count endpoint; approximate from the listed job runs.
export const fetchTaskExecutionCount = (releaseId: string, componentId = '', envId = '', projectId = ''): Promise<number | null> =>
  fetchTaskExecutions(releaseId, componentId, envId, projectId)
    .then((items) => items.length)
    .catch(() => null);

// POST /components/{name}/schedules — the write side of fetchExecutionConfigs,
// upserting the ReleaseBinding's CronJob spec.
//
// UpsertSchedule is a full replace, not a patch: the BFF only carries releaseName
// over from the existing binding, so any field omitted here is cleared or
// defaulted server-side. `state` is the dangerous one — it defaults to "Active",
// which would silently restart a stopped schedule — and `cronExpression` is
// rejected when empty. So read the current binding and merge onto it rather than
// sending the caller's fields alone. The component-wide limits are exempt: the BFF
// patches those only when present, so omitting them leaves them untouched.
//
// jobTimeoutSeconds and jobRetryCount land on the Component's parameters, so they apply to every
// environment rather than the one release. And cronJobAllowConcurrency is dropped:
// OpenChoreo exposes no concurrencyPolicy on the release binding, so there is
// nowhere to put it.
export const updateJobConfigs = async (input: UpdateJobConfigsInput): Promise<boolean> => {
  const path = `/components/${seg(input.componentId)}/schedules`;
  // Only a genuinely absent schedule may be read as "nothing to preserve". Any other
  // failure — expired token, upstream 5xx, network — must not fall through to the
  // full-replace POST, which would drop state and cronTimezone and so restart a
  // stopped schedule: exactly what reading first is meant to prevent.
  const existing = await bff.get<BffSchedule>(`${path}/${seg(input.environmentId)}`).catch((err: unknown) => {
    if (err instanceof BffError && err.status === 404) return null;
    throw err;
  });

  const cronExpression = input.cronFrequency ?? existing?.cronExpression ?? '';
  if (!cronExpression) {
    // The endpoint 400s on an empty cron; fail here with a message naming the cause.
    throw new Error('[cloud] executions.updateJobConfigs: a cron expression is required (none given, and the component has no schedule yet)');
  }

  await bff.post(path, {
    environment: input.environmentId,
    cronExpression,
    ...((input.cronTimezone ?? existing?.cronTimezone) && { cronTimezone: input.cronTimezone ?? existing?.cronTimezone }),
    ...(existing?.state && { state: existing.state }),
    ...(input.jobTimeoutSeconds !== undefined && { activeDeadlineSeconds: input.jobTimeoutSeconds }),
    ...(input.jobRetryCount !== undefined && { backoffLimit: input.jobRetryCount }),
  });
  return true;
};

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
