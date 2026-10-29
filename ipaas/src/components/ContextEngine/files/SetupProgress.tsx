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

/** Where the wizard is after Create: the engine starting, its sources being sent, or done. */
export type SetupPhase = 'starting' | 'failed' | 'setting-up' | 'done';

interface SetupProgressProps {
  engineId: string;
  engineName: string;
  phase: SetupPhase;
  /** Why the engine is not running yet, when the BFF says. */
  statusReason?: string;
  sourceCount: number;
  roleCount: number;
  /** Steps the engine refused. */
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

const HEADLINE: Record<SetupPhase, string> = {
  starting: 'The engine is starting. This usually takes about a minute.',
  failed: 'The engine could not start.',
  'setting-up': 'The engine is running. Your sources are being added now.',
  done: 'The engine is ready. Your files are being handed to it now.',
};

/** What the wizard shows after Create: the engine starting, then its sources, grants and files being handed to it. */
export default function SetupProgress({ engineId, engineName, phase, statusReason, sourceCount, roleCount, warnings, uploads, onOpen }: SetupProgressProps): JSX.Element {
  const failedTo = (pattern: RegExp) => warnings.find((w) => pattern.test(w));
  const sourceFailures = warnings.filter((w) => w.startsWith('Register source')).length;
  const roleFailures = warnings.filter((w) => w.startsWith('Grant query access')).length;
  const ownerFailure = failedTo(/^Give you query and upload access/);
  const waiting = phase === 'starting' || phase === 'setting-up';
  return (
    <Box sx={setupCardSx}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Setting up {engineName}
          </Typography>
          <Typography variant="body2" sx={mutedSx}>
            {HEADLINE[phase]}
          </Typography>
        </Box>
      </Stack>
      <Box sx={{ mt: 2 }}>
        <Step tone="done">Engine created</Step>
        {phase === 'starting' && (
          <Step tone="running" aside={statusReason}>
            Starting the engine
          </Step>
        )}
        {phase === 'failed' && (
          <Step tone="failed" aside={statusReason}>
            The engine failed to start
          </Step>
        )}
        {phase === 'setting-up' && <Step tone="running">Adding your sources and access</Step>}
        {phase === 'done' && (
          <>
            <Step tone={ownerFailure ? 'failed' : 'done'} aside={ownerFailure?.split(': ').slice(1).join(': ')}>
              You have query and upload access
            </Step>
            <Step tone={sourceFailures ? 'failed' : 'done'}>{`${sourceCount - sourceFailures} of ${sourceCount} source${sourceCount === 1 ? '' : 's'} added with visibility rules`}</Step>
            {roleCount > 0 && <Step tone={roleFailures ? 'failed' : 'done'}>{`${roleCount - roleFailures} of ${roleCount} role${roleCount === 1 ? '' : 's'} granted query access`}</Step>}
            {uploads.map((u) => (
              <UploadSource key={u.sourceId} engineId={engineId} source={u} />
            ))}
          </>
        )}
      </Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ ...mutedSx, lineHeight: 1.5 }}>
          {waiting
            ? 'Keep this page open until the engine is running: your sources and files are sent to it from this page. If you leave, the engine is still created and you can add them again from its page.'
            : phase === 'failed'
              ? 'Open the engine to see why, or delete it and create it again.'
              : 'Keep this tab open until the uploads finish. Opening the engine now is fine; they carry on in its Files drawer.'}
        </Typography>
        <Button variant={waiting ? 'outlined' : 'contained'} onClick={onOpen} sx={{ flexShrink: 0 }}>
          Open engine
        </Button>
      </Stack>
    </Box>
  );
}
