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
import { atMaxReplicasMessage, blockedAutoscalingMessages, cappedMetrics, derivePodRows, pollsAutoscaling } from './scaling';
import type { ClusterPod, PodMetrics } from '../types/runtime';
import type { Autoscaling, AutoscalingStatus } from '../types/scaling';

const pod = (over: Partial<ClusterPod> & { name: string }): ClusterPod => ({
  metadata: { name: over.name, uid: over.name, ...over.metadata },
  spec: over.spec ?? { containers: [] },
  status: over.status ?? { phase: 'Running' },
});

describe('derivePodRows', () => {
  it('computes ready/total, restarts and joins metrics by pod name', () => {
    const pods: ClusterPod[] = [
      pod({
        name: 'a',
        spec: { containers: [{ name: 'main' }, { name: 'sidecar' }] },
        status: {
          phase: 'Running',
          startTime: '2026-01-01',
          containerStatuses: [
            { name: 'main', ready: true, restartCount: 1 },
            { name: 'sidecar', ready: false, restartCount: 2 },
          ],
        },
      }),
    ];
    const metrics: PodMetrics[] = [{ metadata: { name: 'a' }, containers: [{ name: 'main', usage: { cpu: '10m', memory: '20Mi' } }] }];
    const [row] = derivePodRows(pods, metrics);
    expect(row).toMatchObject({ name: 'a', status: 'Running', isRunning: true, readyContainers: 1, totalContainers: 2, restarts: 3, cpu: '10m', memory: '20Mi' });
  });
});

// Two replicas held at a max of 2: CPU 2% against 57%, memory 40% against 20%.
const capped = (status: Partial<AutoscalingStatus>, over: Partial<Autoscaling> = {}): Autoscaling => ({
  environmentId: 'development',
  supported: true,
  effective: true,
  memoryEffective: true,
  enabled: true,
  minReplicas: 1,
  maxReplicas: 2,
  cpuUtilizationPercentage: 57,
  memoryUtilizationPercentage: 20,
  maxReplicasLimit: 5,
  status: { currentReplicas: 2, desiredReplicas: 2, conditions: [], ...status },
  ...over,
});

describe('cappedMetrics', () => {
  it('names the metric whose own replica count exceeds the maximum', () => {
    expect(cappedMetrics(capped({ currentCpuUtilizationPercentage: 2, currentMemoryUtilizationPercentage: 40 }))).toEqual([{ name: 'Memory', current: 40, target: 20, wants: 4 }]);
  });

  it('names every metric over the maximum', () => {
    expect(cappedMetrics(capped({ currentCpuUtilizationPercentage: 95, currentMemoryUtilizationPercentage: 40 })).map((m) => m.name)).toEqual(['CPU', 'Memory']);
  });

  it('ignores a metric with no reading, and one that is not targeted', () => {
    expect(cappedMetrics(capped({ currentCpuUtilizationPercentage: 2 }))).toEqual([]);
    expect(cappedMetrics(capped({ currentCpuUtilizationPercentage: 2, currentMemoryUtilizationPercentage: 40 }, { memoryUtilizationPercentage: undefined }))).toEqual([]);
  });

  it('is empty without a live status', () => {
    expect(cappedMetrics(capped({}, { status: undefined }))).toEqual([]);
  });
});

describe('atMaxReplicasMessage', () => {
  it('names the metric, its reading, its target and the replicas it needs', () => {
    expect(atMaxReplicasMessage(capped({ currentCpuUtilizationPercentage: 2, currentMemoryUtilizationPercentage: 40 }))).toBe(
      'Memory is at 40%, above its 20% target, and needs 4 replicas. Max replicas caps it at 2. Raise Max replicas to scale further, or the target if this usage is expected.',
    );
  });

  it('falls back to the bare cap while no reading can be named', () => {
    expect(atMaxReplicasMessage(capped({}))).toBe('The autoscaler needs more replicas than the maximum of 2. Raise Max replicas to allow more.');
  });
});

describe('blockedAutoscalingMessages', () => {
  const observedAt = Date.parse('2026-10-10T14:10:00Z');
  const withCondition = (condition: Partial<AutoscalingStatus['conditions'][number]>) =>
    capped({ conditions: [{ type: 'ScalingActive', status: 'False', reason: 'FailedGetResourceMetric', message: 'failed to get cpu utilization: did not receive metrics for targeted pods (pods might be unready)', ...condition }] });

  it('leaves out a metrics gap within the restart window', () => {
    expect(blockedAutoscalingMessages(withCondition({ lastTransitionTime: '2026-10-10T14:08:30Z' }), observedAt)).toEqual([]);
  });

  it('reports a metrics gap that outlasts the restart window, in plain words', () => {
    expect(blockedAutoscalingMessages(withCondition({ lastTransitionTime: '2026-10-10T14:02:00Z' }), observedAt)).toEqual([
      "The autoscaler hasn't received usage readings from the replicas for 8 minutes, so it isn't scaling. A replica that never becomes ready stops its readings; check the replicas below.",
    ]);
  });

  it('reports a metrics gap with no start time, which cannot be told from a lasting one', () => {
    expect(blockedAutoscalingMessages(withCondition({}), observedAt)).toEqual(["The autoscaler hasn't received usage readings from the replicas, so it isn't scaling. A replica that never becomes ready stops its readings; check the replicas below."]);
  });

  it('reports any other blocked condition with its own reason', () => {
    expect(blockedAutoscalingMessages(withCondition({ type: 'AbleToScale', reason: 'FailedGetScale', message: 'the HPA controller was unable to get the target scale' }), observedAt)).toEqual([
      "The autoscaler can't scale right now: the HPA controller was unable to get the target scale",
    ]);
  });

  it('ignores conditions that are not blocking', () => {
    expect(blockedAutoscalingMessages(withCondition({ status: 'True', reason: 'ValidMetricFound' }), observedAt)).toEqual([]);
  });

  it('reads ScalingLimited False as the healthy within-range state', () => {
    expect(blockedAutoscalingMessages(withCondition({ type: 'ScalingLimited', reason: 'DesiredWithinRange', message: 'the desired count is within the acceptable range' }), observedAt)).toEqual([]);
  });
});

describe('pollsAutoscaling', () => {
  it('polls while autoscaling is on', () => {
    expect(pollsAutoscaling(capped({}))).toBe(true);
  });

  it('stops once autoscaling is off and the platform reports no failure', () => {
    expect(pollsAutoscaling(capped({}, { enabled: false }))).toBe(false);
  });

  it('follows a reported render failure after autoscaling is turned off, until it clears', () => {
    expect(pollsAutoscaling(capped({}, { enabled: false, syncStatus: 'RenderingFailed', syncMessage: 'autoscaling.minReplicas must not exceed autoscaling.maxReplicas.' }))).toBe(true);
  });

  it('does not poll before the setting has loaded', () => {
    expect(pollsAutoscaling(undefined)).toBe(false);
  });
});
