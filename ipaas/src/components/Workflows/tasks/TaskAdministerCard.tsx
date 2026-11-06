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

import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import type { TaskAudience, TaskSummary } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import { ActionCard, ActionCardRow, DetailRow, NotProvided, SectionCard } from '../shared/DetailSections';
import { actionErrorText, type TaskNotice } from './workItem';
import * as styles from './WorkItemDrawer.styles';

/** Administrators are named beside the audience, whichever the task's kind. */
export function AdministratorsRow({ task }: { task: TaskSummary }): JSX.Element {
  const roles = task.administratorRoles ?? [];
  const users = task.administratorUsers ?? [];
  return (
    <DetailRow label="Administrators">
      {roles.length || users.length ? (
        <Box sx={styles.chips}>
          {roles.map((role) => (
            <Chip key={`r:${role}`} label={role} size="small" variant="outlined" />
          ))}
          {users.map((user) => (
            <Chip key={`u:${user}`} label={user} size="small" />
          ))}
        </Box>
      ) : (
        <NotProvided />
      )}
    </DetailRow>
  );
}

/**
 * Who may act on a task or review: its roles as chips, and any named users. A review that names no
 * one is open to any caller who can see it, which `emptyLabel` says rather than "Not provided".
 */
export function EligibleRolesRows({ task, emptyLabel }: { task: TaskSummary; emptyLabel?: string }): JSX.Element {
  const roles = task.userRoles ?? [];
  const users = task.users ?? [];
  return (
    <>
      <DetailRow label="Eligible Roles">
        {roles.length > 0 ? (
          <Box sx={styles.chips}>
            {roles.map((role) => (
              <Chip key={role} label={role} size="small" variant="outlined" />
            ))}
          </Box>
        ) : (
          <NotProvided label={users.length > 0 ? 'None' : emptyLabel} />
        )}
      </DetailRow>
      {users.length > 0 && <DetailRow label="Eligible Users">{users.join(' · ')}</DetailRow>}
    </>
  );
}

// One entry per line: a role name may itself contain a comma, so a comma never separates entries.
const listOf = (text: string): string[] =>
  text
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);

// The runtime's stored form, one per line, exactly as it goes back when left unchanged.
const linesOf = (values?: string[]): string => (values ?? []).join('\n');

type Mode = 'none' | 'reassign' | 'deadline';

/** One administrator act: hand the task to a new audience, or move or clear its deadline. */
type AdminAct = { kind: 'reassign'; audience: TaskAudience } | { kind: 'deadline'; timeoutMillis: number | null };

function successOf(act: AdminAct): string {
  if (act.kind === 'reassign') return 'Task reassigned.';
  return act.timeoutMillis === null ? 'Deadline cleared.' : 'Deadline extended.';
}

const failureOf = (act: AdminAct): string => (act.kind === 'reassign' ? 'Could not reassign the task.' : 'Could not change the deadline.');

interface AudienceFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  disabled: boolean;
}

function AudienceField({ label, value, onChange, hint, disabled }: AudienceFieldProps): JSX.Element {
  return <TextField labelPlacement="top" label={label} value={value} onChange={(event) => onChange(event.target.value)} helperText={hint} size="small" fullWidth multiline minRows={2} disabled={disabled} />;
}

interface DurationFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  max?: number;
  disabled: boolean;
}

function DurationField({ label, value, onChange, max, disabled }: DurationFieldProps): JSX.Element {
  return <TextField labelPlacement="top" label={label} type="number" value={value} onChange={(event) => onChange(event.target.value)} slotProps={{ htmlInput: { min: 0, max } }} size="small" sx={styles.durationField} disabled={disabled} />;
}

interface TaskAdministerCardProps {
  api: ReadyWorkflowApi;
  task: TaskSummary;
  disabled?: boolean;
  /** Called after an act succeeded: the task has changed and must be read again. */
  onDone: () => void;
  onNotify: (notice: TaskNotice) => void;
}

/**
 * What an administrator may do to a pending task besides deciding it: hand it to a new audience,
 * or move or clear its deadline. Both kinds of task
 * accept both acts, and the engine records each one in the task's history under the caller's name.
 * Shown only when the engine reports that the caller administers the task (`canAdminister`), which
 * it decides from the caller's token against the task's administrators; a refused act says why.
 */
