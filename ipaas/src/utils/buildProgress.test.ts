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

import { describe, expect, it } from 'vitest';
import { buildStepperSteps, failedStepPhrase, getBuildStatus, humanizeConclusion, isSkippedConclusion, logsBehindBuild, mergeForward, stepStatusAt, type StepperState } from './buildProgress';
import { BUILD_STAGES } from '../constants/build';
import type { BuildRunLogs, BuildStage } from '../types/build';

const stage = (status: string | null, conclusions: (string | null)[] = []): BuildStage => ({
  log: null,
  status,
  steps: conclusions.map((conclusion, i) => ({ number: i + 1, name: `step-${i}`, status: conclusion ? 'completed' : 'in_progress', conclusion })),
});

const logs = (init: BuildStage, build: BuildStage, deploy: BuildStage): BuildRunLogs => ({ init, build, deploy });

const statuses = (state: StepperState) => BUILD_STAGES.map((_, i) => stepStatusAt(state, i));

describe('getBuildStatus', () => {
  it('holds at the first stage the moment a build starts, before logs land', () => {
    const state = getBuildStatus('in_progress', '', undefined);
    expect(state.activeIndex).toBe(0);
    expect(statuses(state)).toEqual(['inProgress', 'notStarted', 'notStarted']);
  });

  it('highlights nothing while queued', () => {
    const state = getBuildStatus('queued', '', undefined);
    expect(state.activeIndex).toBe(-1);
    expect(statuses(state)).toEqual(['notStarted', 'notStarted', 'notStarted']);
  });

  it('tracks the running stage', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['success']), stage('in_progress', [null]), stage(null)));
    expect(state.activeIndex).toBe(1);
    expect(statuses(state)).toEqual(['success', 'inProgress', 'notStarted']);
  });

  it('sits on the first unfinished stage between stages', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['success']), stage(null), stage(null)));
    expect(state.activeIndex).toBe(1);
  });

  it('holds the active index on the last stage when every stage is done but the build is not', () => {
    const done = stage('completed', ['success']);
    const state = getBuildStatus('in_progress', '', logs(done, done, done));
    expect(state.activeIndex).toBe(BUILD_STAGES.length - 1);
    // All three finished clean, so they read as such — the index only keeps the
    // highlight off the end while the run wraps up.
    expect(statuses(state)).toEqual(['success', 'success', 'success']);
  });

  it('marks every stage successful once the build completes', () => {
    const state = getBuildStatus('completed', 'success', undefined);
    expect(state.activeIndex).toBe(BUILD_STAGES.length);
    expect(statuses(state)).toEqual(['success', 'success', 'success']);
  });

  it('freezes at the failed stage and does not advance past it', () => {
    const state = getBuildStatus('completed', 'failure', logs(stage('completed', ['success']), stage('completed', ['failure']), stage('in_progress', [null])));
    expect(state.activeIndex).toBe(1);
    expect(state.isError).toBe(true);
    expect(statuses(state)).toEqual(['success', 'failed', 'notStarted']);
  });

  it('reports failure at the first stage when a failed build has no logs', () => {
    const state = getBuildStatus('completed', 'failed', null);
    expect(state.isError).toBe(true);
    expect(statuses(state)).toEqual(['failed', 'notStarted', 'notStarted']);
  });

  it('blames the stage the build reached, not stage 0, when no step carries the failure', () => {
    // The real shape of a failed run's last snapshot: init green, the breaking
    // step still reading in-progress, nothing marked failure anywhere.
    const state = getBuildStatus('completed', 'failure', logs(stage('completed', ['success']), stage('in_progress', [null]), stage(null)));
    expect(state.activeIndex).toBe(1);
    expect(statuses(state)).toEqual(['success', 'failed', 'notStarted']);
  });

  it('never re-marks a stage that already finished clean', () => {
    const passed = getBuildStatus('in_progress', '', logs(stage('completed', ['success']), stage('in_progress', [null]), stage(null)));
    expect([...passed.passedStages]).toEqual([0]);
    // Even with the active index dragged back onto it and the build in error.
    expect(stepStatusAt({ ...passed, activeIndex: 0, isError: true }, 0)).toBe('success');
  });

  it('does not count an all-skipped stage as passed', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['skipped']), stage('in_progress', [null]), stage(null)));
    expect([...state.passedStages]).toEqual([]);
    expect(statuses(state)).toEqual(['skipped', 'inProgress', 'notStarted']);
  });

  it('recognises a skipped stage whatever the case of the conclusion', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['SKIPPED']), stage('in_progress', [null]), stage(null)));
    expect([...state.skippedStages]).toEqual([0]);
    expect([...state.passedStages]).toEqual([]);
    expect(statuses(state)).toEqual(['skipped', 'inProgress', 'notStarted']);
  });

  it('detects a stage failure while the build still reports in progress', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['failure']), stage(null), stage(null)));
    expect([...state.failedStages]).toEqual([0]);
    expect(statuses(state)).toEqual(['failed', 'notStarted', 'notStarted']);
  });

  it('marks a stage skipped when all of its steps were skipped', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['success']), stage('completed', ['skipped', 'skipped']), stage('in_progress', [null])));
    expect([...state.skippedStages]).toEqual([1]);
    expect(statuses(state)).toEqual(['success', 'skipped', 'inProgress']);
  });

  it('falls back to the logs for a cancelled build', () => {
    const state = getBuildStatus('completed', 'cancelled', logs(stage('completed', ['success']), stage(null), stage(null)));
    expect(state.activeIndex).toBe(1);
    expect(state.isError).toBe(false);
  });

  it('returns an empty state with no build', () => {
    expect(getBuildStatus(undefined, undefined, undefined)).toEqual({ activeIndex: -1, isError: false, skippedStages: new Set(), failedStages: new Set(), passedStages: new Set() });
  });
});

