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

import { Accordion, AccordionDetails, AccordionSummary, Box, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { AlertTriangle, ChevronDown, Inbox } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useExecutionLogs } from '../../hooks/useExecutions';
import { formatExecutionLogLine, spansMultipleContainers } from '../../utils/logs';
import type { ExecutionLogWindow } from '../../types/executions';

interface ExecutionLogsPanelProps {
  componentId: string;
  deploymentTrackId: string;
  environmentId: string;
  /** The tracked run's execution id (for the logs API) — empty until it appears. */
  executionId: string;
  /** The run's bounds, which cloud needs to isolate this execution's log lines. */
  run?: ExecutionLogWindow;
  /** A run has been triggered but not yet terminal — logs aren't ready. */
  isRunning: boolean;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
}

function LogLines({ componentId, deploymentTrackId, environmentId, executionId, run }: Pick<ExecutionLogsPanelProps, 'componentId' | 'deploymentTrackId' | 'environmentId' | 'executionId' | 'run'>): JSX.Element {
  const { data: logs = [], isLoading, isError } = useExecutionLogs(componentId, deploymentTrackId, executionId, environmentId, true, run);
  if (isLoading) return <CircularProgress size={20} sx={{ display: 'block', mx: 'auto' }} />;
  if (isError) {
    return (
      <Stack alignItems="center" gap={1} sx={{ py: 3, color: 'error.main' }}>
        <AlertTriangle size={28} />
        <Typography variant="body2" color="error.main">
          Failed to load logs.
        </Typography>
      </Stack>
    );
  }
  if (logs.length === 0) return <NoLogs />;
  return (
    <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {logs.map((l) => formatExecutionLogLine(l, spansMultipleContainers(logs))).join('\n')}
    </Box>
  );
}

function NoLogs(): JSX.Element {
  return (
    <Stack alignItems="center" gap={1} sx={{ py: 3, color: 'text.secondary' }}>
      <Inbox size={28} />
      <Typography variant="body2" color="text.secondary">
        No logs available
      </Typography>
    </Stack>
  );
}

/** "Execution logs" accordion — spinner while running, log lines once available, else an empty state. */
export default function ExecutionLogsPanel({ componentId, deploymentTrackId, environmentId, executionId, run, isRunning, expanded, onToggle }: ExecutionLogsPanelProps): JSX.Element {
  return (
    <Accordion expanded={expanded} onChange={(_, v) => onToggle(v)} disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ChevronDown size={16} />}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Execution logs
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ maxHeight: 320, overflowY: 'auto' }}>
        {isRunning ? (
          <CircularProgress size={20} sx={{ display: 'block', mx: 'auto' }} />
        ) : executionId ? (
          <LogLines componentId={componentId} deploymentTrackId={deploymentTrackId} environmentId={environmentId} executionId={executionId} run={run} />
        ) : (
          <NoLogs />
        )}
      </AccordionDetails>
    </Accordion>
  );
}
