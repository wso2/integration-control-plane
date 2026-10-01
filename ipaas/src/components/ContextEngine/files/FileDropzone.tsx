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

import { Box, Link, Typography } from '@wso2/oxygen-ui';
import { Upload } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type DragEvent, type JSX } from 'react';
import { UPLOAD_ACCEPT } from '../../../constants/contextEngine';
import { dropzoneIconSx, dropzoneSx } from '../styles';

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  /** One line under the prompt; omitted in compact mode. */
  hint?: string;
  /** A single row, for a list that already has files. */
  compact?: boolean;
  disabled?: boolean;
  /** Replace one file: the picker takes a single file. */
  single?: boolean;
  /** Label for the picker button in the prompt; defaults to "browse". */
  browseLabel?: string;
}

/** Drop files, or open the picker. Accepts the engine's file types; anything else is still handed on so the list can explain why it is skipped. */
export default function FileDropzone({ onFiles, hint, compact = false, disabled = false, single = false, browseLabel = 'browse' }: FileDropzoneProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(single ? files.slice(0, 1) : files);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  return (
    <Box
      sx={dropzoneSx(over, compact, disabled)}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}>
      <Box sx={dropzoneIconSx(compact)}>
        <Upload size={compact ? 16 : 20} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          Drop files here, or{' '}
          <Link component="button" type="button" variant="body2" disabled={disabled} onClick={() => input.current?.click()} sx={{ fontWeight: 500, verticalAlign: 'baseline' }}>
            {browseLabel}
          </Link>
        </Typography>
        {hint && !compact && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
            {hint}
          </Typography>
        )}
      </Box>
      <input
        ref={input}
        type="file"
        hidden
        multiple={!single}
        accept={UPLOAD_ACCEPT}
        disabled={disabled}
        aria-label="Choose files"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </Box>
  );
}