describe('failedStepPhrase', () => {
  const named = (steps: { name: string; conclusion: string | null }[]): BuildStage => ({
    log: null,
    status: 'completed',
    steps: steps.map((s, i) => ({ number: i + 1, name: s.name, status: 'completed', conclusion: s.conclusion })),
  });

  it('names the failed OpenChoreo task', () => {
    expect(failedStepPhrase(logs(named([{ name: 'checkout-source', conclusion: 'success' }]), named([{ name: 'build-image', conclusion: 'failure' }]), stage(null)))).toBe('building the image');
  });

  it('reports the earliest failure when several steps fail', () => {
    const failed = logs(named([{ name: 'checkout-source', conclusion: 'failure' }]), named([{ name: 'build-image', conclusion: 'failure' }]), stage(null));
    expect(failedStepPhrase(failed)).toBe('checking out the source');
  });

  it('gives no phrase for an unmapped step name', () => {
    expect(failedStepPhrase(logs(stage(null), named([{ name: 'some-new-task', conclusion: 'failure' }]), stage(null)))).toBeUndefined();
  });

  it('gives no phrase without logs or without a failure', () => {
    expect(failedStepPhrase(null)).toBeUndefined();
    expect(failedStepPhrase(logs(named([{ name: 'checkout-source', conclusion: 'success' }]), stage(null), stage(null)))).toBeUndefined();
  });
});

describe('isSkippedConclusion', () => {
  it('matches regardless of case', () => {
    expect(isSkippedConclusion('skipped')).toBe(true);
    expect(isSkippedConclusion('SKIPPED')).toBe(true);
    expect(isSkippedConclusion('Skipped')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSkippedConclusion('success')).toBe(false);
    expect(isSkippedConclusion(null)).toBe(false);
    expect(isSkippedConclusion(undefined)).toBe(false);
  });
});

