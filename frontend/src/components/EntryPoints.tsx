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
  IconButton,
  InputAdornment,
  Snackbar,
  Alert,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { RefreshCw, ListFilter, LayoutGrid, Settings, Copy, Check, Play, ShieldAlert } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useArtifacts, useRefreshEnvironmentArtifacts, type GqlArtifact, type GqlEnvironment } from '../api/queries';
import { useUpdateArtifactTracingStatus, useUpdateArtifactStatisticsStatus } from '../api/artifactToggleMutations';
import { useUpdateArtifactStatus, useUpdateListenerState, useTriggerTask, useGenerateComponentEnvironmentJwtSecret, useRotateComponentEnvironmentJwtSecret } from '../api/mutations';
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
  const showListenerToggle = artifactType === 'Listener';
  const showTaskToggle = artifactType === 'Task';
  const showTaskTrigger = artifactType === 'Task';
  const hasRuntimes = artifact.runtimes && Array.isArray(artifact.runtimes) && artifact.runtimes.length > 0;

  // Track if any preceding controls are visible for proper divider placement
  const hasPrecedingControls = carbonApp || showStatusToggle || showTracingToggle || showStatisticsToggle || showListenerToggle;
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
  componentHandler,
  projectHandler,
  onSelectArtifact,
  onOpenDrawerForTab,
}: {
  env: GqlEnvironment;
  componentId: string;
  projectId: string;
  componentType: string;
  componentHandler: string;
  projectHandler: string;
  onSelectArtifact: (a: GqlArtifact, type: string, envId: string) => void;
  onOpenDrawerForTab: (a: GqlArtifact, type: string, envId: string, tab: string) => void;
}) {
  const refreshEnvironmentArtifacts = useRefreshEnvironmentArtifacts();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'entryPoints' | 'allArtifacts'>('entryPoints');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);

  const generateSecretMutation = useGenerateComponentEnvironmentJwtSecret();
  const rotateSecretMutation = useRotateComponentEnvironmentJwtSecret();

  // The currently displayed secret — updated by both generate and rotate.
  const activeSecret = rotateSecretMutation.data ?? generateSecretMutation.data ?? '';
  const secretLoading = generateSecretMutation.isPending || rotateSecretMutation.isPending;
  const secretError = generateSecretMutation.error?.message ?? rotateSecretMutation.error?.message ?? null;

  const handleOpenConfigDialog = () => {
    setConfigDialogOpen(true);
    // Fetch existing secret (or provision one if this is the first time).
    generateSecretMutation.mutate({ componentId, environmentId: env.id });
  };

  const handleRotateSecret = () => {
    setRotateConfirmOpen(false);
    rotateSecretMutation.mutate({ componentId, environmentId: env.id });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshEnvironmentArtifacts(env.id, componentId);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const generateTomlConfig = (secret: string) => {
    // Runtime ID is not yet known until the runtime first registers.
    const runtimeId = '<Runtime ID>';

    if (componentType === 'BI') {
      return `[ballerinax.wso2.icp]
runtime="${runtimeId}"
integration="${componentHandler}"
project="${projectHandler}"
environment="${env.name}"
heartbeatInterval=10
secret="${secret || '<generating…>'}"\n# serverUrl="https://localhost:9445"`;
    } else {
      // MI
      return `[icp_config]
enabled = true
runtime = "${runtimeId}"
environment = "${env.name}"
project = "${projectHandler}"
integration = "${componentHandler}"
secret = "${secret || '<generating…>'}"\n# icp_url = "https://icp-server:9443"`;
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generateTomlConfig(activeSecret));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
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
            <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
              <Button variant="contained" startIcon={<Settings size={16} />} onClick={handleOpenConfigDialog}>
                Configure Runtime
              </Button>
            </Authorized>
          </Stack>
        </Stack>
        <Dialog open={configDialogOpen} onClose={() => setConfigDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Configure Runtime - {env.name}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>Add the following configuration to your runtime's {componentType === 'BI' ? 'Config.toml' : 'deployment.toml'} file:</DialogContentText>
            {secretError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {secretError}
              </Alert>
            )}
            <Box
              component="pre"
              sx={{
                bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
                color: (theme) => theme.palette.text.primary,
                p: 2,
                borderRadius: 1,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: 13,
                border: '1px solid',
                borderColor: 'divider',
                opacity: secretLoading ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}>
              {secretLoading ? 'Loading configuration…' : generateTomlConfig(activeSecret)}
            </Box>
            <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                <Tooltip title="Generate a new secret. Existing runtimes must be restarted with the new value.">
                  <span>
                    <Button size="small" color="error" variant="outlined" startIcon={<ShieldAlert size={14} />} disabled={secretLoading} onClick={() => setRotateConfirmOpen(true)}>
                      Rotate Secret
                    </Button>
                  </span>
                </Tooltip>
              </Authorized>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfigDialogOpen(false)}>Close</Button>
            <Button variant="contained" startIcon={copySuccess ? <Check size={16} /> : <Copy size={16} />} onClick={handleCopyToClipboard} disabled={secretLoading || !activeSecret}>
              {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Rotate-secret confirmation dialog */}
        <Dialog open={rotateConfirmOpen} onClose={() => setRotateConfirmOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Rotate JWT Secret?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will generate a new HMAC secret for <strong>{env.name}</strong>. Any running runtimes will stop authenticating until they are restarted with the new <code>secret</code> value.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRotateConfirmOpen(false)}>Cancel</Button>
            <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
              <Button variant="contained" color="error" startIcon={<ShieldAlert size={16} />} onClick={handleRotateSecret} disabled={rotateSecretMutation.isPending}>
                {rotateSecretMutation.isPending ? 'Rotating…' : 'Rotate'}
              </Button>
            </Authorized>
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
