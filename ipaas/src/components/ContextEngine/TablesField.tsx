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

import { Box, Button, IconButton, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { REQUIRED_FIELD_SX } from '../../constants/styles';
import { BLANK_TABLE, parseTables, serializeTables, tableErrors } from '../../utils/contextEngine';
import { tableCardHeaderSx, tableCardSx } from './styles';
import type { SourceTable } from '../../types/contextEngine';

interface TablesFieldProps {
  /** The field's value: a JSON array of tables; blank is one empty table. */
  value: string;
  onChange: (value: string) => void;
}

/** The tables a database source syncs, one card each. Each input shows its error only once something is typed in it. */
export default function TablesField({ value, onChange }: TablesFieldProps): JSX.Element {
  const tables = parseTables(value);
  const errors = tableErrors(tables);
  const set = (next: SourceTable[]) => onChange(serializeTables(next));
  const edit = (index: number, key: keyof SourceTable, v: string) => set(tables.map((t, i) => (i === index ? { ...t, [key]: v } : t)));

  const input = (index: number, key: keyof SourceTable, label: string, extra: { required?: boolean; placeholder: string; helper?: string }) => {
    const v = tables[index][key];
    const error = v.trim() ? errors[index][key] : '';
    return (
      <TextField
        labelPlacement="top"
        label={label}
        required={extra.required}
        optional={!extra.required}
        fullWidth
        size="small"
        value={v}
        placeholder={extra.placeholder}
        error={!!error}
        helperText={error || extra.helper}
        onChange={(e) => edit(index, key, e.target.value)}
        sx={extra.required ? REQUIRED_FIELD_SX : undefined}
      />
    );
  };

  return (
    <Stack sx={{ gap: 2 }}>
      {tables.map((t, i) => {
        const title = t.tableName.trim() || `Table ${i + 1}`;
        return (
          <Box key={i} sx={tableCardSx}>
            <Box sx={tableCardHeaderSx}>
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                {title}
              </Typography>
              {tables.length > 1 && (
                <IconButton size="small" aria-label={`Remove ${t.tableName.trim() || `table ${i + 1}`}`} onClick={() => set(tables.filter((_, j) => j !== i))}>
                  <Trash2 size={16} />
                </IconButton>
              )}
            </Box>
            {input(i, 'tableName', 'Table', { required: true, placeholder: 'employees' })}
            {input(i, 'primaryKey', 'Primary Key', { required: true, placeholder: 'id' })}
            {input(i, 'columns', 'Columns', { placeholder: 'id, name, dept_id', helper: 'Comma-separated. Leave empty for all columns.' })}
            {input(i, 'updatedAtColumn', 'Updated-at Column', { placeholder: 'updated_at', helper: 'Last-updated time. Recommended.' })}
          </Box>
        );
      })}
      <Button variant="outlined" color="primary" fullWidth startIcon={<Plus size={16} />} onClick={() => set([...tables, { ...BLANK_TABLE }])}>
        Add table
      </Button>
    </Stack>
  );
}
