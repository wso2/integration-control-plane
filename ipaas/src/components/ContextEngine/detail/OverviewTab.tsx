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

import { Alert, Box, Button, Chip, CircularProgress, Grid, Link, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { EyeOff, Info, KeyRound, Lock, Play, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { useAddContextSource, useAskedFlag, useContextEngineProgress, useContextPermissions, useEngineGraphStatus, useInvalidateContextEngine, useRebuildContextEngine, useUploadAudience } from '../../../hooks/useContextEngine';
import { rememberedSourceRules, rememberSourceRules, startUploads } from '../../../hooks/contextUploads';
import { CONTEXT_JOB_TERMINAL_STATES, EVERYONE_VISIBILITY, LLM_PROVIDERS, STORAGE_BACKENDS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { checkStagedFile, connectorFor, engineMessage, getStartedSteps, modelKeysLabel, sourceAsConfig, summarizeEngineProgress, visibilityTags, withSourceVisibilityRules } from '../../../utils/contextEngine';
import { dropStagedFile, getStagedFile } from '../../../utils/stagedFiles';
import { HttpError } from '../../../types/http';
import GraphStatusChip from '../GraphStatusChip';
import GetStartedChecklist from './GetStartedChecklist';
import OwnerAccessButton from './OwnerAccessButton';
import SourcesProgressCard from './SourcesProgressCard';
import FilesDrawer from '../files/FilesDrawer';
import EditSourceDrawer from './EditSourceDrawer';
import EditModelsDrawer from './EditModelsDrawer';
import SourceDrawer from '../SourceDrawer';
import { mutedSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineDetail, ContextEngineTabKey, ContextSource, ContextSourceConfig, GetStartedStepId } from '../../../types/contextEngine';

interface OverviewTabProps {
  engine: ContextEngineDetail;
  orgHandle: string;
  /** Role handle → display name. */
  roleNames: Record<string, string>;
  onGoTab: (tab: ContextEngineTabKey) => void;
  /** Open the Files drawer for this source on arrival, e.g. right after the wizard uploaded to it. */
  openFilesSourceId?: string;
  /** The engine is being deleted: show what it holds, offer nothing that changes it. */
  readOnly?: boolean;
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

function ModelRow({ label, provider, model, locked = false }: { label: string; provider: string; model: string | undefined; locked?: boolean }): JSX.Element {
  return (
    <Box sx={summaryRowSx}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="body2" sx={mutedSx}>
          {label}
        </Typography>
        {locked && (
          <Tooltip title="Fixed while the engine holds indexed items: their vectors only match this model.">
            <Chip size="small" variant="outlined" icon={<Lock size={12} />} label="Locked" sx={{ height: 22 }} />
          </Tooltip>
        )}
      </Stack>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {provider}
        </Typography>
        <Typography variant="caption" sx={mutedSx}>
          {model ?? 'Set where the engine runs'}
        </Typography>
      </Box>
    </Box>
  );
}

/** Who can see the models: the configuration route needs source or space management rights. */
const canSeeModels = (actions: string[] | undefined): boolean => !actions || actions.includes('space.manage') || actions.includes('source.manage');

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
export default function OverviewTab({ engine, orgHandle, roleNames, onGoTab, openFilesSourceId, readOnly = false }: OverviewTabProps): JSX.Element {
  const [filesSource, setFilesSource] = useState<ContextSource | null>(() => engine.sources.find((s) => s.id === openFilesSourceId && s.type === 'upload') ?? null);
  const [filesOpen, setFilesOpen] = useState(!!openFilesSourceId);
  const openFiles = (source: ContextSource) => {
    setFilesSource(source);
    setFilesOpen(true);
  };
  const rebuild = useRebuildContextEngine(engine.id);
  const invalidate = useInvalidateContextEngine(engine.id);
  const { asked } = useAskedFlag(engine.id);
  const { graph, job, remember } = useEngineGraphStatus(engine.id, engine.graph, rebuild.isPending);
  const progress = useContextEngineProgress(engine.id);
  const [enrichError, setEnrichError] = useState<EnrichFailure | null>(null);
  // Adding a source reuses the wizard's drawer; the session key remounts it fresh each time.
  const [addSession, setAddSession] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editSource, setEditSource] = useState<ContextSource | null>(null);
  const [sourceNotice, setSourceNotice] = useState<{ severity: 'warning' | 'error'; message: string; forbidden?: boolean; retry?: () => void } | null>(null);
  const addSource = useAddContextSource(engine.id);
  const permissions = useContextPermissions(engine.id);
  const canEditModels = !readOnly && !!permissions.data?.includes('space.manage');
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsSession, setModelsSession] = useState(0);
  const openModels = () => {
    setModelsSession((n) => n + 1);
    setModelsOpen(true);
  };
  const { everyone } = useUploadAudience(orgHandle, engine.queryRoles);
  const existingConfigs = engine.sources.map((s) => sourceAsConfig(s, rememberedSourceRules(s.id)));

  const submitNewSource = (picked: ContextSourceConfig) => {
    setSourceNotice(null);
    // The source's visibility becomes audience rules that map the chosen roles to themselves.
    const [config] = withSourceVisibilityRules([picked], everyone);
    addSource.mutate(config, {
      onSuccess: (created) => {
        setAddOpen(false);
        rememberSourceRules(created.id, config.audience ?? []);
        const staged = config.staged ?? [];
        const files = staged.flatMap((m) => {
          const content = getStagedFile(m.id);
          return content && !checkStagedFile(m, []).problem ? [{ content, name: m.name, size: m.size, contentType: m.contentType }] : [];
        });
        staged.forEach((m) => dropStagedFile(m.id));
        if (files.length) {
          const visibility = config.stagedVisibility ?? EVERYONE_VISIBILITY;
          startUploads(engine.id, created.id, files, visibility, visibilityTags(visibility, everyone));
          openFiles(created);
        }
        if ((connectorFor(config.type)?.fields.length ?? 0) > 0) {
          setSourceNotice({ severity: 'warning', message: `“${created.name}” is registered, but its connection settings and credentials are not stored: the engine does not serve the configuration route yet.` });
        }
      },
      onError: (e) => {
        const forbidden = e instanceof HttpError && e.status === 403;
        setSourceNotice({ severity: 'error', forbidden, message: forbidden ? 'Adding a source needs the manage permission on this engine.' : engineMessage(e, "Couldn't add the source."), retry: () => submitNewSource(picked) });
      },
    });
  };
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
  // An engine whose only sources are uploads starts with an upload, not a wait for a connector.
  const uploadSources = engine.sources.filter((s) => s.type === 'upload');
  const uploadFirst = uploadSources.length > 0 && uploadSources.length === engine.sources.length && (!progressSummary || (progressSummary.processed === 0 && progressSummary.active === 0));
  const steps = getStartedSteps({ ...engine, graph }, asked, progressSummary, uploadFirst);
  const allDone = steps.every((s) => s.state === 'done');

  const startEnrichment = () => {
    setEnrichError(null);
    rebuild.mutate(undefined, {
      onSuccess: (handle) => remember(handle.jobId),
      onError: (e) => setEnrichError(enrichFailure(e)),
    });
  };

  const onChecklistAction = (id: GetStartedStepId) => {
    if (id === 'index' && uploadFirst) openFiles(uploadSources[0]);
    else if (id === 'index') document.getElementById(SOURCES_CARD_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (id === 'ask') onGoTab('playground');
    else if (id === 'publish') onGoTab('api');
    else onGoTab('access');
  };

  return (
    <>
      {!allDone && !readOnly && <GetStartedChecklist steps={steps} onAction={onChecklistAction} />}

      {sourceNotice && (
        <Alert
          severity={sourceNotice.severity}
          variant="outlined"
          onClose={() => setSourceNotice(null)}
          action={sourceNotice.forbidden && sourceNotice.retry ? <OwnerAccessButton engineId={engine.id} onGranted={sourceNotice.retry} /> : undefined}
          sx={{ mb: 2 }}>
          {sourceNotice.message}
        </Alert>
      )}

      {enrichError && (
        <Alert severity="warning" variant="outlined" onClose={() => setEnrichError(null)} action={enrichError.forbidden ? <OwnerAccessButton engineId={engine.id} onGranted={startEnrichment} /> : undefined} sx={{ mb: 2 }}>
          {enrichError.message}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <SourcesProgressCard
            id={SOURCES_CARD_ID}
            engineId={engine.id}
            sources={engine.sources}
            graph={graph}
            onManageFiles={readOnly ? undefined : openFiles}
            onAddSource={
              readOnly
                ? undefined
                : () => {
                    setAddSession((n) => n + 1);
                    setAddOpen(true);
                  }
            }
            onEditSource={readOnly ? undefined : setEditSource}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card
            title="Context graph"
            action={
              <Button size="small" variant="outlined" startIcon={building ? <CircularProgress size={14} color="inherit" /> : graph.state === 'built' ? <RefreshCw size={14} /> : <Play size={14} />} disabled={building || readOnly} onClick={startEnrichment}>
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
          <Card
            title="Models"
            action={
              canEditModels && canSeeModels(permissions.data) ? (
                <Link component="button" type="button" variant="body2" onClick={openModels}>
                  {engine.models.embedding || engine.models.llm ? 'Edit' : 'Choose models'}
                </Link>
              ) : undefined
            }>
            {canSeeModels(permissions.data) ? (
              <>
                <ModelRow label="Embedding" provider={engine.models.embedding ? providerName('embedding', engine.models.embedding.provider) : 'Engine default'} model={engine.models.embedding?.model} locked={!!engine.models.embeddingLocked} />
                <ModelRow label="Language model" provider={engine.models.llm ? providerName('llm', engine.models.llm.provider) : 'Engine default'} model={engine.models.llm?.model} />
                {modelKeysLabel(engine.models) ? (
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ ...mutedSx, mt: 1.25 }}>
                    <KeyRound size={14} aria-hidden />
                    <Typography variant="caption">{modelKeysLabel(engine.models)}</Typography>
                  </Stack>
                ) : (
                  !engine.models.embedding &&
                  !engine.models.llm && (
                    <Stack direction="row" alignItems="center" gap={0.75} sx={{ ...mutedSx, mt: 1.25 }}>
                      <Info size={14} aria-hidden />
                      <Typography variant="caption">Uses the engine host&apos;s models until you choose its own.</Typography>
                    </Stack>
                  )
                )}
              </>
            ) : (
              <Stack direction="row" gap={1} sx={mutedSx}>
                <EyeOff size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography variant="body2">Only people who manage this engine&apos;s sources or settings can see its models.</Typography>
              </Stack>
            )}
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

      {modelsSession > 0 && <EditModelsDrawer key={modelsSession} engineId={engine.id} models={engine.models} open={modelsOpen} onClose={() => setModelsOpen(false)} />}
      {filesSource && <FilesDrawer engineId={engine.id} orgHandle={orgHandle} source={filesSource} queryRoles={engine.queryRoles} open={filesOpen} onClose={() => setFilesOpen(false)} />}
      <SourceDrawer key={addSession} orgHandle={orgHandle} open={addOpen} existing={existingConfigs} queryRoles={engine.queryRoles} onClose={() => setAddOpen(false)} onSubmit={submitNewSource} />
      {editSource && (
        <EditSourceDrawer
          key={editSource.id}
          engineId={engine.id}
          orgHandle={orgHandle}
          source={editSource}
          otherNames={engine.sources.filter((s) => s.id !== editSource.id).map((s) => s.name)}
          queryRoles={engine.queryRoles}
          open
          onClose={() => setEditSource(null)}
        />
      )}
    </>
  );
}
