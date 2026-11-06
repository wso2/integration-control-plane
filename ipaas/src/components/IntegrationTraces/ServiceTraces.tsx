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

import { Box, ButtonBase, Chip, Collapse, IconButton, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useMemo, useState, type JSX } from 'react';
import { formatDuration, traceWaterfall, tracesOfService } from '../../utils/integrationTraces';
import { formatDateTime } from '../../utils/time';
import type { ServiceTrace, ServiceTraceSummary, SpanRow, TraceRow } from '../../types/integrationTraces';
import * as styles from './IntegrationTraces.styles';

const PAGE_SIZE = 10;

interface ServiceTracesProps {
  summaries: ServiceTraceSummary[];
  traces: TraceRow[];
  spans: SpanRow[];
}

function ServiceTable({ summaries, selected, onSelect }: { summaries: ServiceTraceSummary[]; selected: string; onSelect: (service: string) => void }): JSX.Element {
  return (
    <Table size="small" aria-label="Services">
      <TableHead>
        <TableRow>
          {['Service', 'Traces', 'Error traces', 'Avg duration', 'p95 duration'].map((h) => (
            <TableCell key={h} sx={styles.headerCell}>
              {h}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {summaries.map((s) => (
          <TableRow
            key={s.service}
            hover
            selected={s.service === selected}
            aria-selected={s.service === selected}
            tabIndex={0}
            onClick={() => onSelect(s.service)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(s.service);
              }
            }}
            sx={styles.clickableRow}>
            <TableCell sx={styles.mono}>{s.service}</TableCell>
            <TableCell>{s.traces.toLocaleString()}</TableCell>
            <TableCell>{s.errorTraces.toLocaleString()}</TableCell>
            <TableCell>{formatDuration(s.avgDurationMs)}</TableCell>
            <TableCell>{formatDuration(s.p95DurationMs)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SpanAttributes({ span }: { span: SpanRow }): JSX.Element {
  const entries = Object.entries(span.attributes).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Box sx={styles.attributeGrid}>
      <Typography variant="caption" color="text.secondary">
        span.id
      </Typography>
      <Typography sx={styles.attributeValue}>{span.spanId}</Typography>
      <Typography variant="caption" color="text.secondary">
        span.kind
      </Typography>
      <Typography sx={styles.attributeValue}>{span.kind}</Typography>
      {span.statusMessage && (
        <>
          <Typography variant="caption" color="text.secondary">
            status.message
          </Typography>
          <Typography sx={styles.attributeValue}>{span.statusMessage}</Typography>
        </>
      )}
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <Typography variant="caption" color="text.secondary">
            {key}
          </Typography>
          <Typography sx={styles.attributeValue}>{value}</Typography>
        </Fragment>
      ))}
    </Box>
  );
}

/** The trace's spans as a call tree, each with its bar on the trace's timeline. Selecting a span shows its attributes. */
function TraceWaterfall({ spans }: { spans: SpanRow[] }): JSX.Element {
  const rows = useMemo(() => traceWaterfall(spans), [spans]);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Box sx={styles.waterfall}>
      {rows.map(({ span, depth, offset, width }) => {
        const open = selected === span.spanId;
        return (
          <Fragment key={span.spanId}>
            <ButtonBase component="div" sx={styles.waterfallRow} aria-expanded={open} onClick={() => setSelected(open ? null : span.spanId)}>
              <Box sx={{ ...styles.waterfallName, pl: depth * 2 }}>
                <Typography sx={styles.mono} noWrap title={span.name}>
                  {span.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {span.serviceName}
                </Typography>
              </Box>
              <Box sx={styles.waterfallTrack}>
                <Box sx={{ ...styles.waterfallBar, left: `${offset * 100}%`, width: `max(${width * 100}%, 2px)`, bgcolor: span.status === 'error' ? 'error.main' : 'primary.main' }} />
              </Box>
              <Typography variant="caption" sx={styles.waterfallDuration}>
                {formatDuration(span.durationMs)}
              </Typography>
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
              <SpanAttributes span={span} />
            </Collapse>
          </Fragment>
        );
      })}
    </Box>
  );
}

function TraceTable({ rows }: { rows: ServiceTrace[] }): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  // A refresh or another service can leave fewer pages than the one open.
  const lastPage = Math.max(Math.ceil(rows.length / PAGE_SIZE) - 1, 0);
  const current = Math.min(page, lastPage);
  const longest = Math.max(...rows.map((r) => r.trace.durationMs), 1);
  return (
    <>
      <Table size="small" aria-label="Traces">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            {['Trace ID', 'Operation', 'Started', 'Spans', 'Duration', 'Status'].map((h) => (
              <TableCell key={h} sx={styles.headerCell}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(({ trace, spans, operation, httpStatus }) => {
            const open = expanded === trace.traceId;
            return (
              <Fragment key={trace.traceId}>
                <TableRow hover onClick={() => setExpanded(open ? null : trace.traceId)} sx={styles.clickableRow}>
                  <TableCell padding="checkbox">
                    <IconButton size="small" aria-label={open ? 'Hide trace spans' : 'Show trace spans'}>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </IconButton>
                  </TableCell>
                  <TableCell sx={styles.mono} title={trace.traceId}>
                    {trace.traceId.slice(0, 12)}
                  </TableCell>
                  <TableCell>
                    <Box sx={styles.operation}>
                      {httpStatus && <Chip size="small" label={httpStatus} color={Number(httpStatus) >= 400 ? 'error' : 'success'} variant="outlined" />}
                      <Typography sx={styles.mono} noWrap title={operation}>
                        {operation}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{formatDateTime(trace.startTime)}</TableCell>
                  <TableCell>{trace.spanCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Box sx={styles.durationCell}>
                      <Box sx={{ ...styles.durationBar, width: `${(trace.durationMs / longest) * 100}%`, bgcolor: trace.hasErrors ? 'error.main' : 'primary.main' }} />
                      <Typography variant="body2">{formatDuration(trace.durationMs)}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={trace.hasErrors ? 'Error' : 'OK'} color={trace.hasErrors ? 'error' : 'success'} variant="outlined" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={7} sx={styles.collapseCell}>
                    <Collapse in={open} unmountOnExit>
                      <TraceWaterfall spans={spans} />
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      {rows.length > PAGE_SIZE && <TablePagination component="div" count={rows.length} page={current} rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]} onPageChange={(_, p) => setPage(p)} />}
    </>
  );
}

/** Services found in the sampled spans, and the traces of the one selected. */
export default function ServiceTraces({ summaries, traces, spans }: ServiceTracesProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  // A refresh can drop the selected service, so fall back to the busiest one rather than show nothing.
  const active = summaries.find((s) => s.service === selected) ?? summaries[0];
  const rows = useMemo(() => (active ? tracesOfService(traces, spans, active.service) : []), [active, traces, spans]);

  if (!active) return <Typography color="text.secondary">No spans in the sampled traces.</Typography>;
  return (
    <>
      <ServiceTable summaries={summaries} selected={active.service} onSelect={setSelected} />
      <Typography variant="subtitle2" sx={styles.subheading}>
        Traces through{' '}
        <Box component="span" sx={styles.mono}>
          {active.service}
        </Box>
      </Typography>
      <TraceTable key={active.service} rows={rows} />
    </>
  );
}
