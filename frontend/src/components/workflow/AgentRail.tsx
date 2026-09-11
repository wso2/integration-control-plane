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

import { alpha, Box, Stack, Tooltip, Typography, useTheme } from '@wso2/oxygen-ui';
import { Brain, Database, Info, SquareCheck, UserCheck, Wrench } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type ComponentType, type ReactElement } from 'react';
import type { ExecutionGraph, InstanceGraph, StepExecution } from '../../api/workflows';
import { paletteColor, statusColorName } from './graphVisuals';
import { MODEL_ACTIVITY_LABELS, modelStepId } from './helpers';

// The agent's compact rail: human tasks, events, tools, activities and model calls, as a categorized list.

interface Row {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  exec?: { status?: string; count: number; failed: boolean; recovered: boolean };
}

interface Section {
  title: string;
  rows: Row[];
}

const execOf = (step: StepExecution | undefined): Row['exec'] => {
  if (!step) return undefined;
  const status = (step.status ?? '').toUpperCase();
  return {
    status: step.status,
    count: step.count,
    failed: ['FAILED', 'TERMINATED', 'TIMED_OUT'].includes(status),
    recovered: step.failure !== undefined && status === 'COMPLETED',
  };
};

export default function AgentRail({
  data,
  executionGraph,
  events,
  selectedStepId,
  onSelect,
}: {
  data: InstanceGraph;
  executionGraph: ExecutionGraph | undefined;
  events: ReadonlyArray<Record<string, unknown>>;
  selectedStepId: string | null;
  onSelect: (stepId: string | null) => void;
}): ReactElement | null {
  const theme = useTheme();

  const sections = useMemo((): Section[] => {
    const nodes = data.graph?.nodes ?? [];
    const steps = data.steps ?? {};

    const tasks: Row[] = [];
    const eventRows: Row[] = [];
    const tools: Row[] = [];
    const activities: Row[] = [];
    for (const node of nodes) {
      const kind = node.kind.toUpperCase();
      const name = node.target ?? node.stepId.replace(/^(tool|event|task):/, '');
      if (kind === 'HUMAN_TASK') {
        tasks.push({ id: node.stepId, label: name, icon: UserCheck, exec: execOf(steps[node.stepId]) });
      } else if (kind === 'EVENT') {
        // Events are signals, not activities: the server-side join misses them; state comes from SIGNALED events.
        const count = events.filter((e) => (e['eventType'] ?? '') === 'WORKFLOW_EXECUTION_SIGNALED' && ((e['attributes'] as Record<string, unknown> | undefined)?.['signalName'] ?? '') === name).length;
        eventRows.push({ id: node.stepId, label: name, icon: Database, exec: count > 0 ? { status: 'COMPLETED', count, failed: false, recovered: false } : undefined });
      } else if (kind === 'TOOL') {
        const row: Row = { id: node.stepId, label: name, icon: node.source === 'ACTIVITY' ? SquareCheck : Wrench, exec: execOf(steps[node.stepId]) };
        (node.source === 'ACTIVITY' ? activities : tools).push(row);
      }
    }

    const model: Row[] = [];
    const seen = new Map<string, { count: number; worst: number; status?: string; failed: boolean }>();
    const rank = (s: string) => (['FAILED', 'TERMINATED', 'TIMED_OUT'].includes(s) ? 3 : s === 'RUNNING' ? 2 : 1);
    for (const n of executionGraph?.nodes ?? []) {
      if ((n.metadata?.['stepId'] as string | undefined) !== 'model' || !n.label) continue;
      const status = (n.status ?? '').toUpperCase();
      const cur = seen.get(n.label);
      if (cur) {
        cur.count += 1;
        if (rank(status) > cur.worst) {
          cur.worst = rank(status);
          cur.status = n.status;
          cur.failed = rank(status) === 3;
        }
      } else {
        seen.set(n.label, { count: 1, worst: rank(status), status: n.status, failed: rank(status) === 3 });
      }
    }
    for (const [activity, agg] of seen) {
      model.push({
        id: modelStepId(activity),
        label: MODEL_ACTIVITY_LABELS[activity] ?? activity,
        icon: Brain,
        exec: { status: agg.status, count: agg.count, failed: agg.failed, recovered: false },
      });
    }
    if (model.length === 0) {
      model.push({ id: 'model', label: 'Thinking', icon: Brain });
    }

    return [
      { title: 'Human tasks', rows: tasks },
      { title: 'Events', rows: eventRows },
      { title: 'Tools', rows: tools },
      { title: 'Activities', rows: activities },
      { title: 'Model', rows: model },
    ].filter((s) => s.rows.length > 0);
  }, [data, executionGraph, events]);

  if (sections.length === 0) return null;

  return (
    <Stack sx={{ overflow: 'auto', height: '100%', py: 1, px: 0.5 }} gap={0.75}>
      {sections.map((section) => (
        <Box key={section.title}>
          <Typography variant="caption" sx={{ display: 'block', px: 1, pb: 0.25, color: 'text.disabled', fontWeight: 700, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {section.title}
          </Typography>
          {section.rows.map((row) => {
            const ran = row.exec !== undefined;
            const statusColor = ran ? paletteColor(theme, statusColorName(row.exec?.status)) : theme.palette.text.disabled;
            const selected = selectedStepId === row.id;
            const Icon = row.icon;
            return (
              <Box
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(selected ? null : row.id)}
                onKeyDown={(e) => (e.key === 'Enter' ? onSelect(selected ? null : row.id) : undefined)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  ml: 0.5,
                  pl: 0.75,
                  pr: 1,
                  py: 0.5,
                  my: 0.25,
                  width: 'fit-content',
                  maxWidth: '100%',
                  minWidth: 150,
                  cursor: 'pointer',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: ran ? statusColor : 'divider',
                  borderLeft: '3px solid',
                  borderLeftColor: ran ? statusColor : 'transparent',
                  bgcolor: selected ? (t) => alpha(t.palette.primary.main, 0.12) : 'background.paper',
                  outline: selected ? '1px solid' : 'none',
                  outlineColor: 'primary.main',
                  '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
                  color: ran ? 'text.primary' : 'text.disabled',
                }}>
                <Box sx={{ color: statusColor, display: 'flex', flexShrink: 0 }}>
                  <Icon size={13} />
                </Box>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: ran ? 600 : 400, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}
                  title={`${row.label} · ${row.id}${ran ? ` · ${row.exec?.status ?? ''}` : ' · not executed'}`}>
                  {row.label}
                </Typography>
                {row.exec?.recovered && (
                  <Tooltip title="Failed earlier in this run; the latest execution succeeded">
                    <Box sx={{ color: 'warning.main', display: 'flex', flexShrink: 0 }}>
                      <Info size={12} />
                    </Box>
                  </Tooltip>
                )}
                {row.exec && row.exec.count > 1 && (
                  <Typography variant="caption" sx={{ color: statusColor, fontWeight: 700, fontSize: 10.5, flexShrink: 0 }}>
                    ×{row.exec.count}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Stack>
  );
}
