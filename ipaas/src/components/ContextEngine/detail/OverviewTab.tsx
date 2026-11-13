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

import { Alert, Box, Button, Chip, /* CircularProgress, */ Grid, Link, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { EyeOff, Lock /* , Play, RefreshCw */ } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useAddContextSource, useAskedFlag, useContextEngineProgress, useContextPermissions, useUploadAudience } from '../../../hooks/useContextEngine';
import { rememberedSourceRules, rememberSourceRules, startUploads } from '../../../hooks/contextUploads';
import { useCan } from '../../../hooks/useCan';
import { Scopes } from '../../../constants/permissions';
import { STORAGE_BACKENDS } from '../../../constants/contextEngine';
import { answersFromIngestion, checkStagedFile, effectiveVisibility, engineMessage, getStartedSteps, modelProviderName, sourceAsConfig, summarizeEngineProgress, visibilityTags, withSourceVisibilityRules } from '../../../utils/contextEngine';
import { dropStagedFile, getStagedFile } from '../../../utils/stagedFiles';
import { HttpError } from '../../../types/http';
import GetStartedChecklist from './GetStartedChecklist';
import OwnerAccessButton from './OwnerAccessButton';
import SourcesProgressCard from './SourcesProgressCard';
import FilesDrawer from '../files/FilesDrawer';
import EditSourceDrawer from './EditSourceDrawer';
import EditModelsDrawer from './EditModelsDrawer';
import AccessSwitch from './AccessSwitch';
import SourceDrawer from '../SourceDrawer';
import { deleteCardSx, mutedSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineAccess, ContextEngineDetail, ContextEngineTabKey, ContextModelSummary, ContextSource, ContextSourceConfig, GetStartedStepId } from '../../../types/contextEngine';

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
  /** Ask to delete the engine. The page owns the confirmation dialog. */
  onRequestDelete?: () => void;
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

function LockedChip({ title }: { title: string }): JSX.Element {
  return (
    <Tooltip title={title}>
      <Chip size="small" variant="outlined" icon={<Lock size={12} />} label="Locked" sx={{ height: 22 }} />
    </Tooltip>
  );
}

/** One model: what it is, and how it can change. */
function ModelRow({ label, model, locked, action }: { label: string; model: string; locked?: string; action: ReactNode }): JSX.Element {
  return (
    <Box sx={summaryRowSx}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{label}</Typography>
        <Stack direction="row" alignItems="center" gap={0.5} sx={mutedSx}>
          <Typography variant="caption">{model}</Typography>
          {locked && (
            <Tooltip title={locked}>
              <Lock size={12} aria-label={locked} />
            </Tooltip>
          )}
        </Stack>
      </Box>
      {action}
    </Box>
  );
}

const modelText = (kind: 'embedding' | 'llm', m: ContextModelSummary | null | undefined, fallback: string): string => (m ? `${modelProviderName(kind, m.provider)} · ${m.model}` : fallback);

function ModelAction({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <Link component="button" type="button" variant="body2" onClick={onClick}>
      {label}
    </Link>
  );
}

/** One public surface: its access switch and a link to its tab. */
function ExposureRow({ engine, surface, label, disabledReason, onOpen }: { engine: ContextEngineDetail; surface: keyof ContextEngineAccess; label: string; disabledReason?: string; onOpen: () => void }): JSX.Element {
  return (
    <Box sx={summaryRowSx}>
      <Link component="button" type="button" variant="body2" onClick={onOpen}>
        {label}
      </Link>
      {engine.access ? (
        <AccessSwitch engineId={engine.id} access={engine.access} surface={surface} disabledReason={disabledReason} />
      ) : (
        <Typography variant="caption" sx={mutedSx}>
          Not available yet
        </Typography>
      )}
    </Box>
  );
}

/** Who can see the models: the engine shows them to anyone with a grant on it. */
const canSeeModels = (actions: string[] | undefined): boolean => !actions || actions.length > 0;

const SOURCES_CARD_ID = 'context-engine-sources';

