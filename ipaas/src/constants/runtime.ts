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

import type { PodConditionInfo } from '../types/runtime';

export const POD_ACTION_LABELS = {
  events: 'Pod conditions and events',
  logs: 'Real-time container logs',
  noPermission: 'You do not have sufficient permissions',
} as const;

export const POD_LOGS_TOOLTIPS = {
  sinceSeconds: 'Fetch logs since the specified number of seconds (starting from now)',
  previousLogs: 'Retrieves logs from a previous instance of this same container after a crash or restart (available when the restart count is greater than 0).',
} as const;

export const POD_EVENT_COUNT_TOOLTIP = 'The number of times this event has been emitted.';

/** Typing in the Since Seconds box would otherwise refetch on every keystroke. */
export const SINCE_SECONDS_DEBOUNCE_MS = 300;

/** Pod drawers open below the app bar; the expanded state takes the full window width. */
export const POD_DRAWER_TOP_OFFSET = 64;
export const POD_DRAWER_WIDTH = 960;

/**
 * Human-readable names, help text and display order for the pod conditions the stepper
 * shows. Conditions outside this map are dropped — Kubernetes reports others, but these
 * five are the startup sequence a user can act on. `order` follows the lifecycle: init
 * containers complete before readiness probes run.
 */
export const POD_CONDITION_DEFINITIONS: Record<string, PodConditionInfo> = {
  PodScheduled: {
    displayName: 'Pod Scheduled',
    description: 'The container scheduler has assigned this pod to a specific node in the data plane. Until this is completed, the pod will remain in a "Pending" state waiting for node assignment.',
    order: 1,
  },
  PodReadyToStartContainers: {
    displayName: 'Starting Pod Containers',
    description: "This condition indicates that the container runtime has successfully created the pod sandbox and configured the pod's networking. This happens before containers actually start running.",
    order: 2,
  },
  ContainersReady: {
    displayName: 'Readiness Checks Passed',
    description: 'This condition is met when the container has passed the readiness probe checks (if configured). The container is almost ready to serve external traffic.',
    order: 4,
  },
  Initialized: {
    displayName: 'Init-Containers Completed',
    description: 'All prerequisite (init) tasks required to start the main container have completed. The main container is ready to start.',
    order: 3,
  },
  Ready: {
    displayName: 'Pod Ready',
    description: 'This pod is healthy and active, and is able to serve traffic (if applicable).',
    order: 5,
  },
};
