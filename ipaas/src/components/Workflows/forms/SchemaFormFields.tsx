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
import type { ReactElement } from 'react';
import { fieldPath, type FormField, type FormValues } from './schemaForm';

/**
 * Renders the fields `parseFormSchema` produced, with labels on top
 * as the MCP playground's form has them.
 *
 * Values are held flat by dotted path so the caller keeps one state object regardless of nesting;
 * `buildFormResult` rebuilds the nesting when the form is submitted.
 */

const groupSx = { pl: 2, mt: 1, borderLeft: '1px solid', borderColor: 'divider' } as const;
const monospaceInputSx = { '& textarea': { fontFamily: 'monospace', fontSize: 13 } } as const;
const answerSx = { mt: 0.5 } as const;

// A required field that may be null is not marked: left blank, it is submitted as null.
const isMarkedRequired = (field: FormField): boolean => field.required && !field.nullable;

interface SchemaFormFieldsProps {
  fields: FormField[];
  values: FormValues;
  errors: Record<string, string>;
  onChange: (path: string, value: string | boolean) => void;
  disabled?: boolean;
  /** Dotted path of the enclosing group, empty at the top level. */
  prefix?: string;
}

export default function SchemaFormFields({ fields, values, errors, onChange, disabled = false, prefix = '' }: SchemaFormFieldsProps): ReactElement {
  return (
    <Stack gap={2}>
      {fields.map((field) => {
        const path = fieldPath(prefix, field.name);
        const error = errors[path];
        const required = isMarkedRequired(field);

        // A group: render its own fields indented under a heading, rather than as raw JSON.
        if (field.fields) {
          return (
            <Box key={path}>
              <Typography variant="subtitle2">
                {field.label}
                {required ? ' *' : ''}
              </Typography>
              {field.description && (
                <Typography variant="caption" color="text.secondary">
                  {field.description}
                </Typography>
              )}
              <Box sx={groupSx}>
                <SchemaFormFields fields={field.fields} values={values} errors={errors} onChange={onChange} disabled={disabled} prefix={path} />
              </Box>
            </Box>
          );
        }

        // Yes / No rather than an on/off switch: a switch shows "off" for a
        // value nobody has given yet, so "No" could only be entered by switching on and off again.
        if (field.type === 'boolean') {
          let answer: 'yes' | 'no' | null = null;
          if (typeof values[path] === 'boolean') {
            answer = values[path] ? 'yes' : 'no';
          }
          return (
            <Box key={path}>
              <Typography variant="body2" id={`${path}-label`}>
                {field.label}
                {required ? ' *' : ''}
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={answer}
                disabled={disabled}
                aria-labelledby={`${path}-label`}
                sx={answerSx}
                onChange={(_, next) => {
                  if (next !== null) onChange(path, next === 'yes');
                }}>
                <ToggleButton value="yes">Yes</ToggleButton>
                <ToggleButton value="no">No</ToggleButton>
              </ToggleButtonGroup>
              {(error || field.description) && (
                <Typography variant="caption" component="div" color={error ? 'error' : 'text.secondary'}>
                  {error ?? field.description}
                </Typography>
              )}
            </Box>
          );
        }

        if (field.enumValues && field.enumValues.length > 0) {
          return (
            <TextField
              key={path}
              select
              labelPlacement="top"
              label={field.label}
              required={required}
              optional={!required}
              fullWidth
              size="small"
              disabled={disabled}
              value={typeof values[path] === 'string' ? values[path] : ''}
              onChange={(event) => onChange(path, event.target.value)}
              error={!!error}
              helperText={error ?? field.description}
              slotProps={{ select: { displayEmpty: true } }}>
              <MenuItem value="">
                <Typography component="span" variant="body2" color="text.secondary">
                  Select…
                </Typography>
              </MenuItem>
              {field.enumValues.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          );
        }

        // Objects, arrays and any-JSON values have no field metadata beyond their type, so they are
        // edited as JSON.
        const isJson = field.type === 'object' || field.type === 'array' || field.type === 'json';
        // Free text grows into a textarea. A single-line <input> silently strips CR/LF from its
        // value, so a multiline argument would render flattened and be submitted that way untouched.
        const isText = !isJson && field.type !== 'number' && field.type !== 'integer';
        return (
          <TextField
            key={path}
            labelPlacement="top"
            label={field.label}
            required={required}
            optional={!required}
            fullWidth
            size="small"
            disabled={disabled}
            value={typeof values[path] === 'string' ? values[path] : ''}
            onChange={(event) => onChange(path, event.target.value)}
            error={!!error}
            helperText={error ?? field.description}
            multiline={isJson || isText}
            minRows={isJson ? 4 : undefined}
            maxRows={isText ? 10 : undefined}
            sx={isJson ? monospaceInputSx : undefined}
            // Numeric fields are deliberately text inputs: <input type="number">
            // replaces content it cannot parse with '', which reaches validation looking untouched
            // and reports "is required" instead of "must be a number".
            type="text"
          />
        );
      })}
    </Stack>
  );
}
