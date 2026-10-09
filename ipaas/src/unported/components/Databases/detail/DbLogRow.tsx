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

import { Chip, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronRight, Copy } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { formatServerDateTime } from '../../../utils/platformServices';
import type { LogEntry } from '../../../../types/platformServices';

/** A single database-server log line for the shared LogsPanel (collapsed summary + expandable detail). */
export default function DbLogRow({ log, expanded, onToggle }: { log: LogEntry; expanded: boolean; onToggle: () => void }): JSX.Element {
  const fields: { label: string; value: string }[] = [
    { label: 'Time', value: formatServerDateTime(log.time) },
    { label: 'Host', value: log.hostname },
    { label: 'Unit', value: log.unit },
    { label: 'Message', value: log.msg },
  ];

  return (
    <>
      <Stack
        direction="row"
        alignItems="center"
        onClick={onToggle}
        sx={{
          fontFamily: 'monospace',
          fontSize: 12,
          px: 0.5,
          py: 0.25,
          cursor: 'pointer',
          borderRadius: 1,
          minHeight: 32,
          '&:hover': { bgcolor: 'action.hover' },
          '&:hover .log-actions': { visibility: 'visible' },
        }}>
        <IconButton size="small" aria-label={expanded ? 'Collapse log entry' : 'Expand log entry'} sx={{ p: 0, mr: 0.5 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap', mr: 1 }}>
          {formatServerDateTime(log.time)}
        </Typography>
        {log.unit ? <Chip label={log.unit} size="small" sx={{ fontFamily: 'monospace', fontSize: 10, height: 18, mr: 1, bgcolor: 'action.selected', color: 'text.secondary', fontWeight: 600 }} /> : null}
        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {log.msg}
        </Typography>
        <Stack direction="row" className="log-actions" sx={{ visibility: 'hidden', ml: 1, flexShrink: 0 }}>
          <Tooltip title="Copy">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard?.writeText(log.msg);
              }}>
              <Copy size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {expanded && (
        <Stack sx={{ pl: 5, pb: 1, fontFamily: 'monospace', fontSize: 12, bgcolor: 'background.default', borderRadius: 1, mx: 0.5, mb: 0.5 }}>
          {fields.map(({ label, value }) => (
            <Stack key={label} direction="row" sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 0.5, gap: 2 }}>
              <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, minWidth: 80, flexShrink: 0 }}>
                {label}
              </Typography>
              <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </>
  );
}
