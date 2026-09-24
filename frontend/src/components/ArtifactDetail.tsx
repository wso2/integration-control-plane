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
  Drawer,
  Grid,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tab,
  TablePagination,
  Tabs,
  Typography,
} from '@wso2/oxygen-ui';
import { ChevronDown, ChevronRight, Maximize2, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState } from 'react';
import { useArtifactTypes, useArtifactPage, ARTIFACT_QUERY_MAP, type GqlArtifact } from '../api/queries';
import { useUpdateArtifactStatus, useUpdateListenerState } from '../api/mutations';
import { useUpdateArtifactTracingStatus, useUpdateArtifactStatisticsStatus } from '../api/artifactToggleMutations';
import { gql } from '../api/graphql';
import SearchField from './SearchField';
import SyncSwitch from './SyncSwitch';
import {
  ArtifactSource,
  ArtifactApiDefinition,
  ArtifactEndpoints,
  ArtifactWsdl,
  ArtifactValue,
  ArtifactCarbonArtifacts,
  ArtifactRuntimes,
  InboundEndpointParameters,
  AutomationExecutions,
  DataSourceOverview,
  DataServiceOverview,
  MessageProcessorOverview,
  MessageProcessorParameters,
} from './ArtifactTabs';
import { ARTIFACT_ICONS, ARTIFACT_TABS, DEFAULT_ARTIFACT_TABS, ENTRY_POINT_TYPE_SET, formatArtifactTypeName, typePlural, type SelectedArtifact, type TabProps } from './artifact-config';
import { useQueryClient } from '@tanstack/react-query';
import { RegistryBrowser } from './RegistryBrowser';

/**
 * Normalizes state/tracing/statistics values to a boolean.
 * Handles string values like "enabled"/"disabled" (case-insensitive) and boolean values.
 */
function toEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const strValue = (value ?? '').toString().toLowerCase();
  return strValue === 'enabled' || strValue === 'true';
}

