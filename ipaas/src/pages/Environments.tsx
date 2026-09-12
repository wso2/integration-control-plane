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

import { Alert, Avatar, Box, Button, CircularProgress, IconButton, ListingTable, PageContent, PageTitle, Stack, TablePagination, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Clock, Layers, Plus, Trash2, AlertTriangle } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, useEffect, type JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { IS_CLOUD } from '../features';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { useDeleteEnvironmentTemplate, useEnvDeleteEligibility, useEnvironmentTemplates } from '../hooks/useEnvironments';
import { useOrgs } from '../hooks/useOrg';
import { useOrgUuid } from '../hooks/useOrgUuid';
import type { EnvironmentTemplate } from '../types/environment';
import EmptyListing from '../components/EmptyListing';
import SearchField from '../components/SearchField';
import { formatDistanceToNow } from '../utils/time';
import { newEnvironmentUrl, type OrgScope, type ProjectScope } from '../nav';
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

// Cloud cannot create environments, so the empty state describes them instead of
// pointing at an action that isn't there.
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
    const state = location.state as { success?: boolean; environmentName?: string } | null;
    if (state?.success && state.environmentName) {
      setAlert({ type: 'success', message: `Environment '${state.environmentName}' created successfully.` });
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
          {alert && (
            <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
              {alert.message}
            </Alert>
          )}
          <ListingTable.Container>
            <ListingTable.Toolbar
              searchSlot={<SearchField value={search} onChange={setSearch} />}
              actions={
                <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
                  <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => navigate(newEnvironmentUrl(scope))}>
                    Create
                  </Button>
                </Authorized>
              }
            />
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Name</ListingTable.Cell>
                  <ListingTable.Cell>Type</ListingTable.Cell>
                  {/* OpenChoreo derives no per-environment hostname, so cloud has no DNS prefix. */}
                  {!IS_CLOUD && <ListingTable.Cell>DNS Prefix</ListingTable.Cell>}
                  <ListingTable.Cell>Created</ListingTable.Cell>
                  <ListingTable.Cell align="right">Action</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {filtered.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={IS_CLOUD ? 4 : 5} align="center">
                      No records to display
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  paginated.map((t) => (
                    <ListingTable.Row key={t.id}>
                      <ListingTable.Cell>
                        <Stack direction="row" alignItems="center" gap={1.5}>
                          <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'action.hover', color: 'text.secondary' }}>{t.name[0]?.toUpperCase()}</Avatar>
                          {t.name}
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell>{t.critical ? 'Critical' : 'Non-Critical'}</ListingTable.Cell>
                      {!IS_CLOUD && <ListingTable.Cell>{t.dnsPrefix || '—'}</ListingTable.Cell>}
                      <ListingTable.Cell>
                        <Stack direction="row" alignItems="center" gap={0.5}>
                          <Clock size={14} />
                          {t.createdAt ? formatDistanceToNow(t.createdAt) : '—'}
                        </Stack>
                      </ListingTable.Cell>
                      <Authorized permissions={Permissions.ENVIRONMENT_MANAGE} fallback={<ListingTable.Cell align="right" />}>
                          <ListingTable.Cell align="right">
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                        </ListingTable.Cell>
                      </Authorized>
                    </ListingTable.Row>
                  ))
                )}
              </ListingTable.Body>
            </ListingTable>
            <TablePagination
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
              component="div"
              count={filtered.length}
              page={safePage}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </ListingTable.Container>
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
