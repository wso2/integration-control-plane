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

import { Alert, Box, Button, Chip, CircularProgress, Grid, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useContextJob, useRebuildContextEngine } from '../../../hooks/useContextEngine';
import { LLM_PROVIDERS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { sourceTypeName } from '../../../utils/contextEngine';
import { HttpError } from '../../../types/http';
import SourceMark from '../SourceMark';
import { mutedSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineDetail, ContextEngineTabKey } from '../../../types/contextEngine';

interface OverviewTabProps {
  engine: ContextEngineDetail;
  /** Role handle → display name. */
  roleNames: Record<string, string>;
  onGoTab: (tab: ContextEngineTabKey) => void;
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <Box sx={summaryCardSx}>
      <Box sx={summaryCardHeaderSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

const providerName = (kind: 'embedding' | 'llm', id: string | undefined): string => {
  if (!id) return '—';
  const list: { id: string; name: string }[] = kind === 'embedding' ? EMBEDDING_PROVIDERS : LLM_PROVIDERS;
  return list.find((p) => p.id === id)?.name ?? id;
};

const jobChipColor = (state: string): 'success' | 'error' | 'info' => (state === 'succeeded' ? 'success' : state === 'failed' ? 'error' : 'info');

/** Overview — sources, access, models, exposure and the build job, each linking to its tab. */
export default function OverviewTab({ engine, roleNames, onGoTab }: OverviewTabProps): JSX.Element {
  const rebuild = useRebuildContextEngine(engine.id);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useContextJob(jobId);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  const startRebuild = () => {
    setRebuildError(null);
    rebuild.mutate(undefined, {
      onSuccess: (handle) => setJobId(handle.jobId),
      onError: (e) => setRebuildError(e instanceof HttpError && (e.status === 404 || e.status === 405) ? 'This engine does not support rebuilding yet.' : "Couldn't start the rebuild. Please try again."),
    });
  };

  const jobRunning = !!job.data && !['succeeded', 'failed'].includes(job.data.state);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Card title={`Sources (${engine.sources.length})`}>
          {engine.sources.length === 0 ? (
            <Typography variant="body2" sx={mutedSx}>
              No sources are registered on this engine yet.
            </Typography>
          ) : (
            engine.sources.map((s) => (
              <Box key={s.id} sx={summaryRowSx}>
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
                <Chip size="small" variant="outlined" color={s.state === 'ready' ? 'success' : s.state === 'failed' ? 'error' : 'default'} label={s.state} />
              </Box>
            ))
          )}
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <Card
          title="Context graph"
          action={
            <Button size="small" variant="outlined" startIcon={rebuild.isPending || jobRunning ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />} disabled={rebuild.isPending || jobRunning} onClick={startRebuild}>
              {jobRunning ? 'Building…' : 'Rebuild'}
            </Button>
          }>
          <Typography variant="body2" sx={mutedSx}>
            Rebuilding re-reads every source and refreshes the graph. Answers keep working from the previous build until it completes.
          </Typography>
          {rebuildError && (
            <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }} onClose={() => setRebuildError(null)}>
              {rebuildError}
            </Alert>
          )}
          {job.data && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1.5 }}>
              <Chip size="small" color={jobChipColor(job.data.state)} label={job.data.state} />
              <Typography variant="caption" sx={mutedSx}>
                Job {job.data.id} · attempt {job.data.attemptCount}
              </Typography>
            </Stack>
          )}
          {job.data?.error && (
            <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
              {job.data.error.message}
            </Alert>
          )}
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card
          title="Who can query"
          action={
            <Link component="button" type="button" variant="body2" onClick={() => onGoTab('access')}>
              Manage
            </Link>
          }>
          {engine.queryRoles.length === 0 ? (
            <Typography variant="body2" sx={mutedSx}>
              Only you.
            </Typography>
          ) : (
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {engine.queryRoles.map((r) => (
                <Chip key={r} size="small" label={roleNames[r] ?? r} />
              ))}
            </Stack>
          )}
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card title="Models">
          <Box sx={summaryRowSx}>
            <Typography variant="body2" sx={mutedSx}>
              Embedding
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {providerName('embedding', engine.models.embedding?.provider)}
              </Typography>
              <Typography variant="caption" sx={mutedSx}>
                {engine.models.embedding?.model ?? 'Not reported by the engine'}
              </Typography>
            </Box>
          </Box>
          <Box sx={summaryRowSx}>
            <Typography variant="body2" sx={mutedSx}>
              Language model
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {providerName('llm', engine.models.llm?.provider)}
              </Typography>
              <Typography variant="caption" sx={mutedSx}>
                {engine.models.llm?.model ?? 'Not reported by the engine'}
              </Typography>
            </Box>
          </Box>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card title="Exposure">
          <Box sx={summaryRowSx}>
            <Link component="button" type="button" variant="body2" onClick={() => onGoTab('api')}>
              REST API
            </Link>
            <Chip size="small" variant="outlined" color={engine.exposure.api ? 'success' : 'default'} label={engine.exposure.api ? 'Published' : 'Not published'} />
          </Box>
          <Box sx={summaryRowSx}>
            <Link component="button" type="button" variant="body2" onClick={() => onGoTab('mcp')}>
              MCP server
            </Link>
            <Chip size="small" variant="outlined" color={engine.exposure.mcp ? 'success' : 'default'} label={engine.exposure.mcp ? 'Published' : 'Not published'} />
          </Box>
          <Box sx={summaryRowSx}>
            <Link component="button" type="button" variant="body2" onClick={() => onGoTab('playground')}>
              Test playground
            </Link>
            <Chip size="small" variant="outlined" label="Always on" />
          </Box>
        </Card>
      </Grid>
    </Grid>
  );
}
