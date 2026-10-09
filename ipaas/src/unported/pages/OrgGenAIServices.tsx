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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, ListingTable, PageContent, PageTitle, Stack, TablePagination, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDeleteGenaiService, useGenaiServices } from '../hooks/useGenaiServices';
import { useProjectId } from '../../hooks/useProjects';
import { GENAI_DEFAULT_PAGE_SIZE, GENAI_PAGE_SIZE_OPTIONS, marketplaceStatusLabel } from '../../constants/genaiServices';
import { formatServiceCreatedTime, genaiServicesBase } from '../utils/genaiServices';
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog';
import NoServicesBanner from '../components/ServiceCatalog/NoServicesBanner';
import SearchField from '../../components/SearchField';
import { hasProject, type OrgScope, type ProjectScope } from '../../nav';
import type { GenAiService } from '../../types/genaiServices';

export default function OrgGenAIServices(scope: OrgScope | ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const projectHandle = hasProject(scope) ? scope.project : undefined;
  const { projectId, isLoading: resolvingProject } = useProjectId(projectHandle ?? '');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(GENAI_DEFAULT_PAGE_SIZE);
  const [toDelete, setToDelete] = useState<GenAiService | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Project scope waits for a resolved (non-empty) project id so we never fall back to org-wide data.
  const { data, isLoading, isFetching, isError, refetch } = useGenaiServices({ query: debouncedSearch, offset: page * rowsPerPage, limit: rowsPerPage, projectId: projectHandle ? projectId : undefined }, !resolvingProject && (!projectHandle || !!projectId));
  const del = useDeleteGenaiService();

  const services = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const hasAny = total > 0 || services.length > 0;

  const base = genaiServicesBase(scope);
  const goCreate = () => navigate(`${base}/new`);
  const goDetail = (serviceId: string) => navigate(`${base}/${serviceId}`);

  const doDelete = () => {
    if (!toDelete) return;
    const name = toDelete.name;
    del.mutate(toDelete.serviceId, {
      onSuccess: () => {
        setToDelete(null);
        setAlert({ type: 'success', message: `GenAI service '${name}' deleted.` });
      },
      onError: (e) => {
        setToDelete(null);
        setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Failed to delete the GenAI service.' });
      },
    });
  };

  const showSearchAndCreate = hasAny || debouncedSearch !== '';

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>GenAI Services</PageTitle.Header>
        </PageTitle>
        {showSearchAndCreate && (
          <Stack direction="row" alignItems="center" gap={1.5}>
            <SearchField value={search} onChange={setSearch} placeholder="Search services..." sx={{ minWidth: 220 }} />
            <Button variant="contained" startIcon={<Plus size={20} />} onClick={goCreate} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Register Service
            </Button>
          </Stack>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {resolvingProject || isLoading || (isFetching && !data) ? (
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
          Failed to load GenAI services.
        </Alert>
      ) : !hasAny && debouncedSearch === '' ? (
        <NoServicesBanner
          title="Bring your own AI models"
          description="Register GenAI services from providers like OpenAI, Azure OpenAI, Mistral AI, and Anthropic AI, then share their connections across your integrations."
          bannerSrc={`${import.meta.env.BASE_URL}assets/images/genai-services-banner.svg`}
          onCreate={goCreate}
        />
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Version</ListingTable.Cell>
                <ListingTable.Cell>Type</ListingTable.Cell>
                <ListingTable.Cell>Marketplace Status</ListingTable.Cell>
                <ListingTable.Cell>Created</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {services.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No GenAI services match “{debouncedSearch}”.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                services.map((s) => {
                  const available = marketplaceStatusLabel(s.status) === 'Available';
                  return (
                    <ListingTable.Row
                      key={s.serviceId}
                      hover
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${s.name}`}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => goDetail(s.serviceId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goDetail(s.serviceId);
                        }
                      }}>
                      <ListingTable.Cell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {s.name}
                        </Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2" color="text.secondary">
                          {s.version}
                        </Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2" color="text.secondary">
                          {s.serviceType}
                        </Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip label={marketplaceStatusLabel(s.status)} size="small" color={available ? 'success' : 'default'} variant="outlined" />
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2" color="text.secondary">
                          {formatServiceCreatedTime(s.createdTime)}
                        </Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Delete ${s.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setToDelete(s);
                            }}>
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
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={GENAI_PAGE_SIZE_OPTIONS}
          />
        </ListingTable.Container>
      )}

      {toDelete && (
        <ConfirmDeleteDialog
          title={
            <>
              Delete <strong>‘{toDelete.name}’</strong>?
            </>
          }
          onConfirm={doDelete}
          onClose={() => setToDelete(null)}
          isPending={del.isPending}>
          <Typography variant="body2" color="text.secondary">
            This permanently removes the GenAI service and its connection configurations. This action can’t be undone.
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </PageContent>
  );
}
