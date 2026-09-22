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

import { Button, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useRef, type ReactNode } from 'react';
import SchemaFormFields from './SchemaFormFields';
import { formValuesForRaw, jsonPretty, type FormField } from './helpers';

// Shown under the JSON editor while a schema exists: the form is there, and this bypasses it.
const RAW_MODE_HELPER = 'Raw mode: submitted exactly as typed — the form is bypassed.';

interface SchemaOrRawEditorProps {
  // The generated form's fields, or null when the schema yields none — then only raw JSON is offered.
  fields: FormField[] | null;
  values: Record<string, string | boolean>;
  errors: Record<string, string>;
  onChange: (name: string, value: string | boolean) => void;
  rawMode: boolean;
  onRawModeChange: (raw: boolean) => void;
  rawText: string;
  onRawTextChange: (text: string) => void;
  // What the JSON is called here: `Result (JSON)`, `Arguments (JSON)`, `Input (JSON)`.
  rawLabel: string;
  rawError?: string;
  // Sentence shown beside the mode toggle; also carries the form's own status line.
  hint?: ReactNode;
  // The value the form was seeded from. Raw mode opens on this with the form's edits laid over it, so
  // a key the schema does not describe is still there to edit.
  rawBase?: unknown;
  // Helper text for the JSON editor when there is no form to fall back to.
  noSchemaHelper: string;
  disabled?: boolean;
}

/**
 * The escape hatch every workflow input surface shares: a schema-generated form with an
 * `Edit as JSON` toggle beside it. Raw mode carries the form's current values across once and never
 * converts back, so a value the generated form cannot express — anything the schema describes loosely,
 * or text the inputs would reshape — can still be submitted exactly as typed. With no parsed fields the
 * JSON editor is all there is, and the toggle is not offered.
 */
export default function SchemaOrRawEditor({ fields, values, errors, onChange, rawMode, onRawModeChange, rawText, onRawTextChange, rawLabel, rawError, hint, rawBase, noSchemaHelper, disabled }: SchemaOrRawEditorProps) {
  // The form's values as of the last seed. A round trip through the form that changed nothing must not
  // overwrite JSON someone has since typed — only a real form edit reseeds.
  const seededFrom = useRef<string | null>(null);

  const toggleRawMode = () => {
    if (!rawMode && fields) {
      const formState = JSON.stringify(values);
      if (seededFrom.current !== formState) {
        onRawTextChange(jsonPretty(formValuesForRaw(fields, values, rawBase)) || '{}');
        seededFrom.current = formState;
      }
    }
    onRawModeChange(!rawMode);
  };

  return (
    <Stack gap={2}>
      {(hint || fields) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
          {fields && (
            <Button size="small" variant="text" disabled={disabled} onClick={toggleRawMode}>
              {rawMode ? 'Back to form' : 'Edit as JSON'}
            </Button>
          )}
        </Stack>
      )}
      {fields && !rawMode ? (
        <SchemaFormFields fields={fields} values={values} errors={errors} onChange={onChange} disabled={disabled} />
      ) : (
        <TextField
          label={rawLabel}
          fullWidth
          multiline
          minRows={5}
          disabled={disabled}
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          error={!!rawError}
          helperText={rawError || (fields ? RAW_MODE_HELPER : noSchemaHelper)}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
        />
      )}
    </Stack>
  );
}
