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

import { Box, Button, CircularProgress, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { Play } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { DynamicFormData, DynamicFormFieldValue, DynamicFormValidationErrors, FormField } from '../../types/executions';
import { RUNTIME_ARGS_DOC_URL } from '../../constants/docs';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import FormFieldTile from './FormFieldTile';

interface ExecutionFormProps {
  formFields: FormField[];
  formData: DynamicFormData;
  validationErrors: DynamicFormValidationErrors;
  showErrors: boolean;
  onFieldChange: (fieldId: string, value: DynamicFormFieldValue) => void;
  onRun: () => void;
  onClear: () => void;
  isRunDisabled: boolean;
  isClearDisabled: boolean;
  isTriggering: boolean;
  /** Critical (e.g. Production) environments label the action "Run" instead of "Test". */
  envCritical?: boolean;
}

/**
 * The Test page's left panel: one card per runtime-argument field, or an empty
 * state when the automation declares none, followed by the Clear / Test actions.
 */
export default function ExecutionForm({ formFields, formData, validationErrors, showErrors, onFieldChange, onRun, onClear, isRunDisabled, isClearDisabled, isTriggering, envCritical }: ExecutionFormProps): JSX.Element {
  const runLabel = envCritical ? 'Run' : 'Test';
  const runningLabel = envCritical ? 'Running…' : 'Testing…';
  const canRun = useCan()(Scopes.INTEGRATION_EXECUTE);
  return (
    <Box>
      <Stack gap={2}>
        {formFields.map((field) => (
          <Box key={field.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, bgcolor: 'background.paper' }}>
            <FormFieldTile field={field} value={formData[field.id]} onChange={(value) => onFieldChange(field.id, value)} error={showErrors && !!validationErrors[field.id]} helperText={validationErrors[field.id]} />
          </Box>
        ))}
      </Stack>

      {formFields.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            No runtime arguments available. To configure, see the{' '}
            <Link href={RUNTIME_ARGS_DOC_URL} target="_blank" rel="noopener noreferrer" variant="body2">
              Documentation.
            </Link>
          </Typography>
        </Box>
      )}

      <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button variant="outlined" size="small" onClick={onClear} disabled={isClearDisabled}>
          Clear
        </Button>
        {canRun && (
          <Button variant="contained" size="small" startIcon={isTriggering ? <CircularProgress size={12} color="inherit" /> : <Play size={14} />} onClick={onRun} disabled={isRunDisabled}>
            {isTriggering ? runningLabel : runLabel}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
