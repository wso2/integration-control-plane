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

import { afterEach, describe, expect, it, vi } from 'vitest';

const queryObsLogEntries = vi.hoisted(() => vi.fn());
const resolveComponentProject = vi.hoisted(() => vi.fn());

vi.mock('./logs', () => ({ queryObsLogEntries, resolveComponentProject }));

import { executionLogWindow, fetchExecutionLogs, podBelongsToJob, toExecutionLogEntry } from './executions';
import { formatExecutionLogLine, spansMultipleContainers } from '../utils/logs';
import { HttpError } from '../types/http';
import type { ObsLogEntry } from './logs';

// A run that started 2026-09-10T10:00:00Z and finished four minutes later,
// in the unix-seconds-as-string form the executions table carries.
const STARTED = Date.UTC(2026, 8, 10, 10, 0, 0) / 1000;
const COMPLETED = STARTED + 240;
const unix = (seconds: number): string => String(seconds);

describe('executionLogWindow', () => {
  it('pads a completed run on both sides', () => {
    const { startTime, endTime } = executionLogWindow({ startTime: unix(STARTED), completionTime: unix(COMPLETED) });
    // Lead of 1 min before the first event, trail of 5 min past completion.
    expect(startTime).toBe('2026-09-10T09:59:00.000Z');
    expect(endTime).toBe('2026-09-10T10:09:00.000Z');
  });

  it('reads a still-running run up to now', () => {
    const now = Date.UTC(2026, 8, 10, 10, 2, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { startTime, endTime } = executionLogWindow({ startTime: unix(STARTED), completionTime: '' });
    expect(startTime).toBe('2026-09-10T09:59:00.000Z');
    expect(endTime).toBe('2026-09-10T10:02:00.000Z');
  });

  it('falls back to a 24h lookback when the run has no start time', () => {
    const now = Date.UTC(2026, 8, 10, 10, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { startTime, endTime } = executionLogWindow(undefined);
    expect(startTime).toBe('2026-09-09T10:00:00.000Z');
    expect(endTime).toBe('2026-09-10T10:00:00.000Z');
  });

  // A non-numeric timestamp must not become an Invalid Date the observer 400s on.
  it('treats an unparseable start time as absent rather than producing NaN', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 10, 10, 0, 0));
    const { startTime, endTime } = executionLogWindow({ startTime: 'not-a-number', completionTime: '' });
    expect(startTime).toBe('2026-09-09T10:00:00.000Z');
    expect(endTime).toBe('2026-09-10T10:00:00.000Z');
  });

  // A clock skew or a bad completionTime must not invert the range.
  it('never returns an end before the start', () => {
    const { startTime, endTime } = executionLogWindow({ startTime: unix(STARTED), completionTime: unix(STARTED - 3600) });
    expect(Date.parse(endTime)).toBeGreaterThanOrEqual(Date.parse(startTime));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('podBelongsToJob', () => {
  const JOB = 'scheduled-logger-a1b2c3-29713548';
  const cases: { name: string; pod: string; job: string; expected: boolean }[] = [
    { name: 'the pod of that job', pod: `${JOB}-2d2xp`, job: JOB, expected: true },
    { name: 'the job name itself', pod: JOB, job: JOB, expected: true },
    // The trailing hyphen is the whole point: a bare startsWith would match here.
    { name: 'a job whose name merely starts the same', pod: 'x-2971-abc', job: 'x-297', expected: false },
    { name: 'a different run of the same cronjob', pod: 'scheduled-logger-a1b2c3-29713549-kk9zz', job: JOB, expected: false },
    { name: 'an entry with no pod name', pod: '', job: JOB, expected: false },
    { name: 'no job to compare against', pod: `${JOB}-2d2xp`, job: '', expected: false },
  ];

  it.each(cases)('$expected for $name', ({ pod, job, expected }) => {
    expect(podBelongsToJob(pod, job)).toBe(expected);
  });
});

describe('toExecutionLogEntry', () => {
  it('maps the observer entry onto the drawer contract', () => {
    expect(toExecutionLogEntry({ timestamp: '2026-09-10T10:00:01Z', log: 'hello', level: 'INFO', metadata: { containerName: 'main', podName: 'p-1' } })).toEqual({
      timestamp: '2026-09-10T10:00:01Z',
      message: 'hello',
      level: 'INFO',
      container: 'main',
    });
  });

  it('defaults every field the observer omitted', () => {
    expect(toExecutionLogEntry({})).toEqual({ timestamp: '', message: '', level: '', container: '' });
  });
});

describe('formatExecutionLogLine', () => {
  const entry = { timestamp: '2026-09-10T10:00:01Z', message: 'hello', level: 'INFO', container: 'main' };

  it('omits the container tag for single-container output', () => {
    expect(formatExecutionLogLine(entry, false)).toBe('2026-09-10T10:00:01Z INFO hello');
  });

  it('tags the container when the run spans more than one', () => {
    expect(formatExecutionLogLine(entry, true)).toBe('2026-09-10T10:00:01Z [main] INFO hello');
  });

  it('drops the parts the entry does not carry', () => {
    expect(formatExecutionLogLine({ timestamp: '', message: 'bare' }, true)).toBe('bare');
  });

  it('reports container spanning only when the containers actually differ', () => {
    expect(spansMultipleContainers([entry, { ...entry, container: 'main' }])).toBe(false);
    expect(spansMultipleContainers([entry, { ...entry, container: 'init' }])).toBe(true);
    expect(spansMultipleContainers([{ timestamp: '', message: 'x' }])).toBe(false);
  });
});

describe('fetchExecutionLogs', () => {
  const JOB = 'scheduled-logger-a1b2c3-29713548';
  const run = { startTime: unix(STARTED), completionTime: unix(COMPLETED) };
  const entry = (podName: string, log: string): ObsLogEntry => ({ timestamp: '2026-09-10T10:00:01Z', log, level: 'INFO', metadata: { podName, containerName: 'main' } });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps only the lines from this run, scoped to the component and environment', async () => {
    resolveComponentProject.mockResolvedValue('default');
    queryObsLogEntries.mockResolvedValue([entry(`${JOB}-2d2xp`, 'mine'), entry('scheduled-logger-a1b2c3-29713549-kk9zz', 'another run'), entry('', 'unattributable')]);

    const logs = await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'Development', run);

    expect(logs.map((l) => l.message)).toEqual(['mine']);
    const query = queryObsLogEntries.mock.calls[0][0];
    expect(query.searchScope).toEqual({ project: 'default', component: 'scheduled-logger', environment: 'development' });
    expect(query.sortOrder).toBe('asc');
    expect(query.startTime).toBe('2026-09-10T09:59:00.000Z');
    // Filtering by level would drop a task's unlabelled stdout.
    expect(query.logLevels).toBeUndefined();
  });

  // Verified against the dev observer: a component-scoped query with no project
  // is answered "searchScope.project is required when searchScope.component is
  // provided" (400), so there is nothing to gain by sending it.
  it('does not query when the owning project cannot be resolved', async () => {
    resolveComponentProject.mockResolvedValue(undefined);

    expect(await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run)).toEqual([]);
    expect(queryObsLogEntries).not.toHaveBeenCalled();
  });

  it('does not query at all without a component, environment and run', async () => {
    expect(await fetchExecutionLogs('', 'track', JOB, 'development', run)).toEqual([]);
    expect(await fetchExecutionLogs('scheduled-logger', 'track', '', 'development', run)).toEqual([]);
    expect(await fetchExecutionLogs('scheduled-logger', 'track', JOB, '', run)).toEqual([]);
    expect(queryObsLogEntries).not.toHaveBeenCalled();
  });

  // The observer reports "nothing indexed for this org" as a 5xx; that is an
  // empty result, and surfacing it as an error would show a failed state to
  // every org that has not run an automation yet.
  it('treats the no-indexed-data error as no logs', async () => {
    resolveComponentProject.mockResolvedValue('default');
    queryObsLogEntries.mockRejectedValue(new HttpError(500, 'HTTP 500: {"errorCode":"OBS-V1-L-04"}'));

    expect(await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run)).toEqual([]);
  });

  // The observer applies its entry limit before the console can filter by pod,
  // and offers no pod or job selector, so a window crowded by concurrent runs
  // would otherwise hide this run entirely behind the first full page.
  it('reaches a run whose output starts after a full page of other pods', async () => {
    resolveComponentProject.mockResolvedValue('default');
    const crowd = Array.from({ length: 1000 }, (_, i) => entry('scheduled-logger-a1b2c3-29713549-kk9zz', `other ${i}`));
    crowd[crowd.length - 1] = { ...crowd[crowd.length - 1], timestamp: '2026-09-10T10:00:00Z' };
    queryObsLogEntries.mockResolvedValueOnce(crowd).mockResolvedValueOnce([entry(`${JOB}-2d2xp`, 'mine')]);

    const logs = await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run);

    expect(logs.map((l) => l.message)).toEqual(['mine']);
    expect(queryObsLogEntries).toHaveBeenCalledTimes(2);
    // The next page resumes at the last entry seen; both range ends are
    // exclusive, so nothing is fetched twice.
    expect(queryObsLogEntries.mock.calls[1][0].startTime).toBe('2026-09-10T10:00:00Z');
    expect(queryObsLogEntries.mock.calls[1][0].endTime).toBe(queryObsLogEntries.mock.calls[0][0].endTime);
  });

  it('stops after a short page rather than asking for more', async () => {
    resolveComponentProject.mockResolvedValue('default');
    queryObsLogEntries.mockResolvedValue([entry(`${JOB}-2d2xp`, 'mine')]);

    await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run);

    expect(queryObsLogEntries).toHaveBeenCalledTimes(1);
  });

  // Every entry of a full page sharing one second leaves no later cursor to ask
  // for, so the walk has to end rather than repeat the same query forever.
  it('gives up when the cursor cannot advance', async () => {
    resolveComponentProject.mockResolvedValue('default');
    queryObsLogEntries.mockResolvedValue(Array.from({ length: 1000 }, () => entry('other-pod-xyz', 'x')));

    const logs = await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run);

    expect(logs).toEqual([]);
    expect(queryObsLogEntries.mock.calls.length).toBeLessThanOrEqual(2);
  });

  // A window busier than the walk allows must still return what it found.
  it('bounds the walk and keeps the matches it reached', async () => {
    resolveComponentProject.mockResolvedValue('default');
    let n = 0;
    queryObsLogEntries.mockImplementation(() => Promise.resolve([...Array.from({ length: 999 }, () => entry('other-pod-xyz', 'x')), { ...entry(`${JOB}-2d2xp`, `mine ${n}`), timestamp: `2026-09-10T10:${String(n++).padStart(2, '0')}:00Z` }]));

    const logs = await fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run);

    expect(queryObsLogEntries).toHaveBeenCalledTimes(10);
    expect(logs).toHaveLength(10);
  });

  it('propagates any other failure', async () => {
    resolveComponentProject.mockResolvedValue('default');
    queryObsLogEntries.mockRejectedValue(new HttpError(500, 'HTTP 500: {"errorCode":"OBS-V1-L-29"}'));

    await expect(fetchExecutionLogs('scheduled-logger', 'track', JOB, 'development', run)).rejects.toThrow('OBS-V1-L-29');
  });
});