/** Overview — first-run checklist, source progress, access, models, storage and exposure, each linking to its tab. */
export default function OverviewTab({ engine, orgHandle, /* roleNames, */ onGoTab, openFilesSourceId, readOnly = false, onRequestDelete }: OverviewTabProps): JSX.Element {
  const [filesSource, setFilesSource] = useState<ContextSource | null>(() => engine.sources.find((s) => s.id === openFilesSourceId && s.type === 'upload') ?? null);
  const [filesOpen, setFilesOpen] = useState(!!openFilesSourceId);
  const openFiles = (source: ContextSource) => {
    setFilesSource(source);
    setFilesOpen(true);
  };
  const can = useCan();
  const canManage = !readOnly && can(Scopes.CONFIG_MANAGE);
  const { asked } = useAskedFlag(engine.id);
  const progress = useContextEngineProgress(readOnly ? '' : engine.id);
  // Adding a source reuses the wizard's drawer; the session key remounts it fresh each time.
  const [addSession, setAddSession] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editSource, setEditSource] = useState<ContextSource | null>(null);
  const [sourceNotice, setSourceNotice] = useState<{ severity: 'warning' | 'error'; message: string; forbidden?: boolean; retry?: () => void } | null>(null);
  const addSource = useAddContextSource(engine.id);
  const permissions = useContextPermissions(readOnly ? '' : engine.id);
  const llmModels = engine.models.llm ? { ...engine.models, llm: engine.models.llm } : null;
  const canOpenModels = canManage && !!llmModels;
  const accessDisabledReason = readOnly ? 'The engine is being deleted.' : undefined;
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsSession, setModelsSession] = useState(0);
  const [focusEmbeddingKey, setFocusEmbeddingKey] = useState(false);
  const openModels = (embeddingKey = false) => {
    setFocusEmbeddingKey(embeddingKey);
    setModelsSession((n) => n + 1);
    setModelsOpen(true);
  };
  const changeModels = canOpenModels ? <ModelAction label="Change" onClick={() => openModels()} /> : undefined;
  const { everyone } = useUploadAudience(orgHandle, engine.queryRoles, readOnly ? null : engine.id);
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
          const visibility = effectiveVisibility(config.stagedVisibility);
          startUploads(engine.id, created.id, files, visibility, visibilityTags(visibility, everyone));
          openFiles(created);
        }
      },
      onError: (e) => {
        const forbidden = e instanceof HttpError && e.status === 403;
        setSourceNotice({ severity: 'error', forbidden, message: forbidden ? 'Adding a source needs the manage permission on this engine.' : engineMessage(e, "Couldn't add the source."), retry: () => submitNewSource(picked) });
      },
    });
  };

  const progressSummary = progress.data?.available
    ? summarizeEngineProgress(
        engine.sources.map((s) => s.id),
        progress.data.sources,
      )
    : null;
  // An engine whose only sources are uploads starts with an upload, not a wait for a connector.
  const uploadSources = engine.sources.filter((s) => s.type === 'upload');
  const uploadFirst = uploadSources.length > 0 && uploadSources.length === engine.sources.length && (!progressSummary || (progressSummary.processed === 0 && progressSummary.active === 0));
  // 'Grant access' step hidden along with the Access tab: roles can't be granted from the UI, so it would never complete.
  const steps = getStartedSteps(engine, asked, progressSummary, uploadFirst).filter((s) => s.id !== 'grant');
  const allDone = steps.every((s) => s.state === 'done');

  const onChecklistAction = (id: GetStartedStepId) => {
    if (id === 'index' && uploadFirst) openFiles(uploadSources[0]);
    else if (id === 'index') document.getElementById(SOURCES_CARD_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (id === 'ask') onGoTab('playground');
    else if (id === 'publish') onGoTab('api');
    // else onGoTab('access'); — 'Grant access' step hidden with the Access tab
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

      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <SourcesProgressCard
            id={SOURCES_CARD_ID}
            engineId={engine.id}
            running={!readOnly}
            sources={engine.sources}
            onManageFiles={canManage ? openFiles : undefined}
            onAddSource={
              !canManage
                ? undefined
                : () => {
                    setAddSession((n) => n + 1);
                    setAddOpen(true);
                  }
            }
            onEditSource={canManage ? setEditSource : undefined}
          />
        </Grid>

        {/* 'Who can query' card hidden for now, along with the Access tab.
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
        */}

        <Grid size={{ xs: 12, md: 4 }}>
          <Card title="Models">
            {canSeeModels(permissions.data) ? (
              <>
                <ModelRow
                  label="Embedding model"
                  model={modelText('embedding', engine.models.embedding, 'Engine default')}
                  locked="The embedding model can't change."
                  action={canOpenModels && engine.models.embedding ? <ModelAction label="Replace key" onClick={() => openModels(true)} /> : undefined}
                />
                <ModelRow label="Ingestion language model" model={modelText('llm', engine.models.llm, 'Engine default')} action={changeModels} />
                <ModelRow
                  label="Answer language model"
                  model={!engine.exposure.answers ? 'Answers are off' : answersFromIngestion(engine.models) ? 'Same as the ingestion model' : modelText('llm', engine.models.answer, 'Same as the ingestion model')}
                  action={engine.exposure.answers ? changeModels : undefined}
                />
              </>
            ) : (
              <Stack direction="row" gap={1} sx={mutedSx}>
                <EyeOff size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography variant="body2">You need access to the whole engine to see its models.</Typography>
              </Stack>
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card title="Storage" action={<LockedChip title="Storage is fixed once the engine is created." />}>
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
            <ExposureRow engine={engine} surface="api" label="REST API" disabledReason={accessDisabledReason} onOpen={() => onGoTab('api')} />
            <ExposureRow engine={engine} surface="mcp" label="MCP server" disabledReason={accessDisabledReason} onOpen={() => onGoTab('mcp')} />
            <Box sx={summaryRowSx}>
              <Link component="button" type="button" variant="body2" onClick={() => onGoTab('playground')}>
                Test playground
              </Link>
              <Chip size="small" variant="outlined" label="Always on" />
            </Box>
          </Card>
        </Grid>

        {onRequestDelete && (
          <Grid size={{ xs: 12 }}>
            <Box sx={deleteCardSx}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Delete engine
                </Typography>
                <Typography variant="body2" sx={mutedSx}>
                  Deletes the engine and everything it holds. This can’t be undone.
                </Typography>
              </Box>
              <Button variant="outlined" color="error" onClick={onRequestDelete} sx={{ flexShrink: 0 }}>
                Delete engine
              </Button>
            </Box>
          </Grid>
        )}
      </Grid>

      {modelsSession > 0 && llmModels && <EditModelsDrawer key={modelsSession} engineId={engine.id} models={llmModels} answersEnabled={engine.exposure.answers} focusEmbeddingKey={focusEmbeddingKey} open={modelsOpen} onClose={() => setModelsOpen(false)} />}
      {filesSource && canManage && <FilesDrawer engineId={engine.id} orgHandle={orgHandle} source={filesSource} queryRoles={engine.queryRoles} open={filesOpen} onClose={() => setFilesOpen(false)} />}
      <SourceDrawer key={addSession} orgHandle={orgHandle} open={addOpen} existing={existingConfigs} queryRoles={engine.queryRoles} engineId={engine.id} onClose={() => setAddOpen(false)} onSubmit={submitNewSource} />
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
