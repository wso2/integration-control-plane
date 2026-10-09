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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, ListingTable, PageContent, PageTitle, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useConfigGroups } from '../hooks/useConfigGroups';
import NoConfigGroupsBanner from '../components/ConfigGroups/NoConfigGroupsBanner';
import DeleteConfigGroupDialog from '../components/ConfigGroups/DeleteConfigGroupDialog';
import SearchField from '../../components/SearchField';
import type { ConfigGroup } from '../../types/configGroups';
import type { OrgScope } from '../../nav';

export default function OrgConfigGroups(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: groups, isLoading, isFetching, isError, refetch } = useConfigGroups();
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<ConfigGroup | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const base = `/organizations/${scope.org}/admin/config-groups`;
  const goCreate = () => navigate(`${base}/new`);
  const goEdit = (uuid: string) => navigate(`${base}/${uuid}`);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups ?? [];
    return (groups ?? []).filter((g) => [g.groupDisplayName, g.groupName, g.description].some((f) => (f ?? '').toLowerCase().includes(q)));
  }, [groups, search]);

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Configuration Groups</PageTitle.Header>
        </PageTitle>
        {!!groups?.length && (
          <Stack direction="row" alignItems="center" gap={1.5}>
            <SearchField value={search} onChange={setSearch} placeholder="Search groups..." sx={{ minWidth: 220 }} />
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

      {isLoading || (isFetching && !groups?.length) ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
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
          Failed to load configuration groups.
        </Alert>
      ) : !groups?.length ? (
        <NoConfigGroupsBanner onCreate={goCreate} />
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Handle</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell>Keys</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {filtered.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No configuration groups match “{search}”.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                filtered.map((g) => (
                  <ListingTable.Row
                    key={g.groupUuid}
                    hover
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${g.groupDisplayName || g.groupName}`}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => goEdit(g.groupUuid)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goEdit(g.groupUuid);
                      }
                    }}>
                    <ListingTable.Cell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {g.groupDisplayName || g.groupName}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {g.groupName}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {g.description || '—'}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Chip label={`${g.configurations?.length ?? 0}`} size="small" variant="outlined" />
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${g.groupDisplayName || g.groupName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setToDelete(g);
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
        <DeleteConfigGroupDialog group={toDelete} onClose={() => setToDelete(null)} onDeleted={(name) => setAlert({ type: 'success', message: `Configuration group '${name}' deleted.` })} onError={(message) => setAlert({ type: 'error', message })} />
      )}
    </PageContent>
  );
}
