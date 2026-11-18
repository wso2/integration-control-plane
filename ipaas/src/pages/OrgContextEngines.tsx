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

import { Alert, Box, Button, IconButton, ListingTable, PageContent, PageTitle, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Play, Plus, Trash2, Waypoints } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX, type MouseEvent } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useRemovalNotice } from '../hooks/useRemovalNotice';
import { useCan } from '../hooks/useCan';
import { isContextEngineEnabled, useContextEngines, useContextEngineSummary, useDeleteContextEngine, useSeenOnScreen } from '../hooks/useContextEngine';
import { contextEngineUrl, newContextEngineUrl } from '../paths';
import { Scopes } from '../constants/permissions';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import DeleteEngineDialog from '../components/ContextEngine/DeleteEngineDialog';
import EngineStateChip from '../components/ContextEngine/EngineStateChip';
import SearchField from '../components/SearchField';
import ExposurePills from '../components/ContextEngine/ExposurePills';
import SourceMark from '../components/ContextEngine/SourceMark';
import { listMarksSx, listProgressTextSx } from '../components/ContextEngine/styles';
import { engineMessage, progressListingLine } from '../utils/contextEngine';
import EmptyListing from '../components/EmptyListing';
import type { ContextEngine, ContextEngineAccess, ContextEnginesLocationState, ContextEngineSummary } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const tableContainerSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflowX: 'auto' } as const;
const searchSx = { mb: 3 } as const;

/** At most this many connector marks per row; the count covers the rest. */
const MAX_MARKS = 4;

/** A row's actions; they pause while the engine is not running. */
function RowActions({ engine, onPlayground, onDelete }: { engine: ContextEngine; onPlayground?: () => void; onDelete?: () => void }): JSX.Element {
  const deleting = engine.state === 'deleting';
  const running = engine.state === 'ready';
  const stop = (fn: () => void) => (ev: MouseEvent) => {
    ev.stopPropagation();
    fn();
  };
  return (
    <>
      {onPlayground && (
        <Tooltip title={running ? 'Open playground' : 'Available once the engine is running'}>
          <span>
            <IconButton size="small" aria-label={`Open playground for ${engine.name}`} disabled={!running} onClick={stop(onPlayground)}>
              <Play size={16} />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip title={deleting ? 'Being deleted' : 'Delete'}>
          <span>
            <IconButton size="small" color="error" aria-label={`Delete ${engine.name}`} disabled={deleting} onClick={stop(onDelete)}>
              <Trash2 size={16} />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </>
  );
}

/** The three summary cells of a row: filled, waiting, or blank when the engine has nothing to say. */
function SummaryCells({ summary, pending, access }: { summary: ContextEngineSummary | null; pending: boolean; access: ContextEngineAccess | undefined }): JSX.Element {
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
  const progress = progressListingLine(summary);
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
      <ListingTable.Cell>{access ? <ExposurePills access={access} /> : '—'}</ListingTable.Cell>
    </>
  );
}

/** One engine; its summary is read from the engine once the row is on screen and the engine runs. */
function EngineRow({ engine, onOpen, onPlayground, onDelete }: { engine: ContextEngine; onOpen: () => void; onPlayground?: () => void; onDelete?: () => void }): JSX.Element {
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
        // Only keys pressed on the row itself open it; Enter on a row action button belongs to that button.
        if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault();
          onOpen();
        }
      }}>
      {/* The description never wraps, so this cap decides the column's width; narrower on laptops keeps Actions in view. */}
      <ListingTable.Cell sx={{ maxWidth: { xs: 280, lg: 360 } }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {engine.name}
        </Typography>
        {engine.description && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {engine.description}
          </Typography>
        )}
      </ListingTable.Cell>
      <SummaryCells summary={running ? (summary.data ?? null) : null} pending={running && (!seen || summary.isLoading)} access={engine.access} />
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
  const can = useCan();
  const canRead = can(Scopes.INTEGRATION_READ);
  const canManage = can(Scopes.CONFIG_MANAGE);
  const { data: engines, dataUpdatedAt, isLoading, isError, error, refetch } = useContextEngines(canRead);
  const remove = useDeleteContextEngine();
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<ContextEngine | null>(null);
  const [deleteAlert, setDeleteAlert] = useState<string | null>(null);
  // Like integrations, a delete is confirmed once the engine leaves the list; until then its row shows Deleting.
  // An accepted delete is also recorded by id, as it may leave the list before any read shows it deleting.
  const removable = useMemo(() => engines?.map((e) => ({ id: e.id, name: e.name, deleting: e.state === 'deleting' })), [engines]);
  const trackRemoval = useRemovalNotice(
    scope.org,
    removable,
    (e) => e.name,
    (name) => setDeleteAlert(`Context engine '${name}' deleted successfully.`),
    dataUpdatedAt,
  );
  const location = useLocation();
  // A delete started on the engine page lands here with the engine, and is confirmed the same way.
  useEffect(() => {
    const state = location.state as ContextEnginesLocationState | null;
    if (!state?.engineDeleted) return;
    trackRemoval(state.engineId, state.engineName, state.deletedAt);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate, trackRemoval]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const goCreate = () => navigate(newContextEngineUrl(scope.org));
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
        trackRemoval(engine.id, engine.name, Date.now());
        setToDelete(null);
      },
      onError: (e) => setDeleteError(deletionError(e, engine.name)),
    });
  };

  const body = (): JSX.Element => {
    if (!canRead) return <Alert severity="info">Your role can&apos;t view context engines.</Alert>;
    if (isLoading) {
      return (
        <Stack gap={1.5}>
          <Skeleton variant="rounded" height={40} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </Stack>
      );
    }
    if (isError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          {`Failed to load context engines. ${engineMessage(error, '')}`.trim()}
        </Alert>
      );
    }
    if (!engines?.length) {
      return (
        <EmptyListing
          icon={<Waypoints size={48} />}
          title="No context engines"
          description="Create a context engine to give your integrations and agents grounded answers from your sources."
          showAction={canManage}
          actionLabel="Create Context Engine"
          onAction={goCreate}
        />
      );
    }
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
              filtered.map((e) => <EngineRow key={e.id} engine={e} onOpen={() => goDetail(e.id)} onPlayground={canManage ? () => goPlayground(e.id) : undefined} onDelete={canManage ? () => setToDelete(e) : undefined} />)
            )}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    );
  };

  return (
    <PageContent fullWidth>
      <PageTitle>
        <PageTitle.Header>Context Engines</PageTitle.Header>
        <PageTitle.SubHeader>Knowledge graphs built from your sources, for integrations and agents to query over API or MCP.</PageTitle.SubHeader>
        {!!engines?.length && canManage && (
          <PageTitle.Actions>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={goCreate} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              Create Context Engine
            </Button>
          </PageTitle.Actions>
        )}
      </PageTitle>

      {!!engines?.length && <SearchField value={search} onChange={setSearch} placeholder="Search context engines" width="standard" sx={searchSx} />}

      {deleteAlert && (
        <Alert severity="success" onClose={() => setDeleteAlert(null)} sx={{ mb: 2 }}>
          {deleteAlert}
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
