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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, ListingTable, MenuItem, PageTitle, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useConnections } from '../../hooks/useConnections';
import { useAccessControl } from '../../../contexts/AccessControlContext';
import { Permissions } from '../../../constants/permissions';
import { connectionTypeLabel } from '../../constants/connections';
import NoConnectionsBanner from './NoConnectionsBanner';
import DeleteConnectionDialog from './DeleteConnectionDialog';
import SearchField from '../../../components/SearchField';
import type { ConnectionListingRecord } from '../../../types/connections';

interface ConnectionsListViewProps {
  projectId: string;
  /** Component-scoped listing when set; otherwise project-scoped. */
  componentId?: string;
  /** URL base for connection actions, e.g. `/organizations/x/projects/y/admin/connections`. */
  base: string;
}

/** Shared connections listing (project + component scopes). Mirrors Devant's ConnectionsView. */
export default function ConnectionsListView({ projectId, componentId, base }: ConnectionsListViewProps): JSX.Element {
  const navigate = useAppNavigate();
  const { hasPermission } = useAccessControl();
  const canManage = hasPermission(Permissions.PROJECT_MANAGE, projectId);
  const { data: connections, isLoading, isFetching, isError, refetch } = useConnections({ projectId, componentId });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [toDelete, setToDelete] = useState<ConnectionListingRecord | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const goCreate = () => navigate(`${base}/new`);
  const goDetail = (groupUuid: string) => navigate(`${base}/${groupUuid}`);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    (connections ?? []).forEach((c) => set.add(connectionTypeLabel(c.resourceType)));
    return ['All', ...[...set].sort()];
  }, [connections]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (connections ?? []).filter((c) => {
      if (typeFilter !== 'All' && connectionTypeLabel(c.resourceType) !== typeFilter) return false;
      if (!q) return true;
      return [c.name, c.serviceName, c.description].some((f) => (f ?? '').toLowerCase().includes(q));
    });
  }, [connections, search, typeFilter]);

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Connections</PageTitle.Header>
        </PageTitle>
        {!!connections?.length && (
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Select size="small" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} sx={{ minWidth: 150 }} aria-label="Filter by type">
              {typeOptions.map((t) => (
                <MenuItem key={t} value={t}>
                  {t === 'All' ? 'All Types' : t}
                </MenuItem>
              ))}
            </Select>
            <SearchField value={search} onChange={setSearch} placeholder="Search connections..." sx={{ minWidth: 220 }} />
            {canManage && (
              <Button variant="contained" startIcon={<Plus size={20} />} onClick={goCreate} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                Create
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading || (isFetching && !connections?.length) ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
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
          Failed to load connections.
        </Alert>
      ) : !connections?.length ? (
        <NoConnectionsBanner onCreate={canManage ? goCreate : undefined} />
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Type</ListingTable.Cell>
                <ListingTable.Cell>Connecting To</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {filtered.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No connections match “{search}”.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                filtered.map((c) => (
                  <ListingTable.Row
                    key={c.groupUuid}
                    hover
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${c.name}`}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => goDetail(c.groupUuid)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goDetail(c.groupUuid);
                      }
                    }}>
                    <ListingTable.Cell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {c.name}
                      </Typography>
                      {c.isPartiallyCreated && <Chip label="Incomplete" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} />}
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Chip label={connectionTypeLabel(c.resourceType)} size="small" variant="outlined" />
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {c.serviceName || '—'}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {c.description || '—'}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      {canManage && (
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Delete ${c.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setToDelete(c);
                            }}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))
              )}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {toDelete && <DeleteConnectionDialog connection={toDelete} onClose={() => setToDelete(null)} onDeleted={(name) => setAlert({ type: 'success', message: `Connection '${name}' deleted.` })} onError={(message) => setAlert({ type: 'error', message })} />}
    </>
  );
}
