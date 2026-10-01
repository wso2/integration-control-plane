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

import { Box, MenuItem, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { formatBytes, labelsFromRules, stagedSummary } from '../../../utils/contextEngine';
import { dropStagedFile, hasStagedFile, stageFiles } from '../../../utils/stagedFiles';
import FileDropzone from './FileDropzone';
import StagedFileList from './StagedFileList';
import { sectionLabelSx } from '../styles';
import type { ContextSourceConfig } from '../../../types/contextEngine';

interface StagedProps {
  draft: ContextSourceConfig;
  onChange: (draft: ContextSourceConfig) => void;
}

/** The wizard's Files section for a File Upload source: chosen now, uploaded the moment the engine exists. */
export function StagedFilesSection({ draft, onChange }: StagedProps): JSX.Element {
  const staged = draft.staged ?? [];
  const missing = new Set(staged.filter((f) => !hasStagedFile(f.id)).map((f) => f.id));
  const sum = stagedSummary(staged, []);

  return (
    <Box>
      <Typography variant="subtitle2" sx={sectionLabelSx}>
        Files
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
        Chosen now, uploaded the moment the engine is created. Text, Markdown, HTML or JSON up to 25 MB each; PDFs are stored until the engine can read them.
      </Typography>
      <FileDropzone compact={staged.length > 0} hint="Text, Markdown, HTML or JSON, up to 25 MB each." onFiles={(files) => onChange({ ...draft, staged: stageFiles(staged, files) })} />
      {staged.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <StagedFileList
            files={staged}
            existingNames={[]}
            missingIds={missing}
            onRemove={(id) => {
              dropStagedFile(id);
              onChange({ ...draft, staged: staged.filter((f) => f.id !== id) });
            }}
          />
          <Typography variant="caption" color={missing.size ? 'warning.dark' : 'text.secondary'} sx={{ display: 'block', mt: 0.75 }}>
            {missing.size > 0
              ? `${missing.size} of ${staged.length} file${staged.length === 1 ? '' : 's'} need adding again; the rest are staged in this browser.`
              : `${sum.ready} file${sum.ready === 1 ? '' : 's'} · ${formatBytes(sum.bytes)} staged in this browser${sum.skipped ? ` · ${sum.skipped} skipped` : ''}. Nothing is sent until you create the engine.`}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/** Which label the staged files are uploaded under; the options are the labels the rules above define. */
export function StagedLabelField({ draft, onChange }: StagedProps): JSX.Element | null {
  const staged = draft.staged ?? [];
  const labels = labelsFromRules(draft.audience);
  if (staged.length === 0) return null;
  const value = draft.stagedLabel && labels.includes(draft.stagedLabel) ? draft.stagedLabel : '';
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={`Who can see these ${staged.length} file${staged.length === 1 ? '' : 's'}`}
      value={value}
      disabled={labels.length === 0}
      helperText={labels.length === 0 ? 'Add a label above first.' : 'Members of the label’s role, with query access, can find these files.'}
      onChange={(e) => onChange({ ...draft, stagedLabel: e.target.value })}>
      {labels.map((label) => (
        <MenuItem key={label} value={label}>
          {label}
        </MenuItem>
      ))}
    </TextField>
  );
}