function ListenerConfirmDialog({ open, action, listenerName, onConfirm, onCancel }: { open: boolean; action: 'START' | 'STOP'; listenerName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>{action === 'STOP' ? 'Disable Listener' : 'Enable Listener'}</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to {action === 'STOP' ? 'disable' : 'enable'} the listener <strong>{listenerName}</strong>?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="text">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" color={action === 'STOP' ? 'error' : 'primary'}>
          {action === 'STOP' ? 'Disable' : 'Enable'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SelectedTypeArtifacts({
  artifacts,
  artifactType,
  envId,
  componentId,
  query,
  onSelect,
  serverTotal,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
}: {
  artifacts: GqlArtifact[];
  artifactType: string;
  envId: string;
  componentId: string;
  query: string;
  onSelect: (a: GqlArtifact) => void;
  serverTotal?: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (p: number) => void;
  onRowsPerPageChange: (rpp: number) => void;
}) {
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; artifact: GqlArtifact | null; action: 'START' | 'STOP' } | null>(null);
  const qc = useQueryClient();
  const toggleStatus = useUpdateArtifactStatus();
  const updateListenerState = useUpdateListenerState();
  const updateTracingStatus = useUpdateArtifactTracingStatus();
  const updateStatisticsStatus = useUpdateArtifactStatisticsStatus();
  const artifactMapping = ARTIFACT_QUERY_MAP[artifactType];
  if (!artifactMapping) return null;

  const columns = artifactMapping.fields.split(', ').filter((f) => f !== 'state' && f !== 'container');
  const filtered = artifacts.filter((a) => {
    if (!query) return true;
    const searchQuery = query.toLowerCase();
    // For Automation artifacts, search across packageOrg, packageName, and packageVersion
    if (artifactType === 'Automation') {
      const packageOrg = a.packageOrg?.toString().toLowerCase() ?? '';
      const packageName = a.packageName?.toString().toLowerCase() ?? '';
      const packageVersion = a.packageVersion?.toString().toLowerCase() ?? '';
      return packageOrg.includes(searchQuery) || packageName.includes(searchQuery) || packageVersion.includes(searchQuery);
    }
    // For other artifacts, search by name
    return a.name?.toString().toLowerCase().includes(searchQuery);
  });
  const supportsToggle = ['Endpoint', 'Listener', 'MessageProcessor'].includes(artifactType);
  const hasStateField = ['Connector', 'CompositeApp', 'DataService'].includes(artifactType);
  // When search is active: filter client-side from server-fetched full list and slice locally.
  // When no search (serverTotal provided): artifacts already come pre-sliced from the backend.
  const isSearching = query.length > 0;
  const totalCount = isSearching ? filtered.length : (serverTotal ?? artifacts.length);
  const maxPage = Math.max(0, Math.ceil(totalCount / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginatedArtifacts = isSearching ? filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage) : artifacts;

  // Calculate max toggle columns across all artifacts (for consistent sizing)
  const maxToggleColumns = (() => {
    let max = 0;
    paginatedArtifacts.forEach((a) => {
      const artifactType_ = a.type?.toString().toLowerCase() ?? '';
      let count = 0;
      if (hasStateField) count += 2; // State chips need more space for text
      if (supportsToggle) count++;
      // Statistics: Endpoint, InboundEndpoint, Sequence, and Templates with type=sequence
      if (['Endpoint', 'InboundEndpoint', 'Sequence'].includes(artifactType) || (artifactType === 'Template' && artifactType_ === 'sequence')) count++;
      // Tracing: Endpoint, InboundEndpoint, Sequence
      if (['Endpoint', 'InboundEndpoint', 'Sequence'].includes(artifactType)) count++;
      max = Math.max(max, count);
    });
    return max;
  })();

  // Calculate column sizes: use integers to avoid subpixel rendering
  const stateChipSize = 2; // State chips need more space for text (Enabled/Disabled)
  const toggleColumnSize = 1; // Each toggle switch gets 1 unit (integer)
  const toggleColumnsSpace = maxToggleColumns; // Total space for toggles (already calculated with proper sizes)
  const dataColumnsSpace = 12 - toggleColumnsSpace; // Remaining space for data columns
  const dataColumnSize = Math.floor(dataColumnsSpace / columns.length); // Integer division
  // Calculate how many extra columns to distribute (remainder)
  const extraColumns = dataColumnsSpace - dataColumnSize * columns.length;

  const handleToggle = (artifact: GqlArtifact, enabled: boolean) => {
    if (artifactType === 'Listener') {
      // Show confirmation dialog for listeners
      setConfirmDialog({
        open: true,
        artifact,
        action: enabled ? 'STOP' : 'START',
      });
    } else {
      // Direct toggle for other artifact types
      toggleStatus.mutate({ envId, componentId, artifactType, artifactName: artifact.name?.toString() ?? '', status: enabled ? 'DISABLED' : 'ENABLED' });
    }
  };

  const handleTracingToggle = (artifact: GqlArtifact, enabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTracingStatus.mutate(
      {
        envId,
        componentId,
        artifactType,
        artifactName: artifact.name?.toString() ?? '',
        trace: enabled ? 'DISABLED' : 'ENABLED',
      },
      {
        onSettled: () => {
          // Invalidate and refetch the artifact list to sync with server
          qc.invalidateQueries({ queryKey: ['artifacts-page', artifactType, envId, componentId] });
        },
      },
    );
  };

  const handleStatisticsToggle = (artifact: GqlArtifact, enabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    updateStatisticsStatus.mutate(
      {
        envId,
        componentId,
        artifactType,
        artifactName: artifact.name?.toString() ?? '',
        statistics: enabled ? 'DISABLED' : 'ENABLED',
      },
      {
        onSettled: () => {
          // Invalidate and refetch the artifact list to sync with server
          qc.invalidateQueries({ queryKey: ['artifacts-page', artifactType, envId, componentId] });
        },
      },
    );
  };

  const handleConfirmListenerToggle = () => {
    if (!confirmDialog?.artifact) return;

    const runtimes = (confirmDialog.artifact.runtimes as Array<{ runtimeId: string }> | undefined) ?? [];
    const runtimeIds = runtimes.map((r) => r.runtimeId);

    updateListenerState.mutate({
      runtimeIds,
      listenerName: confirmDialog.artifact.name?.toString() ?? '',
      listenerPackage: confirmDialog.artifact.package?.toString(),
      action: confirmDialog.action,
    });

    setConfirmDialog(null);
  };

  return (
    <>
      <Stack gap={1.5}>
        {paginatedArtifacts.map((a, i) => {
          const enabled = toEnabled(a.state);
          const tracingEnabled = toEnabled(a.tracing);
          const statisticsEnabled = toEnabled(a.statistics);
          const artifactTypeField = a.type?.toString().toLowerCase() ?? '';

          // Check if this specific artifact supports statistics and tracing
          const showStatistics = ['Endpoint', 'InboundEndpoint', 'Sequence'].includes(artifactType) || (artifactType === 'Template' && artifactTypeField === 'sequence');
          const showTracing = ['Endpoint', 'InboundEndpoint', 'Sequence'].includes(artifactType);

          return (
            <Card key={i} variant="outlined" sx={{ cursor: 'pointer', width: '100%', '&:hover': { boxShadow: 1 } }} onClick={() => onSelect(a)}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Grid container spacing={2} sx={{ flex: 1 }}>
                  {columns.map((col, colIndex) => {
                    // Distribute extra columns to first N data columns to reach exactly 12
                    const columnSize = dataColumnSize + (colIndex < extraColumns ? 1 : 0);
                    return (
                      <Grid key={col} size={{ xs: columnSize }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                          {col === 'size' ? 'Message Count' : col}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {(a[col] ?? '—').toString()}
                        </Typography>
                      </Grid>
                    );
                  })}
                  {hasStateField && (
                    <Grid size={{ xs: stateChipSize }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        State
                      </Typography>
                      <Chip
                        label={(a.state ?? '—').toString().charAt(0).toUpperCase() + (a.state ?? '—').toString().slice(1).toLowerCase()}
                        size="small"
                        variant="outlined"
                        color={['CompositeApp', 'DataService'].includes(artifactType) ? ((a.state ?? '').toString() === 'Active' ? 'success' : (a.state ?? '').toString() === 'Faulty' ? 'error' : 'default') : enabled ? 'success' : 'default'}
                        sx={{ fontSize: '0.875rem' }}
                      />
                    </Grid>
                  )}
                  {supportsToggle && (
                    <Grid size={{ xs: toggleColumnSize }}>
                      <SyncSwitch
                        name="status"
                        label="Status"
                        checked={enabled}
                        inSync={a.stateInSync as boolean | null}
                        labelPlacement="top"
                        sx={{ alignItems: 'flex-start' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(a, enabled);
                        }}
                      />
                    </Grid>
                  )}
                  {showStatistics && (
                    <Grid size={{ xs: toggleColumnSize }}>
                      <SyncSwitch
                        name="statistics"
                        label="Statistics"
                        checked={statisticsEnabled}
                        inSync={a.statisticsInSync as boolean | null}
                        labelPlacement="top"
                        sx={{ alignItems: 'flex-start' }}
                        onClick={(e) => handleStatisticsToggle(a, statisticsEnabled, e)}
                      />
                    </Grid>
                  )}
                  {showTracing && (
                    <Grid size={{ xs: toggleColumnSize }}>
                      <SyncSwitch name="tracing" label="Tracing" checked={tracingEnabled} inSync={a.tracingInSync as boolean | null} labelPlacement="top" sx={{ alignItems: 'flex-start' }} onClick={(e) => handleTracingToggle(a, tracingEnabled, e)} />
                    </Grid>
                  )}
                </Grid>
                <ChevronRight size={18} style={{ color: 'var(--oxygen-palette-text-secondary)', flexShrink: 0 }} />
              </CardContent>
            </Card>
          );
        })}
      </Stack>
      {totalCount > 0 && (
        <TablePagination
          component="div"
          count={totalCount}
          page={safePage}
          onPageChange={(_, p) => onPageChange(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            onRowsPerPageChange(parseInt(e.target.value, 10));
            onPageChange(0);
          }}
          rowsPerPageOptions={[5, 10, 25]}
          sx={{ mt: 1 }}
        />
      )}

      {/* Listener State Confirmation Dialog */}
      <ListenerConfirmDialog open={confirmDialog?.open ?? false} action={confirmDialog?.action ?? 'START'} listenerName={confirmDialog?.artifact?.name?.toString() ?? ''} onConfirm={handleConfirmListenerToggle} onCancel={() => setConfirmDialog(null)} />
    </>
  );
}

export function ArtifactTypeSelector({ envId, componentId, onSelectArtifact }: { envId: string; componentId: string; onSelectArtifact: (a: GqlArtifact, type: string, envId: string) => void }) {
  const { data: allTypes = [], isLoading } = useArtifactTypes(componentId, envId);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const types = allTypes.filter((t) => !ENTRY_POINT_TYPE_SET.has(t.artifactType));
  const selectedArtifactType = selectedType ?? types[0]?.artifactType ?? '';
  const isSearching = query.length > 0;
  // When searching, fetch all items (no limit/offset) so client-side filter works across all pages.
  // When not searching, use server-side pagination.
  const { data: pagedResult, isLoading: loadingArtifacts } = useArtifactPage(selectedArtifactType, envId, componentId, isSearching ? 10000 : rowsPerPage, isSearching ? 0 : page * rowsPerPage);

  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (types.length === 0)
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No artifacts found for this component.
      </Typography>
    );

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 3 }}>
        <List disablePadding>
          {types.map((t) => (
            <ListItemButton
              key={t.artifactType}
              selected={t.artifactType === selectedArtifactType}
              onClick={() => {
                setSelectedType(t.artifactType);
                setQuery('');
                setPage(0);
              }}
              sx={{ borderRadius: 1, mb: 0.5 }}>
              {ARTIFACT_ICONS[t.artifactType] && <ListItemIcon sx={{ minWidth: 32 }}>{ARTIFACT_ICONS[t.artifactType]}</ListItemIcon>}
              <ListItemText primary={formatArtifactTypeName(t.artifactType)} />
            </ListItemButton>
          ))}
        </List>
      </Grid>
      <Grid size={{ xs: 12, sm: 9 }}>
        <Typography variant="overline" sx={{ mb: 1, display: 'block' }}>
          {typePlural(selectedArtifactType)}
        </Typography>
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(0);
          }}
          placeholder={`Search ${typePlural(selectedArtifactType)} by name`}
          fullWidth
          sx={{ mb: 2 }}
        />
        {loadingArtifacts ? (
          <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
        ) : (
          <SelectedTypeArtifacts
            artifacts={pagedResult?.items ?? []}
            artifactType={selectedArtifactType}
            envId={envId}
            componentId={componentId}
            query={query}
            onSelect={(a) => onSelectArtifact(a, selectedArtifactType, envId)}
            serverTotal={pagedResult?.total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={(rpp) => {
              setRowsPerPage(rpp);
              setPage(0);
            }}
          />
        )}
      </Grid>
    </Grid>
  );
}

