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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import { Plus, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState } from 'react';
import { useTriggerComponent } from '../../../hooks/useExecutions';
import FormFieldTile from '../../AutomationTest/FormFieldTile';
import type { DynamicFormData, DynamicFormFieldValue, DynamicFormValidationErrors, RuntimeArgument, TriggerArgument } from '../../../types/executions';
import { buildExecutionArgumentsFromForm, parseRuntimeArgumentsToFormFields, validatePositionalOrder, validateRequiredFields } from '../../../utils/runtimeArguments';

export interface RunWithArgsDialogProps {
  open: boolean;
  onClose: () => void;
  onRunSuccess?: (args: string[]) => void;
  envCritical?: boolean | null;
  orgHandler: string;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** Arguments the program declares, in the order it reads them. Each gets a row labelled with its name. */
  runtimeArguments?: RuntimeArgument[];
}

const isFilled = (value: string): boolean => value.trim() !== '';

const NO_ARGUMENTS: RuntimeArgument[] = [];

/**
 * Declared arguments render as the Test page's fields and serialize the same way. Added
 * rows are free-form values passed after them; since arguments are positional, they can
 * only be used once every declared argument before them has a value.
 */
export default function RunWithArgsDialog({ open, onClose, onRunSuccess, orgHandler, projectId, componentId, releaseId, runtimeArguments = NO_ARGUMENTS }: RunWithArgsDialogProps) {
  const initialExtra = runtimeArguments.length > 0 ? [] : [''];
  const formFields = useMemo(() => parseRuntimeArgumentsToFormFields(runtimeArguments), [runtimeArguments]);
  const [formData, setFormData] = useState<DynamicFormData>({});
  const [args, setArgs] = useState<string[]>(initialExtra);
  const [errors, setErrors] = useState<DynamicFormValidationErrors>({});
  const [runError, setRunError] = useState<string | null>(null);
  const trigger = useTriggerComponent();

  const handleAddArg = () => setArgs((prev) => [...prev, '']);

  const handleRemoveArg = (index: number) => setArgs((prev) => prev.filter((_, i) => i !== index));

  const handleChange = (index: number, val: string) => {
    setArgs((prev) => prev.map((arg, i) => (i === index ? val : arg)));
  };

  const handleFieldChange = (fieldId: string, value: DynamicFormFieldValue) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!(fieldId in prev)) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const extraFilled = args.some(isFilled);
  const gaps = validatePositionalOrder(runtimeArguments, formData, extraFilled);
  const execArgs: TriggerArgument[] = [...buildExecutionArgumentsFromForm(runtimeArguments, formData), ...args.filter(isFilled).map((value) => ({ argument_name: '', argument_value: value }))];

  const handleRun = () => {
    setRunError(null);
    const found = { ...gaps, ...validateRequiredFields(formFields, formData) };
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    trigger.mutate(
      { orgHandler, projectId, componentId, releaseId, args: execArgs },
      {
        onSuccess: () => {
          const resolvedArgs = execArgs.map((a) => a.argument_value);
          handleClose();
          onRunSuccess?.(resolvedArgs);
        },
        onError: (err) => setRunError(err instanceof Error ? err.message : 'Failed to execute'),
      },
    );
  };

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    setFormData({});
    setArgs(initialExtra);
    setErrors({});
    setRunError(null);
    onClose();
  };

  // With a gap, the values would land on the wrong parameters, so no preview is shown.
  const hasGap = Object.keys(gaps).length > 0;
  const previewJson = JSON.stringify(execArgs.map((a) => a.argument_value));
  const removable = runtimeArguments.length > 0 || args.length > 1;

  const drawerSx = {
    '& .MuiDrawer-paper': {
      width: 440,
      position: 'fixed',
      top: 64,
      height: 'calc(100% - 64px)',
      borderLeft: '1px solid',
      borderColor: 'divider',
      display: 'flex',
      flexDirection: 'column',
    },
  };

  return (
    <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h5">Runtime Arguments</Typography>
        <IconButton size="small" aria-label="close" onClick={handleClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
        <Stack gap={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Arguments
            </Typography>
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1, fontFamily: hasGap ? undefined : 'monospace', fontSize: '0.75rem', wordBreak: 'break-all', color: hasGap ? 'text.secondary' : undefined }}>
              {hasGap ? 'Fill the arguments in order to see what is passed.' : previewJson}
            </Box>
          </Box>

          {formFields.map((field) => (
            <FormFieldTile key={field.id} field={field} value={formData[field.id]} onChange={(value) => handleFieldChange(field.id, value)} error={!!errors[field.id]} helperText={errors[field.id]} />
          ))}

          {args.map((arg, index) => (
            <Stack key={index} gap={0.5}>
              <Typography variant="caption" color="text.secondary">
                Arg {runtimeArguments.length + index + 1}
              </Typography>
              <Stack direction="row" gap={1} alignItems="center">
                <TextField size="small" fullWidth placeholder="Enter the argument" value={arg} onChange={(e) => handleChange(index, e.target.value)} />
                <IconButton size="small" aria-label="Remove argument" disabled={!removable} onClick={() => handleRemoveArg(index)}>
                  <Trash2 size={14} />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>

        <Button variant="text" size="small" startIcon={<Plus size={14} />} onClick={handleAddArg} sx={{ mt: 1.5, px: 0 }}>
          Add Argument
        </Button>
        {/* Past its declared arguments, a program only reads options; extra values fail the run. */}
        {runtimeArguments.length > 0 && !runtimeArguments.some((arg) => arg.repeat) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            The program declares only the arguments above. Add values only for options it reads, such as --name=value.
          </Typography>
        )}

        {runError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {runError}
          </Alert>
        )}
      </Box>

      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleRun} disabled={trigger.isPending || !releaseId} startIcon={trigger.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {trigger.isPending ? 'Executing…' : 'Execute'}
        </Button>
      </Stack>
    </Drawer>
  );
}
