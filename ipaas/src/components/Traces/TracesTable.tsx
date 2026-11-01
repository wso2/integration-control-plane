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

import { Chip, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleAlert, CircleCheck } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import * as styles from './TracesTable.styles';
import { formatDuration, formatTokens, previewValue } from '../../utils/traces';
import { formatDistanceToNow } from '../../utils/time';
import type { TraceOverview } from '../../types/traces';

interface TracesTableProps {
  traces: TraceOverview[];
  onSelect: (trace: TraceOverview) => void;
}

function StatusCell({ status }: { status: TraceOverview['status'] }): JSX.Element {
  if (status === 'error') {
    return (
      <Tooltip title="The root span reported an error">
        <Stack direction="row" alignItems="center" gap={0.5}>
          <CircleAlert size={14} color="var(--oxygen-palette-error-main)" />
          <Typography variant="body2">Error</Typography>
        </Stack>
      </Tooltip>
    );
  }
  if (status === 'ok') {
    return (
      <Stack direction="row" alignItems="center" gap={0.5}>
        <CircleCheck size={14} color="var(--oxygen-palette-success-main)" />
        <Typography variant="body2">OK</Typography>
      </Stack>
    );
  }
  // The observer leaves the status unset on a trace whose root never closed.
  return (
    <Tooltip title="The root span set no status">
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    </Tooltip>
  );
}

export default function TracesTable({ traces, onSelect }: TracesTableProps): JSX.Element {
  return (
    <ListingTable.Container elevation={0} sx={styles.container}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Trace</ListingTable.Cell>
            <ListingTable.Cell>Status</ListingTable.Cell>
            <ListingTable.Cell>Input</ListingTable.Cell>
            <ListingTable.Cell align="right">Spans</ListingTable.Cell>
            <ListingTable.Cell align="right">Tokens</ListingTable.Cell>
            <ListingTable.Cell align="right">Duration</ListingTable.Cell>
            <ListingTable.Cell align="right">Started</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {traces.map((trace) => (
            <ListingTable.Row key={trace.traceId} hover sx={styles.row} onClick={() => onSelect(trace)}>
              <ListingTable.Cell>
                <Typography variant="body2">{trace.rootSpanName}</Typography>
                <Stack direction="row" alignItems="center" gap={0.75} sx={styles.chips}>
                  <Typography variant="caption" sx={styles.traceId}>
                    {trace.traceId.slice(0, 16)}
                  </Typography>
                  {trace.models?.map((model) => <Chip key={model} size="small" variant="outlined" label={model} />)}
                  {trace.tools?.map((tool) => <Chip key={tool} size="small" variant="outlined" color={trace.failedTools?.includes(tool) ? 'error' : 'default'} label={tool} />)}
                </Stack>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <StatusCell status={trace.status} />
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" sx={styles.preview}>
                  {previewValue(trace.input)}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell align="right" sx={styles.numeric}>
                {trace.spanCount}
              </ListingTable.Cell>
              <ListingTable.Cell align="right" sx={styles.numeric}>
                {formatTokens(trace.tokenUsage)}
              </ListingTable.Cell>
              <ListingTable.Cell align="right" sx={styles.numeric}>
                {formatDuration(trace.durationInNanos)}
              </ListingTable.Cell>
              <ListingTable.Cell align="right">
                <Tooltip title={new Date(trace.startTime).toLocaleString()}>
                  <Typography variant="body2" color="text.secondary">
                    {formatDistanceToNow(trace.startTime)}
                  </Typography>
                </Tooltip>
              </ListingTable.Cell>
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
