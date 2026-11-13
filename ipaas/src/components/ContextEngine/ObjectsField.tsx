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
import { BLANK_OBJECT, objectErrors, parseObjects, serializeObjects } from '../../utils/contextEngine';
import { tableCardHeaderSx, tableCardSx } from './styles';
import type { SourceObject } from '../../types/contextEngine';

interface ObjectsFieldProps {
  /** The field's value: a JSON array of objects; blank is one empty object. */
  value: string;
  onChange: (value: string) => void;
}

/** The Salesforce objects a source syncs, one card each. Each input shows its error only once something is typed in it. */
export default function ObjectsField({ value, onChange }: ObjectsFieldProps): JSX.Element {
  const objects = parseObjects(value);
  const errors = objectErrors(objects);
  const set = (next: SourceObject[]) => onChange(serializeObjects(next));
  const edit = (index: number, key: keyof SourceObject, v: string) => set(objects.map((o, i) => (i === index ? { ...o, [key]: v } : o)));

  const input = (index: number, key: keyof SourceObject, label: string, extra: { placeholder: string; helper?: string }) => {
    const v = objects[index][key];
    const error = v.trim() ? errors[index][key] : '';
    return <TextField labelPlacement="top" label={label} required fullWidth size="small" value={v} placeholder={extra.placeholder} error={!!error} helperText={error || extra.helper} onChange={(e) => edit(index, key, e.target.value)} sx={REQUIRED_FIELD_SX} />;
  };

  return (
    <Stack sx={{ gap: 2 }}>
      {objects.map((o, i) => {
        const title = o.name.trim() || `Object ${i + 1}`;
        return (
          <Box key={i} sx={tableCardSx}>
            <Box sx={tableCardHeaderSx}>
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                {title}
              </Typography>
              {objects.length > 1 && (
                <IconButton size="small" aria-label={`Remove ${o.name.trim() || `object ${i + 1}`}`} onClick={() => set(objects.filter((_, j) => j !== i))}>
                  <Trash2 size={16} />
                </IconButton>
              )}
            </Box>
            {input(i, 'name', 'Object', { placeholder: 'Account', helper: 'Must have Change Data Capture enabled.' })}
            {input(i, 'fields', 'Fields', { placeholder: 'Name, Industry, Description', helper: 'Comma-separated, in the order they are published.' })}
          </Box>
        );
      })}
      <Button variant="outlined" color="primary" fullWidth startIcon={<Plus size={16} />} onClick={() => set([...objects, { ...BLANK_OBJECT }])}>
        Add object
      </Button>
    </Stack>
  );
}
