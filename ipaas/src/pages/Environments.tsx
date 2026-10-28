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
import { CARD_TABLE_SX } from '../constants/styles';
import SearchField from '../components/SearchField';
import TextField from '../components/common/TextField';
import { Layers, Plus, Trash2, AlertTriangle } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, useEffect, type JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { useDeleteEnvironmentTemplate, useEnvDeleteEligibility, useEnvironmentTemplates } from '../hooks/useEnvironments';
import { useOrgs } from '../hooks/useOrg';
import { useOrgUuid } from '../hooks/useOrgUuid';
import type { EnvironmentTemplate } from '../types/environment';
import EmptyListing from '../components/EmptyListing';
import { formatDistanceToNow } from '../utils/time';
import { editEnvironmentUrl, newEnvironmentUrl, type OrgScope, type ProjectScope } from '../nav';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Permissions } from '../constants/permissions';
import Authorized from '../components/Authorized';

function formatDeleteError(error: Error): string {
  const message = (error?.message ?? '').toLowerCase();
  if (message.includes('deployed') || message.includes('in use') || message.includes('referenced') || message.includes('active')) {
    return 'This environment cannot be deleted while it has deployed integrations.';
  }
  return 'Failed to delete environment. Please try again.';
}

function DeleteDialog({ template, orgUuid, onClose, onSuccess, onError }: { template: EnvironmentTemplate; orgUuid: string; onClose: () => void; onSuccess: (name: string) => void; onError: (error: Error) => void }) {
  const [confirm, setConfirm] = useState('');
  const eligibility = useEnvDeleteEligibility(orgUuid, template.id);
  const mutation = useDeleteEnvironmentTemplate();

  const deployedProjects = eligibility.data?.deployedComponentsDetails ?? [];
  const hasDeployments = deployedProjects.some((p) => (p.components?.length ?? 0) > 0);

  const doDelete = () =>
    mutation.mutate(
      { orgUuid, templateId: template.id },
      {
        onSuccess: () => {
          onClose();
          onSuccess(template.name);
        },
        onError: (error) => {
          onClose();
          onError(error);
        },
      },
    );

  return (
    <ConfirmDeleteDialog
      title={<>Are you sure you want to delete the environment '{template.name}'?</>}
      onConfirm={doDelete}
      onClose={onClose}
      isPending={mutation.isPending}
      confirmDisabled={confirm !== template.name || eligibility.isLoading || hasDeployments}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This action is irreversible and will permanently remove all active integrations from this environment (including other configurations and data associated with this environment).
      </Typography>
      <Alert severity="warning" icon={<AlertTriangle size={20} />} sx={{ mb: 2 }}>
        Deleting the environment will remove control plane data and may cause data inconsistencies.
      </Alert>
      {eligibility.isLoading && <CircularProgress size={18} sx={{ mb: 2 }} />}
      {hasDeployments && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            This environment still has deployed integrations:
          </Typography>
          {deployedProjects.map((p) => (
            <Typography key={p.projectId ?? p.projectName} variant="caption" sx={{ display: 'block' }}>
              {p.projectName}:{' '}
              {(p.components ?? [])
                .map((c) => c.componentName)
                .filter(Boolean)
                .join(', ')}
            </Typography>
          ))}
        </Alert>
      )}
      <Typography variant="body2" sx={{ mb: 1 }}>
        Type the environment name to confirm
      </Typography>
      <TextField placeholder="Enter environment name" value={confirm} onChange={(e) => setConfirm(e.target.value)} fullWidth />
    </ConfirmDeleteDialog>
  );
}

const EMPTY_DESCRIPTION = 'Create your first environment to get started';

