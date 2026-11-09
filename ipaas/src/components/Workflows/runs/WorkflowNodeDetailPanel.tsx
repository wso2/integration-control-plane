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

import { Alert, AlertTitle, Box, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import CopyButton from '../../Overview/integration-as-api/CopyButton';
import { typeLabel } from '../flow/graphVisuals';
import { SYNTHETIC_STEP_PREFIX } from '../flow/instanceGraph';
import { humanizeKey } from '../forms/schemaForm';
import type { StepExecution } from '../model/workflowFlow';
import { splitQualifiedName, type NodeExecutionDetail } from '../model/workflowHistory';
import StatusChip from '../shared/StatusChip';
import StructuredValue from '../shared/StructuredValue';
import { formatDurationMs } from '../shared/workflowDuration';
import { stepStatusChipColor, stepStatusLabel } from '../shared/workflowStepStatus';
import * as styles from './WorkflowNodeDetailPanel.styles';

interface WorkflowNodeDetailPanelProps {
  label: string;
  /** The span's category or the step's kind: `ACTIVITY`, `HUMAN_TASK`, `WORKFLOW`, ... */
  type: string;
  detail: NodeExecutionDetail;
  /** False when the run's history could not be read, so there is no input or result to show. */
  hasHistory: boolean;
  /** The rail step this execution belongs to, when it belongs to one. */
  stepId?: string | null;
  step?: StepExecution;
  onClose: () => void;
}

function configValueText(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function configLabel(key: string): string {
  if (key === 'stepId') {
    return 'Step';
  }
  return key === 'retryOnError' ? 'Retries on Error' : humanizeKey(key);
}

function resultMessage(status?: string): string {
  if (status === 'COMPLETED') {
    return 'This step completed with no return value.';
  }
  return status ? 'No result; this step has not completed.' : 'No result recorded for this step.';
}

/**
 * The details of one execution, opened from a flow node or a timeline span: the step's type, status and duration, its call configuration, and its
 * input, result and failure decoded from the run's history (`extractNodeExecutionDetail`).
 * There is no conversation view for AI-agent model calls; the console hosts no agent workflows.
 * Rendered as a third card beside the flow and the timeline, which narrow to make room for it.
 */
export default function WorkflowNodeDetailPanel({ label, type, detail, hasHistory, stepId, step, onClose }: WorkflowNodeDetailPanelProps): JSX.Element {
  const { task } = splitQualifiedName(label);
  const title = task ?? label;
  const namedStep = stepId && !stepId.startsWith(SYNTHETIC_STEP_PREFIX) ? stepId : null;
  // The step id is shown once, from the rail's own record of it.
  const configEntries = Object.entries(detail.callConfig ?? {}).filter(([key]) => !(key === 'stepId' && namedStep));
  // More than one execution of a call site: a loop, or a retry past a failure.
  const executions = step && step.count > 1 ? step.count : null;

  return (
    <Box component="aside" sx={styles.card} aria-label={`${title} details`}>
      <Box sx={styles.header}>
        <Box sx={styles.headerText}>
          <Typography variant="subtitle2" sx={styles.headerTitle} title={label}>
            {title}
          </Typography>
          <Box sx={styles.headerSubline}>
            <Typography variant="caption">{typeLabel(type)}</Typography>
            {detail.status && <StatusChip label={stepStatusLabel(detail.status)} color={stepStatusChipColor(detail.status)} />}
            {detail.durationMs !== null && <Typography variant="caption">{formatDurationMs(detail.durationMs)}</Typography>}
          </Box>
        </Box>
        <Tooltip title="Close">
          <IconButton size="small" aria-label="Close step details" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={styles.body}>
        {(namedStep || executions || configEntries.length > 0) && (
          <Box sx={styles.configChipsRow}>
            {namedStep && (
              <Box sx={styles.configChip}>
                {'Step: '}
                <Box component="span" sx={styles.mono}>
                  {namedStep}
                </Box>
              </Box>
            )}
            {executions && <Box sx={styles.configChip}>{`Executions: ${executions}`}</Box>}
            {configEntries.map(([key, value]) => (
              <Box key={key} sx={styles.configChip}>
                {`${configLabel(key)}: ${configValueText(value)}`}
              </Box>
            ))}
          </Box>
        )}

        {detail.childWorkflowId && (
          <Box sx={styles.instanceRow}>
            <Typography variant="caption" color="text.secondary">
              Instance
            </Typography>
            <Box component="span" sx={styles.mono}>
              {detail.childWorkflowId}
            </Box>
            <CopyButton value={detail.childWorkflowId} label="Copy ID" />
          </Box>
        )}

        {!hasHistory ? (
          <Typography variant="body2" color="text.secondary">
            The run’s history could not be read, so this step’s input and result can’t be shown.
          </Typography>
        ) : (
          <>
            {detail.error && (
              <Alert severity="error">
                <AlertTitle>Error</AlertTitle>
                {detail.error}
              </Alert>
            )}
            {detail.input !== null ? (
              <StructuredValue title="Input" value={detail.input} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No input recorded for this step.
              </Typography>
            )}
            {detail.result !== null ? (
              <StructuredValue title="Result" value={detail.result} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                {resultMessage(detail.status)}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
