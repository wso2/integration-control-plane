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

import type { BuildRunLogs, BuildStep } from '../types/build';
import type { Step, StepStatus } from '../types/stepper';
import { BUILD_STAGES } from '../constants/build';

export type BuildStageKey = (typeof BUILD_STAGES)[number]['key'];

/**
 * The stepper's whole state, derived once per render and then ratcheted forward
 * by `useStableStepperState`. `activeIndex` is the stage the build is working on
 * (`-1` = not started, `BUILD_STAGES.length` = all done).
 */
export interface StepperState {
  activeIndex: number;
  isError: boolean;
  skippedStages: Set<number>;
  failedStages: Set<number>;
  /** Stages observed finishing with none of their steps failing — never re-marked. */
  passedStages: Set<number>;
}

export function isFailedConclusion(conclusion?: string | null): boolean {
  const c = (conclusion ?? '').toLowerCase();
  return c === 'failure' || c === 'failed';
}

export function isSkippedConclusion(conclusion?: string | null): boolean {
  return (conclusion ?? '').toLowerCase() === 'skipped';
}

/**
 * Wording for a conclusion we have no specific copy for — `timed_out` reads as
 * "Timed Out". Covers the terminal-but-not-success-or-failure verdicts
 * (cancelled, timed out, neutral) so they never surface as "Unknown".
 */
