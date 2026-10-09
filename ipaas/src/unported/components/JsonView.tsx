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

import { Box, IconButton, Tooltip } from '@wso2/oxygen-ui';
import { Check, Copy } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { highlightJson } from '../utils/json';

interface JsonViewProps {
  value: unknown;
  /** Max height before the block scrolls (e.g. `'60vh'`, `400`). */
  maxHeight?: number | string;
}

/** Read-only, dependency-free JSON viewer: pretty-prints `value` with syntax highlighting and a copy button. */
export default function JsonView({ value, maxHeight }: JsonViewProps): ReactNode {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  const html = useMemo(() => highlightJson(text), [text]);

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard unavailable / denied — leave UI state untouched */
      });
  }, [text]);

  return (
    <Box sx={{ position: 'relative' }}>
      <Tooltip title={copied ? 'Copied!' : 'Copy'}>
        <IconButton size="small" onClick={onCopy} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        dangerouslySetInnerHTML={{ __html: html }}
        sx={(theme) => ({
          m: 0,
          p: 2,
          borderRadius: 1,
          bgcolor: 'action.hover',
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'auto',
          maxHeight: maxHeight ?? 'unset',
          fontFamily: 'monospace',
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          whiteSpace: 'pre',
          color: theme.palette.text.primary,
          '& .tok-key': { color: theme.palette.info.main, fontWeight: 600 },
          '& .tok-str': { color: theme.palette.success.main },
          '& .tok-num': { color: theme.palette.warning.main },
          '& .tok-bool': { color: theme.palette.secondary.main },
          '& .tok-null': { color: theme.palette.text.disabled },
        })}
      />
    </Box>
  );
}
