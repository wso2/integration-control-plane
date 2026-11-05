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

import { Alert, Box, Chip, Collapse, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import i18n, { useTranslation } from '../../i18n';
import type { StepAttempt, StepStatus, StepType } from '../../types/workflow';
import { formatDateTime, formatDuration, humanize, plainName } from '../../utils/time';
import { FailedIcon, InProgressIcon, SkippedIcon, SuccessIcon, WaitingIcon } from '../StatusIcons';
import StructuredValue from '../StructuredValue';

const LABELLED_TYPES = ['HUMAN_TASK', 'REVIEW_ACTIVITY', 'TIMER', 'CHILD_WORKFLOW'] as const;
const isLabelled = (type: StepType): type is (typeof LABELLED_TYPES)[number] => (LABELLED_TYPES as readonly StepType[]).includes(type);

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'COMPLETED':
      return <SuccessIcon />;
    case 'FAILED':
    case 'TIMED_OUT':
      return <FailedIcon />;
    case 'RUNNING':
      return <InProgressIcon />;
    case 'WAITING':
      return <WaitingIcon />;
    default:
      return <SkippedIcon />;
  }
}

/** A review's node completes whatever was decided; its output, the decision, says whether it was rejected. */
function isRejectedReview(attempt: StepAttempt): boolean {
  const output = attempt.output as { action?: unknown } | null;
  return attempt.type === 'REVIEW_ACTIVITY' && attempt.status === 'COMPLETED' && output?.action === 'reject';
}

interface Step {
  key: string;
  name: string;
  type: StepType;
  attempts: StepAttempt[];
}

/** Attempts grouped by call site, in the order the run reached them. An approval is its own step. */
function group(attempts: StepAttempt[]): Step[] {
  const steps: Step[] = [];
  const byKey = new Map<string, Step>();
  for (const a of attempts) {
    const key = `${a.type === 'REVIEW_ACTIVITY' ? 'review:' : ''}${a.stepId ?? a.name}`;
    let step = byKey.get(key);
    if (!step) {
      step = { key, name: a.name, type: a.type, attempts: [] };
      byKey.set(key, step);
      steps.push(step);
    }
    step.attempts.push(a);
  }
  return steps;
}

function stepLabel(step: Step): string {
  const name = humanize(plainName(step.name));
  return step.type === 'REVIEW_ACTIVITY' ? i18n.t('workflow.steps.approveStep', { step: name.toLowerCase() }) : name;
}

/** A task's or review's node runs for as long as it waits on a person. */
function waitsOnSomeone(attempt: StepAttempt): boolean {
  return (attempt.type === 'HUMAN_TASK' || attempt.type === 'REVIEW_ACTIVITY') && attempt.status === 'RUNNING';
}

function inputOf(attempt: StepAttempt): unknown {
  if (attempt.type !== 'HUMAN_TASK' && attempt.type !== 'REVIEW_ACTIVITY') return attempt.input;
  return (attempt.input as { taskInput?: unknown } | null)?.taskInput;
}

function outputOf(attempt: StepAttempt): unknown {
  const output = attempt.output as Record<string, unknown> | null;
  if (attempt.type === 'HUMAN_TASK') return output?.result;
  if (attempt.type === 'REVIEW_ACTIVITY' && output) {
    const { action, input, feedback } = output;
    return { action, ...(input !== undefined && { input }), ...(feedback !== undefined && { feedback }) };
  }
  return attempt.output;
}

function AttemptDetail({ attempt, numbered }: { attempt: StepAttempt; numbered: boolean }) {
  const { t } = useTranslation();
  return (
    <Stack gap={1.5} sx={{ py: 1 }}>
      {numbered && (
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          {t('workflow.steps.attempt', { attempt: attempt.attempt, status: t(`workflow.stepStatus.${attempt.status}`), started: formatDateTime(attempt.startTime), duration: formatDuration(attempt.startTime, attempt.endTime) })}
        </Typography>
      )}
      {attempt.failure && (
        <Alert severity="error" variant="outlined" sx={{ py: 0 }}>
          {attempt.failure.message}
        </Alert>
      )}
      <Box>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5, fontWeight: 600 }}>
          {t('workflow.steps.input')}
        </Typography>
        <StructuredValue value={inputOf(attempt)} />
      </Box>
      {attempt.status === 'COMPLETED' && (
        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5, fontWeight: 600 }}>
            {t('workflow.steps.output')}
          </Typography>
          <StructuredValue value={outputOf(attempt)} />
        </Box>
      )}
    </Stack>
  );
}

function StepRow({ step, last }: { step: Step; last: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const latest = step.attempts[step.attempts.length - 1];
  const first = step.attempts[0];
  const typeLabel = isLabelled(step.type) ? t(`workflow.steps.type.${step.type}`) : undefined;
  const waiting = latest.status === 'WAITING' || waitsOnSomeone(latest);
  // Temporal retries an activity within one node, so its attempts are counted, not its nodes.
  const attempts = step.attempts.reduce((sum, a) => sum + Math.max(a.attempt, 1), 0);
  const rejected = isRejectedReview(latest);

  return (
    <Stack direction="row" gap={1.5}>
      <Stack alignItems="center" sx={{ pt: 1.25 }}>
        {rejected ? <FailedIcon /> : <StatusIcon status={waiting ? 'WAITING' : latest.status} />}
        {!last && <Box sx={{ flex: 1, width: '2px', bgcolor: 'divider', mt: 0.5 }} />}
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0, pb: last ? 0 : 1 }}>
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((v) => !v))}
          sx={{ cursor: 'pointer', borderRadius: 1, px: 1, py: 1, '&:hover': { bgcolor: 'action.hover' } }}>
          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', opacity: 0.6, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {stepLabel(step)}
          </Typography>
          {typeLabel && <Chip size="small" variant="outlined" label={typeLabel} />}
          {attempts > 1 && <Chip size="small" color="warning" variant="outlined" label={t('workflow.steps.attempts', { count: attempts })} />}
          {rejected && (
            <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
              {t('workflow.steps.rejected')}
            </Typography>
          )}
          {waiting && (
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
              {t('workflow.steps.waitingForSomeone')}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" noWrap title={formatDateTime(first.startTime)}>
            {formatDuration(first.startTime, latest.endTime)}
          </Typography>
        </Stack>
        <Collapse in={open} unmountOnExit>
          <Box sx={{ pl: 4, pr: 1 }}>
            {step.attempts.map((a) => (
              <AttemptDetail key={a.id} attempt={a} numbered={step.attempts.length > 1} />
            ))}
          </Box>
        </Collapse>
      </Box>
    </Stack>
  );
}

/** The steps a run went through, as a timeline. Open a step for its input, output and failures. */
export default function StepTimeline({ attempts }: { attempts: StepAttempt[] }) {
  const { t } = useTranslation();
  const steps = group(attempts);
  if (!steps.length)
    return (
      <Typography variant="body2" color="text.secondary">
        {t('workflow.steps.noneStarted')}
      </Typography>
    );
  return (
    <Box>
      {steps.map((step, i) => (
        <StepRow key={step.key} step={step} last={i === steps.length - 1} />
      ))}
    </Box>
  );
}
