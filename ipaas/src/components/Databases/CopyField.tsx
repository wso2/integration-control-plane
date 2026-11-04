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

import { Box, IconButton, InputAdornment, Tooltip } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { Copy } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';

interface CopyFieldProps {
  value: string;
  'aria-label': string;
  /** Mask the value (for secrets). */
  password?: boolean;
  /** Extra adornment rendered before the copy button (e.g. a show/hide toggle). */
  endAction?: ReactNode;
}

const inputSx = { bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 13 } as const;
const visuallyHiddenSx = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

type CopyStatus = 'idle' | 'copied' | 'failed';
const COPY_TOOLTIPS: Record<CopyStatus, string> = { idle: 'Copy', copied: 'Copied', failed: "Couldn't copy to the clipboard." };

/** A read-only field with a copy-to-clipboard button. */
export default function CopyField({ value, 'aria-label': ariaLabel, password, endAction }: CopyFieldProps): JSX.Element {
  const [status, setStatus] = useState<CopyStatus>('idle');
  // The clipboard API is missing outside secure contexts and can reject when permission is denied.
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <TextField
      size="small"
      fullWidth
      value={value}
      type={password ? 'password' : 'text'}
      slotProps={{
        htmlInput: { 'aria-label': ariaLabel },
        input: {
          readOnly: true,
          sx: inputSx,
          endAdornment: (
            <InputAdornment position="end">
              {endAction}
              <Tooltip title={COPY_TOOLTIPS[status]} onClose={() => setStatus('idle')}>
                <IconButton size="small" aria-label={`Copy ${ariaLabel}`} onClick={() => void copy()} edge="end">
                  <Copy size={15} />
                </IconButton>
              </Tooltip>
              {/* The button's own label hides the tooltip text from screen readers, so the result is announced here. */}
              <Box component="span" role="status" sx={visuallyHiddenSx}>
                {status === 'idle' ? '' : COPY_TOOLTIPS[status]}
              </Box>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
