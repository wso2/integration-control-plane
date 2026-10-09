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
import { formatAuditTimestamp, outcomeColor } from '../../utils/auditLogs';
import type { AuditLogEntry } from '../../../types/auditLogs';
import { actionsSx, actorChipSx, detailBlockSx, detailKeySx, detailRowSx, detailValueSx, expandBtnSx, outcomeChipSx, rowSx, summarySx, timestampSx } from './auditLogRow.styles';

export default function AuditLogRow({ entry, expanded, onToggle }: { entry: AuditLogEntry; expanded: boolean; onToggle: () => void }): JSX.Element {
  const infoEntries = Object.entries(entry.info ?? {});
  const actor = entry.info?.email ?? entry.userIdpId;
  const summary = entry.action ?? entry.message ?? '—';

  const detailRows: [string, string][] = [];
  if (entry.entityType) detailRows.push(['entityType', entry.entityType]);
  if (entry.message && entry.message !== summary) detailRows.push(['message', entry.message]);
  infoEntries.forEach(([k, v]) => detailRows.push([k, String(v)]));

  return (
    <>
      <Stack direction="row" alignItems="center" onClick={onToggle} sx={rowSx}>
        <IconButton size="small" aria-label={expanded ? 'Collapse audit entry' : 'Expand audit entry'} sx={expandBtnSx}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Typography component="span" sx={timestampSx}>
          {formatAuditTimestamp(entry)}
        </Typography>
        {entry.outcome ? <Chip label={entry.outcome} size="small" variant="outlined" color={outcomeColor(entry.outcome)} sx={outcomeChipSx} /> : null}
        {actor ? (
          <Tooltip title="Performed by">
            <Chip label={actor} size="small" sx={actorChipSx} />
          </Tooltip>
        ) : null}
        <Typography component="span" sx={summarySx}>
          {summary}
        </Typography>
        <Stack direction="row" className="audit-actions" sx={actionsSx}>
          <Tooltip title="Copy">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard?.writeText(JSON.stringify(entry, null, 2));
              }}>
              <Copy size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {expanded && detailRows.length > 0 && (
        <Stack sx={detailBlockSx}>
          {detailRows.map(([key, value]) => (
            <Stack key={key} direction="row" sx={detailRowSx}>
              <Typography component="span" sx={detailKeySx}>
                {key}
              </Typography>
              <Typography component="span" sx={detailValueSx}>
                {value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </>
  );
}
