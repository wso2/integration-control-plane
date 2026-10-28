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

import type { JSX } from 'react';
import PodConditionsStepper from './PodConditionsStepper';
import PodDrawerShell from './PodDrawerShell';
import PodEventsTable from './PodEventsTable';
import { usePodEvents } from '../../hooks/useRuntime';
import type { ClusterPod, PodScope } from '../../types/runtime';

interface PodEventsDrawerProps {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  pod: ClusterPod | null;
  scope: PodScope;
}

/** Conditions come from the pod the runtime page already holds, so only events are fetched. */
export default function PodEventsDrawer({ open, onClose, onExited, pod, scope }: PodEventsDrawerProps): JSX.Element {
  const podName = pod?.metadata.name ?? '';
  const { data: events, isLoading, isError } = usePodEvents(scope.projectId, scope.componentHandler, scope.releaseId, podName, open);

  return (
    <PodDrawerShell open={open} onClose={onClose} onExited={onExited} title={`Pod Conditions and Events for ${podName}`}>
      <PodConditionsStepper pod={pod} />
      <PodEventsTable events={events} isLoading={isLoading} isError={isError} />
    </PodDrawerShell>
  );
}
