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

import { Box, Typography, useTheme } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import { iconForType, tint, typeLabel } from '../flow/graphVisuals';
import type { TimelineSpan } from '../model/workflowFlow';
import { splitQualifiedName, type Timeline } from '../model/workflowHistory';
import { formatDurationMs, formatStopwatch } from '../shared/workflowDuration';
import { stepStatusChipColor, stepStatusPaletteColor } from '../shared/workflowStepStatus';
import * as styles from './WorkflowTimeline.styles';

interface WorkflowTimelineProps {
  timeline: Timeline;
  /** When set, spans whose opening event id is outside it are dimmed, never hidden. */
  visibleIds: ReadonlySet<string> | null;
  /** The selected span's opening event id (or key, for a span without one). */
  selectedKey: string | null;
  /** Reports the clicked span; clicking the selected one again reports null. */
  onSelect: (span: TimelineSpan | null) => void;
}

type TickAnchor = 'left' | 'right' | 'center';

function tickAnchor(index: number): TickAnchor {
  if (index === 0) {
    return 'left';
  }
  return index === styles.TICK_COUNT - 1 ? 'right' : 'center';
}

const spanJoinId = (span: TimelineSpan): string => span.eventId ?? span.key;

const ICON_SIZE = 13;

interface SpanBarProps {
  span: TimelineSpan;
  total: number;
  rangeStart: number;
  now: number;
  color: string;
}

function SpanBar({ span, total, rangeStart, now, color }: SpanBarProps): JSX.Element {
  const Icon = iconForType(span.category);
  // A running span has no close event yet, so its bar runs to the live clock and grows each tick.
  const spanEnd = span.running ? Math.max(span.start, now) : span.end;
  const leftPct = ((span.start - rangeStart) / total) * 100;
  const marker = (
    <Box sx={styles.marker} style={{ color, boxShadow: `0 0 0 1.5px ${color}` }}>
      <Icon size={ICON_SIZE} />
    </Box>
  );

  // An instant (a signal) is its marker alone.
  if (!span.running && spanEnd <= span.start) {
    return (
      <Box sx={styles.pointMarker} style={{ left: `clamp(10px, ${leftPct}%, calc(100% - 10px))` }} title={`${span.label}: ${typeLabel(span.category)}`}>
        {marker}
      </Box>
    );
  }

  const widthPct = Math.max(0.75, Math.min(((spanEnd - span.start) / total) * 100, 100 - leftPct));
  const duration = spanEnd - span.start;
  return (
    <Box
      sx={styles.bar(span.running)}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        // Vertical dashes in the status colour. Running, they march and glow; finished, they rest.
        backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 2px, transparent 2px 6px)`,
        filter: span.running ? `drop-shadow(0 0 2px ${tint(color, 0.7)})` : undefined,
      }}
      title={`${span.label}: ${typeLabel(span.status)} · ${span.running ? formatStopwatch(duration) : formatDurationMs(duration)}`}>
      <Box sx={styles.endCap}>{marker}</Box>
    </Box>
  );
}

/**
 * The run's Gantt timeline: one lane per span built from
 * the history (so a retried step gets a lane per attempt), coloured by status only, with running
 * spans live (they stretch to the clock, march, and glow) and an axis that grows with them.
 * Filtering dims rather than hides, so lanes never reflow when a step is selected.
 */
export default function WorkflowTimeline({ timeline, visibleIds, selectedKey, onSelect }: WorkflowTimelineProps): JSX.Element {
  const theme = useTheme();
  const { spans, start, end } = timeline;
  const isLive = spans.some((s) => s.running);

  // Ticks every second while anything runs, so running bars and the axis grow with the clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isLive) {
      return undefined;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  if (spans.length === 0) {
    return (
      <Box sx={styles.empty}>
        <Typography variant="body2" color="text.secondary">
          No timeline data available.
        </Typography>
      </Box>
    );
  }

  // While running, the axis reaches the live clock so the growing bars stay in range.
  const rangeEnd = isLive ? Math.max(end, now) : end;
  const total = Math.max(1, rangeEnd - start);
  // A sub-minute run needs millisecond labels: a stopwatch would read an 84ms run as 0:00.
  const tickLabel = (ms: number) => (total < 60_000 ? formatDurationMs(ms) : formatStopwatch(ms));
  const ticks = Array.from({ length: styles.TICK_COUNT }, (_, i) => ({
    pct: (i / (styles.TICK_COUNT - 1)) * 100,
    label: tickLabel((total * i) / (styles.TICK_COUNT - 1)),
    anchor: tickAnchor(i),
  }));

  return (
    <Box sx={styles.frame}>
      <Box sx={styles.root}>
        {/* Inside the card, so its top lines up with the flow card beside it. */}
        {isLive && (
          <Typography component="span" sx={styles.liveCaption}>
            {`Running for ${formatStopwatch(total)}`}
          </Typography>
        )}
        {spans.map((span) => {
          const joinId = spanJoinId(span);
          const dimmed = visibleIds !== null && !visibleIds.has(joinId);
          const selected = selectedKey === joinId;
          const color = stepStatusPaletteColor(theme, stepStatusChipColor(span.status));
          const Icon = iconForType(span.category);
          const { workflow, task } = splitQualifiedName(span.label);
          const durationMs = (span.running ? Math.max(span.start, now) : span.end) - span.start;
          const toggle = () => onSelect(selected ? null : span);
          return (
            <Box key={span.key} role="button" tabIndex={0} aria-pressed={selected} onClick={toggle} onKeyDown={(e) => e.key === 'Enter' && toggle()} sx={styles.row(selected, dimmed)}>
              <Box sx={styles.label}>
                <Box sx={styles.labelIcon} style={{ color }}>
                  <Icon size={ICON_SIZE} />
                </Box>
                <Typography sx={styles.labelName} title={workflow ? `${workflow}.${task ?? span.label}` : span.label}>
                  {task ?? span.label}
                </Typography>
                <Typography sx={styles.labelDuration} style={{ color }}>
                  {span.running ? formatStopwatch(durationMs) : formatDurationMs(durationMs)}
                </Typography>
              </Box>
              <Box sx={styles.lane}>
                {ticks.map((tick) => (
                  <Box key={tick.pct} sx={styles.gridline} style={tick.anchor === 'right' ? { right: 0 } : { left: `${tick.pct}%` }} />
                ))}
                <SpanBar span={span} total={total} rangeStart={start} now={now} color={color} />
              </Box>
            </Box>
          );
        })}
        <Box sx={styles.axisRow}>
          <Box sx={styles.axisLabelGutter} />
          <Box sx={styles.axisLane}>
            {ticks.map((tick) => (
              <Typography
                key={tick.pct}
                sx={styles.axisTick}
                style={{
                  left: tick.anchor === 'right' ? undefined : `${tick.pct}%`,
                  right: tick.anchor === 'right' ? 0 : undefined,
                  transform: tick.anchor === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)',
                }}>
                {tick.label}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
