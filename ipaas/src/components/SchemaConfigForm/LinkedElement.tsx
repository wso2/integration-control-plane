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

import { Box, Chip, InputAdornment, TextField, Typography } from '@wso2/oxygen-ui';
import { FieldLinkPicker } from './FieldLinkPicker';
import { fromText, type FieldLinkPicker as Picker, type LinkedSource } from './linkedFrom';

const chipSx = { height: 18, fontSize: '0.65rem', borderRadius: 0.75 } as const;

/** A field a link fills: read-only, saying where from, with the link icon to change it. */
export function LinkedElement({ title, source, picker }: { title: string; source: LinkedSource; picker?: Picker }) {
  const from = fromText(source);
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
        {title}
      </Typography>
      <TextField
        fullWidth
        size="small"
        disabled
        value={from}
        inputProps={{ 'aria-label': `${title} is supplied by ${source.resource}` }}
        InputProps={{
          endAdornment: (source.overrides || picker) && (
            <InputAdornment position="end">
              {source.overrides && <Chip label="Overrides selected Link" size="small" color="info" variant="outlined" sx={chipSx} />}
              {picker && <FieldLinkPicker field={title} picker={picker} />}
            </InputAdornment>
          ),
        }}
      />
      {source.noValuesIn && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
          No {source.noValuesIn} values. Add them in WSO2 Cloud.
        </Typography>
      )}
    </Box>
  );
}
