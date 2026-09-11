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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  ListingTable,
  PageContent,
  PageTitle,
  Stack,
  Tab,
  TablePagination,
  Tabs,
  Typography,
} from '@wso2/oxygen-ui';
import { FileText, Key, Plus, RefreshCw, Server, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import CodeBoxWithCopy from '../components/CodeBoxWithCopy';
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { JSX } from 'react';
import { useAllEnvironments, useOrgSecrets, useOrgRuntimesPage, type GqlEnvironment, type GqlRuntime } from '../api/queries';
import { useCreateOrgSecret, useDeleteRuntime, useRevokeOrgSecret } from '../api/mutations';
import { formatDistanceToNow } from '../utils/time';
import SearchField from '../components/SearchField';
import { LogFilesDrawer } from '../components/LogFilesDrawer';
import EmptyListing from '../components/EmptyListing';
import Authorized from '../components/Authorized';
import { Permissions } from '../constants/permissions';
import { technologyLabel } from '../constants/technologies';
import { useAccessControl } from '../contexts/AccessControlContext';
import type { OrgScope } from '../nav';
import { runtimeImports } from '../utils/runtimeToml';

const drawerSx = {
  '& .MuiDrawer-paper': { width: '45%', maxWidth: 560, minWidth: 360, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' },
};

function SecretDrawer({ env, onClose }: { env: GqlEnvironment; onClose: () => void }) {
  const { data: allSecrets = [], isLoading } = useOrgSecrets(env.id);
  const revokeMutation = useRevokeOrgSecret();
  const [revoking, setRevoking] = useState<string | null>(null);

  const unboundSecrets = allSecrets.filter((s) => !s.bound);

  const confirmRevoke = (keyId: string) => {
    revokeMutation.mutate(keyId, { onSettled: () => setRevoking(null) });
  };

  return (
    <Drawer anchor="right" open variant="persistent" sx={drawerSx}>
      <Stack sx={{ p: 3, height: '100%', overflow: 'auto' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">
            Secrets: <strong>{env.name}</strong> environment
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="close">
            <X size={18} />
          </IconButton>
        </Stack>
        <Divider sx={{ mb: 2 }} />

        {isLoading ? (
          <CircularProgress sx={{ mx: 'auto', my: 4 }} />
        ) : unboundSecrets.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No unbound secrets for this environment.
          </Typography>
        ) : (
          <Box sx={{ width: '100%', overflowX: 'auto' }}>
            <ListingTable sx={{ width: '100%', tableLayout: 'fixed' }}>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell sx={{ width: '30%' }}>Key ID</ListingTable.Cell>
                  <ListingTable.Cell sx={{ width: '25%' }}>Created</ListingTable.Cell>
                  <ListingTable.Cell sx={{ width: '30%' }}>Created By</ListingTable.Cell>
                  <ListingTable.Cell align="right" sx={{ width: '15%' }}>
                    Action
                  </ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {unboundSecrets.map((secret) => (
                  <ListingTable.Row key={secret.keyId}>
                    <ListingTable.Cell>
                      <code style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secret.keyId}....</code>
                    </ListingTable.Cell>
                    <ListingTable.Cell sx={{ whiteSpace: 'nowrap' }}>{formatDistanceToNow(secret.createdAt)}</ListingTable.Cell>
                    <ListingTable.Cell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secret.createdBy ?? '—'}</ListingTable.Cell>
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

function miToml(envName: string, secret: string): string {
  return `[icp_config]
enabled = true
environment = "${envName}"
project = "<project name>"
integration = "<integration name>"
runtime = "<unique id for the runtime>"
secret = "${secret}"
#icp_url = "https://<hostname>:9445"`;
}

// This dialog is org-scoped: the project and integration are fill-in placeholders.
function biToml(envName: string, secret: string): string {
  return `[wso2.icp.runtime.bridge]
environment = "${envName}"
project = "<project name>"
integration = "<integration name>"
runtime = "<unique id for the runtime>"
secret = "${secret}"
# Set to false to run headless: heartbeats only, no workflow management from the ICP.
enableWorkflowManagement = true
#serverUrl="https://<hostname>:9445"`;
}

function AddRuntimeModal({ env, onClose }: { env: GqlEnvironment; onClose: () => void }) {
  const createMutation = useCreateOrgSecret();
  const [secret, setSecret] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    createMutation.mutate(
      { environmentId: env.id },
      {
        onSuccess: (s) => setSecret(s),
        onError: (e) => setError(e.message),
      },
    );
  };

  const config = secret ? (tab === 0 ? biToml(env.handler, secret) : miToml(env.handler, secret)) : null;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Runtime: {env.name} environment</DialogTitle>
      <DialogContent>
        {!secret ? (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <DialogContentText sx={{ mb: 2 }}>
              Generate a new secret for <strong>{env.name}</strong> environment.
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
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab label="Default" />
              <Tab label="MI" />
            </Tabs>
            <DialogContentText sx={{ mb: 1 }}>
              Add the following configuration to your runtime's <strong>{tab === 0 ? 'Config.toml' : 'deployment.toml'}</strong> file. Change the <strong>project, integration and runtime</strong> values as needed. The runtime value must be unique for each
              runtime you register.
            </DialogContentText>
            {config && <CodeBoxWithCopy code={config} />}
            {tab === 0 && (
              <>
                <DialogContentText sx={{ mb: 1 }}>
                  Add the following configuration to your runtime's <strong>Ballerina.toml</strong> file:
                </DialogContentText>
                <CodeBoxWithCopy code={`[build-options]\nremoteManagement = true`} />
                <DialogContentText sx={{ mb: 1 }}>
                  Import wso2/icp.runtime.bridge in your runtime's <strong>main.bal</strong> file:
                </DialogContentText>
                <CodeBoxWithCopy code={runtimeImports()} />
                <Alert severity="info" sx={{ mt: 2 }}>
                  The above configuration is for runtimes using the <strong>Default</strong> integration. If you're using the <strong>MI</strong> integration, switch to the MI tab to see the correct configuration.
                </Alert>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function formatPlatform(r: GqlRuntime): string {
  if (!r.platformVersion) return r.platformName ?? '—';
  return /^\d/.test(r.platformVersion) ? `${r.platformName} ${r.platformVersion}` : r.platformVersion;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function EnvironmentRuntimeCard({
  env,
  onDelete,
  onViewLogs,
  autoOpenAddRuntime,
  onAutoOpenConsumed,
}: {
  env: GqlEnvironment;
  onDelete: (r: GqlRuntime) => void;
  onViewLogs: (r: GqlRuntime) => void;
  autoOpenAddRuntime?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  // Sorting state: key = column, direction = 'asc' | 'desc'
  const [sort, setSort] = useState<{ key: keyof GqlRuntime; direction: 'asc' | 'desc' }>({ key: 'runtimeName', direction: 'asc' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { hasAnyPermission } = useAccessControl();
  const { data, isLoading, isFetching: isRefreshing, refetch } = useOrgRuntimesPage(env.id, query ? 500 : rowsPerPage, query ? 0 : page * rowsPerPage);
  const runtimes = data?.items ?? [];
  const serverTotal = data?.pageInfo?.total ?? 0;

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
    if (!autoOpenAddRuntime) return;
    if (!hasAnyPermission([Permissions.ENVIRONMENT_MANAGE, Permissions.ENVIRONMENT_MANAGE_NONPROD])) return;
    setAddOpen(true);
    onAutoOpenConsumed?.();
  }, [autoOpenAddRuntime, hasAnyPermission, onAutoOpenConsumed]);

  // Sorting logic
  const sorted = [...filtered].sort((a, b) => {
    const { key, direction } = sort;
    let aValue = a[key];
    let bValue = b[key];
    // Special handling for nested or formatted fields
    if (key === 'component') {
      aValue = a.component?.displayName ?? '';
      bValue = b.component?.displayName ?? '';
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
                {env.name}
              </Typography>
              <Chip label={`${total} runtime${total !== 1 ? 's' : ''}`} size="small" color={total > 0 ? 'primary' : 'default'} />
            </Stack>
            <Stack direction="row" gap={1} alignItems="center">
              <Authorized permissions={[Permissions.ENVIRONMENT_MANAGE, Permissions.ENVIRONMENT_MANAGE_NONPROD]}>
                <Stack direction="row" gap={1}>
                  <Button variant="contained" size="small" startIcon={<Key size={14} />} onClick={() => setDrawerOpen(true)}>
                    Manage Secrets
                  </Button>
                  <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
                    Add Runtime
                  </Button>
                </Stack>
              </Authorized>
              <IconButton size="small" aria-label={`Refresh runtimes for ${env.name}`} onClick={() => refetch()} disabled={isRefreshing}>
                <RefreshCw size={16} />
              </IconButton>
            </Stack>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ mb: 2, width: '100%', maxWidth: 400 }}>
            <SearchField
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder="Search runtimes..."
              fullWidth
            />
          </Box>
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
                        active={sort.key === 'component'}
                        direction={sort.key === 'component' ? sort.direction : 'asc'}
                        onClick={() => setSort((prev) => ({ key: 'component', direction: prev.key === 'component' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                        Component
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
                      <ListingTable.Cell>{r.component?.displayName ?? '—'}</ListingTable.Cell>
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
                          <IconButton size="small" color="error" aria-label={`Delete runtime ${r.runtimeId}`} disabled={r.status === 'RUNNING'} onClick={() => onDelete(r)}>
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
                rowsPerPageOptions={[5, 10, 20, 25]}
              />
            </>
          )}
        </CardContent>
      </Card>

      {drawerOpen && <SecretDrawer env={env} onClose={() => setDrawerOpen(false)} />}
      {addOpen && <AddRuntimeModal env={env} onClose={() => setAddOpen(false)} />}
    </>
  );
}

export default function OrgRuntimes(_scope: OrgScope): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: environments, isLoading: envsLoading } = useAllEnvironments();
  const [deleting, setDeleting] = useState<GqlRuntime | null>(null);
  const [viewingLogs, setViewingLogs] = useState<GqlRuntime | null>(null);
  const deleteMutation = useDeleteRuntime();
  const _urlParams = new URLSearchParams(location.search);
  const shouldAutoOpenAddRuntime = _urlParams.get('action') === 'add-runtime';
  const autoOpenEnvironmentId = _urlParams.get('environmentId');

  const clearAutoOpenAction = useCallback(() => {
    if (!shouldAutoOpenAddRuntime) return;
    const params = new URLSearchParams(location.search);
    params.delete('action');
    params.delete('environmentId');
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, shouldAutoOpenAddRuntime]);

  const isLoading = envsLoading;

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Runtimes</PageTitle.Header>
      </PageTitle>

      {isLoading ? (
        <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
      ) : !environments?.length ? (
        <EmptyListing icon={<Server size={48} />} title="No environments found" description="Create an environment first to register runtimes." />
      ) : (
        environments.map((env, index) => (
          <EnvironmentRuntimeCard
            key={env.id}
            env={env}
            onDelete={setDeleting}
            onViewLogs={setViewingLogs}
            autoOpenAddRuntime={shouldAutoOpenAddRuntime && (autoOpenEnvironmentId ? env.id === autoOpenEnvironmentId : index === 0)}
            onAutoOpenConsumed={clearAutoOpenAction}
          />
        ))
      )}

      {viewingLogs && <LogFilesDrawer runtimeId={viewingLogs.runtimeId} onClose={() => setViewingLogs(null)} />}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete Runtime</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete runtime <strong>{deleting.runtimeId}</strong>?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="contained" color="error" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate({ runtimeId: deleting.runtimeId }, { onSuccess: () => setDeleting(null) })}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
