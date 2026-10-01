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

import { Box, Chip, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { FileText, X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { checkStagedFile, formatBytes, stagedFileNote } from '../../../utils/contextEngine';
import { fileListSx, fileRowSx } from '../styles';
import type { StagedFileMeta } from '../../../types/contextEngine';

interface StagedFileListProps {
  files: StagedFileMeta[];
  /** Names already in the source, so a re-upload is marked as a replacement. */
  existingNames: string[];
  /** Ids whose bytes are missing, e.g. after a restored draft. */
  missingIds?: Set<string>;
  onRemove: (id: string) => void;
}

const TYPE_NAME: Record<string, string> = { 'text/plain': 'Plain text', 'text/markdown': 'Markdown', 'text/html': 'HTML', 'application/json': 'JSON', 'application/pdf': 'PDF' };

/** Chosen files with what will happen to each: ready, replaces, stored only, or skipped. */
export default function StagedFileList({ files, existingNames, missingIds, onRemove }: StagedFileListProps): JSX.Element {
  return (
    <Box sx={fileListSx}>
      {files.map((f) => {
        const missing = missingIds?.has(f.id) ?? false;
        const check = checkStagedFile(f, existingNames);
        const note = missing ? 'Add this file again; browsers do not keep chosen files between visits.' : stagedFileNote(check, f.size);
        const tone = missing || check.problem ? (check.problem === 'too-large' || check.problem === 'unsupported' ? 'error' : 'warning') : check.warning ? 'warning' : check.replaces ? 'info' : 'success';
        const label = missing ? 'Missing' : check.problem ? 'Skipped' : check.warning === 'pdf' ? 'Stored only' : check.replaces ? 'Replace' : 'Ready';
        return (
          <Box key={f.id} sx={fileRowSx(!!check.problem)}>
            <FileText size={18} aria-hidden />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                {f.name}
              </Typography>
              <Typography variant="caption" color={note && tone !== 'success' && tone !== 'info' ? `${tone}.dark` : 'text.secondary'} sx={{ display: 'block' }}>
                {note || `${formatBytes(f.size)} · ${TYPE_NAME[f.contentType] ?? f.contentType}`}
              </Typography>
            </Box>
            <Chip size="small" variant="outlined" color={tone} label={label} />
            <Tooltip title="Remove">
              <IconButton size="small" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)}>
                <X size={16} />
              </IconButton>
            </Tooltip>
          </Box>
        );
      })}
    </Box>
  );
}
