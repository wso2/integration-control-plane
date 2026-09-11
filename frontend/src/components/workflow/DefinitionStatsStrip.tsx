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

import { Box, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { resourceUrl, type ComponentScope } from '../../nav';
import { countText, useDefinitionStats, useSinceWindow } from './WorkflowStats';

interface StripCell {
  label: string;
  value: string;
  help: string;
  to: string;
  alarm?: boolean;
}

// The selected definition's figures on the integration overview, scoped to one workflow type.
export function DefinitionStatsStrip({
  scope,
  componentId,
  environmentId,
  workflowType,
  canViewReviews,
  canViewTasks,
}: {
  scope: ComponentScope;
  componentId: string;
  environmentId: string;
  workflowType: string;
  canViewReviews: boolean;
  canViewTasks: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const since = useSinceWindow();
  const s = useDefinitionStats({ componentId, environmentId }, workflowType, since, { reviews: canViewReviews, tasks: canViewTasks });
  const env = `env=${encodeURIComponent(environmentId)}`;
  const executions = `${resourceUrl(scope, 'workflows')}?tab=management&type=${encodeURIComponent(workflowType)}&${env}`;
  const cells: StripCell[] = [
    { label: 'Running', value: countText(s.running), help: `${workflowType} instances currently executing or parked. Opens the executions list.`, to: executions },
    { label: 'Suspended', value: countText(s.suspended), help: `${workflowType} instances paused by an operator, waiting to be resumed.`, to: executions },
    { label: 'Failed (24h)', value: countText(s.failed), help: `${workflowType} instances that finished as FAILED in the last 24 hours.`, to: executions, alarm: (s.failed?.count ?? 0) > 0 },
    { label: 'Completed (24h)', value: countText(s.completed), help: `${workflowType} instances that finished successfully in the last 24 hours.`, to: executions },
  ];
  if (canViewReviews) {
    cells.push({ label: 'Pending Reviews', value: countText(s.reviews), help: `Review activities of ${workflowType} waiting for a decision — approval gates and failed activities. Opens Human Tasks.`, to: `${resourceUrl(scope, 'tasks')}?tab=reviews&${env}` });
  }
  if (canViewTasks) {
    const tasksText = s.tasks === undefined ? '…' : s.tasks === null ? '—' : `${s.tasks}${s.tasksCapped ? '+' : ''}`;
    cells.push({ label: 'Pending Tasks', value: tasksText, help: `Human tasks of ${workflowType} waiting for anyone in any role. Human Tasks shows the ones you can act on.`, to: `${resourceUrl(scope, 'tasks')}?${env}` });
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, borderTop: '1px solid', borderColor: 'divider' }}>
      {cells.map((c, i) => (
        <Tooltip key={c.label} title={c.help}>
          <Box
            role="link"
            tabIndex={0}
            onClick={() => navigate(c.to)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate(c.to);
            }}
            sx={{
              px: 2,
              py: 1.5,
              cursor: 'pointer',
              outline: 'none',
              '&:hover, &:focus-visible': { bgcolor: 'action.hover' },
              ...(i < cells.length - 1 && { borderRight: '1px solid', borderColor: 'divider' }),
            }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600, display: 'block' }}>
              {c.label.toUpperCase()}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5, fontVariantNumeric: 'tabular-nums', color: c.alarm ? 'error.main' : 'inherit', fontWeight: c.alarm ? 600 : 400 }}>
              {c.value}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}