const drawerSx = { '& .MuiDrawer-paper': { width: '60%', maxWidth: 700, minWidth: 400, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' } };
const headerSx = { px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' };
const COMPOSITE_APP_FAULT_STACKTRACE_QUERY = `
  query GetCompositeAppFaultStackTrace($runtimeId: String!, $appName: String!) {
    compositeAppFaultStackTrace(runtimeId: $runtimeId, appName: $appName) {
      faultStackTrace
    }
  }
`;
const DATA_SERVICE_FAULT_STACKTRACE_QUERY = `
  query GetDataServiceFaultStackTrace($runtimeId: String!, $serviceName: String!) {
    dataServiceFaultStackTrace(runtimeId: $runtimeId, serviceName: $serviceName) {
      faultStackTrace
    }
  }
`;

export function ArtifactDetail({ selected, onClose }: { selected: SelectedArtifact | null; onClose: () => void }) {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [stacktraceExpanded, setStacktraceExpanded] = useState(false);
  const [stacktraceLoading, setStacktraceLoading] = useState(false);
  const [stacktrace, setStacktrace] = useState<string | null>(null);
  const [stacktraceError, setStacktraceError] = useState<string | null>(null);
  const [stacktraceLoadedFor, setStacktraceLoadedFor] = useState<string | null>(null);
  const stacktraceRequestRef = useRef<string | null>(null);
  const artifactKey = selected ? `${selected.artifactType}-${selected.artifact.name}-${selected.artifact.version ?? ''}` : '';
  useEffect(() => {
    if (selected?.initialTab) {
      const tabs = ARTIFACT_TABS[selected.artifactType] ?? DEFAULT_ARTIFACT_TABS;
      const idx = tabs.indexOf(selected.initialTab);
      setActiveTabIndex(idx >= 0 ? idx : 0);
    } else {
      setActiveTabIndex(0);
    }

    setStacktraceExpanded(false);
    setStacktraceLoading(false);
    setStacktrace(null);
    setStacktraceError(null);
    setStacktraceLoadedFor(null);
    stacktraceRequestRef.current = null;
  }, [artifactKey, selected?.artifactType, selected?.initialTab]);

  if (!selected) return null;

  const { artifact, artifactType, envId, componentId } = selected;
  // A faulty data service failed to deploy, so it has no live artifact on the runtime.
  // The Overview and Source tabs would trigger management API calls that return 404,
  // so only expose the Runtimes tab (backed by stored heartbeat data) in that case.
  const isFaultyDataService = artifactType === 'DataService' && artifact.state?.toString() === 'Faulty';
  const tabs = isFaultyDataService ? ['Runtimes'] : (ARTIFACT_TABS[artifactType] ?? DEFAULT_ARTIFACT_TABS);
  const validTabIndex = Math.min(activeTabIndex, tabs.length - 1);
  const activeTab = tabs[validTabIndex];

  const tabProps: TabProps = { artifact, artifactType, envId, componentId, projectId: selected.projectId };

  // For Automation artifacts, use packageName as the display name
  const displayName = artifact.name?.toString() ?? (artifactType === 'Automation' && artifact.packageName ? artifact.packageName.toString() : 'Unnamed Artifact');

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'Source':
        return <ArtifactSource {...tabProps} />;
      case 'API definition':
        return <ArtifactApiDefinition {...tabProps} />;
      case 'Endpoints':
        return <ArtifactEndpoints {...tabProps} />;
      case 'WSDL':
        return <ArtifactWsdl {...tabProps} />;
      case 'Overview':
        if (artifactType === 'DataService') return <DataServiceOverview {...tabProps} />;
        if (artifactType === 'MessageProcessor') return <MessageProcessorOverview {...tabProps} />;
        return <DataSourceOverview {...tabProps} />;
      case 'Value':
        return <ArtifactValue {...tabProps} />;
      case 'Artifacts':
        return <ArtifactCarbonArtifacts {...tabProps} />;
      case 'Runtimes':
        return <ArtifactRuntimes {...tabProps} />;
      case 'Parameters':
        if (artifactType === 'MessageProcessor') return <MessageProcessorParameters {...tabProps} />;
        return <InboundEndpointParameters {...tabProps} />;
      case 'Executions':
        return <AutomationExecutions {...tabProps} />;
      case 'Browse': {
        const runtimeId = (artifact.runtimes as Array<{ runtimeId: string }> | undefined)?.[0]?.runtimeId;
        if (!runtimeId) {
          return (
            <Stack sx={{ p: 3, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography color="text.secondary" textAlign="center">
                Registry browser is not available. No runtime is associated with this artifact.
              </Typography>
            </Stack>
          );
        }
        return <RegistryBrowser runtimeId={runtimeId} />;
      }
      default:
        return null;
    }
  };

  const isFaultyCompositeApp = artifactType === 'CompositeApp' && artifact.state?.toString() === 'Faulty';
  const isFaulty = isFaultyCompositeApp || isFaultyDataService;
  const errorMessage = isFaulty ? artifact.errorMessage?.toString() : null;
  const stacktracePanelId = `stacktrace-panel-${artifactType}-${displayName.replace(/\s+/g, '-').toLowerCase()}`;
  const errorLines = errorMessage
    ? errorMessage
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  const loadStacktrace = async () => {
    const runtimeId = (artifact.runtimes as Array<{ runtimeId: string }> | undefined)?.[0]?.runtimeId;
    const artifactName = artifact.name?.toString();

    if (!runtimeId || !artifactName) {
      setStacktraceError(`No stacktrace available. Missing runtime or ${isFaultyDataService ? 'Data Service' : 'Composite App'} name.`);
      return;
    }

    const requestToken = `${runtimeId}::${artifactName}`;
    if (stacktraceLoadedFor === requestToken || stacktraceLoading) return;

    stacktraceRequestRef.current = requestToken;
    setStacktraceLoading(true);
    setStacktraceError(null);

    try {
      let faultStackTrace: string | null = null;
      if (isFaultyDataService) {
        const result = await gql<{ dataServiceFaultStackTrace: { faultStackTrace: string } }>(DATA_SERVICE_FAULT_STACKTRACE_QUERY, {
          runtimeId,
          serviceName: artifactName,
        });
        if (stacktraceRequestRef.current !== requestToken) return;
        faultStackTrace = result.dataServiceFaultStackTrace?.faultStackTrace || null;
      } else {
        const result = await gql<{ compositeAppFaultStackTrace: { faultStackTrace: string } }>(COMPOSITE_APP_FAULT_STACKTRACE_QUERY, {
          runtimeId,
          appName: artifactName,
        });
        if (stacktraceRequestRef.current !== requestToken) return;
        faultStackTrace = result.compositeAppFaultStackTrace?.faultStackTrace || null;
      }

      setStacktrace(faultStackTrace);
      setStacktraceLoadedFor(requestToken);
    } catch (error) {
      console.error('Error fetching artifact stacktrace:', error);
      if (stacktraceRequestRef.current === requestToken) {
        setStacktraceError('Failed to load stacktrace.');
      }
    } finally {
      if (stacktraceRequestRef.current === requestToken) {
        setStacktraceLoading(false);
      }
    }
  };

  const handleStacktraceToggle = async () => {
    const expanded = !stacktraceExpanded;
    setStacktraceExpanded(expanded);
    if (expanded) {
      await loadStacktrace();
    }
  };

  return (
    <Drawer anchor="right" open onClose={onClose} variant="persistent" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {displayName}
        </Typography>
        <Stack direction="row" gap={0.5}>
          <IconButton size="small" aria-label="maximize" disabled>
            <Maximize2 size={16} />
          </IconButton>
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Stack>
      </Stack>
      {isFaulty && (
        <Box sx={{ px: 2, pt: 1.5, pb: 3, backgroundColor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={0} alignItems="flex-start">
            <Chip label="Faulty" size="small" color="error" sx={{ mt: 0.5 }} />
            <Stack spacing={1.5} sx={{ width: '100%', minWidth: 0, mt: 3 }}>
              {errorMessage && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'block', mb: 0.75, color: 'text.primary' }}>
                    Error Message
                  </Typography>
                  <Box sx={{ m: 0 }}>
                    {(errorLines.length > 0 ? errorLines : [errorMessage]).map((line, idx) => (
                      <Typography key={`${line}-${idx}`} variant="body2" sx={{ lineHeight: 1.5, color: 'text.primary' }}>
                        {line}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}

              <Box>
                <Box
                  component="button"
                  type="button"
                  onClick={handleStacktraceToggle}
                  aria-expanded={stacktraceExpanded}
                  aria-controls={stacktracePanelId}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    cursor: 'pointer',
                    py: 0.5,
                    px: 0,
                    border: 0,
                    background: 'none',
                    color: 'inherit',
                    textAlign: 'left',
                  }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Stacktrace
                  </Typography>
                  <ChevronDown size={16} style={{ transform: stacktraceExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }} />
                </Box>
                {stacktraceExpanded &&
                  (stacktraceLoading ? (
                    <Typography id={stacktracePanelId} variant="body2" color="text.secondary" sx={{ p: 1 }}>
                      Loading stacktrace...
                    </Typography>
                  ) : stacktraceError ? (
                    <Typography id={stacktracePanelId} variant="body2" color="error" sx={{ p: 1 }}>
                      {stacktraceError}
                    </Typography>
                  ) : (
                    <Box
                      id={stacktracePanelId}
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1,
                        fontSize: '0.75rem',
                        lineHeight: 1.4,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        color: 'text.primary',
                      }}>
                      <Box component="code" sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }}>
                        {stacktrace ?? 'No stacktrace available.'}
                      </Box>
                    </Box>
                  ))}
              </Box>
            </Stack>
          </Stack>
        </Box>
      )}
      <Box sx={{ px: 2 }}>
        {tabs.length > 0 && (
          <>
            <Tabs value={validTabIndex} onChange={(_, v) => setActiveTabIndex(v)} sx={{ mb: 2 }}>
              {tabs.map((t) => (
                <Tab key={t} label={t} />
              ))}
            </Tabs>
            {renderActiveTab()}
          </>
        )}
      </Box>
    </Drawer>
  );
}
