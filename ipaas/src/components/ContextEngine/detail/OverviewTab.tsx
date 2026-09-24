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
import { Play, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useAskedFlag, useContextJob, useInvalidateContextEngine, useRebuildContextEngine } from '../../../hooks/useContextEngine';
import { LLM_PROVIDERS, STORAGE_BACKENDS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { getStartedSteps } from '../../../utils/contextEngine';
import { HttpError } from '../../../types/http';
import GraphStatusChip from '../GraphStatusChip';
import GetStartedChecklist from './GetStartedChecklist';
import SourcesProgressCard from './SourcesProgressCard';
import { mutedSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineDetail, ContextEngineTabKey, ContextGraphStatus, GetStartedStepId } from '../../../types/contextEngine';

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

function ModelRow({ label, provider, model }: { label: string; provider: string; model: string | undefined }): JSX.Element {
  return (
    <Box sx={summaryRowSx}>
      <Typography variant="body2" sx={mutedSx}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {provider}
        </Typography>
        <Typography variant="caption" sx={mutedSx}>
          {model ?? 'Not set'}
        </Typography>
      </Box>
    </Box>
  );
}

/** Overview — first-run checklist, source progress, graph status, access, models, storage and exposure, each linking to its tab. */
export default function OverviewTab({ engine, roleNames, onGoTab }: OverviewTabProps): JSX.Element {
  const rebuild = useRebuildContextEngine(engine.id);
  const invalidate = useInvalidateContextEngine(engine.id);
  const { asked } = useAskedFlag(engine.id);
  const [jobId, setJobId] = useState<string | null>(engine.graph.state === 'building' ? (engine.graph.jobId ?? null) : null);
  const job = useContextJob(jobId);
  const [buildError, setBuildError] = useState<string | null>(null);

  const jobState = job.data?.state;
  const building = rebuild.isPending || (!!jobId && jobState !== 'succeeded' && jobState !== 'failed');

  // A finished build changes sources, graph and (soon) models — refetch the engine once, then stop tracking the job.
  useEffect(() => {
    if (jobState === 'succeeded' || jobState === 'failed') {
      invalidate();
      setJobId(null);
    }
  }, [jobState, invalidate]);

  // What the header and cards show while a build we started is in flight.
  const graph: ContextGraphStatus = building ? { state: 'building', jobId: jobId ?? undefined } : jobState === 'failed' ? { state: 'failed', jobId: jobId ?? undefined } : engine.graph;
  const steps = getStartedSteps({ ...engine, graph }, asked);
  const allDone = steps.every((s) => s.state === 'done');

  const startBuild = () => {
    setBuildError(null);
    rebuild.mutate(undefined, {
      onSuccess: (handle) => setJobId(handle.jobId),
      onError: (e) => setBuildError(e instanceof HttpError && (e.status === 404 || e.status === 405) ? 'Building is not available on this engine yet — the enrichment route has not been enabled.' : "Couldn't start the build. Please try again."),
    });
  };

  const onChecklistAction = (id: GetStartedStepId) => {
    if (id === 'build') startBuild();
    else if (id === 'ask') onGoTab('playground');
    else if (id === 'publish') onGoTab('api');
    else onGoTab('access');
  };

  return (
    <>
      {!allDone && <GetStartedChecklist steps={steps} building={building} onAction={onChecklistAction} />}

      {buildError && (
        <Alert severity="warning" variant="outlined" onClose={() => setBuildError(null)} sx={{ mb: 2 }}>
          {buildError}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <SourcesProgressCard engineId={engine.id} sources={engine.sources} graph={graph} />
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card
            title="Context graph"
            action={
              <Button
                size="small"
                variant={graph.state === 'built' ? 'outlined' : 'contained'}
                startIcon={building ? <CircularProgress size={14} color="inherit" /> : graph.state === 'built' ? <RefreshCw size={14} /> : <Play size={14} />}
                disabled={building}
                onClick={startBuild}>
                {building ? 'Building…' : graph.state === 'built' ? 'Rebuild' : 'Build now'}
              </Button>
            }>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
              <GraphStatusChip graph={graph} />
              {job.data && (
                <Typography variant="caption" sx={mutedSx}>
                  Job {job.data.id} · attempt {job.data.attemptCount}
                </Typography>
              )}
            </Stack>
            <Typography variant="body2" sx={mutedSx}>
              {graph.state === 'built'
                ? 'Rebuilding re-reads every source and refreshes the graph. Answers keep working from the current build until it completes.'
                : `The first build indexes ${engine.sources.length} source${engine.sources.length === 1 ? '' : 's'}; later builds only re-read what changed.`}
            </Typography>
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
            <ModelRow label="Embedding" provider={providerName('embedding', engine.models.embedding?.provider)} model={engine.models.embedding?.model} />
            <ModelRow label="Language model" provider={providerName('llm', engine.models.llm?.provider)} model={engine.models.llm?.model} />
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card title="Storage">
            {STORAGE_BACKENDS.map((b) => {
              const sum = engine.storage?.[b.kind];
              return (
                <Box key={b.kind} sx={summaryRowSx}>
                  <Typography variant="body2" sx={mutedSx}>
                    {b.title.replace(' database', '')}
                  </Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {sum?.label ?? '—'}
                    </Typography>
                    <Typography variant="caption" sx={mutedSx}>
                      {sum ? (sum.detail ?? sum.provider) : 'Not reported'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
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
    </>
  );
}
