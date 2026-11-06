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
import { buildTimeline, decodePayloads, extractNodeExecutionDetail, extractWorkflowInput, splitQualifiedName } from './workflowHistory';

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const json = (value: unknown) => ({
  payloads: [
    {
      metadata: { encoding: b64('json/plain') },
      data: b64(JSON.stringify(value)),
    },
  ],
});
const at = (seconds: number) => new Date(Date.UTC(2026, 8, 28, 10, 0, seconds)).toISOString();

function event(eventId: number, eventType: string, seconds: number, attributes: Record<string, unknown> = {}) {
  return { eventId, eventType, timestamp: at(seconds), attributes };
}

// A run that reserved stock, is waiting on an approval, and was signalled once.
const RUNNING_RUN = [
  event(1, 'WORKFLOW_EXECUTION_STARTED', 0, {
    workflowType: { name: 'orderWorkflow' },
    input: json({ orderId: 'o-1' }),
  }),
  event(5, 'ACTIVITY_TASK_SCHEDULED', 1, {
    activityType: { name: 'reserveStock' },
    input: json([{ sku: 'A' }, { __callConfig__: true, stepId: 'reserveStock#1', retryOnError: true }]),
  }),
  event(7, 'ACTIVITY_TASK_COMPLETED', 3, {
    scheduledEventId: 5,
    result: json({ reserved: true }),
  }),
  event(9, 'START_CHILD_WORKFLOW_EXECUTION_INITIATED', 4, {
    workflowId: 'reviewactivity-orderWorkflow.approve-123',
    workflowType: { name: 'reviewactivity-orderWorkflow.approve' },
  }),
  event(11, 'WORKFLOW_EXECUTION_SIGNALED', 5, { signalName: 'nudge' }),
];

describe('buildTimeline', () => {
  it('pairs each step with its close event and leaves open ones running', () => {
    const { spans, start, end } = buildTimeline(RUNNING_RUN);
    expect(start).toBe(Date.parse(at(0)));
    expect(end).toBe(Date.parse(at(5)));
    expect(spans.map((s) => [s.label, s.category, s.status, s.running])).toEqual([
      ['orderWorkflow', 'WORKFLOW', 'RUNNING', true],
      ['reserveStock', 'ACTIVITY', 'COMPLETED', false],
      ['orderWorkflow.review-approve', 'HUMAN_TASK', 'RUNNING', true],
      ['nudge', 'SIGNAL', '', false],
    ]);
    const reserve = spans[1];
    expect(reserve.eventId).toBe('5');
    expect(reserve.end - reserve.start).toBe(2000);
  });

  it('closes the run span on its terminal event', () => {
    const finished = [
      ...RUNNING_RUN,
      event(12, 'WORKFLOW_EXECUTION_FAILED', 8, {
        failure: { message: 'boom' },
      }),
    ];
    const root = buildTimeline(finished).spans[0];
    expect(root).toMatchObject({ status: 'FAILED', running: false });
    expect(root.end).toBe(Date.parse(at(8)));
  });

  it('ends a step left open with the run, as the run ended', () => {
    const terminated = [...RUNNING_RUN, event(12, 'WORKFLOW_EXECUTION_TERMINATED', 8, { reason: 'stop' })];
    const review = buildTimeline(terminated).spans.find((s) => s.category === 'HUMAN_TASK');
    expect(review).toMatchObject({ status: 'TERMINATED', running: false });
    expect(review?.end).toBe(Date.parse(at(8)));
  });

  it('closes a child workflow that failed to start', () => {
    const child = buildTimeline([
      event(1, 'WORKFLOW_EXECUTION_STARTED', 0),
      event(2, 'START_CHILD_WORKFLOW_EXECUTION_INITIATED', 1, {
        workflowId: 'child-1',
        workflowType: { name: 'shipWorkflow' },
      }),
      event(3, 'START_CHILD_WORKFLOW_EXECUTION_FAILED', 2, {
        initiatedEventId: '2',
      }),
    ]).spans.find((s) => s.category === 'CHILD_WORKFLOW');
    expect(child).toMatchObject({ status: 'FAILED', running: false });
    expect(child?.end).toBe(Date.parse(at(2)));
  });

  it('pairs timers by their timer id', () => {
    const timeline = buildTimeline([event(1, 'WORKFLOW_EXECUTION_STARTED', 0), event(2, 'TIMER_STARTED', 1, { timerId: 't1' }), event(3, 'TIMER_FIRED', 31, { timerId: 't1' })]);
    expect(timeline.spans[1]).toMatchObject({
      label: 'Timer t1',
      category: 'TIMER',
      status: 'COMPLETED',
      running: false,
    });
  });

  it('is empty without timestamps', () => {
    expect(buildTimeline([{ eventId: 1, eventType: 'X' }]).spans).toEqual([]);
  });
});

