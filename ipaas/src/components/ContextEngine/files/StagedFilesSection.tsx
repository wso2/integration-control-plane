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

import { Box, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { EVERYONE_VISIBILITY } from '../../../constants/contextEngine';
import { formatBytes, stagedSummary } from '../../../utils/contextEngine';
import { dropStagedFile, hasStagedFile, stageFiles } from '../../../utils/stagedFiles';
import FileDropzone from './FileDropzone';
import FileVisibilityField from './FileVisibilityField';
import StagedFileList from './StagedFileList';
import { sectionLabelSx } from '../styles';
import type { ContextSourceConfig } from '../../../types/contextEngine';

interface StagedProps {
  draft: ContextSourceConfig;
  onChange: (draft: ContextSourceConfig) => void;
}

/**
 * The Files section of a File Upload source's form: files chosen now and uploaded
 * the moment the engine exists, or, on a running engine, as soon as the source is added.
 */
export function StagedFilesSection({ draft, onChange, onRunningEngine = false }: StagedProps & { onRunningEngine?: boolean }): JSX.Element {
  const when = onRunningEngine ? 'as soon as you add the source' : 'the moment the engine is created';
  const staged = draft.staged ?? [];
  const missing = new Set(staged.filter((f) => !hasStagedFile(f.id)).map((f) => f.id));
  const sum = stagedSummary(staged, []);

  return (
    <Box>
      <Typography variant="subtitle2" sx={sectionLabelSx}>
        Files
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
        {`Chosen now, uploaded ${when}. Text, Markdown, HTML or JSON up to 25 MB each; PDFs are stored until the engine can read them.`}
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
              : `${sum.ready} file${sum.ready === 1 ? '' : 's'} · ${formatBytes(sum.bytes)} staged in this browser${sum.skipped ? ` · ${sum.skipped} skipped` : ''}. Nothing is sent until you ${onRunningEngine ? 'add the source' : 'create the engine'}.`}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * Who can see the staged files. Without files it only explains the choice each
 * upload makes; the source itself needs no rules typed in.
 */
export function StagedVisibilityField({ draft, onChange, orgHandle, queryRoles }: StagedProps & { orgHandle: string; queryRoles?: string[] }): JSX.Element {
  const staged = draft.staged ?? [];
  if (staged.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Who can see uploaded files
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
          Each upload chooses: everyone who can query this engine, or only some roles. There are no labels or rules to set up.
        </Typography>
      </Box>
    );
  }
  return (
    <FileVisibilityField
      id="staged-visibility"
      label={`Who can see ${staged.length === 1 ? 'this file' : `these ${staged.length} files`}`}
      orgHandle={orgHandle}
      queryRoles={queryRoles}
      value={draft.stagedVisibility ?? EVERYONE_VISIBILITY}
      onChange={(stagedVisibility) => onChange({ ...draft, stagedVisibility })}
    />
  );
}
