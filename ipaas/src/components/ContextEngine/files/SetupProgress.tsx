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

import { Box, Button, CircularProgress, LinearProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Check, CircleAlert, FileText } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { retryUpload, useSourceUploads } from '../../../hooks/contextUploads';
import { formatBytes, isUploadActive } from '../../../utils/contextEngine';
import UploadStatusChip from './UploadStatusChip';
import { fileListSx, mutedSx, progressBarSx, setupCardSx, setupDotSx, setupStepSx, uploadRowHeadSx, uploadRowSx } from '../styles';

export interface SetupUploadSource {
  sourceId: string;
  name: string;
}

interface SetupProgressProps {
  engineId: string;
  engineName: string;
  sourceCount: number;
  roleCount: number;
  /** Steps the engine skipped because it does not serve them yet. */
  warnings: string[];
  uploads: SetupUploadSource[];
  onOpen: () => void;
}

function Step({ tone, children, aside }: { tone: 'done' | 'running' | 'skipped' | 'failed'; children: string; aside?: string }): JSX.Element {
  return (
    <Box sx={setupStepSx}>
      <Box sx={setupDotSx(tone)} aria-hidden>
        {tone === 'done' ? <Check size={13} /> : tone === 'running' ? <CircularProgress size={12} color="inherit" /> : <CircleAlert size={13} />}
      </Box>
      <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: tone === 'running' ? 500 : 400 }}>
        {children}
      </Typography>
      {aside && (
        <Typography variant="caption" sx={mutedSx}>
          {aside}
        </Typography>
      )}
    </Box>
  );
}

function UploadSource({ engineId, source }: { engineId: string; source: SetupUploadSource }): JSX.Element {
  const entries = useSourceUploads(engineId, source.sourceId);
  const done = entries.filter((e) => !isUploadActive(e)).length;
  const failed = entries.filter((e) => e.status === 'failed').length;
  const running = entries.some(isUploadActive);
  const bytes = entries.reduce((n, e) => n + e.size, 0);
  const sent = entries.reduce((n, e) => n + (e.size * (e.status === 'uploading' ? e.progress : 100)) / 100, 0);
  const title = running
    ? `Uploading ${entries.length} file${entries.length === 1 ? '' : 's'} to “${source.name}” · ${done} of ${entries.length} done`
    : `${entries.length} file${entries.length === 1 ? '' : 's'} uploaded to “${source.name}”${failed ? ` · ${failed} failed` : ''}`;
  return (
    <Box>
      <Step tone={running ? 'running' : failed ? 'failed' : 'done'} aside={running ? `${formatBytes(sent)} of ${formatBytes(bytes)}` : undefined}>
        {title}
      </Step>
      {running && <LinearProgress variant="determinate" value={bytes ? (sent / bytes) * 100 : 0} aria-label={`${source.name} upload progress`} sx={{ ...progressBarSx, ml: '36px' }} />}
      <Box sx={{ ...fileListSx, ml: '36px', mt: 1.5 }}>
        {entries.map((e) => (
          <Box key={e.recordId} sx={uploadRowSx}>
            <Box sx={uploadRowHeadSx}>
              <FileText size={16} aria-hidden />
              <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                {e.name}
              </Typography>
              {e.status === 'failed' && !e.jobId && (
                <Button size="small" variant="text" onClick={() => retryUpload(engineId, source.sourceId, e.recordId)}>
                  Retry
                </Button>
              )}
              <UploadStatusChip entry={e} />
            </Box>
            {e.detail && !isUploadActive(e) && (
              <Typography variant="caption" sx={{ display: 'block', pl: '28px', color: e.status === 'failed' ? 'error.main' : 'warning.dark' }}>
                {e.detail}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** What the wizard shows after Create while the staged files are handed to the new engine. */
export default function SetupProgress({ engineId, engineName, sourceCount, roleCount, warnings, uploads, onOpen }: SetupProgressProps): JSX.Element {
  const configSkipped = warnings.some((w) => /models/i.test(w));
  return (
    <Box sx={setupCardSx}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Setting up {engineName}
          </Typography>
          <Typography variant="body2" sx={mutedSx}>
            The engine is ready. Your files are being handed to it now.
          </Typography>
        </Box>
      </Stack>
      <Box sx={{ mt: 2 }}>
        <Step tone="done" aside={engineId}>
          Engine created
        </Step>
        <Step tone="done">You have query, enrichment and upload access</Step>
        <Step tone="done">{`${sourceCount} source${sourceCount === 1 ? '' : 's'} registered with visibility rules`}</Step>
        {roleCount > 0 && <Step tone="done">{`${roleCount} role${roleCount === 1 ? '' : 's'} granted query access`}</Step>}
        {configSkipped && (
          <Step tone="skipped" aside={warnings.find((w) => /models/i.test(w))?.split(': ')[1]}>
            Models were not saved
          </Step>
        )}
        {uploads.map((u) => (
          <UploadSource key={u.sourceId} engineId={engineId} source={u} />
        ))}
      </Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ ...mutedSx, lineHeight: 1.5 }}>
          Keep this tab open until the uploads finish. Opening the engine now is fine; they carry on in its Files drawer.
        </Typography>
        <Button variant="contained" onClick={onOpen} sx={{ flexShrink: 0 }}>
          Open engine
        </Button>
      </Stack>
    </Box>
  );
}
