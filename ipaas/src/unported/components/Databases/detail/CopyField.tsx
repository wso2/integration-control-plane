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

import { IconButton, InputAdornment, Tooltip } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { Copy } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';

interface CopyFieldProps {
  value: string;
  'aria-label': string;
  /** Mask the value (for secrets). */
  password?: boolean;
  /** Extra adornment rendered before the copy button (e.g. a show/hide toggle). */
  endAction?: ReactNode;
}

const inputSx = { bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 13 } as const;

/** A read-only field with a copy-to-clipboard button. */
export default function CopyField({ value, 'aria-label': ariaLabel, password, endAction }: CopyFieldProps): JSX.Element {
  return (
    <TextField
      size="small"
      fullWidth
      value={value}
      type={password ? 'password' : 'text'}
      InputProps={{
        readOnly: true,
        sx: inputSx,
        endAdornment: (
          <InputAdornment position="end">
            {endAction}
            <Tooltip title="Copy">
              <IconButton size="small" aria-label={`Copy ${ariaLabel}`} onClick={() => void navigator.clipboard?.writeText(value).catch(() => undefined)} edge="end">
                <Copy size={15} />
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}
