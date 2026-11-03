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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { CircleAlert, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import * as styles from './TraceSpansDrawer.styles';
import SpanDetailPanel from './SpanDetailPanel';
import { apiErrorMessage } from '../../utils/apiErrors';
import { buildSpanTree, formatDuration } from '../../utils/traces';
import { useTraceSpans } from '../../hooks/useTraces';
import type { TraceOverview, TraceQuery } from '../../types/traces';

interface TraceSpansDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Kept while the drawer slides out, so the content does not vanish mid-animation. */
  trace: TraceOverview | null;
  componentId: string;
  envId: string;
  window: TraceQuery;
}

export default function TraceSpansDrawer({ open, onClose, trace, componentId, envId, window: traceWindowQuery }: TraceSpansDrawerProps): JSX.Element {
  const traceId = trace?.traceId ?? '';
  // Addressed by the trace alone, never by `open`. The drawer keeps its children
  // mounted through the slide-out, and a key that has never been fetched reads as
  // a settled empty result, so closing would flash the "no spans" notice.
  const { data, isLoading, isError, error, refetch } = useTraceSpans(componentId, envId, traceId, traceWindowQuery);

  const rows = useMemo(() => buildSpanTree(data?.spans ?? []), [data?.spans]);

  const [selectedSpanId, setSelectedSpanId] = useState('');
  // Each trace opens on its own root, not on the span selected in the last one.
  useEffect(() => setSelectedSpanId(''), [traceId]);

  const activeSpanId = selectedSpanId || rows[0]?.span.spanId || '';

  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={styles.drawer}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={styles.header}>
        <Box>
          <Typography variant="h5">{trace?.rootSpanName ?? 'Trace'}</Typography>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Typography variant="caption" sx={styles.traceId}>
              {traceId}
            </Typography>
            {trace ? (
              <Typography variant="caption" color="text.secondary">
                {trace.spanCount} spans · {formatDuration(trace.durationInNanos)}
              </Typography>
            ) : null}
          </Stack>
        </Box>
        <IconButton size="small" aria-label="close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      {isLoading ? (
        <Box sx={styles.centered}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Box sx={styles.detailPane}>
          <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
            {apiErrorMessage(error, 'Could not load the spans of this trace.')}
          </Alert>
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={styles.detailPane}>
          <Alert severity="info">
            This trace has no spans in the selected time range. Widen the range to cover the whole trace — a trace is listed by its start, but its spans are read over the range you
            choose.
          </Alert>
        </Box>
      ) : (
        <Box sx={styles.body}>
          <Box sx={styles.treePane}>
            {data && data.totalCount > rows.length ? (
              <Alert severity="warning" sx={styles.partialNotice}>
                Showing {rows.length} of {data.totalCount} spans. The rest are not fetched, so some branches may appear detached.
              </Alert>
            ) : null}
            {rows.map(({ span, depth, offset, width }) => (
              <Box
                key={span.spanId}
                component="button"
                type="button"
                aria-current={span.spanId === activeSpanId}
                onClick={() => setSelectedSpanId(span.spanId)}
                sx={styles.spanRow(span.spanId === activeSpanId)}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={styles.spanIndent(depth)}>
                  <Stack direction="row" alignItems="center" gap={0.5} minWidth={0}>
                    {span.error ? <CircleAlert size={13} color="var(--oxygen-palette-error-main)" /> : null}
                    <Typography variant="body2" noWrap>
                      {span.spanName}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {formatDuration(span.durationNs)}
                  </Typography>
                </Stack>
                <Box sx={styles.waterfallTrack}>
                  <Box sx={styles.waterfallBar(offset, width, span.error === true)} />
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={styles.detailPane}>
            <SpanDetailPanel componentId={componentId} envId={envId} traceId={traceId} spanId={activeSpanId} window={traceWindowQuery} />
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
