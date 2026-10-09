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
import { derivePodRows } from './scaling';
import type { ClusterPod, PodMetrics } from '../../types/runtime';

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
