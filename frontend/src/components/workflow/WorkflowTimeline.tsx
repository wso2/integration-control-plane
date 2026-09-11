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

import { alpha, Box, colors, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useEffect, useState } from 'react';
import type { ExecutionGraph } from '../../api/workflows';
import { buildTimeline, formatDuration, formatStopwatch, splitQualifiedName, type ChipColor, type SpanCategory, type TimelineSpan } from './helpers';
import { iconForType, softPrimary, statusColorName, typeLabel } from './graphVisuals';

const LABEL_W = 190; // px, fixed left column of span names
const ROW_H = 36; // px per span row
const BAR_H = 16; // px height of the dashed span bar
const DASH_W = 6; // px period of the vertical dashes (line + gap)
const AXIS_H = 26; // px for the time ruler
const TICK_COUNT = 5; // gridlines / axis labels (TICK_COUNT - 1 intervals)

const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

// Map each status colour to a Material Design hue and pull specific shades from it.
type Hue = Record<number, string>;
const HUE_BY_STATUS: Record<ChipColor, Hue> = {
  success: colors.green,
  info: colors.blue,
  error: colors.red,
  warning: colors.amber,
  primary: colors.indigo,
  default: colors.blueGrey,
};

// Colour keys off status only, never category — the same vocabulary as the rail and the summary chip.
function spanShades(span: Pick<TimelineSpan, 'category' | 'status'>): { main: string; accent: string } {
  const hue = HUE_BY_STATUS[statusColorName(span.status)] ?? colors.blueGrey;
  return { main: hue[500], accent: hue[600] };
}

