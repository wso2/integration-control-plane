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

import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { fetchBuildLogs, fetchBuildRunLogs } from '../api/builds';
import type { BuildRunLogs } from '../types/build';
import { logsBehindBuild } from '../utils/buildProgress';

interface BuildLogsPolling {
  /** The build's own verdict; drives the cadence and how long polling runs on for. */
  status?: string;
  conclusion?: string | null;
  /** Slow refresh while the user is actually watching the log panel. */
  keepFresh?: boolean;
}

/**
 * How long logs keep being chased at full speed after a build finishes. A run
 * killed mid-flight can leave its tasks unresolved for ever, so the catch-up
 * window has to end rather than poll until the page closes.
 */
const LOG_SETTLE_WINDOW_MS = 60_000;

export function useBuildLogs(componentId: string, versionId: string, workflowName: string, enabled = true, polling: BuildLogsPolling = {}) {
  const { status, conclusion, keepFresh } = polling;
  // Start of the current build's catch-up window, keyed by build so a new one
  // gets a fresh window. Written from the refetch callback, not during render.
  const settleRef = useRef<{ key: string; startedAt: number } | null>(null);

  return useQuery({
    queryKey: ['buildLogs', componentId, versionId, workflowName],
    queryFn: () => fetchBuildLogs(componentId, versionId, workflowName),
    enabled: enabled && !!componentId && !!versionId && !!workflowName,
    refetchInterval: (query) => {
      if (status === 'in_progress') {
        settleRef.current = null;
        return 5000;
      }
      // A finished build is not the end of the logs: the failing step often
      // resolves a beat later, and log lines keep arriving from the pipeline.
      if (logsBehindBuild(status, conclusion, query.state.data as BuildRunLogs | null | undefined)) {
        if (settleRef.current?.key !== workflowName) settleRef.current = { key: workflowName, startedAt: Date.now() };
        if (Date.now() - settleRef.current.startedAt < LOG_SETTLE_WINDOW_MS) return 5000;
      }
      return keepFresh ? 15000 : false;
    },
  });
}

// Not used
export function useBuildRunLogs(orgHandler: string, projectId: string, componentId: string, runId: string, enabled: boolean, isInProgress: boolean) {
  return useQuery({
    queryKey: ['buildRunLogs', orgHandler, projectId, componentId, runId],
    queryFn: () => fetchBuildRunLogs(orgHandler, projectId, componentId, runId),
    enabled: enabled && !!orgHandler && !!projectId && !!componentId && !!runId,
    refetchInterval: isInProgress ? 5000 : false,
  });
}
