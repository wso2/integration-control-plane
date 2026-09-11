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

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  ListingTable,
  PageContent,
  PageTitle,
  Stack,
  TablePagination,
  Typography,
} from '@wso2/oxygen-ui';
import { FileText, Key, Plus, RefreshCw, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import CodeBoxWithCopy from '../components/CodeBoxWithCopy';
import SearchField from '../components/SearchField';
import { LogFilesDrawer } from '../components/LogFilesDrawer';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { gql } from '../api/graphql';
import { useProjectByHandler, useEnvironments, useComponentByHandler, useComponentSecrets, useRuntimesPage, COMPONENT_SECRETS_QUERY, type GqlRuntime, type GqlBoundSecret } from '../api/queries';
import { useCreateOrgSecret, useDeleteRuntime, useRevokeOrgSecret } from '../api/mutations';
import { hasComponent, type ProjectScope, type ComponentScope } from '../nav';
import { formatDistanceToNow } from '../utils/time';
import { runtimeImports } from '../utils/runtimeToml';
import Authorized from '../components/Authorized';
import { Permissions } from '../constants/permissions';
import { technologyLabel } from '../constants/technologies';
import { useAccessControl } from '../contexts/AccessControlContext';

const drawerSx = {
  '& .MuiDrawer-paper': { width: '45%', maxWidth: 560, minWidth: 360, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' },
};

function formatPlatform(r: GqlRuntime): string {
  if (!r.platformVersion) return r.platformName ?? '—';
  return /^\d/.test(r.platformVersion) ? `${r.platformName} ${r.platformVersion}` : r.platformVersion;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function miToml(envName: string, secret: string, projectHandle: string, integrationHandle: string): string {
  return `[icp_config]
enabled = true
environment = "${envName}"
project = "${projectHandle}"
integration = "${integrationHandle}"
runtime = "<unique id for the runtime>"
secret = "${secret}"
# icp_url = "https://<hostname>:9445"`;
}

function biToml(envName: string, secret: string, projectHandle: string, integrationHandle: string): string {
  // One snippet for every BI runtime; enableWorkflowManagement is the deployment's headless opt-out.
  return `[wso2.icp.runtime.bridge]
environment = "${envName}"
project = "${projectHandle}"
integration = "${integrationHandle}"
runtime = "<unique id for the runtime>"
secret = "${secret}"
# Set to false to run headless: heartbeats only, no workflow management from the ICP.
enableWorkflowManagement = true
# serverUrl = "https://<hostname>:9445"
# runtimeHostUrl = "http://<hostname>"`;
}

function AddRuntimeModal({
  environmentId,
  environmentName,
  componentId,
  componentType,
  projectHandle,
  integrationHandle,
  onClose,
}: {
  environmentId: string;
  environmentName: string;
  componentId: string;
  componentType?: string;
  projectHandle: string;
  integrationHandle: string;
  onClose: () => void;
}) {
  const createMutation = useCreateOrgSecret();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBI = componentType === 'BI';

  const handleGenerate = () => {
    setError(null);
    createMutation.mutate(
      { environmentId, componentId },
      {
        onSuccess: (s) => {
          setSecret(s);
          if (componentId) {
            queryClient.invalidateQueries({ queryKey: ['componentSecrets', componentId, environmentId] });
          }
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const config = secret ? (isBI ? biToml(environmentName, secret, projectHandle, integrationHandle) : miToml(environmentName, secret, projectHandle, integrationHandle)) : null;

  const handleDialogClose = (_event: unknown, reason: string) => {
    if (createMutation.isPending && (reason === 'backdropClick' || reason === 'escapeKeyDown')) return;
    onClose();
  };

  return (
    <Dialog open onClose={handleDialogClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Runtime for {environmentName}</DialogTitle>
      <DialogContent>
        {!secret ? (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <DialogContentText sx={{ mb: 2 }}>
              Generate a new secret for <strong>{environmentName}</strong> environment.
            </DialogContentText>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>The secret will be shown once — copy it before closing.</strong>
            </Alert>
            <Button variant="contained" onClick={handleGenerate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Generating...' : 'Generate Secret'}
            </Button>
          </>
        ) : (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Copy this secret now. It will not be shown again.
            </Alert>
            <DialogContentText sx={{ mb: 1 }}>
              Add the following configuration to your runtime's <strong>{isBI ? 'Config.toml' : 'deployment.toml'}</strong> file. Change the <strong>runtime</strong> value; it must be unique for each registered runtime.
            </DialogContentText>
            {config && <CodeBoxWithCopy code={config} />}
            {isBI && (
              <>
                <DialogContentText sx={{ mb: 1 }}>
                  Add the following configuration to your runtime's <strong>Ballerina.toml</strong> file:
                </DialogContentText>
                <CodeBoxWithCopy code={`[build-options]\nremoteManagement = true`} />
                <DialogContentText sx={{ mb: 1 }}>
                  Import wso2/icp.runtime.bridge in your runtime's <strong>main.bal</strong> file:
                </DialogContentText>
                <CodeBoxWithCopy code={runtimeImports()} />
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={createMutation.isPending}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BoundSecretDrawer({ componentId, environmentId, environmentName, onClose }: { componentId: string; environmentId: string; environmentName: string; onClose: () => void }) {
  const { data: secrets = [], isLoading } = useComponentSecrets(componentId, environmentId);
  const revokeMutation = useRevokeOrgSecret();
  const [revoking, setRevoking] = useState<string | null>(null);

  const confirmRevoke = (keyId: string) => {
    revokeMutation.mutate(keyId, { onSettled: () => setRevoking(null) });
  };

  return (
    <Drawer anchor="right" open variant="persistent" sx={drawerSx}>
      <Stack sx={{ p: 3, height: '100%', overflow: 'auto' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">
            Secrets: <strong>{environmentName}</strong> environment
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="close">
            <X size={18} />
          </IconButton>
        </Stack>
        <Divider sx={{ mb: 2 }} />

        {isLoading ? (
          <CircularProgress sx={{ mx: 'auto', my: 4 }} />
        ) : secrets.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No secrets for this integration in this environment.
          </Typography>
        ) : (
          <Box sx={{ width: '100%', overflowX: 'auto' }}>
            <ListingTable sx={{ width: '100%', tableLayout: 'fixed' }}>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell sx={{ width: '20%' }}>Key ID</ListingTable.Cell>
                  <ListingTable.Cell sx={{ width: '15%' }}>Created</ListingTable.Cell>
                  <ListingTable.Cell sx={{ width: '15%' }}>Created By</ListingTable.Cell>
                  <ListingTable.Cell sx={{ width: '40%' }}>Runtimes</ListingTable.Cell>
                  <ListingTable.Cell align="right" sx={{ width: '10%' }}>
                    Action
                  </ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {secrets.map((secret) => (
                  <ListingTable.Row key={secret.keyId}>
                    <ListingTable.Cell>
                      <code style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secret.keyId}....</code>
                    </ListingTable.Cell>
                    <ListingTable.Cell sx={{ whiteSpace: 'nowrap' }}>{formatDistanceToNow(secret.createdAt)}</ListingTable.Cell>
                    <ListingTable.Cell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secret.createdBy ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>
                      {secret.runtimes.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      ) : (
                        <Stack direction="row" gap={0.5} flexWrap="wrap">
                          {secret.runtimes.map((rt) => (
                            <Chip key={rt.runtimeId} label={rt.runtimeId} size="small" color={rt.status === 'RUNNING' ? 'success' : 'default'} />
                          ))}
                        </Stack>
                      )}
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      <IconButton size="small" color="error" aria-label={`Revoke ${secret.keyId}`} onClick={() => setRevoking(secret.keyId)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          </Box>
        )}
      </Stack>

      {revoking && (
        <Dialog open onClose={() => setRevoking(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Revoke Secret</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Revoke secret <strong>{revoking}....</strong>? Any runtime using this secret will no longer be able to authenticate.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="contained" color="error" disabled={revokeMutation.isPending} onClick={() => confirmRevoke(revoking)}>
              Revoke
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Drawer>
  );
}

function EnvironmentRuntimeCard({
  environmentName,
  environmentId,
  componentId,
  componentType,
  projectHandle,
  integrationHandle,
  projectId,
  onDelete,
  onViewLogs,
  autoOpenAddRuntime,
  onAutoOpenConsumed,
}: {
  environmentName: string;
  environmentId: string;
  componentId: string | undefined;
  componentType?: string;
  projectHandle: string;
  integrationHandle: string;
  projectId: string;
  onDelete: (runtime: GqlRuntime, envId: string) => void;
  onViewLogs: (runtime: GqlRuntime) => void;
  autoOpenAddRuntime?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { data, isLoading, isFetching: isRefreshing, refetch } = useRuntimesPage(environmentId, projectId, componentId, query ? 500 : rowsPerPage, query ? 0 : page * rowsPerPage);
  const runtimes = data?.items ?? [];
  const serverTotal = data?.pageInfo?.total ?? 0;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { hasAnyPermission } = useAccessControl();

  const filtered = runtimes.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (r.runtimeName || '').toLowerCase().includes(q) ||
      r.runtimeId.toLowerCase().includes(q) ||
      r.runtimeType.toLowerCase().includes(q) ||
      (r.component?.displayName ?? '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      (r.version || '').toLowerCase().includes(q) ||
      (r.platformName || '').toLowerCase().includes(q) ||
      (r.platformVersion || '').toLowerCase().includes(q) ||
      (r.osName || '').toLowerCase().includes(q) ||
      (r.osVersion || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!isLoading && serverTotal > 0 && filtered.length === 0 && page > 0) {
      setPage((p) => p - 1);
    }
  }, [filtered.length, serverTotal, page, isLoading]);

  useEffect(() => {
    if (!autoOpenAddRuntime || !componentId) return;
    if (!hasAnyPermission([Permissions.INTEGRATION_MANAGE], undefined, componentId)) return;
    setAddOpen(true);
    onAutoOpenConsumed?.();
  }, [autoOpenAddRuntime, componentId, hasAnyPermission, onAutoOpenConsumed]);

  // Sorting state: key = column, direction = 'asc' | 'desc'
  const [sort, setSort] = useState<{ key: keyof GqlRuntime | 'component' | 'registrationTime' | 'lastHeartbeat'; direction: 'asc' | 'desc' }>({ key: 'runtimeName', direction: 'asc' });

  // Sorting logic
  const sorted = [...filtered].sort((a, b) => {
    const { key, direction } = sort;
    let aValue: any = a[key as keyof GqlRuntime];
    let bValue: any = b[key as keyof GqlRuntime];
    if (key === 'component') {
      aValue = a.component?.displayName ?? '';
      bValue = b.component?.displayName ?? '';
    }
    if (key === 'registrationTime') {
      aValue = a.registrationTime;
      bValue = b.registrationTime;
    }
    if (key === 'lastHeartbeat') {
      aValue = a.lastHeartbeat;
      bValue = b.lastHeartbeat;
    }
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const cmp = aValue.localeCompare(bValue);
      return direction === 'asc' ? cmp : -cmp;
    }
    if (aValue instanceof Date && bValue instanceof Date) {
      return direction === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
    }
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction === 'asc' ? aValue - bValue : bValue - aValue;
    }
    // Fallback to string compare
    const cmp = String(aValue ?? '').localeCompare(String(bValue ?? ''));
    return direction === 'asc' ? cmp : -cmp;
  });

  const paged = query ? sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : sorted;
  const total = query ? filtered.length : serverTotal;

  return (
    <>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                {environmentName}
              </Typography>
              <Chip label={`${total} runtime${total !== 1 ? 's' : ''}`} size="small" color={total > 0 ? 'primary' : 'default'} />
            </Stack>
            <Stack direction="row" gap={1} alignItems="center">
              {componentId && (
                <Authorized permissions={[Permissions.INTEGRATION_MANAGE]}>
                  <Stack direction="row" gap={1}>
                    <Button variant="contained" size="small" startIcon={<Key size={14} />} onClick={() => setDrawerOpen(true)}>
                      Manage Secrets
                    </Button>
                    <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
                      Add Runtime
                    </Button>
                  </Stack>
                </Authorized>
              )}
              <IconButton size="small" aria-label={`Refresh runtimes for ${environmentName}`} onClick={() => refetch()} disabled={isRefreshing}>
                <RefreshCw size={16} />
              </IconButton>
            </Stack>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(0);
            }}
            placeholder="Search runtimes..."
            sx={{ mb: 2, width: '100%', maxWidth: 400 }}
          />
          {isLoading ? (
            <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
          ) : filtered.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {query ? 'No runtimes match your search.' : 'No runtimes registered for this environment.'}
            </Typography>
          ) : (
            <>
              <ListingTable>
                <ListingTable.Head>
                  <ListingTable.Row>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'runtimeName'}
                        direction={sort.key === 'runtimeName' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'runtimeName', direction: prev.key === 'runtimeName' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Runtime Name
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'runtimeId'}
                        direction={sort.key === 'runtimeId' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'runtimeId', direction: prev.key === 'runtimeId' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Runtime ID
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'runtimeType'}
                        direction={sort.key === 'runtimeType' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'runtimeType', direction: prev.key === 'runtimeType' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Type
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'status'}
                        direction={sort.key === 'status' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'status', direction: prev.key === 'status' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Status
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'version'}
                        direction={sort.key === 'version' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'version', direction: prev.key === 'version' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Version
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>Platform</ListingTable.Cell>
                    <ListingTable.Cell>OS</ListingTable.Cell>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'registrationTime'}
                        direction={sort.key === 'registrationTime' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'registrationTime', direction: prev.key === 'registrationTime' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Registration Time
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <ListingTable.SortLabel
                        active={sort.key === 'lastHeartbeat'}
                        direction={sort.key === 'lastHeartbeat' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'lastHeartbeat', direction: prev.key === 'lastHeartbeat' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Last Heartbeat
                      </ListingTable.SortLabel>
                    </ListingTable.Cell>
                    <ListingTable.Cell>Actions</ListingTable.Cell>
                  </ListingTable.Row>
                </ListingTable.Head>
                <ListingTable.Body>
                  {paged.map((r) => (
                    <ListingTable.Row key={r.runtimeId}>
                      <ListingTable.Cell>{r.runtimeName || r.runtimeId}</ListingTable.Cell>
                      <ListingTable.Cell>{r.runtimeId}</ListingTable.Cell>
                      <ListingTable.Cell>{technologyLabel(r.runtimeType)}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip label={r.status} size="small" color={r.status === 'RUNNING' ? 'success' : 'default'} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>{r.version || '—'}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2">{formatPlatform(r)}</Typography>
                        {r.platformHome && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {r.platformHome}
                          </Typography>
                        )}
                      </ListingTable.Cell>
                      <ListingTable.Cell>{[r.osName, r.osVersion].filter(Boolean).join(' ')}</ListingTable.Cell>
                      <ListingTable.Cell>{r.registrationTime ? formatDate(r.registrationTime) : '—'}</ListingTable.Cell>
                      <ListingTable.Cell>{r.lastHeartbeat ? formatDate(r.lastHeartbeat) : '—'}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Stack direction="row" gap={0.5}>
                          {r.runtimeType === 'MI' && (
                            <IconButton size="small" color="primary" aria-label={`View logs for ${r.runtimeId}`} disabled={r.status !== 'RUNNING'} onClick={() => onViewLogs(r)} title="View Logs">
                              <FileText size={16} />
                            </IconButton>
                          )}
                          <IconButton size="small" color="error" aria-label={`Delete runtime ${r.runtimeId}`} disabled={r.status === 'RUNNING'} onClick={() => onDelete(r, environmentId)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Stack>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  ))}
                </ListingTable.Body>
              </ListingTable>
              <TablePagination
                sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1 }}
                component="div"
                count={total}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25]}
              />
            </>
          )}
        </CardContent>
      </Card>

      {drawerOpen && componentId && <BoundSecretDrawer componentId={componentId} environmentId={environmentId} environmentName={environmentName} onClose={() => setDrawerOpen(false)} />}
      {addOpen && componentId && (
        <AddRuntimeModal environmentId={environmentId} environmentName={environmentName} componentId={componentId} componentType={componentType} projectHandle={projectHandle} integrationHandle={integrationHandle} onClose={() => setAddOpen(false)} />
      )}
    </>
  );
}

function isSoleUser(secrets: GqlBoundSecret[], runtimeId: string): string | null {
  for (const s of secrets) {
    if (s.runtimes.length === 1 && s.runtimes[0].runtimeId === runtimeId) return s.keyId;
  }
  return null;
}

export default function Runtime(scope: ProjectScope | ComponentScope): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: project } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const projectHandle = project?.handler ?? scope.project;
  const { data: component } = useComponentByHandler(projectId, hasComponent(scope) ? scope.component : undefined);
  const componentId = component?.id;
  const integrationHandle = component?.handler || (hasComponent(scope) ? scope.component : '');
  const { data: environments = [] } = useEnvironments(projectId);
  const [deleting, setDeleting] = useState<GqlRuntime | null>(null);
  const [deletingEnvId, setDeletingEnvId] = useState<string | null>(null);
  const [alsoRevoke, setAlsoRevoke] = useState(false);
  const [viewingLogs, setViewingLogs] = useState<GqlRuntime | null>(null);
  const deleteMutation = useDeleteRuntime();
  const params = new URLSearchParams(location.search);
  const shouldAutoOpenAddRuntime = params.get('action') === 'add-runtime';
  const autoOpenEnvironmentId = params.get('environmentId');

  const clearAutoOpenAction = useCallback(() => {
    if (!shouldAutoOpenAddRuntime) return;
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('action');
    nextParams.delete('environmentId');
    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, shouldAutoOpenAddRuntime]);

  const secretQueries = useQueries({
    queries: environments.map((env) => ({
      queryKey: ['componentSecrets', componentId ?? '', env.id],
      queryFn: () => gql<{ componentSecrets: { items: GqlBoundSecret[] } }>(COMPONENT_SECRETS_QUERY, { componentId, environmentId: env.id }).then((d) => d.componentSecrets.items),
      enabled: !!componentId,
    })),
  });

  const deletingEnvIndex = deletingEnvId ? environments.findIndex((e) => e.id === deletingEnvId) : -1;
  const deletingEnvSecrets = deletingEnvIndex >= 0 ? (secretQueries[deletingEnvIndex]?.data ?? []) : [];
  const orphanedKeyId = deleting ? isSoleUser(deletingEnvSecrets, deleting.runtimeId) : null;

  const handleStartDelete = (r: GqlRuntime, envId: string) => {
    setDeleting(r);
    setDeletingEnvId(envId);
    setAlsoRevoke(false);
  };

  const handleConfirmDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate(
      { runtimeId: deleting.runtimeId, revokeSecret: alsoRevoke || undefined },
      {
        onSuccess: () => {
          setDeleting(null);
          setDeletingEnvId(null);
          setAlsoRevoke(false);
        },
      },
    );
  };

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Runtime</PageTitle.Header>
      </PageTitle>

      {environments.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 8, textAlign: 'center' }}>
          No environments found. Create an environment to register runtimes.
        </Typography>
      ) : (
        environments.map((env, index) => (
          <EnvironmentRuntimeCard
            key={env.id}
            environmentName={env.handler}
            environmentId={env.id}
            componentId={componentId}
            componentType={component?.componentType}
            projectHandle={projectHandle}
            integrationHandle={integrationHandle}
            projectId={projectId}
            onDelete={handleStartDelete}
            onViewLogs={setViewingLogs}
            autoOpenAddRuntime={shouldAutoOpenAddRuntime && (autoOpenEnvironmentId ? env.id === autoOpenEnvironmentId : index === 0)}
            onAutoOpenConsumed={clearAutoOpenAction}
          />
        ))
      )}

      {viewingLogs && <LogFilesDrawer runtimeId={viewingLogs.runtimeId} onClose={() => setViewingLogs(null)} />}

      {deleting && (
        <Dialog
          open
          onClose={() => {
            setDeleting(null);
            setDeletingEnvId(null);
          }}
          maxWidth="sm"
          fullWidth>
          <DialogTitle>Delete Runtime</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete runtime <strong>{deleting.runtimeId}</strong>?
            </DialogContentText>
            {orphanedKeyId && (
              <FormControlLabel
                sx={{ mt: 1 }}
                control={<Checkbox checked={alsoRevoke} onChange={(_, v) => setAlsoRevoke(v)} />}
                label={
                  <Typography variant="body2">
                    Also revoke secret <code>{orphanedKeyId}....</code> (no other runtimes use it)
                  </Typography>
                }
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setDeleting(null);
                setDeletingEnvId(null);
              }}>
              Cancel
            </Button>
            <Button variant="contained" color="error" disabled={deleteMutation.isPending} onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
