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

import { Box, Button, Chip, Collapse, Stack, Typography } from '@wso2/oxygen-ui';
import { Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type KeyboardEvent } from 'react';
import type { McpHistoryEvent, McpHistoryEventType } from '../../types/mcp';
import { capitalize } from '../../utils/string';

const TYPE_COLOR: Record<McpHistoryEventType, 'info' | 'success' | 'error' | 'default'> = {
  request: 'info',
  response: 'success',
  error: 'error',
  info: 'default',
};

const detailSx = {
  bgcolor: 'action.hover',
  borderRadius: 0.5,
  p: 1,
  m: 0,
  mt: 0.5,
  fontFamily: 'monospace',
  fontSize: 11.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 160,
  overflow: 'auto',
} as const;

/** A single activity-log row; clicking it toggles its structured details. */
function HistoryRow({ event }: { event: McpHistoryEvent }): JSX.Element {
  const [open, setOpen] = useState(false);
  const hasDetails = event.details !== undefined;
  const toggle = () => setOpen((o) => !o);
  // Only expandable rows are interactive — mouse and keyboard toggle the same state.
  const interactiveProps = hasDetails
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-expanded': open,
        onClick: toggle,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        },
      }
    : {};
  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: 1.5, py: 0.75 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ cursor: hasDetails ? 'pointer' : 'default' }} {...interactiveProps}>
        <Chip label={capitalize(event.type)} size="small" color={TYPE_COLOR[event.type]} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', flexShrink: 0 }}>
          {new Date(event.timestamp).toLocaleTimeString()}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 600, flexShrink: 0 }}>
          {event.source}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {event.message}
        </Typography>
        {hasDetails && (
          <Typography variant="caption" color="primary.main" sx={{ flexShrink: 0 }}>
            Details
          </Typography>
        )}
      </Stack>
      {hasDetails && (
        <Collapse in={open}>
          <Box component="pre" sx={detailSx}>
            {JSON.stringify(event.details, null, 2)}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

/** Activity log of all playground requests/responses/errors. Fills the height its parent gives it. */
export default function HistoryPanel({ history, onClear }: { history: McpHistoryEvent[]; onClear: () => void }): JSX.Element {
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Activity history
        </Typography>
        <Chip label={history.length} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          color="inherit"
          startIcon={
            <Box component="span" sx={{ display: 'inline-flex', color: 'error.main' }}>
              <Trash2 size={14} />
            </Box>
          }
          disabled={history.length === 0}
          onClick={onClear}>
          Clear
        </Button>
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {history.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 1.5 }}>
            No activity yet.
          </Typography>
        ) : (
          history.map((event, i) => <HistoryRow key={`${event.timestamp}-${i}`} event={event} />)
        )}
      </Box>
    </Stack>
  );
}
