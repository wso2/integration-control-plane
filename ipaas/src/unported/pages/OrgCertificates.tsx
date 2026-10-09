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

import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, PageContent, PageTitle, Select, MenuItem, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { Plus, Search, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCertificateGroups, useDeleteCertificate } from '../hooks/useCertificates';
import { certificateValidity, certificateTypeLabel } from '../utils/certificates';
import { orgNewCertificateUrl, orgCertificateUrl } from '../../paths';
import type { OrgScope } from '../../nav';
import type { ConfigGroup } from '../../types/configGroups';

export default function OrgCertificates(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: groups, isLoading, isError, refetch } = useCertificateGroups();
  const del = useDeleteCertificate();

  const [search, setSearch] = useState('');
  const [validity, setValidity] = useState('all');
  const [certToDelete, setCertToDelete] = useState<ConfigGroup | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filtered = useMemo(() => {
    if (!groups) return [];
    let result = groups;

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter((g) => (g.groupDisplayName ?? g.groupName).toLowerCase().includes(s));
    }

    if (validity !== 'all') {
      result = result.filter((g) => certificateValidity(g.properties?.notAfter).category === validity);
    }

    return result;
  }, [groups, search, validity]);

  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const handleDelete = () => {
    if (!certToDelete) return;
    del.mutate(certToDelete.groupUuid, {
      onSuccess: () => {
        setCertToDelete(null);
      },
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, cert: ConfigGroup) => {
    e.stopPropagation();
    del.reset();
    setCertToDelete(cert);
  };

  const closeDeleteDialog = () => {
    setCertToDelete(null);
    del.reset();
  };

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Certificates</PageTitle.Header>
        </PageTitle>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(orgNewCertificateUrl(scope.org))} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          Add Certificate
        </Button>
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search certificates"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          slotProps={{
            input: {
              startAdornment: <Search size={18} style={{ marginRight: 8, opacity: 0.5 }} />,
            },
          }}
          inputProps={{ 'aria-label': 'Search certificates' }}
          sx={{ minWidth: 220 }}
        />
        <Select
          size="small"
          value={validity}
          onChange={(e) => {
            setValidity(e.target.value);
            setPage(0);
          }}
          inputProps={{ 'aria-label': 'Filter by validity' }}
          sx={{ minWidth: 150 }}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="VALID">Valid</MenuItem>
          <MenuItem value="EXPIRING_SOON">Expiring Soon</MenuItem>
          <MenuItem value="EXPIRED">Expired</MenuItem>
        </Select>
      </Stack>

      {isLoading ? (
        <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          Failed to load certificates.
        </Alert>
      ) : !groups?.length ? (
        <Alert severity="info">
          <Typography variant="subtitle2">No certificates yet</Typography>
          <Typography variant="body2">Add a certificate to let your integrations trust external servers.</Typography>
        </Alert>
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Type</ListingTable.Cell>
                <ListingTable.Cell>Validity</ListingTable.Cell>
                <ListingTable.Cell>Created</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {filtered.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No certificates match your filters.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                paginated.map((g) => {
                  const v = certificateValidity(g.properties?.notAfter);
                  const name = g.groupDisplayName ?? g.groupName;
                  return (
                    <ListingTable.Row key={g.groupUuid} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(orgCertificateUrl(scope.org, g.groupUuid))}>
                      <ListingTable.Cell>
                        <Stack>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {name}
                          </Typography>
                          {g.description && (
                            <Typography variant="caption" color="text.secondary">
                              {g.description}
                            </Typography>
                          )}
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell>{certificateTypeLabel(g.properties?.certificateType)}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip size="small" variant="outlined" label={v.label} color={v.color} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>{g.createdAt ? new Date(g.createdAt).toLocaleDateString() : '—'}</ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" aria-label={`Delete ${name}`} onClick={(e) => handleDeleteClick(e, g)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  );
                })
              )}
            </ListingTable.Body>
          </ListingTable>
          {filtered.length > rowsPerPage && (
            <Stack direction="row" justifyContent="flex-end" sx={{ borderTop: '1px solid', borderColor: 'divider', p: 1 }}>
              <Stack direction="row" alignItems="center" gap={2}>
                <Select
                  size="small"
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setPage(0);
                  }}
                  sx={{ width: 80 }}>
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={25}>25</MenuItem>
                </Select>
                <Typography variant="body2" color="text.secondary">
                  {safePage * rowsPerPage + 1}–{Math.min((safePage + 1) * rowsPerPage, filtered.length)} of {filtered.length}
                </Typography>
                <Button size="small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  Previous
                </Button>
                <Button size="small" disabled={safePage >= maxPage} onClick={() => setPage(safePage + 1)}>
                  Next
                </Button>
              </Stack>
            </Stack>
          )}
        </ListingTable.Container>
      )}

      <Dialog open={!!certToDelete} onClose={closeDeleteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Delete certificate</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete <strong>{certToDelete?.groupDisplayName ?? certToDelete?.groupName}</strong>. Integrations that trust this certificate may fail to connect.
          </Typography>
          {del.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Failed to delete the certificate. It may be in use by a component.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} disabled={del.isPending}>
            Cancel
          </Button>
          <Button variant="contained" color="error" disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