describe('payload decoding', () => {
  it('parses JSON payloads and treats a null encoding as no value', () => {
    expect(decodePayloads(json({ a: 1 }))).toEqual({ a: 1 });
    expect(
      decodePayloads({
        payloads: [{ metadata: { encoding: b64('binary/null') } }],
      }),
    ).toBeNull();
    expect(decodePayloads({ payloads: [] })).toBeNull();
  });

  it('reads the run input off the start event', () => {
    expect(extractWorkflowInput(RUNNING_RUN)).toEqual({ orderId: 'o-1' });
    expect(extractWorkflowInput([])).toBeNull();
  });
});

describe('extractNodeExecutionDetail', () => {
  it('splits the call configuration off the input and reads the result', () => {
    const detail = extractNodeExecutionDetail({ id: '5', type: 'ACTIVITY' }, RUNNING_RUN);
    expect(detail).toMatchObject({
      input: { sku: 'A' },
      result: { reserved: true },
      status: 'COMPLETED',
      error: null,
      durationMs: 2000,
      callConfig: { stepId: 'reserveStock#1', retryOnError: true },
      childWorkflowId: null,
    });
  });

  it('reports a still-open step with the status it was given', () => {
    const detail = extractNodeExecutionDetail({ id: '9', type: 'HUMAN_TASK', status: 'RUNNING' }, RUNNING_RUN);
    expect(detail).toMatchObject({
      result: null,
      status: 'RUNNING',
      durationMs: null,
      childWorkflowId: 'reviewactivity-orderWorkflow.approve-123',
    });
  });

  it('reports a child workflow that failed to start as failed, as the timeline does', () => {
    const history = [
      event(1, 'WORKFLOW_EXECUTION_STARTED', 0),
      event(2, 'START_CHILD_WORKFLOW_EXECUTION_INITIATED', 1, { workflowId: 'child-1', workflowType: { name: 'shipWorkflow' } }),
      event(3, 'START_CHILD_WORKFLOW_EXECUTION_FAILED', 2, { initiatedEventId: '2' }),
    ];
    expect(extractNodeExecutionDetail({ id: '2', type: 'CHILD_WORKFLOW' }, history)).toMatchObject({ status: 'FAILED', durationMs: 1000 });
  });

  it('reads the run itself from its start and terminal events', () => {
    const failed = [
      ...RUNNING_RUN,
      event(12, 'WORKFLOW_EXECUTION_FAILED', 8, {
        failure: { message: 'boom' },
      }),
    ];
    expect(extractNodeExecutionDetail({ id: '', type: 'WORKFLOW' }, failed)).toMatchObject({
      input: { orderId: 'o-1' },
      status: 'FAILED',
      error: 'boom',
    });
  });
});

describe('splitQualifiedName', () => {
  it('splits a qualified name and passes a bare one through as the task', () => {
    expect(splitQualifiedName('workflow-orderWorkflow.approve')).toEqual({
      workflow: 'orderWorkflow',
      task: 'approve',
    });
    expect(splitQualifiedName('reserveStock')).toEqual({
      task: 'reserveStock',
    });
  });
});
