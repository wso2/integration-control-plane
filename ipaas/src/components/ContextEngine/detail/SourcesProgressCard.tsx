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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Plus, Upload } from '@wso2/oxygen-ui-icons-react';
import { useSourceUploads } from '../../../hooks/contextUploads';
import type { JSX } from 'react';
import { useContextEngineProgress } from '../../../hooks/useContextEngine';
import { SOURCE_PROGRESS_LABEL, SOURCE_PROGRESS_TONE } from '../../../constants/contextEngine';
import { formatProgressPercent, isSourceProgressActive, sourceFailureNotice, sourceProgressDetail, sourceProgressStatus, sourceProgressValue, sourceSyncText, sourceTypeName, summarizeEngineProgress } from '../../../utils/contextEngine';
import SourceMark from '../SourceMark';
import SectionCard from '../SectionCard';
import { mutedSx, progressBarSx, progressCaptionSx, progressHeadlineSx, sourceProgressBodySx, sourceProgressHeadSx, sourceProgressRowSx } from '../styles';
import type { ContextSource, SourceProgress } from '../../../types/contextEngine';

interface SourcesProgressCardProps {
  /** DOM id, so the checklist can scroll here. */
  id?: string;
  engineId: string;
  sources: ContextSource[];
  /** Drives the fallback chip on engines that do not report progress yet. */
  /** Opens the Files drawer for a File Upload source. */
  onManageFiles?: (source: ContextSource) => void;
  /** Register another source on this engine. */
  onAddSource?: () => void;
  /** Rename a source or change its visibility rules. */
  onEditSource?: (source: ContextSource) => void;
}

/** "Upload files" until this browser has uploaded something, then "Manage files" with the count. */
function FilesAction({ engineId, source, onManage }: { engineId: string; source: ContextSource; onManage: (source: ContextSource) => void }): JSX.Element {
  const entries = useSourceUploads(engineId, source.id);
  return (
    <Button size="small" variant="outlined" startIcon={<Upload size={14} />} onClick={() => onManage(source)} sx={{ flexShrink: 0 }}>
      {entries.length ? `Manage files (${entries.length})` : 'Upload files'}
    </Button>
  );
}

/** Chip for engines without the progress route: the source's own state. */
function FallbackChip({ source }: { source: ContextSource }): JSX.Element {
  const label = source.state;
  const color = source.state === 'ready' ? 'success' : source.state === 'failed' ? 'error' : 'default';
  return <Chip size="small" variant="outlined" color={color} label={label} />;
}

function ProgressChip({ progress }: { progress: SourceProgress }): JSX.Element {
  const status = sourceProgressStatus(progress);
  const active = isSourceProgressActive(progress);
  const value = sourceProgressValue(progress);
  const label = active && value !== null ? `${SOURCE_PROGRESS_LABEL[status]} · ${formatProgressPercent(value)}` : SOURCE_PROGRESS_LABEL[status];
  return <Chip size="small" variant="outlined" color={SOURCE_PROGRESS_TONE[status]} icon={active ? <CircularProgress size={10} color="inherit" aria-hidden /> : undefined} label={label} />;
}

/** The one-line summary after the source type: what is in the index, or what is happening now. */
function rowSummary(source: ContextSource, p: SourceProgress): string {
  const status = sourceProgressStatus(p);
  const ix = p.indexing;
  const n = (v: number) => v.toLocaleString('en-US');
  const items = (v: number) => `${n(v)} ${v === 1 ? 'item' : 'items'}`;
  if (status === 'waiting') return source.type === 'upload' ? 'No files yet. Upload files to bring data in.' : 'No sync yet. Data appears after the first sync.';
  if (status === 'empty') return sourceProgressDetail(p);
  if (status === 'reading' || status === 'processing') {
    const { total, succeeded, failed } = p.processing;
    return total > 0 ? `${n(succeeded + failed)} of ${items(total)} processed${p.reading.state === 'reading' ? ' so far' : ''}` : 'Waiting for the first items';
  }
  const parts: string[] = [];
  if (ix.state === 'ok' && ix.expected) parts.push(ix.indexed === ix.expected ? `${items(ix.indexed ?? 0)} indexed` : `${n(ix.indexed ?? 0)} of ${items(ix.expected)} indexed`);
  else parts.push(`${items(p.records.active)} stored`);
  const failed = (ix.state === 'ok' ? ix.failed : null) ?? p.processing.failed;
  if (failed) parts.push(`${n(failed)} failed`);
  const sync = sourceSyncText(p);
  if (sync) parts.push(sync);
  return parts.join(' · ');
}

