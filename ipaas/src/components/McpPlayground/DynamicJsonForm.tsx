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

import { Alert, Box, FormControlLabel, MenuItem, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography, TextField } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { coerceFieldValue, formatFieldLabel, isSimpleObjectSchema } from '../../utils/mcp';
import type { JsonSchemaType, JsonValue } from '../../types/mcp';

const monospaceInputSx = { '& textarea': { fontFamily: 'monospace', fontSize: 13 } } as const;

interface DynamicJsonFormProps {
  schema: JsonSchemaType | undefined;
  value: Record<string, JsonValue>;
  onChange: (value: Record<string, JsonValue>) => void;
}

/** A multiline JSON editor for a nested object/array field; owns its raw text + parse error. */
function NestedJsonField({ label, required, value, onChange }: { label: string; required: boolean; value: JsonValue; onChange: (next: JsonValue) => void }): JSX.Element {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState(false);
  return (
    <TextField
      labelPlacement="top"
      label={label}
      required={required}
      optional={!required}
      fullWidth
      multiline
      minRows={3}
      size="small"
      value={raw}
      error={error}
      helperText={error ? 'Invalid JSON.' : ' '}
      sx={monospaceInputSx}
      onChange={(e) => {
        setRaw(e.target.value);
        try {
          onChange(JSON.parse(e.target.value) as JsonValue);
          setError(false);
        } catch {
          setError(true);
        }
      }}
    />
  );
}

/**
 * Renders a tool's input schema as a form (primitive fields inline, nested object/array
 * fields as JSON editors), with a Form ⇄ JSON toggle for editing the whole payload as raw JSON.
 */
export default function DynamicJsonForm({ schema, value, onChange }: DynamicJsonFormProps): JSX.Element {
  const properties = schema?.properties ?? {};
  const required = schema?.required ?? [];
  const canUseForm = !!schema && isSimpleObjectSchema(schema);
  const [mode, setMode] = useState<'form' | 'json'>(canUseForm ? 'form' : 'json');
  const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState(false);

  const setField = (key: string, next: JsonValue) => onChange({ ...value, [key]: next });

  const switchMode = (next: 'form' | 'json') => {
    if (next === 'json') {
      setRaw(JSON.stringify(value, null, 2));
      setJsonError(false);
    }
    setMode(next);
  };

  const propEntries = Object.entries(properties);

  return (
    <Stack gap={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Arguments
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, next) => next && switchMode(next as 'form' | 'json')}>
          <ToggleButton value="form" disabled={!canUseForm}>
            Form
          </ToggleButton>
          <ToggleButton value="json">JSON</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {mode === 'form' ? (
        propEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            This tool takes no arguments.
          </Typography>
        ) : (
          <Stack gap={2}>
            {propEntries.map(([key, prop]) => {
              const label = formatFieldLabel(key);
              const isRequired = required.includes(key);
              const enumOptions = Array.isArray(prop.enum) ? prop.enum : null;

              if (prop.type === 'boolean') {
                return <FormControlLabel key={key} control={<Switch size="small" checked={value[key] === true} onChange={(e) => setField(key, e.target.checked)} />} label={label} />;
              }
              if (enumOptions) {
                return (
                  <TextField labelPlacement="top" key={key} select label={label} required={isRequired} optional={!isRequired} fullWidth size="small" value={value[key] ?? ''} onChange={(e) => setField(key, e.target.value)} helperText={prop.description || ' '}>
                    {enumOptions.map((opt) => (
                      <MenuItem key={String(opt)} value={String(opt)}>
                        {String(opt)}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              }
              if (prop.type === 'object' || prop.type === 'array') {
                return <NestedJsonField key={key} label={label} required={isRequired} value={value[key] ?? null} onChange={(next) => setField(key, next)} />;
              }
              const isNumeric = prop.type === 'number' || prop.type === 'integer';
              return (
                <TextField
                  labelPlacement="top"
                  key={key}
                  label={label}
                  required={isRequired}
                  optional={!isRequired}
                  fullWidth
                  size="small"
                  type={isNumeric ? 'number' : 'text'}
                  value={value[key] ?? ''}
                  onChange={(e) => setField(key, e.target.value === '' && isNumeric ? '' : coerceFieldValue(prop.type, e.target.value))}
                  placeholder={prop.description}
                  helperText={prop.description || ' '}
                />
              );
            })}
          </Stack>
        )
      ) : (
        <Box>
          <TextField
            fullWidth
            multiline
            minRows={6}
            size="small"
            value={raw}
            error={jsonError}
            sx={monospaceInputSx}
            onChange={(e) => {
              setRaw(e.target.value);
              try {
                const parsed = JSON.parse(e.target.value) as JsonValue;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  onChange(parsed as Record<string, JsonValue>);
                  setJsonError(false);
                } else {
                  setJsonError(true);
                }
              } catch {
                setJsonError(true);
              }
            }}
          />
          {jsonError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              Arguments must be a valid JSON object.
            </Alert>
          )}
        </Box>
      )}
    </Stack>
  );
}
