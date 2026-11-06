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
 * Cloud (OpenChoreo) build-log API.
 *
 * The build card's stepper needs per-stage status + steps. The per-step
 * progress lives in the WorkflowRun's tasks (GET /components/{name}/builds/{runId},
 * each task has a phase), so we fetch the run from the BFF and synthesize the
 * BuildRunLogs (init/build/deploy) from its task phases.
 *
 * The log text itself comes from the wso2cloud observability proxy, queried by
 * WorkflowRun name (see logs.ts) — the same source as runtime logs.
 */

import type { BuildRunLogs, BuildStage, BuildStep } from '../types/build';
import type { LogRow } from '../types/logs';
import { bff, q, seg } from './_client';
import { queryObsLogs } from './logs';

// Underscored params (_orgHandler, _versionId) are kept for devant contract
// parity; cloud addresses builds by component name + run id only.

// Subset of the BFF WorkflowRun (GET /components/{name}/builds/{runId}) we read.
interface BffWorkflowTask {
  name: string;
  phase?: string;
  startedAt?: string;
  completedAt?: string;
}
interface BffBuildRun {
  status?: string;
  startedAt?: string;
  completedAt?: string;
  tasks?: BffWorkflowTask[];
}

type StageKey = 'init' | 'build' | 'deploy';

const TASK_STAGE: Record<string, StageKey> = {
  'checkout-source': 'init',
  'build-image': 'build',
  'publish-image': 'deploy',
  'convert-component-descriptor': 'deploy',
  'generate-workload-cr': 'deploy',
  'publish-build-artifacts': 'deploy',
};

function stageForTask(name: string): StageKey {
  return TASK_STAGE[name] ?? 'build';
}

// OpenChoreo task phase → the status/conclusion the stepper reads.
function stepFromTask(task: BffWorkflowTask, number: number): BuildStep {
  const phase = task.phase ?? '';
  let status = 'pending';
  let conclusion: string | null = null;
  if (phase === 'Running') {
    status = 'in_progress';
  } else if (phase === 'Succeeded') {
    status = 'completed';
    conclusion = 'success';
  } else if (phase === 'Failed') {
    status = 'completed';
    conclusion = 'failure';
  }
  return { number, name: task.name, status, conclusion, started_at: task.startedAt ?? null, completed_at: task.completedAt ?? null };
}

// The last task that runs for each stage. A stage is done only once
// this task succeeds
const STAGE_FINAL_TASK: Record<StageKey, string> = {
  init: 'checkout-source',
  build: 'build-image',
  deploy: 'publish-build-artifacts',
};

// Stage status from its steps: in_progress if any running, completed once
// the stage's final task (STAGE_FINAL_TASK) has succeeded, otherwise null
// (the card reads an unresolved/empty stage as "pending").
function stageStatus(steps: BuildStep[], stage: StageKey): string | null {
  if (steps.length === 0) return null;
  if (steps.some((s) => s.status === 'in_progress')) return 'in_progress';
  const finalTask = steps.find((s) => s.name === STAGE_FINAL_TASK[stage]);
  return finalTask?.status === 'completed' ? 'completed' : null;
}

// The card base64-decodes stage logs (safeAtob), but the BFF returns raw text;
// re-encode so it renders. Null/empty stays null so the card shows the live
// step list instead.
function encodeLog(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return null;
  }
}

function buildRunLogsFromTasks(run: BffBuildRun, rawBuildLog: string | null): BuildRunLogs {
  const stages: Record<StageKey, BuildStep[]> = { init: [], build: [], deploy: [] };
  (run.tasks ?? []).forEach((t, i) => stages[stageForTask(t.name)].push(stepFromTask(t, i + 1)));
  const mk = (key: StageKey, log: string | null): BuildStage => ({ log, status: stageStatus(stages[key], key), steps: stages[key] });
  return { init: mk('init', null), build: mk('build', encodeLog(rawBuildLog)), deploy: mk('deploy', null) };
}

// The most entries the observer will return for one query; asking for more is
// rejected outright.
const BUILD_LOG_LIMIT = 1000;

/**
 * Renders queried rows as the build's log text, oldest line first.
 *
 * Rows arrive newest-first because a build that outruns the query limit has to
 * lose one end of its output, and the end worth keeping is the last one — a
 * failure reports itself there. Hitting the limit is called out in the text, so
 * a truncated log cannot be misread as a build that began mid-stream.
 */
export function buildLogTextFrom(rows: LogRow[]): string | null {
  if (rows.length === 0) return null;
  const lines = rows.map((r) => r.logLine).reverse();
  if (rows.length >= BUILD_LOG_LIMIT) {
    lines.unshift(`... earlier output omitted - showing the last ${BUILD_LOG_LIMIT} lines`);
  }
  return lines.join('\n');
}

// Fetch the build's log lines from the observability proxy, keyed by the
// WorkflowRun name. The time window starts at the run's start (30 days back
// when unknown) and is padded 10 minutes past completion to capture logs that
// arrive late in the ingestion pipeline; in-progress runs read up to now.
async function fetchObsBuildLogText(runId: string, run: BffBuildRun): Promise<string | null> {
  const startTime = run.startedAt || new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const endTime = run.completedAt ? new Date(new Date(run.completedAt).getTime() + 10 * 60_000).toISOString() : new Date().toISOString();
  try {
    const rows = await queryObsLogs({
      searchScope: { workflowRunName: runId },
      startTime,
      endTime,
      limit: BUILD_LOG_LIMIT,
      sortOrder: 'desc',
      searchPhrase: '',
    });
    return buildLogTextFrom(rows);
  } catch {
    return null;
  }
}

// Fetch the run (for task phases → steps) and its log text (best-effort) and
// synthesize the BuildRunLogs the stepper consumes. The build run is required;
// the log text is sourced solely from the observability proxy (a null result
// just leaves the stage log empty and the card shows the live step list).
async function loadBuildRunLogs(componentId: string, runId: string, projectQuery: string): Promise<BuildRunLogs | null> {
  const run = await bff.get<BffBuildRun | null>(`/components/${seg(componentId)}/builds/${seg(runId)}${projectQuery}`).catch(() => null);
  if (!run) return null;
  const rawLog = await fetchObsBuildLogText(runId, run);
  return buildRunLogsFromTasks(run, rawLog);
}

export const fetchBuildRunLogs = (_orgHandler: string, projectId: string, componentId: string, runId: string): Promise<BuildRunLogs | null> => loadBuildRunLogs(componentId, runId, q({ projectName: projectId }));

export const fetchBuildLogs = (componentId: string, _versionId: string, workflowName: string): Promise<BuildRunLogs | null> => loadBuildRunLogs(componentId, workflowName, '');
