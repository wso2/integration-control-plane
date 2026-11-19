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

import { IconButton, Tooltip } from '@wso2/oxygen-ui';
import { Check, Copy } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import * as styles from './apiConsumption.styles';
import { copyToClipboard } from '../../../utils/clipboard';

interface CopyButtonProps {
  /** Value written to the clipboard. */
  value: string;
  /** Tooltip text; also the accessible name. */
  label?: string;
}

/** Icon-only copy-to-clipboard button that flips to a tick for ~1.4s. */
export default function CopyButton({ value, label = 'Copy' }: CopyButtonProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  // Confirm only after the write resolves — a blocked clipboard must not read as a copy.
  const copy = async () => {
    if (!(await copyToClipboard(value))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Tooltip title={copied ? 'Copied' : label}>
      <IconButton size="small" onClick={() => void copy()} aria-label={label} sx={copied ? { ...styles.credIconButton, color: 'success.main' } : styles.credIconButton}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </IconButton>
    </Tooltip>
  );
}
