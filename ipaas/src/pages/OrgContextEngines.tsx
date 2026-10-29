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

import { Alert, Box, Button, CircularProgress, IconButton, ListingTable, MenuItem, PageContent, PageTitle, Select, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Play, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { isContextEngineEnabled, useContextEngines, useContextEngineSummary, useDeleteContextEngine, useSeenOnScreen } from '../hooks/useContextEngine';
import { useAllEnvironments } from '../hooks/useEnvironments';
import { contextEngineUrl, newContextEngineUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import DeleteEngineDialog from '../components/ContextEngine/DeleteEngineDialog';
import EngineStateChip from '../components/ContextEngine/EngineStateChip';
import SearchField from '../components/SearchField';
import ExposurePills from '../components/ContextEngine/ExposurePills';
import SourceMark from '../components/ContextEngine/SourceMark';
import { listMarksSx, listProgressTextSx } from '../components/ContextEngine/styles';
import { engineMessage, progressListingText, selectEnvironment } from '../utils/contextEngine';
import NoContextEnginesBanner from '../components/ContextEngine/NoContextEnginesBanner';
import type { ContextEngine, ContextEngineSummary } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const centeredSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' } as const;
const tableContainerSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;
const envSelectSx = { minWidth: 200, height: 40 } as const;

/** At most this many connector marks per row; the count covers the rest. */
const MAX_MARKS = 4;

/** A row's actions; they pause while the engine is not running. */
function RowActions({ engine, onPlayground, onDelete }: { engine: ContextEngine; onPlayground: () => void; onDelete: () => void }): JSX.Element {
  const deleting = engine.state === 'deleting';
  const running = engine.state === 'ready';
  const stop = (fn: () => void) => (ev: MouseEvent) => {
    ev.stopPropagation();
    fn();
  };
  return (
    <>
      <Tooltip title={running ? 'Open playground' : 'Available once the engine is running'}>
        <span>
          <IconButton size="small" aria-label={`Open playground for ${engine.name}`} disabled={!running} onClick={stop(onPlayground)}>
            <Play size={16} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={deleting ? 'Being deleted' : 'Delete'}>
        <span>
          <IconButton size="small" color="error" aria-label={`Delete ${engine.name}`} disabled={deleting} onClick={stop(onDelete)}>
            <Trash2 size={16} />
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}

/** The three summary cells of a row: filled, waiting, or blank when the engine has nothing to say. */
function SummaryCells({ summary, pending }: { summary: ContextEngineSummary | null; pending: boolean }): JSX.Element {
  if (pending || !summary) {
    const filler = pending ? <Skeleton variant="text" width={64} /> : '—';
    return (
      <>
        <ListingTable.Cell>{filler}</ListingTable.Cell>
        <ListingTable.Cell>{filler}</ListingTable.Cell>
        <ListingTable.Cell>{filler}</ListingTable.Cell>
      </>
    );
  }
  const progress = progressListingText(summary.progress);
  return (
    <>
      <ListingTable.Cell>
        <Box sx={listMarksSx}>
          {summary.sourceTypes.slice(0, MAX_MARKS).map((t, i) => (
            <SourceMark key={`${t}-${i}`} type={t} size={16} />
          ))}
          <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            {summary.sourceCount}
          </Typography>
        </Box>
        {progress && (
          <Typography variant="caption" color="text.secondary" sx={listProgressTextSx}>
            {progress}
          </Typography>
        )}
      </ListingTable.Cell>
      <ListingTable.Cell>
        <Typography variant="body2">{summary.roleCount === 0 ? 'Only you' : `${summary.roleCount} role${summary.roleCount === 1 ? '' : 's'}`}</Typography>
      </ListingTable.Cell>
      <ListingTable.Cell>
        <ExposurePills exposure={summary.exposure} />
      </ListingTable.Cell>
    </>
  );
}

/** One engine; its summary is read from the engine once the row is on screen and the engine runs. */
function EngineRow({ engine, onOpen, onPlayground, onDelete }: { engine: ContextEngine; onOpen: () => void; onPlayground: () => void; onDelete: () => void }): JSX.Element {
  const [rowRef, seen] = useSeenOnScreen<HTMLTableRowElement>();
  const running = engine.state === 'ready';
  const summary = useContextEngineSummary(engine.id, seen && running);
  return (
    <ListingTable.Row
      ref={rowRef}
      hover
      role="button"
      tabIndex={0}
      aria-label={`Open ${engine.name}`}
      sx={{ cursor: 'pointer' }}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen();
        }
      }}>
      <ListingTable.Cell sx={{ maxWidth: 360 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {engine.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {engine.description || 'No description'}
        </Typography>
      </ListingTable.Cell>
      <SummaryCells summary={running ? (summary.data ?? null) : null} pending={running && (!seen || summary.isLoading)} />
      <ListingTable.Cell>
        <EngineStateChip state={engine.state} reason={engine.statusReason} />
      </ListingTable.Cell>
      <ListingTable.Cell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <RowActions engine={engine} onPlayground={onPlayground} onDelete={onDelete} />
      </ListingTable.Cell>
    </ListingTable.Row>
  );
}

export default function OrgContextEngines(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const [params] = useSearchParams();
  const environments = useAllEnvironments();
  const [chosenEnv, setChosenEnv] = useState<string | null>(null);
  const envList = environments.data ?? [];
  const environment = selectEnvironment(
    envList.map((e) => e.id),
    chosenEnv,
    params.get('env'),
  );
  const { data: engines, isLoading, isError, error, refetch } = useContextEngines(environment);
  const remove = useDeleteContextEngine();
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<ContextEngine | null>(null);
  const [alert, setAlert] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const goCreate = () => navigate(newContextEngineUrl(scope.org, environment));
  const goDetail = (id: string) => navigate(contextEngineUrl(scope.org, id));
  const goPlayground = (id: string) => navigate(contextEngineUrl(scope.org, id, 'playground'));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return engines ?? [];
    return (engines ?? []).filter((e) => [e.name, e.description, e.handle].some((f) => f.toLowerCase().includes(q)));
  }, [engines, search]);

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  const deletionError = (e: unknown, name: string): string => {
    if (e instanceof HttpError && e.status === 403) return "You don't have permission to delete context engines.";
    return `Couldn't delete “${name}”: ${engineMessage(e, 'please try again')}.`;
  };

  const startDelete = (engine: ContextEngine) => {
    setDeleteError(null);
    remove.mutate(engine.id, {
      onSuccess: () => {
        setToDelete(null);
        setAlert({ type: 'info', message: `“${engine.name}” is being deleted. It leaves this list once it is gone.` });
      },
      onError: (e) => setDeleteError(deletionError(e, engine.name)),
    });
  };

  const envSelect = envList.length > 0 && (
    <Select size="small" value={environment} onChange={(e) => setChosenEnv(String(e.target.value))} sx={envSelectSx} inputProps={{ 'aria-label': 'Environment' }}>
      {envList.map((env) => (
        <MenuItem key={env.id} value={env.id}>
          {env.name}
        </MenuItem>
      ))}
    </Select>
  );

  const body = (): JSX.Element => {
    if (environments.isLoading || isLoading) {
      return (
        <Box sx={centeredSx}>
          <CircularProgress />
        </Box>
      );
    }
    if (environments.isError || isError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => (environments.isError ? environments.refetch() : refetch())}>
              Retry
            </Button>
          }>
          {environments.isError ? 'Failed to load environments.' : `Failed to load context engines. ${engineMessage(error, '')}`.trim()}
        </Alert>
      );
    }
    if (envList.length === 0) return <Alert severity="info">This organization has no environments to create a context engine in yet.</Alert>;
    if (!engines?.length) return <NoContextEnginesBanner onCreate={goCreate} />;
    return (
      <ListingTable.Container elevation={0} sx={tableContainerSx}>
        <ListingTable size="small">
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Name</ListingTable.Cell>
              <ListingTable.Cell>Sources</ListingTable.Cell>
              <ListingTable.Cell>Who can query</ListingTable.Cell>
              <ListingTable.Cell>Exposure</ListingTable.Cell>
              <ListingTable.Cell>State</ListingTable.Cell>
              <ListingTable.Cell align="right">Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {filtered.length === 0 ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No context engines match “{search}”.
                </ListingTable.Cell>
              </ListingTable.Row>
            ) : (
              filtered.map((e) => <EngineRow key={e.id} engine={e} onOpen={() => goDetail(e.id)} onPlayground={() => goPlayground(e.id)} onDelete={() => setToDelete(e)} />)
            )}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    );
  };

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Context Engines</PageTitle.Header>
        </PageTitle>
        <Stack direction="row" alignItems="center" gap={1.5}>
          {envSelect}
          {!!engines?.length && (
            <>
              <SearchField value={search} onChange={setSearch} placeholder="Search engines..." sx={{ minWidth: 220 }} />
              <Button variant="contained" startIcon={<Plus size={20} />} onClick={goCreate} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                Create
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {body()}

      {toDelete && (
        <DeleteEngineDialog
          name={toDelete.name}
          isPending={remove.isPending}
          error={deleteError}
          onConfirm={() => startDelete(toDelete)}
          onClose={() => {
            if (remove.isPending) return;
            setToDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </PageContent>
  );
}
