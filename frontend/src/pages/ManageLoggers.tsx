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
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  ListingTable,
  MenuItem,
  PageContent,
  Select,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { Maximize2, RefreshCw, Server, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { useProjectByHandler, useComponentByHandler, useEnvironments, useLoggers, RUNTIMES_QUERY, type GqlRuntime } from '../api/queries';
import { gql } from '../api/graphql';
import { useUpdateLogLevel, useDeleteLogger } from '../api/mutations';
import NotFound from '../components/NotFound';
import { resourceUrl, broaden, type ComponentScope } from '../nav';

type LogLevel = 'OFF' | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const MI_LOG_LEVELS: LogLevel[] = ['OFF', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const BI_LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

const drawerSx = { '& .MuiDrawer-paper': { width: '60%', maxWidth: 700, minWidth: 400, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' } };
const headerSx = { px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' };

const getLogLevelColor = (level: string): 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error' => {
  switch (level) {
    case 'OFF':
      return 'default'; // Gray
    case 'TRACE':
      return 'secondary'; // Purple/Pink
    case 'DEBUG':
      return 'info'; // Blue
    case 'INFO':
      return 'success'; // Green
    case 'WARN':
      return 'warning'; // Orange
    case 'ERROR':
      return 'error'; // Red
    case 'FATAL':
      return 'error'; // Red (most critical)
    default:
      return 'default';
  }
};

function LoggersList({ environmentId, componentId, componentType }: { environmentId: string; componentId: string; componentType: string }) {
  const { data: loggers = [], isLoading, preparing, isError, error, refetch } = useLoggers(environmentId, componentId);
  const updateLogLevel = useUpdateLogLevel();
  const deleteLogger = useDeleteLogger();
  const [updatingLogger, setUpdatingLogger] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [runtimeDrawer, setRuntimeDrawer] = useState<{ loggerName: string; runtimeIds: string[] } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ loggerName: string; runtimeIds: string[] } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteLogger = async () => {
    if (!deleteConfirm) return;
    setDeleteError(null);
    try {
      await deleteLogger.mutateAsync({ runtimeIds: deleteConfirm.runtimeIds, loggerName: deleteConfirm.loggerName });
      await refetch();
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogLevelChange = async (uniqueKey: string, loggerName: string, componentName: string, runtimeIds: string[], newLevel: LogLevel) => {
    setUpdatingLogger(uniqueKey);
    const isMI = componentType === 'MI';
    try {
      // For MI: send loggerName (both update and add use loggerName, add also includes loggerClass)
      // For BI: send componentName
      await updateLogLevel.mutateAsync({
        runtimeIds,
        ...(isMI ? { loggerName } : { componentName }),
        componentType,
        logLevel: newLevel,
      });
      await refetch();
    } catch (error) {
      console.error('Failed to update log level:', error);
    } finally {
      setUpdatingLogger(null);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 2 }}>
        <CircularProgress size={24} />
        {/* Named only when the wait is the runtime's: on the default path the answer is in
            the request, and a spinner that lingers there would be a different problem. */}
        {preparing && (
          <Typography variant="body2" color="text.secondary">
            Fetching from the runtime…
          </Typography>
        )}
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <IconButton color="inherit" size="small" onClick={() => refetch()} aria-label="Retry">
            <RefreshCw size={16} />
          </IconButton>
        }>
        {error instanceof Error ? error.message : 'Failed to load loggers'}
      </Alert>
    );
  }

  const isMI = componentType === 'MI';
  const logLevels = isMI ? MI_LOG_LEVELS : BI_LOG_LEVELS;

  // Pagination logic
  const maxPage = Math.max(0, Math.ceil(loggers.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginatedLoggers = loggers.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  if (loggers.length === 0) {
    return (
      <Box sx={{ p: 3, bgcolor: 'action.hover', borderRadius: 1, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No loggers found for this environment
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <ListingTable.Container>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              {isMI && <ListingTable.Cell>Logger Name</ListingTable.Cell>}
              <ListingTable.Cell>Component Name</ListingTable.Cell>
              <ListingTable.Cell sx={{ width: 160 }}>Log Level</ListingTable.Cell>
              <ListingTable.Cell sx={{ width: 200 }}></ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {paginatedLoggers.map((logger) => {
              const uniqueKey = `${logger.loggerName || ''}|${logger.componentName}`;

              return (
                <ListingTable.Row key={uniqueKey}>
                  {isMI && (
                    <ListingTable.Cell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {logger.loggerName}
                      </Typography>
                    </ListingTable.Cell>
                  )}
                  <ListingTable.Cell sx={{ maxWidth: 220 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {logger.componentName}
                    </Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Select
                        value={logger.logLevel}
                        onChange={(e) => handleLogLevelChange(uniqueKey, logger.loggerName, logger.componentName, logger.runtimeIds, e.target.value as LogLevel)}
                        size="small"
                        disabled={updatingLogger === uniqueKey}
                        sx={{ minWidth: 120 }}>
                        {logLevels.map((level) => (
                          <MenuItem key={level} value={level}>
                            <Chip label={level} size="small" color={getLogLevelColor(level)} sx={{ minWidth: 70 }} />
                          </MenuItem>
                        ))}
                      </Select>
                      <Box sx={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(logger.logLevelInSync === false || updatingLogger === uniqueKey) && <CircularProgress size={16} />}</Box>
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell sx={{ whiteSpace: 'nowrap' }}>
                    <Stack direction="row" gap={1} alignItems="center">
                      <Button variant="contained" size="small" startIcon={<Server size={14} />} onClick={() => setRuntimeDrawer({ loggerName: logger.loggerName || logger.componentName, runtimeIds: logger.runtimeIds })}>
                        View Runtimes
                      </Button>
                      {isMI && (
                        <IconButton size="small" color="error" aria-label="Delete logger" onClick={() => setDeleteConfirm({ loggerName: logger.loggerName, runtimeIds: logger.runtimeIds })}>
                          <Trash2 size={16} />
                        </IconButton>
                      )}
                    </Stack>
                  </ListingTable.Cell>
                </ListingTable.Row>
              );
            })}
          </ListingTable.Body>
        </ListingTable>
        <TablePagination
          sx={{ borderTop: '1px solid', borderColor: 'divider' }}
          component="div"
          count={loggers.length}
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
      {runtimeDrawer && (
        <Drawer anchor="right" open onClose={() => setRuntimeDrawer(null)} variant="persistent" sx={drawerSx}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {runtimeDrawer.loggerName}
            </Typography>
            <Stack direction="row" gap={0.5}>
              <IconButton size="small" aria-label="maximize" disabled>
                <Maximize2 size={16} />
              </IconButton>
              <IconButton size="small" aria-label="close" onClick={() => setRuntimeDrawer(null)}>
                <X size={16} />
              </IconButton>
            </Stack>
          </Stack>
          <Box sx={{ px: 2, py: 2 }}>
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Runtime ID</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {runtimeDrawer.runtimeIds.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell align="center" colSpan={1}>
                      No runtimes found.
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  runtimeDrawer.runtimeIds.map((runtimeId) => (
                    <ListingTable.Row key={runtimeId}>
                      <ListingTable.Cell>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{runtimeId}</Typography>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  ))
                )}
              </ListingTable.Body>
            </ListingTable>
          </Box>
        </Drawer>
      )}
      {deleteConfirm && (
        <Dialog
          open
          onClose={() => {
            setDeleteConfirm(null);
            setDeleteError(null);
          }}
          maxWidth="xs"
          fullWidth>
          <DialogTitle>Delete Logger</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Typography>
                Are you sure you want to delete logger <strong>{deleteConfirm.loggerName}</strong> from {deleteConfirm.runtimeIds.length} runtime(s)?
              </Typography>
              {deleteError && <Alert severity="error">{deleteError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setDeleteConfirm(null);
                setDeleteError(null);
              }}
              color="inherit"
              disabled={deleteLogger.isPending}>
              Cancel
            </Button>
            <Button onClick={handleDeleteLogger} variant="contained" color="error" disabled={deleteLogger.isPending}>
              {deleteLogger.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

export default function ManageLoggers(scope: ComponentScope): JSX.Element {
  const queryClient = useQueryClient();
  const [refreshingEnv, setRefreshingEnv] = useState<string | null>(null);
  const [addLoggerDialog, setAddLoggerDialog] = useState<{ open: boolean; environmentId?: string; runtimeIds?: string[] }>({ open: false });
  const [newLoggerForm, setNewLoggerForm] = useState({ loggerName: '', loggerClass: '', logLevel: 'INFO' as LogLevel });
  const [addLoggerError, setAddLoggerError] = useState<string | null>(null);
  const updateLogLevel = useUpdateLogLevel();
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(projectId);

  // Batch fetch runtimes for all environments
  const runtimeQueries = useQueries({
    queries: environments.map((env) => ({
      queryKey: ['runtimes', env.id, projectId, component?.id ?? ''],
      queryFn: () => gql<{ runtimes: { items: GqlRuntime[] } }>(RUNTIMES_QUERY, { environmentId: env.id, projectId, componentId: component?.id ?? '' }).then((d) => d.runtimes.items),
      enabled: !!component?.id,
    })),
  });

  // Create a map of environment ID to runtime IDs
  const runtimesByEnv = environments.reduce(
    (acc, env, index) => {
      const runtimes = runtimeQueries[index]?.data ?? [];
      acc[env.id] = runtimes.map((r) => r.runtimeId);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  const handleRefresh = async (envId: string, componentId: string) => {
    setRefreshingEnv(envId);
    await queryClient.invalidateQueries({ queryKey: ['loggers', envId, componentId] });
    setRefreshingEnv(null);
  };

  const handleAddLogger = async () => {
    if (!addLoggerDialog.runtimeIds || addLoggerDialog.runtimeIds.length === 0) {
      console.error('No runtime IDs available');
      return;
    }

    try {
      await updateLogLevel.mutateAsync({
        runtimeIds: addLoggerDialog.runtimeIds,
        loggerName: newLoggerForm.loggerName,
        loggerClass: newLoggerForm.loggerClass,
        componentType: component?.componentType,
        logLevel: newLoggerForm.logLevel,
      });

      // Clear any previous errors on successful add
      setAddLoggerError(null);

      // Close dialog and reset form
      setAddLoggerDialog({ open: false });
      setNewLoggerForm({ loggerName: '', loggerClass: '', logLevel: 'INFO' });

      // Refresh loggers
      if (addLoggerDialog.environmentId) {
        await queryClient.invalidateQueries({ queryKey: ['loggers', addLoggerDialog.environmentId, component?.id] });
      }
    } catch (error) {
      console.error('Failed to add logger:', error);
      setAddLoggerError(error instanceof Error ? error.message : 'Failed to add logger');
    }
  };

  const isLoading = loadingProject || loadingComponent;
  if (isLoading)
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );

  if (!component) return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;

  return (
    <>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <Box sx={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
        <PageContent>
          <Stack component="header" direction="row" alignItems="center" gap={2} sx={{ mb: 1 }}>
            <Avatar sx={{ width: 56, height: 56, fontSize: 24, bgcolor: 'text.primary', color: 'background.paper' }}>{component.displayName?.[0]?.toUpperCase() ?? 'C'}</Avatar>
            <Typography variant="h1">{component.displayName ?? scope.component}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, ml: 9 }}>
            {component.description}
          </Typography>

          {loadingEnvironments ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : environments.length === 0 ? (
            <Card variant="outlined">
              <CardContent sx={{ py: 8, textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No Environments Found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create an environment to start managing loggers
                </Typography>
              </CardContent>
            </Card>
          ) : (
            environments.map((env) => {
              const runtimeIds = runtimesByEnv[env.id] ?? [];

              return (
                <Card key={env.id} variant="outlined" sx={{ mb: 3 }}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="h6" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                        {env.name}
                      </Typography>
                      <Stack direction="row" gap={1}>
                        {component.componentType === 'MI' && runtimeIds.length > 0 && (
                          <Button variant="outlined" size="small" onClick={() => setAddLoggerDialog({ open: true, environmentId: env.id, runtimeIds })}>
                            Add Logger
                          </Button>
                        )}
                        <IconButton size="small" onClick={() => handleRefresh(env.id, component.id)} disabled={refreshingEnv === env.id} aria-label="Refresh loggers">
                          <RefreshCw size={16} style={{ animation: refreshingEnv === env.id ? 'spin 1s linear infinite' : 'none', transformOrigin: 'center' }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    <Divider sx={{ my: 2 }} />
                    <LoggersList environmentId={env.id} componentId={component.id} componentType={component.componentType} />
                  </CardContent>
                </Card>
              );
            })
          )}
        </PageContent>
      </Box>

      {/* Add Logger Dialog */}
      <Dialog
        open={addLoggerDialog.open}
        onClose={() => {
          setAddLoggerDialog({ open: false });
          setAddLoggerError(null);
        }}
        maxWidth="sm"
        fullWidth>
        <DialogTitle>Add New Logger</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {addLoggerError && (
              <Alert severity="error" onClose={() => setAddLoggerError(null)}>
                {addLoggerError}
              </Alert>
            )}
            <TextField label="Logger Name" value={newLoggerForm.loggerName} onChange={(e) => setNewLoggerForm({ ...newLoggerForm, loggerName: e.target.value })} placeholder="e.g., synapse-api, org-apache-hadoop-hive" fullWidth required />
            <TextField label="Logger Class" value={newLoggerForm.loggerClass} onChange={(e) => setNewLoggerForm({ ...newLoggerForm, loggerClass: e.target.value })} placeholder="e.g., org.apache.synapse.rest.API" fullWidth required />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Log Level
              </Typography>
              <Select value={newLoggerForm.logLevel} onChange={(e) => setNewLoggerForm({ ...newLoggerForm, logLevel: e.target.value as LogLevel })} size="small" fullWidth>
                {MI_LOG_LEVELS.map((level) => (
                  <MenuItem key={level} value={level}>
                    <Chip label={level} size="small" color={getLogLevelColor(level)} sx={{ minWidth: 70 }} />
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Typography variant="body2" color="text.secondary">
              This logger will be added to {addLoggerDialog.runtimeIds?.length || 0} runtime(s)
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddLoggerDialog({ open: false });
              setAddLoggerError(null);
            }}
            color="inherit">
            Cancel
          </Button>
          <Button onClick={handleAddLogger} variant="contained" disabled={!newLoggerForm.loggerName || !newLoggerForm.loggerClass || updateLogLevel.isPending}>
            {updateLogLevel.isPending ? 'Adding...' : 'Add Logger'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