export default function TaskAdministerCard({ api, task, disabled = false, onDone, onNotify }: TaskAdministerCardProps): JSX.Element | null {
  const { client, connection } = api;
  const [mode, setMode] = useState<Mode>('none');
  const [userRoles, setUserRoles] = useState(linesOf(task.userRoles));
  const [users, setUsers] = useState(linesOf(task.users));
  const [excludedRoles, setExcludedRoles] = useState(linesOf(task.excludedRoles));
  const [excludedUsers, setExcludedUsers] = useState(linesOf(task.excludedUsers));
  const [days, setDays] = useState('0');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const administer = useMutation({
    mutationFn: (act: AdminAct) => (act.kind === 'reassign' ? client.humanTasks.reassign(task.taskId, act.audience) : client.humanTasks.extendDeadline(task.taskId, act.timeoutMillis)),
    onSuccess: (_answer, act) => {
      setMode('none');
      onNotify({ message: successOf(act), severity: 'success' });
      onDone();
    },
    onError: (failure, act) => setError(actionErrorText(connection, failure, failureOf(act))),
  });

  if (task.canAdminister !== true) {
    return null;
  }
  const submitting = administer.isPending;
  const busy = disabled || submitting;

  const act = (next: AdminAct) => {
    setError(null);
    administer.mutate(next);
  };

  const submitReassign = () => {
    const audience = { userRoles: listOf(userRoles), users: listOf(users), excludedRoles: listOf(excludedRoles), excludedUsers: listOf(excludedUsers) };
    if (audience.userRoles.length === 0 && audience.users.length === 0) {
      setError('Name at least one role or user.');
      return;
    }
    act({ kind: 'reassign', audience });
  };

  const submitDeadline = (clear: boolean) => {
    if (clear) {
      act({ kind: 'deadline', timeoutMillis: null });
      return;
    }
    const timeoutMillis = Math.round(((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000);
    if (!Number.isSafeInteger(timeoutMillis) || timeoutMillis <= 0) {
      setError('Enter a deadline from now: days, hours and minutes adding up to more than zero.');
      return;
    }
    act({ kind: 'deadline', timeoutMillis });
  };

  const toggle = (next: Mode) => {
    setError(null);
    setMode((current) => (current === next ? 'none' : next));
  };

  const spinner = submitting ? <CircularProgress size={14} color="inherit" /> : undefined;

  return (
    <SectionCard title="Administer">
      <Stack gap={2}>
        <Typography variant="body2" color="text.secondary">
          You administer this task. Each action below is recorded in its history under your name.
        </Typography>
        <ActionCardRow>
          <ActionCard
            title="Reassign"
            subtitle="Hand the task to a new audience."
            info="Replaces who may complete the task. The current audience is refused from then on; anyone eligible before who already acted keeps their record."
            selected={mode === 'reassign'}
            disabled={busy}
            onClick={() => toggle('reassign')}
          />
          <ActionCard
            title="Change Deadline"
            subtitle="Extend from now, or remove it."
            info="A new deadline is counted from now, replacing the one the task was created with. Clearing it leaves the task open until someone decides."
            selected={mode === 'deadline'}
            disabled={busy}
            onClick={() => toggle('deadline')}
          />
        </ActionCardRow>

        {error && <Alert severity="error">{error}</Alert>}

        {mode === 'reassign' && (
          <Box sx={styles.editorPanel}>
            <AudienceField label="Roles" value={userRoles} onChange={setUserRoles} hint="One per line. Anyone holding one of these may complete the task." disabled={busy} />
            <AudienceField label="Users" value={users} onChange={setUsers} hint="One user id per line." disabled={busy} />
            <AudienceField label="Excluded roles" value={excludedRoles} onChange={setExcludedRoles} disabled={busy} />
            <AudienceField label="Excluded users" value={excludedUsers} onChange={setExcludedUsers} disabled={busy} />
            <Box sx={styles.formActions}>
              <Button variant="text" color="inherit" size="small" disabled={busy} onClick={() => setMode('none')}>
                Cancel
              </Button>
              <Button variant="contained" size="small" disabled={busy} onClick={submitReassign} startIcon={spinner}>
                Reassign
              </Button>
            </Box>
          </Box>
        )}

        {mode === 'deadline' && (
          <Box sx={styles.editorPanel}>
            <Typography variant="body2" color="text.secondary">
              The new deadline, counted from now.
            </Typography>
            <Box sx={styles.durationFields}>
              <DurationField label="Days" value={days} onChange={setDays} disabled={busy} />
              <DurationField label="Hours" value={hours} onChange={setHours} max={23} disabled={busy} />
              <DurationField label="Minutes" value={minutes} onChange={setMinutes} max={59} disabled={busy} />
            </Box>
            <Box sx={styles.formActions}>
              <Button variant="text" color="inherit" size="small" disabled={busy} onClick={() => setMode('none')}>
                Cancel
              </Button>
              <Button variant="outlined" size="small" disabled={busy} onClick={() => submitDeadline(true)}>
                Clear deadline
              </Button>
              <Button variant="contained" size="small" disabled={busy} onClick={() => submitDeadline(false)} startIcon={spinner}>
                Extend
              </Button>
            </Box>
          </Box>
        )}
      </Stack>
    </SectionCard>
  );
}
