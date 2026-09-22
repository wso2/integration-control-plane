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

import { Box, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import { fieldPath, type FormField } from './helpers';

// Marks the required-field asterisk red on generated form fields.
const requiredAsteriskSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } } as const;

interface FieldsProps {
  fields: FormField[];
  values: Record<string, string | boolean>;
  errors: Record<string, string>;
  onChange: (name: string, value: string | boolean) => void;
  disabled?: boolean;
}

/** Renders one leaf field (boolean toggle, enum dropdown, or numeric/text input) keyed by its dotted path. */
function LeafField({
  field: f,
  path,
  values,
  errors,
  onChange,
  disabled,
}: {
  field: FormField;
  path: string;
  values: Record<string, string | boolean>;
  errors: Record<string, string>;
  onChange: (name: string, value: string | boolean) => void;
  disabled?: boolean;
}) {
  if (f.type === 'boolean') {
    return (
      <Box>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {f.label}
          {f.required && (
            <Typography component="span" color="error.main">
              {' *'}
            </Typography>
          )}
        </Typography>
        <ToggleButtonGroup exclusive size="small" disabled={disabled} value={typeof values[path] === 'boolean' ? (values[path] ? 'yes' : 'no') : null} onChange={(_, v) => v !== null && onChange(path, v === 'yes')}>
          <ToggleButton value="yes" sx={{ px: 2 }}>
            Yes
          </ToggleButton>
          <ToggleButton value="no" sx={{ px: 2 }}>
            No
          </ToggleButton>
        </ToggleButtonGroup>
        {(errors[path] || f.description) && (
          <Typography variant="caption" color={errors[path] ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
            {errors[path] || f.description}
          </Typography>
        )}
      </Box>
    );
  }
  const isJson = f.type === 'object' || f.type === 'array';
  const isNumeric = f.type === 'number' || f.type === 'integer';
  // Free text grows into a textarea. A single-line <input> silently strips CR/LF from its value, so a
  // multiline argument would render flattened and be submitted that way even untouched.
  const isText = !f.enumValues && !isJson && !isNumeric;
  return (
    <TextField
      label={f.label}
      fullWidth
      disabled={disabled}
      required={f.required}
      select={!!f.enumValues}
      multiline={isJson || isText}
      minRows={isJson ? 3 : undefined}
      maxRows={isText ? 10 : undefined}
      // Numeric fields are deliberately text inputs: <input type="number"> replaces content it can't
      // parse with '', which reaches validation looking untouched and reports "is required" instead of
      // the accurate "must be a number" / "must be an integer". Keeping the raw text lets that through.
      type="text"
      value={typeof values[path] === 'string' ? values[path] : ''}
      onChange={(e) => onChange(path, e.target.value)}
      error={!!errors[path]}
      helperText={errors[path] || f.description || (isJson ? 'Enter as JSON.' : undefined)}
      sx={requiredAsteriskSx}
      slotProps={{
        ...(isJson ? { input: { sx: { fontFamily: 'monospace', fontSize: 13 } } } : {}),
        ...(isNumeric ? { htmlInput: { inputMode: 'decimal' } } : {}),
      }}>
      {f.enumValues?.map((v) => (
        <MenuItem key={v} value={v}>
          {v}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Recursively renders a list of fields under `prefix`; grouped (nested-object) fields indent their children. */
function FieldList({ fields, prefix, values, errors, onChange, disabled }: FieldsProps & { prefix: string }) {
  return (
    <Stack gap={2}>
      {fields.map((f) => {
        const path = fieldPath(prefix, f.name);
        if (f.fields) {
          return (
            <Box key={path}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                {f.label}
                {f.required && (
                  <Typography component="span" color="error.main">
                    {' *'}
                  </Typography>
                )}
              </Typography>
              <Box sx={{ pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
                <FieldList fields={f.fields} prefix={path} values={values} errors={errors} onChange={onChange} disabled={disabled} />
              </Box>
            </Box>
          );
        }
        return <LeafField key={path} field={f} path={path} values={values} errors={errors} onChange={onChange} disabled={disabled} />;
      })}
    </Stack>
  );
}

/**
 * Renders editable inputs for fields derived from a JSON schema (see `parseFormSchema`):
 * a Yes/No toggle for booleans, a dropdown for enums, numeric/text inputs otherwise, and nested
 * groups for object properties, with required fields marked by a red asterisk. Values are kept as
 * entered (keyed by dotted path) and coerced to schema types at submit via `buildFormResult`.
 */
export default function SchemaFormFields({ fields, values, errors, onChange, disabled }: FieldsProps) {
  return <FieldList fields={fields} prefix="" values={values} errors={errors} onChange={onChange} disabled={disabled} />;
}
