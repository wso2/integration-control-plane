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
  Autocomplete,
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
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Alert,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { RefreshCw, ListFilter, LayoutGrid, Settings, Play, X, Trash2, UserPlus } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useArtifacts, useRefreshEnvironmentArtifacts, useRuntimes, useComponentRuntimes, type GqlArtifact, type GqlEnvironment } from '../api/queries';
import { useUpdateArtifactTracingStatus, useUpdateArtifactStatisticsStatus } from '../api/artifactToggleMutations';
import { useUpdateArtifactStatus, useUpdateListenerState, useTriggerTask } from '../api/mutations';
import { useListMiUsers, useCreateMiUser, useDeleteMiUser } from '../api/miUsers';
import { ArtifactApiDefinition, ServiceResources, AutomationExecutions, ProxyApiReference } from './ArtifactTabs';
import { ArtifactTypeSelector } from './ArtifactDetail';
import Authorized from './Authorized';
import { Permissions } from '../constants/permissions';
import { ENTRY_POINT_CONFIG, ENTRY_POINT_DETAIL_TABS, type SelectedArtifact, type TabProps } from './artifact-config';
import SyncSwitch from './SyncSwitch';

function EntryPointDetail({ selected, onOpenDrawerTab }: { selected: SelectedArtifact; onOpenDrawerTab: (tab: string) => void }) {
  const [tracingEnabled, setTracingEnabled] = useState(false);
  const [statisticsEnabled, setStatisticsEnabled] = useState(false);
  const [statusEnabled, setStatusEnabled] = useState(false);
  const [listenerEnabled, setListenerEnabled] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ type: 'tracing' | 'statistics' | 'status'; checked: boolean } | null>(null);
  const [pendingListenerToggle, setPendingListenerToggle] = useState<{ checked: boolean } | null>(null);
  const [triggerConfirmDialogOpen, setTriggerConfirmDialogOpen] = useState(false);
  const [triggerSuccessMessage, setTriggerSuccessMessage] = useState<string | null>(null);
  const { artifact, artifactType, envId, componentId, projectId } = selected;
  const queryClient = useQueryClient();
  const updateTracingStatus = useUpdateArtifactTracingStatus();
  const updateStatisticsStatus = useUpdateArtifactStatisticsStatus();
  const updateArtifactStatus = useUpdateArtifactStatus();
  const updateListenerState = useUpdateListenerState();
  const triggerTask = useTriggerTask();
  const config = ENTRY_POINT_CONFIG[artifactType];
  const tabProps: TabProps = { artifact, artifactType, envId, componentId, projectId };
  const carbonApp = artifact.carbonApp?.toString();
  const overviewFields = (config?.overviewFields ?? '').split(', ').filter(Boolean);
  const showTracingToggle = ['RestApi', 'ProxyService', 'InboundEndpoint'].includes(artifactType);
  const showRuntimesButton = true; // Show View Runtimes button for all entry points
  const showParametersButton = artifactType === 'InboundEndpoint';
  const showSourceButton = ['RestApi', 'ProxyService', 'InboundEndpoint', 'Task'].includes(artifactType);
  const showWsdlButton = artifactType === 'ProxyService';
  const showStatisticsToggle = ['RestApi', 'ProxyService', 'InboundEndpoint'].includes(artifactType);
  const showStatusToggle = artifactType === 'ProxyService';
  const showStatusChip = ['RestApi', 'InboundEndpoint'].includes(artifactType);
  const showListenerToggle = artifactType === 'Listener';
  const showTaskToggle = artifactType === 'Task';
  const showTaskTrigger = artifactType === 'Task';
  const hasRuntimes = artifact.runtimes && Array.isArray(artifact.runtimes) && artifact.runtimes.length > 0;

  // Track if any preceding controls are visible for proper divider placement
  const hasPrecedingControls = carbonApp || showStatusToggle || showStatusChip || showTracingToggle || showStatisticsToggle || showListenerToggle;
  const toEnabled = (value: unknown) => {
    if (typeof value === 'boolean') return value;
    const normalized = (value ?? '').toString().toLowerCase();
    return normalized === 'enabled' || normalized === 'active' || normalized === 'true';
  };

  const artifactName = artifactType === 'Automation' ? (artifact.packageName?.toString() ?? '') : (artifact.name?.toString() ?? '');
  const artifactKey = `${artifactType}-${artifactName}`;
  useEffect(() => {
    setTracingEnabled(toEnabled(artifact.tracing));
    setStatisticsEnabled(toEnabled(artifact.statistics));
    setStatusEnabled(toEnabled(artifact.state));
    setListenerEnabled(toEnabled(artifact.state));
  }, [artifactKey, artifact.tracing, artifact.statistics, artifact.state]);

  const handleToggleTracing = (checked: boolean) => {
    if (!showTracingToggle) return;
    setPendingToggle({ type: 'tracing', checked });
  };

  const handleToggleStatistics = (checked: boolean) => {
    if (!showStatisticsToggle) return;
    setPendingToggle({ type: 'statistics', checked });
  };

  const handleToggleStatus = (checked: boolean) => {
    if (!showStatusToggle && !showTaskToggle) return;
    setPendingToggle({ type: 'status', checked });
  };

  const handleToggleListener = (checked: boolean) => {
    if (!showListenerToggle) return;
    setPendingListenerToggle({ checked });
  };

  const handleTriggerTask = () => {
    if (!showTaskTrigger) return;
    setTriggerConfirmDialogOpen(true);
  };

  const handleConfirmTrigger = () => {
    setTriggerConfirmDialogOpen(false);
    triggerTask.mutate(
      { componentId, taskName: artifactName },
      {
        onSuccess: () => {
          setTriggerSuccessMessage(`Successfully triggered task ${artifactName}`);
        },
        onSettled: () => {
          const artifactQueryKey = ['artifacts', artifactType, envId, componentId];
          queryClient.invalidateQueries({ queryKey: artifactQueryKey });
        },
      },
    );
  };

  const handleConfirmToggle = () => {
    if (!pendingToggle) return;
    const artifactQueryKey = ['artifacts', artifactType, envId, componentId];
    if (pendingToggle.type === 'tracing') {
      const previousValue = tracingEnabled;
      setTracingEnabled(pendingToggle.checked);
      updateTracingStatus.mutate(
        { envId, componentId, artifactType, artifactName, trace: pendingToggle.checked ? 'enable' : 'disable' },
        {
          onError: () => setTracingEnabled(previousValue),
          onSettled: () => queryClient.invalidateQueries({ queryKey: artifactQueryKey }),
        },
      );
    } else if (pendingToggle.type === 'statistics') {
      const previousValue = statisticsEnabled;
      setStatisticsEnabled(pendingToggle.checked);
      updateStatisticsStatus.mutate(
        { envId, componentId, artifactType, artifactName, statistics: pendingToggle.checked ? 'enable' : 'disable' },
        {
          onError: () => setStatisticsEnabled(previousValue),
          onSettled: () => queryClient.invalidateQueries({ queryKey: artifactQueryKey }),
        },
      );
    } else {
      const previousValue = statusEnabled;
      setStatusEnabled(pendingToggle.checked);
      updateArtifactStatus.mutate(
        { envId, componentId, artifactType, artifactName, status: pendingToggle.checked ? 'active' : 'inactive' },
        {
          onError: () => setStatusEnabled(previousValue),
          onSettled: () => queryClient.invalidateQueries({ queryKey: artifactQueryKey }),
        },
      );
    }
    setPendingToggle(null);
  };

  const handleConfirmListenerToggle = () => {
    if (!pendingListenerToggle) return;

    const runtimes = artifact.runtimes;
    if (!runtimes || !Array.isArray(runtimes) || runtimes.length === 0) {
      console.error('No valid runtimes available for listener toggle');
      setPendingListenerToggle(null);
      return;
    }

    const runtimeIds = runtimes.map((r: { runtimeId: string }) => r.runtimeId);
    const previousValue = listenerEnabled;

    setListenerEnabled(pendingListenerToggle.checked);
    const artifactQueryKey = ['artifacts', artifactType, envId, componentId];

    updateListenerState.mutate(
      {
        runtimeIds,
        listenerName: artifactName,
        action: pendingListenerToggle.checked ? 'START' : 'STOP',
      },
      {
        onError: () => setListenerEnabled(previousValue),
        onSettled: () => queryClient.invalidateQueries({ queryKey: artifactQueryKey }),
      },
    );

    setPendingListenerToggle(null);
  };

  const toggleLabel = pendingToggle?.type ?? 'status';
  const toggleAction = pendingToggle?.checked ? 'enable' : 'disable';
  const listenerAction = pendingListenerToggle?.checked ? 'enable' : 'disable';

  return (
    <>
      <Dialog open={pendingToggle !== null} onClose={() => setPendingToggle(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Confirm {toggleAction === 'enable' ? 'Enable' : 'Disable'} {toggleLabel.charAt(0).toUpperCase() + toggleLabel.slice(1)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to {toggleAction} {toggleLabel} for <strong>{artifactName}</strong>?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingToggle(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmToggle}>
            {toggleAction === 'enable' ? 'Enable' : 'Disable'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={pendingListenerToggle !== null} onClose={() => setPendingListenerToggle(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{listenerAction === 'enable' ? 'Enable Listener' : 'Disable Listener'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to {listenerAction} the listener <strong>{artifactName}</strong>?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingListenerToggle(null)}>Cancel</Button>
          <Button variant="contained" color={listenerAction === 'disable' ? 'error' : 'primary'} onClick={handleConfirmListenerToggle}>
            {listenerAction === 'enable' ? 'Enable' : 'Disable'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={triggerConfirmDialogOpen} onClose={() => setTriggerConfirmDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Trigger Task</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to trigger task <strong>{artifactName}</strong>?
          </DialogContentText>
          <DialogContentText sx={{ mt: 1.5, fontSize: 13, color: 'text.secondary' }}>This will send a trigger command to all runtimes associated with this task.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTriggerConfirmDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmTrigger}>
            Trigger
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ mt: 2 }}>
        {/* Header row */}
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.5 }}>
          {carbonApp && <Chip label={`C-App: ${carbonApp}`} size="small" variant="outlined" sx={{ bgcolor: '#e8eaf6', color: '#3949ab', fontSize: 11 }} />}
          {carbonApp && <Divider orientation="vertical" flexItem />}
          {showStatusChip && artifact.state && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                Status
              </Typography>
              <Chip label={String(artifact.state).charAt(0).toUpperCase() + String(artifact.state).slice(1).toLowerCase()} size="small" variant="outlined" color={toEnabled(artifact.state) ? 'success' : 'default'} />
            </Box>
          )}
          {showStatusChip && artifact.state && (showStatusToggle || showTracingToggle || showStatisticsToggle || showListenerToggle) && <Divider orientation="vertical" flexItem />}
          {showStatusToggle && (
            <SyncSwitch name="status" label="Status" checked={statusEnabled} inSync={artifact.stateInSync as boolean | null} onChange={handleToggleStatus} disabled={updateArtifactStatus.isPending} />
          )}
          {showStatusToggle && showTracingToggle && <Divider orientation="vertical" flexItem />}
          {showTracingToggle && (
            <SyncSwitch label="Tracing" checked={tracingEnabled} inSync={artifact.tracingInSync as boolean | null} onChange={handleToggleTracing} disabled={updateTracingStatus.isPending} />
          )}
          {showTracingToggle && showStatisticsToggle && <Divider orientation="vertical" flexItem />}
          {showStatisticsToggle && (
            <SyncSwitch label="Statistics" checked={statisticsEnabled} inSync={artifact.statisticsInSync as boolean | null} onChange={handleToggleStatistics} disabled={updateStatisticsStatus.isPending} />
          )}
          {(showTracingToggle || showStatisticsToggle) && showListenerToggle && <Divider orientation="vertical" flexItem />}
          {showListenerToggle && (
            <SyncSwitch label="State" checked={listenerEnabled} inSync={artifact.stateInSync as boolean | null} onChange={handleToggleListener} disabled={updateListenerState.isPending} />
          )}
          {showTaskToggle && (
            <>
              {hasPrecedingControls && <Divider orientation="vertical" flexItem />}
              <SyncSwitch label="Status" checked={statusEnabled} inSync={artifact.stateInSync as boolean | null} onChange={handleToggleStatus} disabled={updateArtifactStatus.isPending || !hasRuntimes} />
            </>
          )}
          {showTaskTrigger && (
            <>
              {(hasPrecedingControls || showTaskToggle) && <Divider orientation="vertical" flexItem />}
              <Tooltip title={!hasRuntimes ? 'No runtimes available' : 'Trigger task'}>
                <Box>
                  <IconButton size="small" onClick={handleTriggerTask} disabled={triggerTask.isPending || !hasRuntimes} aria-label="Trigger task" sx={{ color: hasRuntimes ? 'primary.main' : 'text.disabled' }}>
                    <Play size={16} />
                  </IconButton>
                </Box>
              </Tooltip>
            </>
          )}
          {showSourceButton && (
            <Button variant="outlined" size="small" onClick={() => onOpenDrawerTab('Source')} sx={{ ml: 'auto' }}>
              View Source
            </Button>
          )}
          {showParametersButton && (
            <Button variant="outlined" size="small" onClick={() => onOpenDrawerTab('Parameters')} sx={{ ml: 'auto' }}>
              View Parameters
            </Button>
          )}
          {showWsdlButton && (
            <Button variant="outlined" size="small" onClick={() => onOpenDrawerTab('Endpoints')} sx={{ ml: 'auto' }}>
              View Endpoints
            </Button>
          )}
          {showWsdlButton && (
            <Button variant="outlined" size="small" onClick={() => onOpenDrawerTab('WSDL')}>
              View WSDL
            </Button>
          )}
          {showRuntimesButton && (
            <Button variant="outlined" size="small" onClick={() => onOpenDrawerTab('Runtimes')} sx={{ ml: showSourceButton || showParametersButton || showWsdlButton ? 0 : 'auto' }}>
              View Runtimes
            </Button>
          )}
        </Stack>
        {/* Overview columns */}
        {overviewFields.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${overviewFields.length}, 1fr)` }}>
            {overviewFields.map((f, i) => (
              <Box key={f} sx={{ px: 2, py: 1.5, ...(i < overviewFields.length - 1 && { borderRight: '1px solid', borderColor: 'divider' }) }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600, display: 'block' }}>
                  {f.toUpperCase()}
                </Typography>
                {f === 'state' ? (
                  <Chip
                    label={artifact[f] ? artifact[f].toString().charAt(0).toUpperCase() + artifact[f].toString().slice(1).toLowerCase() : '—'}
                    size="small"
                    variant="outlined"
                    color={artifact[f]?.toString().toLowerCase() === 'enabled' ? 'success' : 'default'}
                    sx={{ mt: 0.5, fontSize: 13 }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {artifact[f] ? artifact[f].toString() : '—'}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
        {(ENTRY_POINT_DETAIL_TABS[artifactType] ?? []).includes('Resources') && <Box sx={{ px: 2, py: 1.5 }}>{artifactType === 'RestApi' ? <ArtifactApiDefinition {...tabProps} /> : <ServiceResources {...tabProps} />}</Box>}
        {artifactType === 'ProxyService' && (
          <Box sx={{ px: 2, py: 1.5 }}>
            <ProxyApiReference {...tabProps} />
          </Box>
        )}
        {artifactType === 'Automation' && (
          <Box sx={{ px: 2, py: 1.5 }}>
            <AutomationExecutions {...tabProps} />
          </Box>
        )}
      </Box>
      <Snackbar open={triggerSuccessMessage !== null} autoHideDuration={4000} onClose={() => setTriggerSuccessMessage(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setTriggerSuccessMessage(null)} severity="success" sx={{ width: '100%' }}>
          {triggerSuccessMessage}
        </Alert>
      </Snackbar>
    </>
  );
}

function EntryPointsList({ envId, componentId, projectId, componentType, onOpenDrawer }: { envId: string; componentId: string; projectId: string; componentType: string; onOpenDrawer: (a: GqlArtifact, type: string, envId: string, tab: string) => void }) {
  const [selectedKey, setSelectedKey] = useState('');
  const isMI = componentType === 'MI';

  const { data: apis = [], isLoading: loadingApis } = useArtifacts('RestApi', envId, componentId, { enabled: isMI });
  const { data: proxies = [], isLoading: loadingProxies } = useArtifacts('ProxyService', envId, componentId, { enabled: isMI });
  const { data: inboundEps = [], isLoading: loadingInbound } = useArtifacts('InboundEndpoint', envId, componentId, { enabled: isMI });
  const { data: tasks = [], isLoading: loadingTasks } = useArtifacts('Task', envId, componentId, { enabled: isMI });
  const { data: services = [], isLoading: loadingServices } = useArtifacts('Service', envId, componentId, { enabled: !isMI });
  const { data: listeners = [], isLoading: loadingListeners } = useArtifacts('Listener', envId, componentId, { enabled: !isMI });
  const { data: automations = [], isLoading: loadingAutomations } = useArtifacts('Automation', envId, componentId, { enabled: !isMI });

  const isLoading = isMI ? loadingApis || loadingProxies || loadingInbound || loadingTasks : loadingServices || loadingListeners || loadingAutomations;

  const allEntryPoints = useMemo(
    () =>
      isMI
        ? [...apis.map((a) => ({ artifact: a, type: 'RestApi' })), ...proxies.map((a) => ({ artifact: a, type: 'ProxyService' })), ...inboundEps.map((a) => ({ artifact: a, type: 'InboundEndpoint' })), ...tasks.map((a) => ({ artifact: a, type: 'Task' }))]
        : [...services.map((a) => ({ artifact: a, type: 'Service' })), ...listeners.map((a) => ({ artifact: a, type: 'Listener' })), ...automations.map((a) => ({ artifact: a, type: 'Automation' }))],
    [isMI, apis, proxies, inboundEps, tasks, services, listeners, automations],
  );

  const allKeys = new Set(
    allEntryPoints.map(({ artifact: a, type }) => {
      const artifactKey = type === 'Automation' ? a.packageName : a.name;
      return `${type}::${artifactKey}`;
    }),
  );
  const firstKey = allEntryPoints.length > 0 ? `${allEntryPoints[0].type}::${allEntryPoints[0].type === 'Automation' ? allEntryPoints[0].artifact.packageName : allEntryPoints[0].artifact.name}` : '';
  const activeKey = selectedKey && allKeys.has(selectedKey) ? selectedKey : firstKey;
  const selectedEntry = useMemo(
    () =>
      allEntryPoints.find(({ artifact: a, type }) => {
        const artifactKey = type === 'Automation' ? a.packageName : a.name;
        return `${type}::${artifactKey}` === activeKey;
      }),
    [allEntryPoints, activeKey],
  );

  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (allEntryPoints.length === 0)
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No entry points found for this component.
      </Typography>
    );

  return (
    <>
      <Autocomplete
        value={selectedEntry ?? null}
        onChange={(_, newValue) => {
          if (!newValue) {
            setSelectedKey('');
            return;
          }
          const artifactKey = newValue.type === 'Automation' ? newValue.artifact.packageName : newValue.artifact.name;
          setSelectedKey(`${newValue.type}::${artifactKey}`);
        }}
        options={allEntryPoints}
        autoHighlight
        fullWidth
        getOptionLabel={(option) => {
          const displayName = option.type === 'Automation' ? option.artifact.packageName : option.artifact.name;
          return displayName?.toString() ?? '';
        }}
        isOptionEqualToValue={(a, b) => {
          const aName = a.type === 'Automation' ? a.artifact.packageName : a.artifact.name;
          const bName = b.type === 'Automation' ? b.artifact.packageName : b.artifact.name;
          return a.type === b.type && aName === bName;
        }}
        renderOption={(props, { artifact: a, type }) => {
          const { key, ...optionProps } = props;
          const cfg = ENTRY_POINT_CONFIG[type];
          const meta = cfg?.metaField ? a[cfg.metaField]?.toString() : undefined;
          const displayName = type === 'Automation' ? a.packageName?.toString() : a.name?.toString();
          return (
            <Box key={key} component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }} {...optionProps}>
              <Chip label={cfg?.label} size="small" sx={{ bgcolor: cfg?.bgColor, color: cfg?.color, fontWeight: 700, fontSize: 11, minWidth: 60, justifyContent: 'center' }} />
              <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                {displayName}
              </Typography>
              {meta && (
                <Typography variant="body2" color="text.secondary">
                  {meta}
                </Typography>
              )}
            </Box>
          );
        }}
        renderInput={(params) => {
          const cfg = selectedEntry ? ENTRY_POINT_CONFIG[selectedEntry.type] : undefined;
          const chipAdornment = cfg ? (
            <InputAdornment position="start">
              <Chip label={cfg.label} size="small" sx={{ bgcolor: cfg.bgColor, color: cfg.color, fontWeight: 700, fontSize: 11, minWidth: 60, justifyContent: 'center' }} />
            </InputAdornment>
          ) : null;
          return (
            <TextField
              {...params}
              placeholder="Search entry points..."
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <>
                    {chipAdornment}
                    {params.InputProps.startAdornment}
                  </>
                ),
              }}
            />
          );
        }}
      />
      {selectedEntry && <EntryPointDetail selected={{ artifact: selectedEntry.artifact, artifactType: selectedEntry.type, envId, componentId, projectId }} onOpenDrawerTab={(tab) => onOpenDrawer(selectedEntry.artifact, selectedEntry.type, envId, tab)} />}
    </>
  );
}

export default function Environment({
  env,
  componentId,
  projectId,
  componentType,
  onSelectArtifact,
  onOpenDrawerForTab,
}: {
  env: GqlEnvironment;
  componentId: string;
  projectId: string;
  componentType: string;
  onSelectArtifact: (a: GqlArtifact, type: string, envId: string) => void;
  onOpenDrawerForTab: (a: GqlArtifact, type: string, envId: string, tab: string) => void;
}) {
  const refreshEnvironmentArtifacts = useRefreshEnvironmentArtifacts();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'entryPoints' | 'allArtifacts'>('entryPoints');
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // MI users state
  const [selectedRuntimeId, setSelectedRuntimeId] = useState('');
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  const { data: runtimes = [], error: runtimesError, isLoading: runtimesLoading } = useComponentRuntimes(env.id, projectId, componentId, componentType === 'MI' && settingsPanelOpen && !!env.id && !!projectId && !!componentId);
  const validatedRuntimeId = runtimes.some((r) => r.runtimeId === selectedRuntimeId) ? selectedRuntimeId : '';
  const activeRuntimeId = validatedRuntimeId || (runtimes.length === 1 ? runtimes[0].runtimeId : '');
  const createMiUser = useCreateMiUser();
  const deleteMiUser = useDeleteMiUser();
  const { data: miUsers = [], error: miUsersError, isLoading: miUsersLoading } = useListMiUsers(componentId, activeRuntimeId, componentType === 'MI' && settingsPanelOpen && !!activeRuntimeId);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshEnvironmentArtifacts(env.id, componentId);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const closeCreateUserDialog = () => {
    setCreateUserDialogOpen(false);
    setNewUserId('');
    setNewPassword('');
    setNewIsAdmin(false);
    setCreateUserError(null);
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
            {env.name}
          </Typography>
          <Stack direction="row" alignItems="center" gap={1}>
            <IconButton size="small" onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh">
              <RefreshCw
                size={16}
                style={{
                  animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                  transformOrigin: 'center',
                }}
              />
            </IconButton>
            <Authorized permissions={[Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE]}>
              <Tooltip title="Settings">
                <IconButton size="small" onClick={() => setSettingsPanelOpen(true)} aria-label="Settings">
                  <Settings size={16} />
                </IconButton>
              </Tooltip>
            </Authorized>
          </Stack>
        </Stack>

        {/* Settings side panel */}
        <Drawer anchor="right" open={settingsPanelOpen} onClose={() => setSettingsPanelOpen(false)} sx={{ '& .MuiDrawer-paper': { width: 400, p: 3, boxSizing: 'border-box' } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Settings — {env.name}
            </Typography>
            <IconButton size="small" onClick={() => setSettingsPanelOpen(false)} aria-label="Close settings">
              <X size={16} />
            </IconButton>
          </Stack>

          {/* MI Users section */}
          {componentType === 'MI' && (
            <>
              <Divider sx={{ my: 3 }} />
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Runtime Users
                </Typography>
                <Tooltip title="Add user">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setNewUserId('');
                        setNewPassword('');
                        setNewIsAdmin(false);
                        setCreateUserError(null);
                        setCreateUserDialogOpen(true);
                      }}
                      disabled={!activeRuntimeId}
                      aria-label="Add user">
                      <UserPlus size={16} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>

              {runtimes.length > 1 && (
                <Autocomplete
                  size="small"
                  options={runtimes}
                  getOptionLabel={(r) => r.runtimeId}
                  value={runtimes.find((r) => r.runtimeId === activeRuntimeId) ?? null}
                  onChange={(_, v) => setSelectedRuntimeId(v?.runtimeId ?? '')}
                  renderInput={(params) => <TextField {...params} label="Runtime" placeholder="Select runtime" />}
                  sx={{ mb: 2 }}
                />
              )}

              {runtimesError && (
                <Typography variant="body2" color="error">
                  Failed to load runtimes: {runtimesError.message}
                </Typography>
              )}

              {!runtimesError && !runtimesLoading && !activeRuntimeId && (
                <Typography variant="body2" color="text.secondary">
                  No runtimes available.
                </Typography>
              )}

              {activeRuntimeId && miUsersLoading && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', mt: 2 }} />}

              {activeRuntimeId && !miUsersLoading && miUsersError && (
                <Typography variant="body2" color="error">
                  Failed to load users: {miUsersError.message}
                </Typography>
              )}

              {activeRuntimeId && !miUsersLoading && !miUsersError && miUsers.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No users found.
                </Typography>
              )}

              {activeRuntimeId && !miUsersLoading && miUsers.length > 0 && (
                <List dense disablePadding>
                  {miUsers.map((u) => (
                    <ListItem
                      key={u.username}
                      disableGutters
                      secondaryAction={
                        <Tooltip title={`Delete ${u.username}`}>
                          <IconButton size="small" color="error" onClick={() => setDeleteUserTarget(u.username)} aria-label={`Delete ${u.username}`}>
                            <Trash2 size={14} />
                          </IconButton>
                        </Tooltip>
                      }>
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" gap={1}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {u.username}
                            </Typography>
                            {u.isAdmin && <Chip label="Admin" size="small" color="primary" sx={{ fontSize: 10, height: 18 }} />}
                          </Stack>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
        </Drawer>

        {/* Create MI User dialog */}
        <Dialog open={createUserDialogOpen} onClose={closeCreateUserDialog} maxWidth="xs" fullWidth>
          <DialogTitle>Add Runtime User</DialogTitle>
          <DialogContent>
            {createUserError && (
              <Alert severity="error" onClose={() => setCreateUserError(null)} sx={{ mb: 2 }}>
                {createUserError}
              </Alert>
            )}
            <Stack gap={2} sx={{ mt: 1 }}>
              <TextField label="Username" required fullWidth size="small" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} autoFocus />
              <TextField label="Password" required type="password" fullWidth size="small" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <FormControlLabel control={<Switch size="small" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />} label="Admin user" labelPlacement="start" sx={{ m: 0, gap: 1, justifyContent: 'space-between' }} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeCreateUserDialog}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!newUserId.trim() || !newPassword.trim() || createMiUser.isPending}
              onClick={() => {
                setCreateUserError(null);
                createMiUser.mutate(
                  { componentId, runtimeId: activeRuntimeId, username: newUserId.trim(), password: newPassword, isAdmin: newIsAdmin },
                  {
                    onSuccess: closeCreateUserDialog,
                    onError: (err) => setCreateUserError(err.message ?? 'Failed to create user'),
                  },
                );
              }}>
              {createMiUser.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete MI User confirmation dialog */}
        <Dialog
          open={deleteUserTarget !== null}
          onClose={() => {
            setDeleteUserTarget(null);
            setDeleteUserError(null);
          }}
          maxWidth="xs"
          fullWidth>
          <DialogTitle>Delete User</DialogTitle>
          <DialogContent>
            {deleteUserError && (
              <Alert severity="error" onClose={() => setDeleteUserError(null)} sx={{ mb: 2 }}>
                {deleteUserError}
              </Alert>
            )}
            <DialogContentText>
              Are you sure you want to delete user <strong>{deleteUserTarget}</strong> from the runtime? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setDeleteUserTarget(null);
                setDeleteUserError(null);
              }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={deleteMiUser.isPending}
              onClick={() => {
                if (!deleteUserTarget) return;
                deleteMiUser.mutate(
                  { componentId, runtimeId: activeRuntimeId, username: deleteUserTarget },
                  {
                    onSuccess: () => {
                      setDeleteUserTarget(null);
                      setDeleteUserError(null);
                    },
                    onError: (err) => setDeleteUserError(err.message),
                  },
                );
              }}>
              {deleteMiUser.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>

        <Divider sx={{ my: 2 }} />
        {componentType === 'MI' && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Stack direction="row">
              <Button variant={viewMode === 'entryPoints' ? 'contained' : 'outlined'} size="small" startIcon={<ListFilter size={14} />} onClick={() => setViewMode('entryPoints')} sx={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                Entry Points
              </Button>
              <Button variant={viewMode === 'allArtifacts' ? 'contained' : 'outlined'} size="small" startIcon={<LayoutGrid size={14} />} onClick={() => setViewMode('allArtifacts')} sx={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, ml: '-1px' }}>
                Supporting Artifacts
              </Button>
            </Stack>
          </Stack>
        )}
        {(componentType !== 'MI' || viewMode === 'entryPoints') && <EntryPointsList envId={env.id} componentId={componentId} projectId={projectId} componentType={componentType} onOpenDrawer={onOpenDrawerForTab} />}
        {componentType === 'MI' && viewMode === 'allArtifacts' && <ArtifactTypeSelector envId={env.id} componentId={componentId} onSelectArtifact={onSelectArtifact} />}
      </CardContent>
    </Card>
  );
}
