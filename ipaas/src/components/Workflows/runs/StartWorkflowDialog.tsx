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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { CircleCheck } from '@wso2/oxygen-ui-icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type JSX } from 'react';
import CopyButton from '../../Overview/integration-as-api/CopyButton';
import type { WorkflowClient } from '../api/client';
import { markSettling } from '../api/settleRegistry';
import type { WorkflowDefinition, WorkflowHandle } from '../api/types';
import SchemaOrRawEditor from '../forms/SchemaOrRawEditor';
import { BARE_VALUE_FIELD, buildFormResult, formIsAuthoritative, parseRawJson, parseSchemaForm, type FormValues } from '../forms/schemaForm';
import { invalidateRunLists } from './runQueries';
import * as styles from './StartWorkflowDialog.styles';

/**
 * Starts a workflow.
 *
 * The input form is driven by the chosen definition's `inputSchema`; when the engine reports no
 * schema the workflow takes no input and the form says so rather than offering an empty JSON box.
 * On success the dialog swaps to a confirmation, with the new workflow id to copy and a way to
 * the run itself. A started workflow is not visible in the list until the visibility store catches
 * up, which is also why the id is marked settling.
 */

interface StartWorkflowDialogProps {
  open: boolean;
  api: WorkflowClient | null;
  scopeId: string;
  definitions: WorkflowDefinition[];
  /** Preselects this definition each time the dialog opens (the overview passes its selection). */
  initialWorkflowType?: string;
  onClose: () => void;
  /** Opens the run just started; the confirmation offers it as View Running Workflow. */
  onViewRun?: (run: { workflowType: string; runId: string }) => void;
}

const INPUT_LABEL = 'Input';

