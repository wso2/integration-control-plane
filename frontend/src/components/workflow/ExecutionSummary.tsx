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

import { alpha, Box, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Copy } from '@wso2/oxygen-ui-icons-react';
import type { ReactElement, ReactNode } from 'react';
import type { WorkflowInstance } from '../../api/workflows';

import { displayWorkflowId, formatDuration, jsonPretty } from './helpers';
import { DebugInfoIcon, DetailRow, SectionCard, StatusChip } from './shared';
import DateTime from '../DateTime';

// What happened to this run, read out of the instances.get payload rather than shown verbatim.
export default function ExecutionSummary({
  info,
  fallbackStartMs,
  fallbackEndMs,
  onOpenHistory,
}: {
  info: WorkflowInstance;
  // From the run's history — the instances payload itself carries no times.
  fallbackStartMs?: number | null;
  fallbackEndMs?: number | null;
  onOpenHistory?: () => void;
}): ReactElement {
  const status = (info.status ?? '').toUpperCase();
  const closed = !['RUNNING', 'SUSPENDED', ''].includes(status);
  const startMs = info.startTime ? Date.parse(info.startTime) : (fallbackStartMs ?? NaN);
  const closeMs = info.closeTime ? Date.parse(info.closeTime) : closed ? (fallbackEndMs ?? NaN) : NaN;
  const durationMs = Number.isFinite(startMs) && Number.isFinite(closeMs) ? closeMs - startMs : null;
  const errorMessage = typeof info['errorMessage'] === 'string' ? (info['errorMessage'] as string) : null;

  const row = (label: string, value: ReactNode): ReactNode => (value == null || value === '' ? null : <DetailRow label={label}>{value}</DetailRow>);
  const badge = (
    <Stack direction="row" alignItems="center" gap={1}>
      {status && <StatusChip status={status} />}
      {durationMs != null && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {formatDuration(durationMs)}
        </Typography>
      )}
    </Stack>
  );
  const actions = (
    <>
      {onOpenHistory && (
        <Tooltip title="Debug information: the raw event history">
          <IconButton size="small" aria-label="open debug information" onClick={onOpenHistory}>
            <DebugInfoIcon size={14} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Copy the raw execution info">
        <IconButton size="small" aria-label="copy raw execution info" onClick={() => navigator.clipboard.writeText(jsonPretty(info))}>
          <Copy size={14} />
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <SectionCard title="Execution" badge={badge} actions={actions}>
      <Stack gap={1}>
        {row(
          'Instance ID',
          info.workflowId ? (
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
              <Box component="span" title={info.workflowId} sx={{ fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayWorkflowId(info.workflowId)}
              </Box>
              <Tooltip title="Copy instance ID">
                <IconButton size="small" aria-label="copy instance id" onClick={() => navigator.clipboard.writeText(info.workflowId)} sx={{ p: 0.25 }}>
                  <Copy size={12} />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : null,
        )}
        {row('Workflow Name', info.workflowType)}
        {row('Started', Number.isFinite(startMs) ? <DateTime value={startMs} /> : null)}
        {row('Closed', Number.isFinite(closeMs) ? <DateTime value={closeMs} /> : null)}
        {row('Task Queue', info.taskQueue)}
        {errorMessage && (
          <Box sx={{ px: 1.25, py: 0.75, borderRadius: 1, border: '1px solid', borderColor: 'error.main', color: 'error.main', bgcolor: (t) => alpha(t.palette.error.main, 0.08) }}>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {errorMessage}
            </Typography>
          </Box>
        )}
      </Stack>
    </SectionCard>
  );
}
