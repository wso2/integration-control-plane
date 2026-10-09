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

import { IconButton, InputAdornment } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Eye, EyeOff } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';

interface SecretFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string;
}

/** A masked text field with a show/hide toggle — the shared secret-input pattern. */
export default function SecretField({ label, value, onChange, required, placeholder, error }: SecretFieldProps): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label={label}
      required={required}
      fullWidth
      size="small"
      type={show ? 'text' : 'password'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      error={!!error}
      helperText={error || undefined}
      sx={required ? REQUIRED_FIELD_SX : undefined}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" aria-label={show ? `Hide ${label}` : `Show ${label}`} onClick={() => setShow((s) => !s)} edge="end">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}