function SpanBar({ span, total, rangeStart, now }: { span: TimelineSpan; total: number; rangeStart: number; now: number }) {
  const { main } = spanShades(span);
  // A running span has no close event, so its bar extends to the live clock and grows each tick.
  const spanEnd = span.running ? Math.max(span.start, now) : span.end;
  const leftPct = ((span.start - rangeStart) / total) * 100;
  const isPoint = !span.running && spanEnd <= span.start; // an instant with no duration, e.g. a signal
  const Icon = iconForType(span.category);

  // The round category-icon marker, reused as a point event's whole glyph and as a bar's end cap.
  const markerSx = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', bgcolor: 'background.paper', color: main, boxShadow: `0 0 0 1.5px ${main}` } as const;

  if (isPoint) {
    return (
      <Box sx={{ position: 'relative', height: ROW_H }}>
        <Tooltip title={`${span.label} — ${typeLabel(span.category)}`} placement="top" arrow>
          <Box sx={{ position: 'absolute', top: '50%', left: `clamp(10px, ${leftPct}%, calc(100% - 10px))`, transform: 'translate(-50%, -50%)', ...markerSx }}>
            <Icon size={13} />
          </Box>
        </Tooltip>
      </Box>
    );
  }

  const widthPct = Math.max(0.75, Math.min(((spanEnd - span.start) / total) * 100, 100 - leftPct));
  const duration = spanEnd - span.start;
  const tooltip = `${span.label} — ${typeLabel(span.status)} · ${span.running ? formatStopwatch(duration) : formatDuration(duration)}`;
  // Each span is a series of vertical dashes (||||||||) in its status colour. Running spans have the
  // dashes march along (animated background-position) and glow; finished spans are static.
  const dashes = `repeating-linear-gradient(90deg, ${main} 0 2px, transparent 2px ${DASH_W}px)`;

  return (
    <Box sx={{ position: 'relative', height: ROW_H }}>
      <Tooltip title={tooltip} placement="top" arrow>
        <Box
          sx={{
            position: 'absolute',
            top: (ROW_H - BAR_H) / 2,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            minWidth: 4,
            height: BAR_H,
            backgroundImage: dashes,
            backgroundPosition: 'left center',
            ...(span.running
              ? {
                  filter: `drop-shadow(0 0 2px ${alpha(main, 0.7)})`,
                  animation: 'wfDashMove 0.7s linear infinite',
                  '@keyframes wfDashMove': { from: { backgroundPositionX: '0px' }, to: { backgroundPositionX: `${DASH_W}px` } },
                }
              : {}),
          }}>
          <Box sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', ...markerSx }}>
            <Icon size={13} />
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
}

export default function WorkflowTimeline({
  events,
  graph,
  visibleIds = null,
  selectedKey = null,
  onSelectSpan,
}: {
  events: ReadonlyArray<Record<string, unknown>>;
  graph?: ExecutionGraph;
  // When set, spans whose opening event id is outside the set are dimmed rather than hidden.
  visibleIds?: ReadonlySet<string> | null;
  // The selected span's opening event id.
  selectedKey?: string | null;
  // Clicking a span row reports it; clicking the selected one again reports null.
  onSelectSpan?: (span: TimelineSpan | null) => void;
}) {
  const built = buildTimeline(events);
  const { start, end } = built;

  // The execution graph carries authoritative node types. Use them to correct categories the
  // history-based inference gets wrong — e.g. a human task implemented as a child workflow — so the
  // timeline's icon/colour match the execution graph. Graph and history label the same step
  // differently (prefixes/qualifiers differ), so match on the normalized task name, not the raw label.
  const taskKey = (label: string) => (splitQualifiedName(label).task ?? label).trim().toLowerCase();
  const typeByTask = new Map<string, SpanCategory>();
  for (const n of graph?.nodes ?? []) {
    const t = n.type?.toUpperCase();
    if (t && n.label) typeByTask.set(taskKey(n.label), t as SpanCategory);
  }
  const spans = built.spans.map((s) => {
    const t = typeByTask.get(taskKey(s.label));
    return t && t !== s.category ? { ...s, category: t } : s;
  });
  const isLive = spans.some((s) => s.running);

  // While anything is still running, tick every second so running bars and the axis grow with the
  // system clock. Seeded lazily (and reset when the run finishes) so the clock only advances live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isLive) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  if (spans.length === 0) {
    return <Typography sx={emptySx}>No timeline data available.</Typography>;
  }

  // The axis extends to the live clock while running so growing bars stay within range.
  const rangeEnd = isLive ? Math.max(end, now) : end;
  const total = Math.max(1, rangeEnd - start);
  // Sub-minute runs need ms labels: a seconds-floor stopwatch renders an 84ms run as 0:00, i.e. "no data".
  const tickLabel = (ms: number) => (total < 60_000 ? formatDuration(ms) : formatStopwatch(ms));
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const pct = (i / (TICK_COUNT - 1)) * 100;
    return { pct, label: tickLabel((total * i) / (TICK_COUNT - 1)), anchor: i === 0 ? 'left' : i === TICK_COUNT - 1 ? 'right' : 'center' };
  });

  return (
    <Stack gap={1}>
      {isLive && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
          Running for {formatStopwatch(total)}
        </Typography>
      )}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflowX: 'auto', maxHeight: '62vh', overflowY: 'auto', bgcolor: 'action.hover' }}>
        <Box sx={{ minWidth: LABEL_W + 360 }}>
          {spans.map((s) => {
            const joinId = s.eventId ?? s.key;
            const dimmed = visibleIds != null && !visibleIds.has(joinId);
            const selected = selectedKey === joinId;
            const { workflow, task } = splitQualifiedName(s.label);
            const Icon = iconForType(s.category);
            const color = spanShades(s).accent;
            const durationMs = (s.running ? Math.max(s.start, now) : s.end) - s.start;
            return (
              <Box key={s.key}>
                <Box
                  role={onSelectSpan ? 'button' : undefined}
                  tabIndex={onSelectSpan ? 0 : undefined}
                  onClick={onSelectSpan ? () => onSelectSpan(selected ? null : s) : undefined}
                  onKeyDown={onSelectSpan ? (e) => (e.key === 'Enter' ? onSelectSpan(selected ? null : s) : undefined) : undefined}
                  sx={{
                    display: 'flex',
                    alignItems: 'stretch',
                    opacity: dimmed ? 0.35 : 1,
                    cursor: onSelectSpan ? 'pointer' : 'default',
                    bgcolor: selected ? (t) => softPrimary(t, 0.08) : 'transparent',
                    '&:hover': onSelectSpan ? { bgcolor: (t) => softPrimary(t, 0.05) } : undefined,
                  }}>
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ width: LABEL_W, flexShrink: 0, px: 1, borderRight: '1px solid', borderColor: 'divider', minWidth: 0 }}>
                    <Box sx={{ color, display: 'flex', flexShrink: 0 }}>
                      <Icon size={14} />
                    </Box>
                    <Tooltip title={workflow ? `${workflow}.${task ?? s.label}` : (task ?? s.label)} placement="top">
                      <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                        {task ?? s.label}
                      </Typography>
                    </Tooltip>
                    <Typography variant="caption" sx={{ color, fontSize: 10, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {s.running ? formatStopwatch(durationMs) : formatDuration(durationMs)}
                    </Typography>
                  </Stack>
                  <Box sx={{ flex: 1, position: 'relative', minWidth: 360 }}>
                    {ticks.map((t) => (
                      <Box key={t.pct} sx={{ position: 'absolute', top: 0, bottom: 0, width: '1px', bgcolor: 'divider', opacity: 0.5, ...(t.anchor === 'right' ? { right: 0 } : { left: `${t.pct}%` }) }} />
                    ))}
                    <SpanBar span={s} total={total} rangeStart={start} now={now} />
                  </Box>
                </Box>
              </Box>
            );
          })}
          <Box sx={{ display: 'flex' }}>
            <Box sx={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', height: AXIS_H }} />
            <Box sx={{ flex: 1, position: 'relative', height: AXIS_H, borderTop: '1px solid', borderColor: 'divider', minWidth: 360 }}>
              {ticks.map((t) => (
                <Typography
                  key={t.pct}
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: `${t.pct}%`,
                    transform: t.anchor === 'left' ? 'none' : t.anchor === 'right' ? 'translateX(-100%)' : 'translateX(-50%)',
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                  }}>
                  {t.label}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
