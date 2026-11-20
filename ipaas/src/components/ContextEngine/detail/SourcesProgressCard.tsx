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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, LinearProgress, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Plus, Upload } from '@wso2/oxygen-ui-icons-react';
import { useSourceUploads } from '../../../hooks/contextUploads';
import { useEffect, useState, type JSX } from 'react';
import { nextCronRunMs } from '../../../utils/cronUtils';
import { formatDistanceToNow } from '../../../utils/time';
import { useContextEngineProgress, useContextIntegrations } from '../../../hooks/useContextEngine';
import { SOURCE_PROGRESS_LABEL, SOURCE_PROGRESS_TONE } from '../../../constants/contextEngine';
import { formatProgressPercent, isSourceProgressActive, sourceFailureNotice, sourceProgressDetail, sourceProgressStatus, sourceProgressValue, sourceSyncText, sourceTypeName, summarizeEngineProgress } from '../../../utils/contextEngine';
import SourceMark from '../SourceMark';
import SectionCard from '../SectionCard';
import { mutedSx, progressBarSx, progressCaptionSx, progressHeadlineSx, sourceProgressBodySx, sourceProgressHeadSx, sourceProgressRowSx } from '../styles';
import type { ContextIntegration, ContextSource, SourceProgress } from '../../../types/contextEngine';

interface SourcesProgressCardProps {
  /** DOM id, so the checklist can scroll here. */
  id?: string;
  engineId: string;
  /** Progress comes from the engine, so it is asked for only once the engine runs. */
  running: boolean;
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

type ChipTone = 'success' | 'info' | 'error' | 'warning' | 'default';

/**
 * The row's one status, in the user's terms: did syncing work. How the source runs underneath stays out of it;
 * the engine's own progress speaks only while something is moving or needs attention.
 */
function syncStatus(source: ContextSource, p: SourceProgress | undefined, integration: ContextIntegration | undefined): { label: string; tone: ChipTone; detail?: string } | null {
  const status = p ? sourceProgressStatus(p) : null;
  if (integration?.status === 'provisioning') return { label: 'Setting up', tone: 'info' };
  if (integration?.status === 'removing') return { label: 'Removing', tone: 'warning' };
  // A failure comes first: a failed run can come back without a completion time, and must not read as still syncing.
  if (integration && (integration.status === 'failed' || integration.lastRun?.status === 'failed')) return { label: 'Sync failed', tone: 'error', detail: integration.statusReason };
  if (integration?.lastRun?.startedAt && !integration.lastRun.completedAt) return { label: 'Syncing', tone: 'info' };
  if (status === 'attention') return { label: SOURCE_PROGRESS_LABEL.attention, tone: 'warning' };
  if (status === 'waiting') return { label: SOURCE_PROGRESS_LABEL.waiting, tone: 'default' };
  if (source.type === 'upload') return status ? { label: SOURCE_PROGRESS_LABEL[status], tone: SOURCE_PROGRESS_TONE[status] } : null;
  if (integration) return integration.lastRun || integration.shape !== 'automation' ? { label: 'Synced', tone: 'success' } : { label: 'Waiting for first sync', tone: 'default' };
  return status ? { label: SOURCE_PROGRESS_LABEL[status], tone: SOURCE_PROGRESS_TONE[status] } : null;
}

function StatusChip({ label, tone, detail }: { label: string; tone: ChipTone; detail?: string }): JSX.Element {
  const chip = <Chip size="small" variant="outlined" color={tone} label={label} />;
  return detail ? (
    <Tooltip title={detail}>
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}

function ProgressChip({ progress }: { progress: SourceProgress }): JSX.Element {
  const status = sourceProgressStatus(progress);
  const active = isSourceProgressActive(progress);
  const value = sourceProgressValue(progress);
  const label = active && value !== null ? `${SOURCE_PROGRESS_LABEL[status]} · ${formatProgressPercent(value)}` : SOURCE_PROGRESS_LABEL[status];
  return <Chip size="small" variant="outlined" color={SOURCE_PROGRESS_TONE[status]} icon={active ? <CircularProgress size={10} color="inherit" aria-hidden /> : undefined} label={label} />;
}

/** "8 min", "1 h 5 min": how long until `at`, rounded up to the minute. */
function untilText(at: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((at - now) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

/** When the integration behind a source last synced, and when it syncs next on its schedule. */
function syncTimesText(integration: ContextIntegration, now: number): string | null {
  const run = integration.lastRun;
  const parts: string[] = [];
  if (run?.completedAt) {
    const when = formatDistanceToNow(run.completedAt).toLowerCase();
    parts.push(run.status === 'failed' ? `Last sync failed ${when}` : `Last sync ${when}`);
  } else if (run?.startedAt) parts.push('Syncing now');
  if (integration.shape !== 'automation') return run?.completedAt ? `Continuous · ${parts.join(' · ')}` : 'Continuous';
  if (integration.shape === 'automation' && integration.schedule) {
    // A CronJob with no time zone of its own runs on the cluster's clock, which is UTC.
    const next = nextCronRunMs(integration.schedule, 'UTC');
    if (next !== null) parts.push(`Next sync in ${untilText(next, now)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Re-renders every half minute, so "next sync in" counts down. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The one-line summary after the source type: what is in the index, or what is happening now. */
function rowSummary(source: ContextSource, p: SourceProgress, withSync = true): string {
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
  const sync = withSync ? sourceSyncText(p) : null;
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
export default function SourcesProgressCard({ id, engineId, running, sources, onManageFiles, onAddSource, onEditSource }: SourcesProgressCardProps): JSX.Element {
  const progressQuery = useContextEngineProgress(running ? engineId : '');
  // Followed while the card is open, so a scheduled run's result and the next run's time stay current.
  const integrations = useContextIntegrations(
    engineId,
    sources.some((s) => s.type !== 'upload'),
    { followRuns: true },
  );
  const now = useNow();
  const integrationBySource = new Map((integrations.data ?? []).flatMap((i) => (i.sourceId ? [[i.sourceId, i] as const] : [])));
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
          {progressQuery.isLoading && sources.length > 0 && <Skeleton variant="text" width={110} aria-label="Loading progress" />}
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

      {integrations.isError && (
        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mb: 1.5 }}>
          Couldn&apos;t load integration status. Trying again…
        </Typography>
      )}

      {sources.length === 0 ? (
        <Typography variant="body2" sx={mutedSx}>
          No sources yet.
        </Typography>
      ) : (
        sources.map((s) => {
          const p = byId.get(s.id);
          const integration = integrationBySource.get(s.id);
          // The integration knows the schedule and the last run, so its times replace the engine's own sync line.
          const syncTimes = integration ? syncTimesText(integration, now) : null;
          const caption = [sourceTypeName(s.type), p ? rowSummary(s, p, !syncTimes) : null].filter(Boolean).join(' · ');
          const moving = !!p && isSourceProgressActive(p);
          const rowStatus = moving ? null : syncStatus(s, p, integration);
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
                      {caption}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
                  {syncTimes && (
                    <Typography variant="caption" sx={{ ...mutedSx, mr: 0.5 }} noWrap>
                      {syncTimes}
                    </Typography>
                  )}
                  {moving && p ? <ProgressChip progress={p} /> : rowStatus ? <StatusChip {...rowStatus} /> : available ? <Chip size="small" variant="outlined" label="Progress hidden" /> : <FallbackChip source={s} />}
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