export function humanizeConclusion(conclusion?: string | null): string {
  const c = (conclusion ?? '').trim();
  if (!c) return 'Unknown';
  return c.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function emptyStepperState(): StepperState {
  return { activeIndex: -1, isError: false, skippedStages: new Set(), failedStages: new Set(), passedStages: new Set() };
}

function stageSteps(logs: BuildRunLogs, key: BuildStageKey): BuildStep[] {
  return logs[key]?.steps ?? [];
}

/**
 * Stage the build is running. With no logs yet we hold at stage 0 rather than
 * "nothing started", so the card flips to In Progress the moment the build does
 * instead of waiting a poll for logs to land.
 */
function inProgressIndex(logs: BuildRunLogs | null | undefined): number {
  if (!logs) return 0;
  const running = BUILD_STAGES.findIndex(({ key }) => logs[key]?.status === 'in_progress');
  if (running !== -1) return running;
  // Between stages: sit on the first unfinished one. If every stage reports
  // completed while the build still says in-progress, hold on the last stage
  // rather than rendering an all-green stepper for a build that is still going.
  const firstUnfinished = BUILD_STAGES.findIndex(({ key }) => logs[key]?.status !== 'completed');
  return firstUnfinished === -1 ? BUILD_STAGES.length - 1 : firstUnfinished;
}

/** Raw (un-ratcheted) stepper state for one build. */
export function getBuildStatus(status: string | undefined, conclusion: string | null | undefined, logs: BuildRunLogs | null | undefined): StepperState {
  if (!status) return emptyStepperState();

  const skippedStages = new Set<number>();
  const failedStages = new Set<number>();
  const passedStages = new Set<number>();
  if (logs) {
    BUILD_STAGES.forEach(({ key }, i) => {
      const steps = stageSteps(logs, key);
      if (steps.length === 0) return;
      const allSkipped = steps.every((s) => isSkippedConclusion(s.conclusion));
      const anyFailed = steps.some((s) => isFailedConclusion(s.conclusion));
      if (allSkipped) skippedStages.add(i);
      if (anyFailed) failedStages.add(i);
      if (logs[key]?.status === 'completed' && !allSkipped && !anyFailed) passedStages.add(i);
    });
  }

  let activeIndex = -1;
  let isError = false;

  if (status === 'in_progress') {
    activeIndex = inProgressIndex(logs);
  } else if (status === 'completed') {
    if (isFailedConclusion(conclusion)) {
      isError = true;
      // Without a stage carrying the failing step, blame the stage the build had
      // reached — never stage 0, which is usually long since green.
      activeIndex = failedStages.size > 0 ? Math.min(...failedStages) : inProgressIndex(logs);
    } else if (conclusion === 'success') {
      activeIndex = BUILD_STAGES.length;
    } else {
      // Cancelled/terminated: no conclusion to trust, so go by the logs.
      activeIndex = inProgressIndex(logs);
    }
  }

  return { activeIndex, isError, skippedStages, failedStages, passedStages };
}

/** The stepper's steps for one state — labels from `BUILD_STAGES`, status per stage. */
export function buildStepperSteps(state: StepperState): Step[] {
  return BUILD_STAGES.map(({ key, label }, i) => ({ id: key, label, status: stepStatusAt(state, i) }));
}

/**
 * True when the build has finished but its log snapshot has not caught up with
 * the verdict — a step is still shown running, or a failed build has no step
 * carrying the failure. Polling has to continue through this window: the run's
 * last snapshot regularly lands before the breaking step resolves, and stopping
 * there freezes the card on a bare "Failed" that never names the step and a log
 * panel cut off mid-stream.
 */
export function logsBehindBuild(status: string | undefined, conclusion: string | null | undefined, logs: BuildRunLogs | null | undefined): boolean {
  if (status !== 'completed' || !logs) return false;
  const steps = BUILD_STAGES.flatMap(({ key }) => stageSteps(logs, key));
  if (steps.length === 0) return false;
  if (steps.some((s) => s.status === 'in_progress')) return true;
  return isFailedConclusion(conclusion) && !steps.some((s) => isFailedConclusion(s.conclusion));
}

/**
 * Build-step name → what the build was doing, for a "Failed while …" label.
 * The names are the OpenChoreo workflow tasks the BFF passes through. An
 * unmapped name just yields a plain "Failed".
 */
const BUILD_STEP_PHRASES: Record<string, string> = {
  'checkout-source': 'checking out the source',
  'build-image': 'building the image',
  'convert-component-descriptor': 'converting the component descriptor',
  'generate-workload-cr': 'generating the workload resource',
  'publish-build-artifacts': 'publishing build artifacts',
};

/** What the build was doing when it broke, or `undefined` if the step is unknown. */
export function failedStepPhrase(logs: BuildRunLogs | null | undefined): string | undefined {
  if (!logs) return undefined;
  for (const { key } of BUILD_STAGES) {
    const failed = stageSteps(logs, key).find((s) => isFailedConclusion(s.conclusion));
    if (failed) return BUILD_STEP_PHRASES[failed.name];
  }
  return undefined;
}

function unionSets(a: Set<number>, b: Set<number>): Set<number> {
  const result = new Set(a);
  b.forEach((v) => result.add(v));
  return result;
}

/**
 * Merge a fresh poll into the state already on screen without ever losing
 * ground: the active index only climbs, the skipped/failed sets only grow, and
 * the error flag latches. A poll that comes back partial or empty therefore
 * cannot walk the stepper backwards.
 */
export function mergeForward(stable: StepperState, raw: StepperState): StepperState {
  return {
    activeIndex: Math.max(stable.activeIndex, raw.activeIndex),
    isError: stable.isError || raw.isError,
    skippedStages: unionSets(stable.skippedStages, raw.skippedStages),
    failedStages: unionSets(stable.failedStages, raw.failedStages),
    passedStages: unionSets(stable.passedStages, raw.passedStages),
  };
}

/**
 * Per-stage icon status. A confirmed failure freezes the stepper: every stage
 * after the first failed one stays "not started" so a stale later stage can
 * never render as running once the build has already broken.
 */
export function stepStatusAt(state: StepperState, index: number): StepStatus {
  const { activeIndex, isError, skippedStages, failedStages, passedStages } = state;
  // A stage seen through to a clean finish is settled: nothing later — not a
  // regressed active index, not a build-level failure — may re-mark it.
  if (passedStages.has(index) && !failedStages.has(index)) return 'success';
  const firstFailed = failedStages.size > 0 ? Math.min(...failedStages) : -1;
  if (firstFailed !== -1 && index > firstFailed) return 'notStarted';
  if (failedStages.has(index)) return 'failed';
  if (skippedStages.has(index)) return 'skipped';
  if (index < activeIndex) return 'success';
  if (index === activeIndex) return isError ? 'failed' : 'inProgress';
  return 'notStarted';
}