export default function StartWorkflowDialog({ open, api, scopeId, definitions, initialWorkflowType, onClose, onViewRun }: StartWorkflowDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [workflowType, setWorkflowType] = useState('');
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('{}');
  const [rawError, setRawError] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [started, setStarted] = useState<(WorkflowHandle & { workflowType: string }) | null>(null);

  // The input schema is per definition, so switching invalidates anything already typed.
  const clearInput = () => {
    setValues({});
    setErrors({});
    setRawMode(false);
    setRawText('{}');
    setRawError('');
  };

  // Opening from a view that has a definition in hand starts from that one, if it is still listed.
  const preselect = open && initialWorkflowType && definitions.some((d) => d.workflowType === initialWorkflowType) ? initialWorkflowType : null;
  const [preselected, setPreselected] = useState<string | null>(null);
  if (preselect !== preselected) {
    setPreselected(preselect);
    if (preselect) {
      setWorkflowType(preselect);
      clearInput();
    }
  }

  const selected = definitions.find((d) => d.workflowType === workflowType);

  // Keyed on the chosen type so switching definitions rebuilds the form. A workflow whose one input
  // parameter is a `string`, `boolean` or an enum gets one field, its value submitted bare.
  const { fields, bare } = useMemo(() => parseSchemaForm(selected?.inputSchema, INPUT_LABEL), [selected?.inputSchema]);

  const reset = () => {
    setWorkflowType('');
    clearInput();
    setWorkflowId('');
    setTimeoutSeconds('');
    setAdvanced(false);
    setSubmitError(null);
    setStarted(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleStart = () => {
    if (!api || !workflowType) {
      return;
    }
    let input: unknown;
    if (formIsAuthoritative(fields, rawMode)) {
      const { result, errors: found } = buildFormResult(fields, values);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        return;
      }
      input = bare ? result[BARE_VALUE_FIELD] : result;
    } else if (selected?.inputSchema) {
      const parsed = parseRawJson(rawText);
      if (!parsed) {
        setRawError('Input must be valid JSON.');
        return;
      }
      // Blank is no input at all, not `{}`: a workflow whose input is optional still starts.
      input = rawText.trim() ? parsed.value : undefined;
    }
    const timeout = timeoutSeconds.trim();
    if (timeout && !(Number.isInteger(Number(timeout)) && Number(timeout) > 0)) {
      setSubmitError('Timeout must be a whole number of seconds, above 0.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    api.instances
      .start({
        workflowType,
        ...(input !== undefined ? { input } : {}),
        ...(workflowId.trim() ? { workflowId: workflowId.trim() } : {}),
        ...(timeout ? { timeoutSeconds: Number(timeout) } : {}),
      })
      .then((handle) => {
        markSettling(handle.workflowId);
        invalidateRunLists(queryClient, scopeId);
        setStarted({ ...handle, workflowType });
      })
      .catch((error: unknown) => setSubmitError(error instanceof Error ? error.message : 'Could not start the workflow.'))
      .finally(() => setSubmitting(false));
  };

  const viewRun = () => {
    if (!started || !onViewRun) {
      return;
    }
    const { workflowType: startedType, runId } = started;
    close();
    onViewRun({ workflowType: startedType, runId });
  };

  // One dialog for both states, so the confirmation replaces the form in place.
  const confirmation = started && (
    <>
      <DialogTitle component="div" sx={styles.startedTitle}>
        <Box component="span" sx={styles.startedIcon}>
          <CircleCheck size={48} />
        </Box>
        <Typography component="h2" variant="h6">
          Workflow Started
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={styles.started}>
          <Typography variant="body1">
            <strong>{started.workflowType}</strong> started successfully.
          </Typography>
          <Box sx={styles.idBox}>
            <Box sx={styles.idText}>
              <Typography variant="caption" sx={styles.idLabel}>
                Workflow ID
              </Typography>
              <Typography sx={styles.idValue}>{started.workflowId}</Typography>
            </Box>
            <CopyButton value={started.workflowId} label="Copy workflow ID" />
          </Box>
          <Typography variant="caption" color="text.secondary">
            It may take a moment to appear in the Workflows list.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={styles.centredActions}>
        <Button variant={onViewRun ? 'outlined' : 'contained'} color={onViewRun ? 'inherit' : 'primary'} onClick={close}>
          Close
        </Button>
        {onViewRun && (
          <Button variant="contained" onClick={viewRun}>
            View Running Workflow
          </Button>
        )}
      </DialogActions>
    </>
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : close} maxWidth="sm" fullWidth>
      {confirmation || (
        <>
          <DialogTitle>Start New Workflow</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={styles.form}>
              {submitError && <Alert severity="error">{submitError}</Alert>}

              <TextField
                select
                labelPlacement="top"
                label="Workflow Definition"
                required
                size="small"
                fullWidth
                value={workflowType}
                disabled={submitting}
                onChange={(event) => {
                  setWorkflowType(event.target.value);
                  clearInput();
                }}
                slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">
                  <Typography component="span" variant="body2" color="text.secondary">
                    Select a workflow definition…
                  </Typography>
                </MenuItem>
                {definitions.map((definition) => (
                  <MenuItem key={definition.workflowType} value={definition.workflowType}>
                    {definition.workflowType}
                  </MenuItem>
                ))}
              </TextField>

              {workflowType &&
                (selected?.inputSchema ? (
                  <SchemaOrRawEditor
                    key={workflowType}
                    fields={fields}
                    values={values}
                    errors={errors}
                    onChange={(path, value) => setValues((current) => ({ ...current, [path]: value }))}
                    rawMode={rawMode}
                    onRawModeChange={(raw) => {
                      setRawMode(raw);
                      setRawError('');
                    }}
                    rawText={rawText}
                    onRawTextChange={(text) => {
                      setRawText(text);
                      setRawError('');
                    }}
                    rawLabel="Input (JSON)"
                    rawError={rawError}
                    bare={bare}
                    noSchemaHelper="This workflow's input has no generated form; the JSON is submitted as the input."
                    disabled={submitting}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    This workflow takes no input.
                  </Typography>
                ))}

              <Button variant="text" size="small" sx={styles.advancedToggle} aria-expanded={advanced} onClick={() => setAdvanced((current) => !current)}>
                {advanced ? 'Hide advanced' : 'Advanced'}
              </Button>

              {advanced && (
                <>
                  <TextField
                    labelPlacement="top"
                    label="Workflow ID"
                    size="small"
                    fullWidth
                    value={workflowId}
                    disabled={submitting}
                    onChange={(event) => setWorkflowId(event.target.value)}
                    helperText="Optional. The engine generates one when left blank; supplying your own makes the start idempotent."
                  />
                  <TextField labelPlacement="top" label="Timeout (seconds)" size="small" fullWidth type="number" value={timeoutSeconds} disabled={submitting} onChange={(event) => setTimeoutSeconds(event.target.value)} />
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" color="inherit" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="contained" disabled={!api || !workflowType || submitting} onClick={handleStart} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Start
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
