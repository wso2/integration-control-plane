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

import { Box, Checkbox, FormControlLabel, FormHelperText, IconButton, MenuItem, Select, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX, KeyboardEvent } from 'react';
import type { DynamicFormFieldValue, FormField } from '../../types/executions';
import { blockNonNumericKeys, isNumericType } from '../../utils/runtimeArguments';

interface FormFieldTileProps {
  field: FormField;
  value: DynamicFormFieldValue | undefined;
  onChange: (value: DynamicFormFieldValue) => void;
  error?: boolean;
  helperText?: string;
}

/** Renders one runtime-argument field; the widget is chosen by `field.inputType`. */
export default function FormFieldTile({ field, value, onChange, error, helperText }: FormFieldTileProps): JSX.Element {
  const asString = typeof value === 'string' ? value : '';
  const asArray = Array.isArray(value) ? value : [];
  const runtimeType = field.runtimeType ?? '';

  const label = <Typography sx={{ fontWeight: 600 }}>{field.required ? field.label : `${field.label} (Optional)`}</Typography>;

  const renderInput = (): JSX.Element => {
    switch (field.inputType) {
      case 'number':
        return (
          <TextField
            size="small"
            fullWidth
            value={asString}
            placeholder={field.placeholder}
            error={error}
            inputProps={{ inputMode: 'decimal' }}
            onKeyDown={(e) => blockNonNumericKeys(e as KeyboardEvent<HTMLInputElement>, runtimeType, asString)}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'dropdown':
        return (
          <Select size="small" fullWidth displayEmpty value={asString} error={error} onChange={(e) => onChange(e.target.value as string)} renderValue={(v) => (v ? String(v) : <Typography color="text.secondary">{field.placeholder}</Typography>)}>
            {field.options.map((opt) => (
              <MenuItem key={opt.id} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        );

      case 'checkbox':
        // Single boolean toggle vs. a multi-select group of enum values.
        if (runtimeType === 'boolean') {
          return <FormControlLabel control={<Checkbox size="small" checked={value === true} onChange={(e) => onChange(e.target.checked)} />} label={field.placeholder} />;
        }
        return (
          <Stack>
            {field.options.map((opt) => {
              const checked = asArray.includes(opt.value);
              return <FormControlLabel key={opt.id} control={<Checkbox size="small" checked={checked} onChange={(e) => onChange(e.target.checked ? [...asArray, opt.value] : asArray.filter((v) => v !== opt.value))} />} label={opt.label} />;
            })}
          </Stack>
        );

      case 'multi-text': {
        const rows = asArray.length > 0 ? asArray : [''];
        const setRow = (i: number, v: string) => onChange(rows.map((row, idx) => (idx === i ? v : row)));
        return (
          <Stack gap={1}>
            {rows.map((row, i) => (
              <Stack key={i} direction="row" gap={1} alignItems="center">
                <TextField
                  size="small"
                  fullWidth
                  value={row}
                  placeholder={field.placeholder}
                  onKeyDown={(e) => (isNumericType(runtimeType) ? blockNonNumericKeys(e as KeyboardEvent<HTMLInputElement>, runtimeType, row) : undefined)}
                  onChange={(e) => setRow(i, e.target.value)}
                />
                <IconButton size="small" aria-label={`Remove value ${i + 1}`} disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
                  <Trash2 size={14} />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <IconButton size="small" aria-label="Add value" onClick={() => onChange([...rows, ''])}>
                <Plus size={14} />
              </IconButton>
            </Box>
          </Stack>
        );
      }

      case 'text':
      default:
        return <TextField size="small" fullWidth value={asString} placeholder={field.placeholder} error={error} onChange={(e) => onChange(e.target.value)} />;
    }
  };

  return (
    <Box>
      {label}
      {field.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {field.description}
        </Typography>
      )}
      <Box sx={{ mt: field.description ? 0 : 1 }}>{renderInput()}</Box>
      {error && helperText && <FormHelperText error>{helperText}</FormHelperText>}
    </Box>
  );
}