export default function Environments(scope: OrgScope | ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation();
  const { hasOrgPermission } = useAccessControl();
  const canManageEnv = hasOrgPermission(Permissions.ENVIRONMENT_MANAGE);

  const { data: orgs } = useOrgs();
  const org = orgs?.find((o) => o.handle === scope.org);
  const tokenOrgUuid = useOrgUuid();
  const orgUuid = org?.uuid ?? tokenOrgUuid ?? '';
  // The environment-templates endpoint is keyed by the numeric org id (e.g. 8740),
  // unlike the uuid-keyed create/delete endpoints.
  const orgId = org?.numericId ? String(org.numericId) : '';
  const { data: templates, isLoading, isError, refetch } = useEnvironmentTemplates(orgId);

  const [deleting, setDeleting] = useState<EnvironmentTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const state = location.state as { success?: boolean; environmentName?: string; updated?: boolean; name?: string } | null;
    if (state?.success && state.environmentName) {
      setAlert({ type: 'success', message: `Environment '${state.environmentName}' created successfully.` });
      navigate(location.pathname, { replace: true, state: null });
    } else if (state?.updated && state.name) {
      setAlert({ type: 'success', message: `Environment '${state.name}' updated successfully.` });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (!search.trim()) return templates;
    const s = search.trim().toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(s));
  }, [templates, search]);

  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Environments</PageTitle.Header>
        <PageTitle.SubHeader>Deployment targets for integrations, shared by every project in this organization.</PageTitle.SubHeader>
      </PageTitle>

      {isLoading ? (
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
          Failed to load environments.
        </Alert>
      ) : !templates?.length ? (
        <EmptyListing icon={<Layers size={48} />} title="No environments found" description={EMPTY_DESCRIPTION} showAction={canManageEnv} actionLabel="Create Environment" onAction={() => navigate(newEnvironmentUrl(scope))} />
      ) : (
        <>
          <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 3 }}>
            <SearchField value={search} onChange={setSearch} placeholder="Search environments..." fullWidth />
            <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(newEnvironmentUrl(scope))} sx={{ whiteSpace: 'nowrap', flexShrink: 0, px: 2.5 }}>
                Create Environment
              </Button>
            </Authorized>
          </Stack>
          {alert && (
            <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 3 }}>
              {alert.message}
            </Alert>
          )}
          {filtered.length === 0 ? (
            <EmptyListing icon={<Layers size={48} />} title="No environments found" description="Try adjusting your search" showAction={false} />
          ) : (
            <>
              <ListingTable.Container disablePaper>
                <ListingTable variant="card" density="compact" sx={CARD_TABLE_SX}>
                  <ListingTable.Head>
                    <ListingTable.Row>
                      <ListingTable.Cell width={300}>Environment</ListingTable.Cell>
                      <ListingTable.Cell>Type</ListingTable.Cell>
                      <ListingTable.Cell>Created</ListingTable.Cell>
                      {canManageEnv && <ListingTable.Cell width={100}>Actions</ListingTable.Cell>}
                    </ListingTable.Row>
                  </ListingTable.Head>
                  <ListingTable.Body>
                    {paginated.map((t) => (
                      <ListingTable.Row key={t.id} variant="card" hover={canManageEnv} clickable={canManageEnv} onClick={canManageEnv ? () => navigate(editEnvironmentUrl(scope, t.id)) : undefined}>
                        <ListingTable.Cell>
                          <Typography variant="body2" fontWeight={600}>
                            {t.name}
                          </Typography>
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Chip size="small" variant="outlined" color={t.critical ? 'error' : 'default'} label={t.critical ? 'Critical' : 'Non-Critical'} />
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Typography variant="body2" color="text.secondary">
                            {t.createdAt ? formatDistanceToNow(t.createdAt) : '—'}
                          </Typography>
                        </ListingTable.Cell>
                        {canManageEnv && (
                          <ListingTable.Cell>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete ${t.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleting(t);
                                }}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          </ListingTable.Cell>
                        )}
                      </ListingTable.Row>
                    ))}
                  </ListingTable.Body>
                </ListingTable>
              </ListingTable.Container>
              {filtered.length > 10 && (
                <TablePagination
                  component="div"
                  count={filtered.length}
                  page={safePage}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setRowsPerPage(parseInt(e.target.value, 10));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[10, 20, 50]}
                  sx={{ mt: 2 }}
                />
              )}
            </>
          )}
        </>
      )}

      {deleting && (
        <DeleteDialog
          template={deleting}
          orgUuid={orgUuid}
          onClose={() => setDeleting(null)}
          onSuccess={(name) => setAlert({ type: 'success', message: `Environment '${name}' deleted successfully.` })}
          onError={(error) => setAlert({ type: 'error', message: formatDeleteError(error) })}
        />
      )}
    </PageContent>
  );
}
