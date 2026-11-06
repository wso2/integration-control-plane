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

import { Box, Button, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useRef, useState, type JSX, type ReactNode } from 'react';
import SchemaFormFields from './SchemaFormFields';
import { BARE_VALUE_FIELD, formIsAuthoritative, formValuesForRaw, jsonPretty, type FormField, type FormValues } from './schemaForm';

const monospaceInputSx = { '& textarea': { fontFamily: 'monospace', fontSize: 13 } } as const;

interface SchemaOrRawEditorProps {
  /** The generated form's fields, or null when the schema yields none: then only JSON is offered. */
  fields: FormField[] | null;
  values: FormValues;
  errors: Record<string, string>;
  onChange: (path: string, value: string | boolean) => void;
  rawMode: boolean;
  onRawModeChange: (raw: boolean) => void;
  rawText: string;
  onRawTextChange: (text: string) => void;
  /** What the JSON is called here: `Result (JSON)`, `Arguments (JSON)`, `Input (JSON)`. */
  rawLabel: string;
  rawError?: string;
  /** Sentence shown beside the mode toggle; also carries the form's own status line. */
  hint?: ReactNode;
  /**
   * The value the form was seeded from. Raw mode opens on this with the form's edits laid over it,
   * so a key the schema does not describe is still there to edit.
   */
  rawBase?: unknown;
  /**
   * The fields stand for one value submitted as it is (`parseSchemaForm`), so raw mode holds that
   * value rather than an object around it.
   */
  bare?: boolean;
  /** Helper text for the JSON editor when there is no form to fall back to. */
  noSchemaHelper: string;
  disabled?: boolean;
}

/**
 * The escape hatch every workflow input surface shares:
 * a schema-generated form with an `Edit as JSON` toggle beside it. Raw mode carries the form's
 * current values across once and never converts back, so a value the generated form cannot express
 * (anything the schema describes loosely, or text the inputs would reshape) can still be submitted
 * exactly as typed. Since the form does not read the JSON back, going back to it with JSON edits
 * takes a second click that discards them. With no parsed fields the JSON editor is all there is,
 * and the toggle is not offered.
 */
export default function SchemaOrRawEditor({ fields, values, errors, onChange, rawMode, onRawModeChange, rawText, onRawTextChange, rawLabel, rawError, hint, rawBase, bare = false, noSchemaHelper, disabled = false }: SchemaOrRawEditorProps): JSX.Element {
  // The form's values as of the last seed. A round trip through the form that changed nothing must
  // not overwrite JSON someone has since typed: only a real form edit reseeds.
  const seededFrom = useRef<string | null>(null);
  // The JSON as seeded, to tell whether it has been edited since.
  const seededText = useRef<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const toggleRawMode = () => {
    if (rawMode) {
      if (seededText.current !== null && rawText !== seededText.current) {
        if (!confirmDiscard) {
          setConfirmDiscard(true);
          return;
        }
        onRawTextChange(seededText.current);
      }
      setConfirmDiscard(false);
      onRawModeChange(false);
      return;
    }
    if (fields) {
      const formState = JSON.stringify(values);
      if (seededFrom.current !== formState) {
        const text = bare ? jsonPretty(formValuesForRaw(fields, values, { [BARE_VALUE_FIELD]: rawBase })[BARE_VALUE_FIELD]) || '' : jsonPretty(formValuesForRaw(fields, values, rawBase)) || '{}';
        onRawTextChange(text);
        seededFrom.current = formState;
        seededText.current = text;
      } else {
        seededText.current = rawText;
      }
    }
    onRawModeChange(true);
  };

  let rawToggleLabel = 'Edit as JSON';
  if (rawMode) {
    rawToggleLabel = confirmDiscard ? 'Discard JSON edits' : 'Back to form';
  }

  // The discard warning follows "Back to form" pressed with JSON edits, which the form cannot pick
  // up. With a schema, the form is there and raw mode bypasses it.
  let rawHelper: string | undefined = rawError;
  if (!rawHelper) {
    if (confirmDiscard) {
      rawHelper = 'The form does not pick up JSON edits. Submit them from here, or discard them to go back to the form.';
    } else {
      rawHelper = fields ? 'Raw mode: submitted exactly as typed; the form is bypassed.' : noSchemaHelper;
    }
  }

  return (
    <Stack gap={2}>
      {(hint || fields) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
          {fields && (
            <Button variant="text" size="small" disabled={disabled} onClick={toggleRawMode}>
              {rawToggleLabel}
            </Button>
          )}
        </Stack>
      )}
      {formIsAuthoritative(fields, rawMode) ? (
        <SchemaFormFields fields={fields} values={values} errors={errors} onChange={onChange} disabled={disabled} />
      ) : (
        <Box>
          <TextField
            labelPlacement="top"
            label={rawLabel}
            value={rawText}
            onChange={(event) => {
              setConfirmDiscard(false);
              onRawTextChange(event.target.value);
            }}
            disabled={disabled}
            error={!!rawError || confirmDiscard}
            helperText={rawHelper}
            size="small"
            fullWidth
            multiline
            minRows={6}
            sx={monospaceInputSx}
          />
        </Box>
      )}
    </Stack>
  );
}
