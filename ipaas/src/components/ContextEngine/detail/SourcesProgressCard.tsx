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

import { Alert, Box, Button, Chip, CircularProgress, LinearProgress, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useContextEngineProgress } from '../../../hooks/useContextEngine';
import { SOURCE_PROGRESS_LABEL, SOURCE_PROGRESS_TONE } from '../../../constants/contextEngine';
import {
  formatProgressPercent,
  isSourceProgressActive,
  overallProgress,
  progressHeadline,
  sourceIndexingText,
  sourceProgressDetail,
  sourceProgressStatus,
  sourceProgressValue,
  sourceSyncText,
  sourceTypeName,
  summarizeEngineProgress,
} from '../../../utils/contextEngine';
import SourceMark from '../SourceMark';
import { mutedSx, progressBarSx, progressCaptionSx, progressHeadlineSx, progressOverallSx, sourceProgressBodySx, sourceProgressHeadSx, sourceProgressRowSx, summaryCardHeaderSx, summaryCardSx } from '../styles';
import type { ContextGraphStatus, ContextSource, SourceProgress } from '../../../types/contextEngine';

interface SourcesProgressCardProps {
  engineId: string;
  sources: ContextSource[];
  /** Drives the fallback chip on engines that do not report progress yet. */
  graph: ContextGraphStatus;
}

/** Chip for engines without the progress route: the old graph-derived guess. */
function FallbackChip({ source, graph }: { source: ContextSource; graph: ContextGraphStatus }): JSX.Element {
  const label = graph.state === 'built' ? source.state : graph.state === 'building' ? 'Indexing' : 'Waiting for first build';
  const color = graph.state === 'built' && source.state === 'ready' ? 'success' : source.state === 'failed' ? 'error' : 'default';
  return <Chip size="small" variant="outlined" color={color} label={label} />;
}

function ProgressChip({ progress }: { progress: SourceProgress }): JSX.Element {
  const status = sourceProgressStatus(progress);
  const active = isSourceProgressActive(progress);
  const value = sourceProgressValue(progress);
  const label = active && value !== null ? `${SOURCE_PROGRESS_LABEL[status]} · ${formatProgressPercent(value)}` : SOURCE_PROGRESS_LABEL[status];
  return <Chip size="small" variant="outlined" color={SOURCE_PROGRESS_TONE[status]} icon={active ? <CircularProgress size={10} color="inherit" aria-hidden /> : undefined} label={label} />;
}

function ProgressBody({ source, progress }: { source: ContextSource; progress: SourceProgress }): JSX.Element {
  const status = sourceProgressStatus(progress);
  const value = sourceProgressValue(progress);
  const sync = sourceSyncText(progress);
  const indexing = sourceIndexingText(progress);
  return (
    <Box sx={sourceProgressBodySx}>
      {status !== 'waiting' && (
        <LinearProgress
          variant={value === null ? 'indeterminate' : 'determinate'}
          value={value ?? undefined}
          color={status === 'attention' ? 'warning' : status === 'processed' ? 'success' : 'primary'}
          aria-label={`${source.name} progress`}
          sx={progressBarSx}
        />
      )}
      <Typography variant="caption" sx={progressCaptionSx}>
        {sourceProgressDetail(progress)}
      </Typography>
      {sync && (
        <Typography variant="caption" sx={progressCaptionSx}>
          {sync}
        </Typography>
      )}
      {indexing && (
        <Typography variant="caption" sx={progressCaptionSx}>
          {indexing}
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
export default function SourcesProgressCard({ engineId, sources, graph }: SourcesProgressCardProps): JSX.Element {
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
  const overall = available ? overallProgress(progress.sources) : null;

  return (
    <Box sx={summaryCardSx}>
      <Box sx={summaryCardHeaderSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Sources ({sources.length})
        </Typography>
        {progressQuery.isLoading && sources.length > 0 && (
          <Box sx={progressHeadlineSx}>
            <CircularProgress size={12} color="inherit" aria-hidden />
            <Typography variant="caption">Loading progress…</Typography>
          </Box>
        )}
        {summary && sources.length > 0 && (
          <Box sx={progressHeadlineSx} aria-live="polite">
            {summary.active > 0 && <CircularProgress size={12} color="inherit" aria-hidden />}
            <Typography variant="caption">{progressHeadline(summary)}</Typography>
          </Box>
        )}
      </Box>

      {progressQuery.isError && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ mb: 1.5 }}
          action={
            <Button size="small" color="inherit" onClick={() => void progressQuery.refetch()}>
              Retry
            </Button>
          }>
          Couldn&apos;t load source progress.
        </Alert>
      )}

      {summary && overall && visible > 1 && (
        <Box sx={progressOverallSx}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Syncing {summary.active} of {visible} sources
            </Typography>
            <Typography variant="caption" sx={mutedSx}>
              {overall.text}
            </Typography>
          </Stack>
          <LinearProgress variant={overall.value === null ? 'indeterminate' : 'determinate'} value={overall.value ?? undefined} aria-label="All sources progress" sx={progressBarSx} />
        </Box>
      )}

      {sources.length === 0 ? (
        <Typography variant="body2" sx={mutedSx}>
          No sources are registered on this engine yet.
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
                    <Typography variant="caption" sx={mutedSx}>
                      {sourceTypeName(s.type)}
                    </Typography>
                  </Box>
                </Stack>
                {p ? <ProgressChip progress={p} /> : available ? <Chip size="small" variant="outlined" label="Progress hidden" /> : <FallbackChip source={s} graph={graph} />}
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
    </Box>
  );
}
