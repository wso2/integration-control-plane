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

import { Alert, Box, Button, CircularProgress, IconButton, ListingTable, PageContent, PageTitle, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Play, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { isContextEngineEnabled, useContextEngines, useDeleteContextEngine } from '../hooks/useContextEngine';
import { contextEngineUrl, newContextEngineUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import SearchField from '../components/SearchField';
import EngineStateChip from '../components/ContextEngine/EngineStateChip';
import ExposurePills from '../components/ContextEngine/ExposurePills';
import GraphStatusChip from '../components/ContextEngine/GraphStatusChip';
import SourceMark from '../components/ContextEngine/SourceMark';
import { listMarksSx } from '../components/ContextEngine/styles';
import NoContextEnginesBanner from '../components/ContextEngine/NoContextEnginesBanner';
import type { ContextEngine } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const centeredSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' } as const;
const tableContainerSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;

/** At most this many connector marks per row; the count covers the rest. */
const MAX_MARKS = 4;

export default function OrgContextEngines(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: engines, isLoading, isFetching, isError, error, refetch } = useContextEngines();
  const remove = useDeleteContextEngine();
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<ContextEngine | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const goCreate = () => navigate(newContextEngineUrl(scope.org));
  const goDetail = (id: string) => navigate(contextEngineUrl(scope.org, id));
  const goPlayground = (id: string) => navigate(contextEngineUrl(scope.org, id, 'playground'));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return engines ?? [];
    return (engines ?? []).filter((e) => [e.name, e.description, e.id].some((f) => f.toLowerCase().includes(q)));
  }, [engines, search]);

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  const confirmDelete = () => {
    if (!toDelete) return;
    const name = toDelete.name;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        setToDelete(null);
        setAlert({ type: 'success', message: `Deleting “${name}”.` });
      },
      onError: (e) => {
        setToDelete(null);
        setAlert({ type: 'error', message: e instanceof HttpError && (e.status === 404 || e.status === 405) ? 'This engine does not support deletion yet.' : `Couldn't delete “${name}”. Please try again.` });
      },
    });
  };

  const loadErrorMessage = error instanceof HttpError && error.status === 401 ? 'The context engine rejected the credential. Check the engine token in runtime config.' : 'Failed to load context engines. Is the engine running?';

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Context Engines</PageTitle.Header>
        </PageTitle>
        {!!engines?.length && (
          <Stack direction="row" alignItems="center" gap={1.5}>
            <SearchField value={search} onChange={setSearch} placeholder="Search engines..." sx={{ minWidth: 220 }} />
            <Button variant="contained" startIcon={<Plus size={20} />} onClick={goCreate} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Create
            </Button>
          </Stack>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading || (isFetching && !engines?.length) ? (
        <Box sx={centeredSx}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          {loadErrorMessage}
        </Alert>
      ) : !engines?.length ? (
        <NoContextEnginesBanner onCreate={goCreate} />
      ) : (
        <ListingTable.Container elevation={0} sx={tableContainerSx}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Sources</ListingTable.Cell>
                <ListingTable.Cell>Who can query</ListingTable.Cell>
                <ListingTable.Cell>Exposure</ListingTable.Cell>
                <ListingTable.Cell>Graph</ListingTable.Cell>
                <ListingTable.Cell>State</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {filtered.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No context engines match “{search}”.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                filtered.map((e) => (
                  <ListingTable.Row
                    key={e.id}
                    hover
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${e.name}`}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => goDetail(e.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        goDetail(e.id);
                      }
                    }}>
                    <ListingTable.Cell sx={{ maxWidth: 360 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {e.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {e.description || 'No description'}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      {e.summary ? (
                        <Box sx={listMarksSx}>
                          {e.summary.sourceTypes.slice(0, MAX_MARKS).map((t, i) => (
                            <SourceMark key={`${t}-${i}`} type={t} size={16} />
                          ))}
                          <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                            {e.summary.sourceCount}
                          </Typography>
                        </Box>
                      ) : (
                        '—'
                      )}
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2">{e.summary ? (e.summary.roleCount === 0 ? 'Only you' : `${e.summary.roleCount} role${e.summary.roleCount === 1 ? '' : 's'}`) : '—'}</Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>{e.summary ? <ExposurePills exposure={e.summary.exposure} /> : '—'}</ListingTable.Cell>
                    <ListingTable.Cell>{e.summary ? <GraphStatusChip graph={e.summary.graph} /> : '—'}</ListingTable.Cell>
                    <ListingTable.Cell>
                      <EngineStateChip state={e.state} />
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      <Tooltip title="Open playground">
                        <IconButton
                          size="small"
                          aria-label={`Open playground for ${e.name}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            goPlayground(e.id);
                          }}>
                          <Play size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${e.name}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setToDelete(e);
                          }}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))
              )}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {toDelete && (
        <ConfirmDeleteDialog
          title={
            <>
              Delete <strong>{toDelete.name}</strong>?
            </>
          }
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
          isPending={remove.isPending}>
          <Typography variant="body2" color="text.secondary">
            The context graph, its sources and every grant on this engine will be removed. Integrations and agents calling its API or MCP endpoint will stop receiving answers.
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </PageContent>
  );
}