/** A bar only while the source is moving; a failure as one sentence. Nothing else under the row. */
function ProgressBody({ source, progress }: { source: ContextSource; progress: SourceProgress }): JSX.Element | null {
  const status = sourceProgressStatus(progress);
  const value = sourceProgressValue(progress);
  const notice = sourceFailureNotice(progress);
  const moving = status === 'reading' || status === 'processing' || status === 'indexing';
  if (!moving && !notice) return null;
  return (
    <Box sx={sourceProgressBodySx}>
      {moving && <LinearProgress variant={value === null ? 'indeterminate' : 'determinate'} value={value ?? undefined} aria-label={`${source.name} progress`} sx={progressBarSx} />}
      {notice && (
        <Typography variant="caption" sx={{ ...progressCaptionSx, color: 'warning.dark' }}>
          {notice}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Sources with live pipeline progress: whether each connector is still reading,
 * how many delivered items the engine has processed, and, once the engine
 * collects it, how much the search index has caught up. Polls while anything moves.
 */
export default function SourcesProgressCard({ id, engineId, sources, onManageFiles, onAddSource, onEditSource }: SourcesProgressCardProps): JSX.Element {
  const progressQuery = useContextEngineProgress(engineId);
  const progress = progressQuery.data;
  const available = !!progress?.available;
  const byId = new Map((progress?.sources ?? []).map((p) => [p.sourceId, p]));
  const summary = available
    ? summarizeEngineProgress(
        sources.map((s) => s.id),
        progress.sources,
      )
    : null;
  const visible = summary ? summary.sourceCount - summary.hidden : 0;
  const attention = available ? progress.sources.filter((p) => sources.some((src) => src.id === p.sourceId) && sourceProgressStatus(p) === 'attention').length : 0;

  return (
    <SectionCard
      id={id}
      title={`Sources (${sources.length})`}
      action={
        <Stack direction="row" alignItems="center" gap={1.5}>
          {progressQuery.isLoading && sources.length > 0 && (
            <Box sx={progressHeadlineSx}>
              <CircularProgress size={12} color="inherit" aria-hidden />
              <Typography variant="caption">Loading progress…</Typography>
            </Box>
          )}
          {summary && (summary.active > 0 || attention > 0) && (
            <Box sx={progressHeadlineSx} aria-live="polite">
              {summary.active > 0 && <CircularProgress size={12} color="inherit" aria-hidden />}
              <Typography variant="caption">
                {summary.active > 0 && `Syncing ${summary.active} of ${visible}`}
                {summary.active > 0 && attention > 0 && ' · '}
                {attention > 0 && (
                  <Box component="span" sx={{ color: 'warning.dark' }}>
                    {attention} need{attention === 1 ? 's' : ''} attention
                  </Box>
                )}
              </Typography>
            </Box>
          )}
          {onAddSource && (
            <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={onAddSource}>
              Add source
            </Button>
          )}
        </Stack>
      }>
      {progressQuery.isError && (
        <Alert
          severity="warning"
          sx={{ mb: 1.5 }}
          action={
            <Button size="small" color="inherit" onClick={() => void progressQuery.refetch()}>
              Retry
            </Button>
          }>
          Couldn&apos;t load source progress.
        </Alert>
      )}

      {sources.length === 0 ? (
        <Typography variant="body2" sx={mutedSx}>
          No sources yet.
        </Typography>
      ) : (
        sources.map((s) => {
          const p = byId.get(s.id);
          return (
            <Box key={s.id} sx={sourceProgressRowSx}>
              <Box sx={sourceProgressHeadSx}>
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
                  <SourceMark type={s.type} size={18} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="caption" sx={{ ...mutedSx, display: 'block' }}>
                      {p ? `${sourceTypeName(s.type)} · ${rowSummary(s, p)}` : sourceTypeName(s.type)}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
                  {p ? <ProgressChip progress={p} /> : available ? <Chip size="small" variant="outlined" label="Progress hidden" /> : <FallbackChip source={s} />}
                  {s.type === 'upload' && onManageFiles && <FilesAction engineId={engineId} source={s} onManage={onManageFiles} />}
                  {onEditSource && (
                    <Tooltip title="Edit source">
                      <IconButton size="small" aria-label={`Edit ${s.name}`} onClick={() => onEditSource(s)}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
              {p && <ProgressBody source={s} progress={p} />}
              {!p && available && (
                <Box sx={sourceProgressBodySx}>
                  <Typography variant="caption" sx={mutedSx}>
                    Seeing progress needs delivery or manage rights on this source.
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })
      )}
    </SectionCard>
  );
}
