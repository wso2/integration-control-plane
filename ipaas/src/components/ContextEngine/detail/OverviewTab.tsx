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
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { useAskedFlag, useContextEngineProgress, useEngineGraphStatus, useInvalidateContextEngine, useRebuildContextEngine } from '../../../hooks/useContextEngine';
import { CONTEXT_JOB_TERMINAL_STATES, LLM_PROVIDERS, STORAGE_BACKENDS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { getStartedSteps, summarizeEngineProgress } from '../../../utils/contextEngine';
import { HttpError } from '../../../types/http';
import GraphStatusChip from '../GraphStatusChip';
import GetStartedChecklist from './GetStartedChecklist';
import OwnerAccessButton from './OwnerAccessButton';
import SourcesProgressCard from './SourcesProgressCard';
import { mutedSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineDetail, ContextEngineTabKey, GetStartedStepId } from '../../../types/contextEngine';

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

const SOURCES_CARD_ID = 'context-engine-sources';

interface EnrichFailure {
  message: string;
  /** The engine refused this user; they may be able to grant themselves the creator's access. */
  forbidden?: boolean;
}

function enrichFailure(e: unknown): EnrichFailure {
  if (e instanceof HttpError) {
    if (e.status === 403) return { message: 'Enriching needs the context.enrich permission on this engine.', forbidden: true };
    if (e.status === 503) return { message: "The engine is running without its knowledge backend, so it can't enrich yet. Start it in provider mode with model keys." };
    if (e.status === 409) return { message: 'This enrichment request is already bound to another one. Try again.' };
    if (e.status === 404 || e.status === 405) return { message: 'Enrichment is not available on this engine yet — the route has not been enabled.' };
  }
  return { message: "Couldn't start enrichment. Please try again." };
}

/** Overview — first-run checklist, source progress, enrichment, access, models, storage and exposure, each linking to its tab. */
export default function OverviewTab({ engine, roleNames, onGoTab }: OverviewTabProps): JSX.Element {
  const rebuild = useRebuildContextEngine(engine.id);
  const invalidate = useInvalidateContextEngine(engine.id);
  const { asked } = useAskedFlag(engine.id);
  const { graph, job, remember } = useEngineGraphStatus(engine.id, engine.graph, rebuild.isPending);
  const progress = useContextEngineProgress(engine.id);
  const [enrichError, setEnrichError] = useState<EnrichFailure | null>(null);
  const building = graph.state === 'building';

  // When a job we are watching ends, the engine may report new state — refetch the engine once.
  const jobState = job?.state;
  const lastJobState = useRef(jobState);
  useEffect(() => {
    const was = lastJobState.current;
    lastJobState.current = jobState;
    if (was && !CONTEXT_JOB_TERMINAL_STATES.has(was) && jobState && CONTEXT_JOB_TERMINAL_STATES.has(jobState)) invalidate();
  }, [jobState, invalidate]);

  const progressSummary = progress.data?.available
    ? summarizeEngineProgress(
        engine.sources.map((s) => s.id),
        progress.data.sources,
      )
    : null;
  const steps = getStartedSteps({ ...engine, graph }, asked, progressSummary);
  const allDone = steps.every((s) => s.state === 'done');

  const startEnrichment = () => {
    setEnrichError(null);
    rebuild.mutate(undefined, {
      onSuccess: (handle) => remember(handle.jobId),
      onError: (e) => setEnrichError(enrichFailure(e)),
    });
  };

  const onChecklistAction = (id: GetStartedStepId) => {
    if (id === 'index') document.getElementById(SOURCES_CARD_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (id === 'ask') onGoTab('playground');
    else if (id === 'publish') onGoTab('api');
    else onGoTab('access');
  };

  return (
    <>
      {!allDone && <GetStartedChecklist steps={steps} onAction={onChecklistAction} />}

      {enrichError && (
        <Alert severity="warning" variant="outlined" onClose={() => setEnrichError(null)} action={enrichError.forbidden ? <OwnerAccessButton engineId={engine.id} onGranted={startEnrichment} /> : undefined} sx={{ mb: 2 }}>
          {enrichError.message}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <SourcesProgressCard id={SOURCES_CARD_ID} engineId={engine.id} sources={engine.sources} graph={graph} />
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card
            title="Context graph"
            action={
              <Button size="small" variant="outlined" startIcon={building ? <CircularProgress size={14} color="inherit" /> : graph.state === 'built' ? <RefreshCw size={14} /> : <Play size={14} />} disabled={building} onClick={startEnrichment}>
                {building ? 'Enriching…' : graph.state === 'built' ? 'Enrich again' : 'Enrich'}
              </Button>
            }>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
              <GraphStatusChip graph={graph} />
              {job && (
                <Typography variant="caption" sx={mutedSx}>
                  Job {job.id} · attempt {job.attemptCount}
                </Typography>
              )}
            </Stack>
            <Typography variant="body2" sx={mutedSx}>
              {graph.state === 'built'
                ? 'Enrichment derived more connections from the indexed items. Run it again after large changes; queries keep working while it runs.'
                : `Indexing already builds the graph and makes items searchable. Enrichment is an optional pass that derives more connections from ${engine.sources.length} source${engine.sources.length === 1 ? '' : 's'} with the engine's language model.`}
            </Typography>
            {job?.error && (
              <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
                {job.error.message}
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
