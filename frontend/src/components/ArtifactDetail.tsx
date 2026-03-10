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
import { ChevronRight, Maximize2, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState } from 'react';
import { useArtifactTypes, useArtifacts, ARTIFACT_QUERY_MAP, type GqlArtifact } from '../api/queries';
import { useUpdateArtifactStatus, useUpdateListenerState } from '../api/mutations';
import { useUpdateArtifactTracingStatus, useUpdateArtifactStatisticsStatus } from '../api/artifactToggleMutations';
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

function SelectedTypeArtifacts({ artifacts, artifactType, envId, componentId, query, onSelect }: { artifacts: GqlArtifact[]; artifactType: string; envId: string; componentId: string; query: string; onSelect: (a: GqlArtifact) => void }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
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
  const hasStateField = ['Connector'].includes(artifactType);
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginatedArtifacts = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  // Calculate max toggle columns across all artifacts (for consistent sizing)
  const maxToggleColumns = (() => {
    let max = 0;
    paginatedArtifacts.forEach((a) => {
      const artifactType_ = a.type?.toString().toLowerCase() ?? '';
      let count = 0;
      if (hasStateField) count++;
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
  const toggleColumnSize = 1; // Each toggle gets 1 unit (integer)
  const toggleColumnsSpace = maxToggleColumns * toggleColumnSize; // Total space for toggles
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
      toggleStatus.mutate({ envId, componentId, artifactType, artifactName: artifact.name?.toString() ?? '', status: enabled ? 'inactive' : 'active' });
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
        trace: enabled ? 'disable' : 'enable',
      },
      {
        onSettled: () => {
          // Invalidate and refetch the artifact list to sync with server
          qc.invalidateQueries({ queryKey: ['artifacts', artifactType, envId, componentId] });
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
        statistics: enabled ? 'disable' : 'enable',
      },
      {
        onSettled: () => {
          // Invalidate and refetch the artifact list to sync with server
          qc.invalidateQueries({ queryKey: ['artifacts', artifactType, envId, componentId] });
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
                    <Grid size={{ xs: toggleColumnSize }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        State
                      </Typography>
                      <Chip label={(a.state ?? '—').toString().charAt(0).toUpperCase() + (a.state ?? '—').toString().slice(1).toLowerCase()} size="small" variant="outlined" color={enabled ? 'success' : 'default'} sx={{ fontSize: '0.875rem' }} />
                    </Grid>
                  )}
                  {supportsToggle && (
                    <Grid size={{ xs: toggleColumnSize }}>
                      <SyncSwitch name="status" label="Status" checked={enabled} inSync={a.stateInSync as boolean | null} labelPlacement="top" sx={{ alignItems: 'flex-start' }} onClick={(e) => { e.stopPropagation(); handleToggle(a, enabled); }} />
                    </Grid>
                  )}
                  {showStatistics && (
                    <Grid size={{ xs: toggleColumnSize }}>
                      <SyncSwitch name="statistics" label="Statistics" checked={statisticsEnabled} inSync={a.statisticsInSync as boolean | null} labelPlacement="top" sx={{ alignItems: 'flex-start' }} onClick={(e) => handleStatisticsToggle(a, statisticsEnabled, e)} />
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
      {filtered.length > rowsPerPage && (
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

  const types = allTypes.filter((t) => !ENTRY_POINT_TYPE_SET.has(t.artifactType));
  const selectedArtifactType = selectedType ?? types[0]?.artifactType ?? '';
  const { data: artifacts = [], isLoading: loadingArtifacts } = useArtifacts(selectedArtifactType, envId, componentId);

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
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${typePlural(selectedArtifactType)} by name`} fullWidth sx={{ mb: 2 }} />
        {loadingArtifacts ? (
          <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
        ) : (
          <SelectedTypeArtifacts artifacts={artifacts} artifactType={selectedArtifactType} envId={envId} componentId={componentId} query={query} onSelect={(a) => onSelectArtifact(a, selectedArtifactType, envId)} />
        )}
      </Grid>
    </Grid>
  );
}

const drawerSx = { '& .MuiDrawer-paper': { width: '60%', maxWidth: 700, minWidth: 400, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' } };
const headerSx = { px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' };

export function ArtifactDetail({ selected, onClose }: { selected: SelectedArtifact | null; onClose: () => void }) {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const artifactKey = selected ? `${selected.artifactType}-${selected.artifact.name}` : '';
  useEffect(() => {
    if (selected?.initialTab) {
      const tabs = ARTIFACT_TABS[selected.artifactType] ?? DEFAULT_ARTIFACT_TABS;
      const idx = tabs.indexOf(selected.initialTab);
      setActiveTabIndex(idx >= 0 ? idx : 0);
    } else {
      setActiveTabIndex(0);
    }
  }, [artifactKey, selected?.artifactType, selected?.initialTab]);

  if (!selected) return null;

  const { artifact, artifactType, envId, componentId } = selected;
  const tabs = ARTIFACT_TABS[artifactType] ?? DEFAULT_ARTIFACT_TABS;
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
