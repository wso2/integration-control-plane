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

import { Button, IconButton, InputAdornment, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Check, Eye, EyeOff, Paperclip } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX } from 'react';
import { CONFIG_FILE_MAX_KB } from '../../constants/configGroups';
import type { ConfigValueType } from '../../../types/configGroups';

interface ConfigValueCellProps {
  type: ConfigValueType;
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
  ariaLabel: string;
}

/** A single (key × environment) value input — plain text, masked secret, or base64 file upload. */
export default function ConfigValueCell({ type, value, onChange, onError, ariaLabel }: ConfigValueCellProps): JSX.Element {
  const [reveal, setReveal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (type === 'file') {
    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-selecting the same file
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // The stored value is the base64 payload (~33% larger than the raw file),
        // so enforce the limit against the encoded string that actually gets sent.
        const encoded = (String(reader.result).split(',')[1] ?? '').trim();
        if (encoded.length > CONFIG_FILE_MAX_KB * 1024) {
          onError(`File exceeds the ${CONFIG_FILE_MAX_KB} KB limit.`);
          return;
        }
        onChange(encoded);
      };
      reader.onerror = () => onError('Could not read the selected file.');
      reader.readAsDataURL(file);
    };
    return (
      <Stack direction="row" alignItems="center" gap={1}>
        <input ref={fileRef} type="file" hidden onChange={onPick} aria-label={ariaLabel} />
        <Button size="small" variant="outlined" startIcon={<Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Tooltip title="File attached">
            <Check size={16} color="var(--mui-palette-success-main, #2e7d32)" />
          </Tooltip>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          max {CONFIG_FILE_MAX_KB} KB
        </Typography>
      </Stack>
    );
  }

  return (
    <TextField
      size="small"
      fullWidth
      type={type === 'secret' && !reveal ? 'password' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      inputProps={{ 'aria-label': ariaLabel }}
      InputProps={
        type === 'secret'
          ? {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label={reveal ? 'Hide value' : 'Show value'} onClick={() => setReveal((r) => !r)} edge="end">
                    {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                </InputAdornment>
              ),
            }
          : undefined
      }
      sx={{ minWidth: 160 }}
    />
  );
}
