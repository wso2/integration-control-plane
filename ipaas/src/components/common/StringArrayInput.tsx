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

import { Box, Button, IconButton, InputAdornment, Stack, Typography } from '@wso2/oxygen-ui';
import { TextField } from '@wso2/oxygen-ui';
import { Plus, X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface StringArrayInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  /** Label for the empty-state add button (e.g. "Add command"). */
  addLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * An editable list of free-text values (Devant's TextInputListArray) — used for a
 * container's Command and Arguments. Shows a JSON preview of the current values,
 * then one text field per item with a remove button, and a control to append.
 */
export default function StringArrayInput({ label, value, onChange, addLabel = 'Add', placeholder, disabled }: StringArrayInputProps): JSX.Element {
  const setAt = (index: number, next: string): void => {
    const copy = [...value];
    copy[index] = next;
    onChange(copy);
  };
  const removeAt = (index: number): void => onChange(value.filter((_, i) => i !== index));
  const append = (): void => onChange([...value, '']);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box component="pre" sx={{ m: 0, mb: 1.5, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'text.secondary', overflowX: 'auto' }}>
        {JSON.stringify(value)}
      </Box>
      <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5}>
        {value.map((item, index) => (
          <TextField
            key={index}
            size="small"
            value={item}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => setAt(index, e.target.value)}
            sx={{ width: 200 }}
            inputProps={{ 'aria-label': `${label} ${index + 1}` }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" edge="end" aria-label={`Remove ${label} ${index + 1}`} disabled={disabled} onClick={() => removeAt(index)}>
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        ))}
        {value.length > 0 ? (
          <IconButton aria-label={addLabel} disabled={disabled} onClick={append} sx={{ border: '1px solid', borderColor: 'primary.main', color: 'primary.main' }}>
            <Plus size={18} />
          </IconButton>
        ) : (
          <Button variant="outlined" size="small" startIcon={<Plus size={16} />} disabled={disabled} onClick={append}>
            {addLabel}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