describe('humanizeConclusion', () => {
  it('spaces and title-cases a snake_case verdict', () => {
    expect(humanizeConclusion('timed_out')).toBe('Timed Out');
  });

  it('title-cases a single word', () => {
    expect(humanizeConclusion('cancelled')).toBe('Cancelled');
  });

  it('falls back to Unknown for an absent verdict', () => {
    expect(humanizeConclusion('')).toBe('Unknown');
    expect(humanizeConclusion('   ')).toBe('Unknown');
    expect(humanizeConclusion(null)).toBe('Unknown');
    expect(humanizeConclusion(undefined)).toBe('Unknown');
  });
});

describe('buildStepperSteps', () => {
  it('labels each stage and carries its status', () => {
    const state = getBuildStatus('in_progress', '', logs(stage('completed', ['success']), stage('in_progress', [null]), stage(null)));
    expect(buildStepperSteps(state)).toEqual([
      { id: 'init', label: 'Initialization', status: 'success' },
      { id: 'build', label: 'Build Source & Test', status: 'inProgress' },
      { id: 'deploy', label: 'Finalization', status: 'notStarted' },
    ]);
  });

  it('emits one step per build stage', () => {
    expect(buildStepperSteps(getBuildStatus('queued', '', undefined))).toHaveLength(BUILD_STAGES.length);
  });
});

describe('logsBehindBuild', () => {
  it('keeps polling a failed build whose logs show no failure yet', () => {
    expect(logsBehindBuild('completed', 'failure', logs(stage('completed', ['success']), stage('in_progress', [null]), stage(null)))).toBe(true);
  });

  it('keeps polling while any step still reads as running', () => {
    expect(logsBehindBuild('completed', 'success', logs(stage('completed', ['success']), stage('in_progress', [null]), stage(null)))).toBe(true);
  });

  it('stops once the logs carry the failure', () => {
    expect(logsBehindBuild('completed', 'failure', logs(stage('completed', ['success']), stage('completed', ['failure']), stage(null)))).toBe(false);
  });

  it('stops for a settled successful build', () => {
    const done = stage('completed', ['success']);
    expect(logsBehindBuild('completed', 'success', logs(done, done, done))).toBe(false);
  });

  it('does not poll a running build through this path, nor one with no logs', () => {
    expect(logsBehindBuild('in_progress', '', logs(stage('in_progress', [null]), stage(null), stage(null)))).toBe(false);
    expect(logsBehindBuild('completed', 'failure', null)).toBe(false);
    expect(logsBehindBuild('completed', 'failure', logs(stage(null), stage(null), stage(null)))).toBe(false);
  });
});

describe('mergeForward', () => {
  const state = (over: Partial<StepperState> = {}): StepperState => ({ activeIndex: 0, isError: false, skippedStages: new Set(), failedStages: new Set(), passedStages: new Set(), ...over });

  it('advances when the new state is further along', () => {
    expect(mergeForward(state({ activeIndex: 1 }), state({ activeIndex: 2 })).activeIndex).toBe(2);
  });

  it('never walks the active index backwards', () => {
    expect(mergeForward(state({ activeIndex: 2 }), state({ activeIndex: 0 })).activeIndex).toBe(2);
  });

  it('never walks back to nothing-started when a poll comes back empty', () => {
    expect(mergeForward(state({ activeIndex: 1 }), state({ activeIndex: -1 })).activeIndex).toBe(1);
  });

  it('latches the error flag', () => {
    expect(mergeForward(state({ isError: true }), state({ isError: false })).isError).toBe(true);
  });

  it('keeps failed and skipped stages once seen', () => {
    const merged = mergeForward(state({ failedStages: new Set([1]), skippedStages: new Set([0]) }), state());
    expect([...merged.failedStages]).toEqual([1]);
    expect([...merged.skippedStages]).toEqual([0]);
  });

  it('unions newly reported failures in', () => {
    const merged = mergeForward(state({ failedStages: new Set([0]) }), state({ failedStages: new Set([2]) }));
    expect([...merged.failedStages].sort()).toEqual([0, 2]);
  });
});
