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

import { Box, Chip, FormControlLabel, MenuItem, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import { Braces, ListTree } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from '../i18n';
import { fieldsOf, initialValues, parseJson, toObject, type Field, type FormValues } from '../utils/schema';
import TextField from './common/TextField';

type Mode = 'form' | 'json';

/** The state of a schema-driven form, with the raw-JSON escape hatch ICP offers. */
export function useSchemaEditor(schemaText: string | null | undefined, prefill?: Record<string, unknown> | null) {
  const { t } = useTranslation();
  const fields = useMemo(() => fieldsOf(schemaText), [schemaText]);
  const [mode, setMode] = useState<Mode>(fields && fields.every((f) => f.kind !== 'json') ? 'form' : 'json');
  const [values, setValues] = useState<FormValues>(() => (fields ? initialValues(fields, prefill) : {}));
  const [raw, setRaw] = useState(() => JSON.stringify(prefill ?? {}, null, 2));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rawError, setRawError] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'json' && fields) {
      setRaw(JSON.stringify(toObject(fields, values).value, null, 2));
    } else if (next === 'form' && fields) {
      const parsed = parseJson(raw);
      if (parsed.error || typeof parsed.value !== 'object' || parsed.value === null) {
        setRawError(t('integrations.schemaEditor.fixJson'));
        return;
      }
      setValues(initialValues(fields, parsed.value as Record<string, unknown>));
    }
    setRawError(null);
    setMode(next);
  };

  /** The value to submit, or undefined with the errors shown. */
  const read = (): { ok: true; value: unknown } | { ok: false } => {
    if (mode === 'form' && fields) {
      const result = toObject(fields, values);
      setErrors(result.errors);
      return Object.keys(result.errors).length ? { ok: false } : { ok: true, value: result.value };
    }
    const parsed = parseJson(raw);
    setRawError(parsed.error ?? null);
    return parsed.error ? { ok: false } : { ok: true, value: parsed.value };
  };

  const setValue = (name: string, v: unknown) => {
    setValues((all) => ({ ...all, [name]: v }));
    setErrors(({ [name]: _cleared, ...rest }) => rest);
  };

  return { fields, mode, switchMode, values, setValue, raw, setRaw: (text: string) => (setRaw(text), setRawError(null)), errors, rawError, read };
}

export type SchemaEditorState = ReturnType<typeof useSchemaEditor>;

function FieldInput({ field, value, error, onChange: change, disabled, readOnly }: { field: Field; value: unknown; error?: string; onChange: (v: unknown) => void; disabled?: boolean; readOnly?: boolean }) {
  const { t } = useTranslation();
  const onChange = readOnly ? () => undefined : change;
  const common = { label: field.label, required: field.required && !readOnly, error: !!error, helperText: error ?? field.description, disabled, fullWidth: true };
  switch (field.kind) {
    case 'boolean':
      return (
        <Box>
          <FormControlLabel control={<Switch checked={value === true} onChange={(e) => onChange(e.target.checked)} disabled={disabled} readOnly={readOnly} />} label={field.label} />
          {field.description && (
            <Typography variant="caption" color="text.secondary" component="div">
              {field.description}
            </Typography>
          )}
        </Box>
      );
    case 'choice':
      return (
        <TextField {...common} select size="small" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} slotProps={{ select: { readOnly } }}>
          {!field.required && (
            <MenuItem value="">
              <em>{t('integrations.schemaEditor.none')}</em>
            </MenuItem>
          )}
          {field.options.map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextField>
      );
    case 'choices':
      return (
        <TextField
          {...common}
          select
          size="small"
          value={Array.isArray(value) ? value : []}
          onChange={(e) => onChange(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
          slotProps={{
            select: {
              multiple: true,
              readOnly,
              renderValue: (selected) => (
                <Stack direction="row" gap={0.5} flexWrap="wrap">
                  {(selected as string[]).map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      size="small"
                      onDelete={readOnly ? undefined : () => onChange((selected as string[]).filter((other) => other !== s))}
                      // The select opens on mouse down; a press on the cross only removes the choice.
                      onMouseDown={(e) => {
                        if ((e.target as Element).closest('.MuiChip-deleteIcon')) e.stopPropagation();
                      }}
                    />
                  ))}
                </Stack>
              ),
            },
          }}>
          {field.options.map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextField>
      );
    default: {
      const multiline = field.kind === 'textarea' || field.kind === 'json';
      const type = { email: 'email', date: 'date', number: 'number', integer: 'number' }[field.kind as string] ?? 'text';
      return (
        <TextField
          {...common}
          size="small"
          type={type}
          multiline={multiline}
          minRows={multiline ? 3 : undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          slotProps={{ htmlInput: { readOnly, ...(field.kind === 'json' ? { style: { fontFamily: 'monospace', fontSize: 12 } } : {}) }, inputLabel: { shrink: true } }}
        />
      );
    }
  }
}

/** The form a schema describes, or raw JSON when the user asks for it or the schema can't be drawn. Read only shows a value in the same form. */
export default function SchemaEditor({ editor, disabled, readOnly }: { editor: SchemaEditorState; disabled?: boolean; readOnly?: boolean }) {
  const { t } = useTranslation();
  const { fields, mode } = editor;
  return (
    <Stack gap={2}>
      {fields && (
        <Stack direction="row" justifyContent="flex-end">
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m: Mode | null) => m && editor.switchMode(m)}>
            <ToggleButton value="form" aria-label={t('integrations.schemaEditor.form')}>
              <ListTree size={16} />
              <Typography variant="caption" sx={{ ml: 0.75 }}>
                {t('integrations.schemaEditor.form')}
              </Typography>
            </ToggleButton>
            <ToggleButton value="json" aria-label={t('integrations.schemaEditor.json')}>
              <Braces size={16} />
              <Typography variant="caption" sx={{ ml: 0.75 }}>
                {t('integrations.schemaEditor.json')}
              </Typography>
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}
      {mode === 'form' && fields ? (
        fields.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('integrations.schemaEditor.noInput')}
          </Typography>
        ) : (
          fields.map((field) => <FieldInput key={field.name} field={field} value={editor.values[field.name]} error={editor.errors[field.name]} disabled={disabled} readOnly={readOnly} onChange={(v) => editor.setValue(field.name, v)} />)
        )
      ) : (
        <TextField
          label={t('integrations.schemaEditor.rawLabel')}
          multiline
          minRows={8}
          fullWidth
          value={editor.raw}
          disabled={disabled}
          onChange={(e) => editor.setRaw(e.target.value)}
          error={!!editor.rawError}
          helperText={editor.rawError ?? ' '}
          slotProps={{ htmlInput: { readOnly, style: { fontFamily: 'monospace', fontSize: 12 }, spellCheck: false } }}
        />
      )}
    </Stack>
  );
}
