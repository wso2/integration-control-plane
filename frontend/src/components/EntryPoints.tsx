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
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Alert,
  Stack,
  TextField,
  Checkbox,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { RefreshCw, ListFilter, LayoutGrid, Server, Settings, Play, Square, Plus, X, Trash2, UserPlus, Code, Sliders, Link as LinkIcon, FileText, BookOpen, Package, Tag, FlaskConical, Layers } from '@wso2/oxygen-ui-icons-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useArtifacts, useRefreshEnvironmentArtifacts, useComponentRuntimes, type GqlArtifact, type GqlEnvironment } from '../api/queries';
import { useUpdateArtifactTracingStatus, useUpdateArtifactStatisticsStatus } from '../api/artifactToggleMutations';
import { useUpdateArtifactStatus, useUpdateListenerState, useTriggerTask } from '../api/mutations';
import { useListMiUsers, useCreateMiUser, useDeleteMiUser } from '../api/miUsers';
import { ArtifactApiDefinition, ServiceResources, ServiceListeners, AutomationExecutions, ProxyApiReference } from './ArtifactTabs';
import { StartWorkflowDialog, type Toast as WorkflowToast } from './workflow/AdminPortal';
import { DefinitionStatsStrip } from './workflow/DefinitionStatsStrip';
import { ArtifactTypeSelector } from './ArtifactDetail';
import Authorized from './Authorized';
import { Permissions } from '../constants/permissions';
import { hasComponent, resourceUrl, useScope } from '../nav';
import { useAccessControl } from '../contexts/AccessControlContext';
import { isWorkflowIntegration } from '../constants/integrationTypes';
import { ENTRY_POINT_CONFIG, ENTRY_POINT_DETAIL_TABS, type SelectedArtifact, type TabProps } from './artifact-config';
import SyncSwitch from './SyncSwitch';
import CopyButton from './CopyButton';

// Stable reference for useArtifacts' `data` fallback — a fresh `[]` literal on every render (the
// default in `const { data: x = [] } = ...`) changes identity even when the query is disabled and
// data is genuinely unchanged, which cascades through downstream useMemo/useEffect chains and can
// trigger a render loop (e.g. EntryPointsList's onSelectionChange effect).
const EMPTY_ARTIFACTS: GqlArtifact[] = [];

function toEnabled(value: unknown) {
  if (typeof value === 'boolean') return value;
  const normalized = (value ?? '').toString().toLowerCase();
  return normalized === 'enabled' || normalized === 'active' || normalized === 'true';
}

// Small colored tag identifying an entry point's artifact type (API, Proxy, Inbound, Task…) — used
// in the MI entry point picker, where several artifact types are mixed into a single list.
function EntryTypeChip({ cfg }: { cfg?: { label: string; color: string; bgColor: string } }) {
  if (!cfg) return null;
  return <Chip label={cfg.label} size="small" sx={{ bgcolor: cfg.bgColor, color: cfg.color, fontWeight: 700, fontSize: 11, minWidth: 60, justifyContent: 'center' }} />;
}

// swagger-ui-react is ~1.3MB gzipped - code-split it out of the main bundle since it's only
// needed when a user actually opens the API docs drawer for a BI service.
const OpenApiDefinitionsDrawer = lazy(() => import('./OpenApiDefinitionsDrawer').then((m) => ({ default: m.OpenApiDefinitionsDrawer })));

// View Workflows / Start New Workflow, with the start dialog and its toast.
function WorkflowActions({ componentId, envId, workflowType }: { componentId: string; envId: string; workflowType: string }) {
  const [startOpen, setStartOpen] = useState(false);
  const [toast, setToast] = useState<WorkflowToast>(null);
  const navigate = useNavigate();
  const scope = useScope();

  return (
    <>
      <Button variant="contained" size="small" startIcon={<LayoutGrid size={14} />} onClick={() => navigate(`${resourceUrl(scope, 'workflows')}?tab=management&type=${encodeURIComponent(workflowType)}&env=${encodeURIComponent(envId)}`)}>
        View Workflows
      </Button>
      <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
        <Button variant="contained" size="small" startIcon={<Play size={14} />} onClick={() => setStartOpen(true)}>
          Start New Workflow
        </Button>
      </Authorized>
      {startOpen && (
        <StartWorkflowDialog scope={{ targets: [{ componentId, componentName: '', handler: hasComponent(scope) ? scope.component : '' }], environmentId: envId }} initialWorkflowType={workflowType} onClose={() => setStartOpen(false)} onToast={setToast} />
      )}
      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {/* Alert stays mounted so the Snackbar's exit transition can play after the toast clears. */}
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)} sx={{ width: '100%' }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </>
  );
}

function EntryPointDetail({ selected, onOpenDrawerTab }: { selected: SelectedArtifact; onOpenDrawerTab: (tab: string) => void }) {
  const [tracingEnabled, setTracingEnabled] = useState(false);
  const [statisticsEnabled, setStatisticsEnabled] = useState(false);
  const [statusEnabled, setStatusEnabled] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ type: 'tracing' | 'statistics' | 'status'; checked: boolean } | null>(null);
  const [listenerEnabled, setListenerEnabled] = useState(false);
  const [pendingListenerToggle, setPendingListenerToggle] = useState<{ checked: boolean } | null>(null);
  // Which direction is actually in flight — drives each button's own busy label, so a
  // Disable action in progress can't make the (now-visible) Enable button say "Enabling…".
  const [pendingListenerAction, setPendingListenerAction] = useState<'START' | 'STOP' | null>(null);
  const [listenerToggleError, setListenerToggleError] = useState<string | null>(null);
  const [triggerConfirmDialogOpen, setTriggerConfirmDialogOpen] = useState(false);
  const [triggerSuccessMessage, setTriggerSuccessMessage] = useState<string | null>(null);
  const { artifact, artifactType, envId, componentId, projectId } = selected;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const scope = useScope();
  const { hasAnyPermission } = useAccessControl();
  const canViewTasks = hasAnyPermission([Permissions.WORKFLOW_VIEW_HUMAN_TASKS, Permissions.WORKFLOW_MANAGE_HUMAN_TASKS], projectId, componentId);
  const updateTracingStatus = useUpdateArtifactTracingStatus();
  const updateStatisticsStatus = useUpdateArtifactStatisticsStatus();
  const updateArtifactStatus = useUpdateArtifactStatus();
  const updateListenerState = useUpdateListenerState();
  const triggerTask = useTriggerTask();
  const config = ENTRY_POINT_CONFIG[artifactType];
  const tabProps: TabProps = { artifact, artifactType, envId, componentId, projectId };
  const compositeApp = artifact.compositeApp?.toString();
  const artifactState = artifact.state?.toString();
  const overviewFields = (config?.overviewFields ?? '').split(', ').filter(Boolean);
  const showTracingToggle = ['RestApi', 'ProxyService', 'InboundEndpoint'].includes(artifactType);
  const showParametersButton = artifactType === 'InboundEndpoint';
  const showWsdlButton = artifactType === 'ProxyService';
  const showStatisticsToggle = ['RestApi', 'ProxyService', 'InboundEndpoint'].includes(artifactType);
  const showStatusToggle = ['ProxyService', 'InboundEndpoint'].includes(artifactType);
  const showStatusChip = artifactType === 'RestApi' || artifactType === 'Listener';
  const showListenerToggle = artifactType === 'Listener';
  const showTaskToggle = artifactType === 'Task';
  const showTaskTrigger = artifactType === 'Task';
  const hasRuntimes = artifact.runtimes && Array.isArray(artifact.runtimes) && artifact.runtimes.length > 0;
  const artifactRuntimes = (artifact.runtimes as Array<{ runtimeId: string; status: string }> | undefined) ?? [];
  const showApiDocsButton = artifactType === 'Service' && Boolean(hasRuntimes);
  // A Service can have multiple runtime instances (e.g. one per environment/replica); they all
  // run the same deployed code, so any instance's packed OpenAPI docs are representative. Prefer
  // a RUNNING one so the "Try it out" requests in the drawer have somewhere to actually land.
  const apiDocsRuntimeId = artifactRuntimes.find((r) => r.status === 'RUNNING')?.runtimeId ?? artifactRuntimes[0]?.runtimeId;
  const [viewingApiDocs, setViewingApiDocs] = useState(false);

  // Track if any preceding controls are visible for proper divider placement
  const hasPrecedingControls = compositeApp || showStatusToggle || showStatusChip || showTracingToggle || showStatisticsToggle || showListenerToggle;
  const hasHeaderControls =
    !!compositeApp || showStatusChip || showStatusToggle || showTracingToggle || showStatisticsToggle || showListenerToggle || showParametersButton || showWsdlButton || showTaskToggle || showTaskTrigger || (showApiDocsButton && !!apiDocsRuntimeId);

  const artifactName = artifactType === 'Automation' ? (artifact.packageName?.toString() ?? '') : (artifact.name?.toString() ?? '');
  const artifactKey = `${artifactType}-${artifactName}`;
  useEffect(() => {
    setTracingEnabled(toEnabled(artifact.tracing));
    setStatisticsEnabled(toEnabled(artifact.statistics));
    setStatusEnabled(toEnabled(artifact.state));
  }, [artifactKey, artifact.tracing, artifact.statistics, artifact.state]);

  useEffect(() => {
    if (showListenerToggle && !pendingListenerAction) {
      setListenerEnabled(toEnabled(artifact.state));
    }
  }, [showListenerToggle, artifact.state, pendingListenerAction]);

  // Clear the busy state as soon as `state` itself reflects the requested change — the
  // same field the status indicator below already uses, so both update in lockstep.
  useEffect(() => {
    if (!showListenerToggle || !pendingListenerAction) return;
    const targetEnabled = pendingListenerAction === 'START';
    if (toEnabled(artifact.state) === targetEnabled) {
      setPendingListenerAction(null);
    }
  }, [showListenerToggle, artifact.state, pendingListenerAction]);

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

  const handleToggleListener = (checked: boolean) => {
    if (!showListenerToggle) return;
    setPendingListenerToggle({ checked });
  };

  const handleConfirmListenerToggle = () => {
    const runtimes = artifact.runtimes as Array<{ runtimeId: string }> | undefined;
    if (!pendingListenerToggle || !runtimes || runtimes.length === 0) {
      setPendingListenerToggle(null);
      return;
    }

    const runtimeIds = runtimes.map((r) => r.runtimeId);
    const action = pendingListenerToggle.checked ? 'START' : 'STOP';
    const artifactQueryKey = ['artifacts', artifactType, envId, componentId];

    // Don't optimistically flip listenerEnabled here — that would swap which button is
    // visible before the backend has confirmed anything. The clicked button stays put
    // and shows its own busy label until the sync effect above updates listenerEnabled
    // from the real (confirmed) artifact state once pendingListenerAction clears.
    setPendingListenerAction(action);
    setListenerToggleError(null);

    updateListenerState.mutate(
      {
        runtimeIds,
        listenerName: artifactName,
        listenerPackage: artifact.package?.toString(),
        port: typeof artifact.port === 'number' ? artifact.port : undefined,
        action,
      },
      {
        onError: (err) => {
          setPendingListenerAction(null);
          setListenerToggleError(err instanceof Error ? err.message : 'Failed to update listener state');
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: artifactQueryKey });
        },
      },
    );

    setPendingListenerToggle(null);
  };

  const listenerToggleAction = pendingListenerToggle?.checked ? 'enable' : 'disable';

  const toggleLabel = pendingToggle?.type ?? 'status';
  const toggleAction = pendingToggle?.checked ? 'enable' : 'disable';

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
        <DialogTitle>{listenerToggleAction === 'enable' ? 'Enable Listener' : 'Disable Listener'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to {listenerToggleAction} the listener <strong>{artifactName}</strong>?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingListenerToggle(null)}>Cancel</Button>
          <Button variant="contained" color={listenerToggleAction === 'disable' ? 'error' : 'success'} onClick={handleConfirmListenerToggle}>
            {listenerToggleAction === 'enable' ? 'Enable' : 'Disable'}
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
      <Box sx={{ mt: hasHeaderControls ? 2 : 0 }}>
        {/* Header row — hidden when this artifact type has no controls (e.g. a BI service) */}
        {hasHeaderControls && (
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.5 }}>
            {compositeApp && <Chip label={`Composite App: ${compositeApp}`} size="small" variant="outlined" sx={{ bgcolor: '#e8eaf6', color: '#3949ab', fontSize: 11 }} />}
            {compositeApp && <Divider orientation="vertical" flexItem />}
            {showStatusChip && artifactState && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Status
                </Typography>
                {artifactType === 'Listener' || artifactType === 'RestApi' ? (
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: toEnabled(artifact.state) ? 'success.main' : 'text.disabled' }} />
                    <Typography variant="body2">{toEnabled(artifact.state) ? 'Enabled' : 'Disabled'}</Typography>
                  </Stack>
                ) : (
                  <Chip label={artifactState.charAt(0).toUpperCase() + artifactState.slice(1).toLowerCase()} size="small" variant="outlined" color={toEnabled(artifact.state) ? 'success' : 'default'} sx={{ fontSize: '0.875rem' }} />
                )}
              </Box>
            )}
            {showStatusChip && artifactState && (showStatusToggle || showTracingToggle || showStatisticsToggle || showListenerToggle) && <Divider orientation="vertical" flexItem />}
            {showStatusToggle && <SyncSwitch name="status" label="Status" checked={statusEnabled} inSync={artifact.stateInSync as boolean | null} onChange={handleToggleStatus} disabled={updateArtifactStatus.isPending} />}
            {showStatusToggle && showTracingToggle && <Divider orientation="vertical" flexItem />}
            {showTracingToggle && <SyncSwitch label="Tracing" checked={tracingEnabled} inSync={artifact.tracingInSync as boolean | null} onChange={handleToggleTracing} disabled={updateTracingStatus.isPending} />}
            {showTracingToggle && showStatisticsToggle && <Divider orientation="vertical" flexItem />}
            {showStatisticsToggle && <SyncSwitch label="Statistics" checked={statisticsEnabled} inSync={artifact.statisticsInSync as boolean | null} onChange={handleToggleStatistics} disabled={updateStatisticsStatus.isPending} />}
            {showListenerToggle && !listenerEnabled && (
              <Tooltip title={!hasRuntimes ? 'No runtimes available' : 'Enable listener'}>
                <span style={{ marginLeft: 'auto' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    color="success"
                    startIcon={pendingListenerAction === 'START' ? <CircularProgress size={12} color="inherit" /> : <Play size={14} />}
                    disabled={pendingListenerAction !== null || !hasRuntimes}
                    onClick={() => handleToggleListener(true)}>
                    {pendingListenerAction === 'START' ? 'Enabling…' : 'Enable'}
                  </Button>
                </span>
              </Tooltip>
            )}
            {showListenerToggle && listenerEnabled && (
              <Tooltip title={!hasRuntimes ? 'No runtimes available' : 'Disable listener'}>
                <span style={{ marginLeft: 'auto' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={pendingListenerAction === 'STOP' ? <CircularProgress size={12} color="inherit" /> : <Square size={14} />}
                    disabled={pendingListenerAction !== null || !hasRuntimes}
                    onClick={() => handleToggleListener(false)}>
                    {pendingListenerAction === 'STOP' ? 'Disabling…' : 'Disable'}
                  </Button>
                </span>
              </Tooltip>
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
            {showParametersButton && (
              <Button variant="contained" size="small" startIcon={<Sliders size={14} />} onClick={() => onOpenDrawerTab('Parameters')} sx={{ ml: 'auto' }}>
                View Parameters
              </Button>
            )}
            {showWsdlButton && (
              <Button variant="text" size="small" startIcon={<LinkIcon size={14} />} onClick={() => onOpenDrawerTab('Endpoints')} sx={{ textTransform: 'none', ml: showParametersButton ? 0 : 'auto' }}>
                View Endpoints
              </Button>
            )}
            {showWsdlButton && (
              <Button variant="text" size="small" startIcon={<FileText size={14} />} onClick={() => onOpenDrawerTab('WSDL')} sx={{ textTransform: 'none' }}>
                View WSDL
              </Button>
            )}
            {showApiDocsButton && apiDocsRuntimeId && (
              <Stack direction="row" gap={1} sx={{ ml: 'auto' }}>
                <Authorized permissions={[Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE]}>
                  <Button variant="outlined" size="small" startIcon={<FlaskConical size={14} />} onClick={() => navigate(`${resourceUrl(scope, 'test')}?service=${encodeURIComponent(artifactName)}&env=${encodeURIComponent(envId)}`)}>
                    Test
                  </Button>
                </Authorized>
                <Button variant="contained" size="small" startIcon={<BookOpen size={14} />} onClick={() => setViewingApiDocs(true)}>
                  View API Docs
                </Button>
              </Stack>
            )}
          </Stack>
        )}
        {/* Overview columns */}
        {overviewFields.length > 0 && artifactType !== 'Service' && (
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
        {artifactType === 'Workflow' && hasComponent(scope) && (
          <Authorized permissions={[Permissions.WORKFLOW_VIEW_WORKFLOWS, Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
            <DefinitionStatsStrip scope={scope} componentId={componentId} environmentId={envId} workflowType={artifactName} canViewReviews canViewTasks={canViewTasks} />
          </Authorized>
        )}
        {/* pt: 0 for Service — it's the first block rendered (no header/overview above it here), so
            the grid's own mb above already provides the gap; adding padding-top on top of that
            margin doesn't collapse the way devant's stacked margins do, and reads as too much space. */}
        {(ENTRY_POINT_DETAIL_TABS[artifactType] ?? []).includes('Resources') && (
          <Box sx={{ px: 2, pt: artifactType === 'Service' ? 0 : 1.5, pb: 1.5 }}>{artifactType === 'RestApi' ? <ArtifactApiDefinition {...tabProps} /> : <ServiceResources {...tabProps} />}</Box>
        )}
        {(ENTRY_POINT_DETAIL_TABS[artifactType] ?? []).includes('Listeners') && (
          <Box sx={{ px: 2, py: 1.5 }}>
            <ServiceListeners {...tabProps} />
          </Box>
        )}
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
      <Snackbar open={listenerToggleError !== null} autoHideDuration={6000} onClose={() => setListenerToggleError(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setListenerToggleError(null)} severity="error" sx={{ width: '100%' }}>
          {listenerToggleError}
        </Alert>
      </Snackbar>
      {viewingApiDocs && apiDocsRuntimeId && (
        <Suspense fallback={null}>
          <OpenApiDefinitionsDrawer runtimeId={apiDocsRuntimeId} onClose={() => setViewingApiDocs(false)} serviceBasePath={artifact.basePath?.toString()} />
        </Suspense>
      )}
    </>
  );
}

function EntryPointsList({
  envId,
  componentId,
  projectId,
  componentType,
  displayType,
  isOnline,
  onOpenDrawer,
  onSelectionChange,
}: {
  envId: string;
  componentId: string;
  projectId: string;
  componentType: string;
  displayType?: string;
  isOnline: boolean;
  onOpenDrawer: (a: GqlArtifact, type: string, envId: string, tab: string) => void;
  onSelectionChange?: (entry: { artifact: GqlArtifact; type: string } | null) => void;
}) {
  const [selectedKey, setSelectedKey] = useState('');
  const navigate = useNavigate();
  const scope = useScope();
  const isMI = componentType === 'MI';
  // Workflow definitions are shown for a Workflow integration and no other type. Its BI runtime also
  // reports the service and listener artifacts that host the workflow engine, but those are
  // implementation detail rather than something the integration exposes - so the two sets do not mix
  // in either direction.
  const workflowOnly = isWorkflowIntegration(displayType);

  const { data: apis = EMPTY_ARTIFACTS, isLoading: loadingApis } = useArtifacts('RestApi', envId, componentId, { enabled: isMI, active: isOnline });
  const { data: proxies = EMPTY_ARTIFACTS, isLoading: loadingProxies } = useArtifacts('ProxyService', envId, componentId, { enabled: isMI, active: isOnline });
  const { data: inboundEps = EMPTY_ARTIFACTS, isLoading: loadingInbound } = useArtifacts('InboundEndpoint', envId, componentId, { enabled: isMI, active: isOnline });
  const { data: tasks = EMPTY_ARTIFACTS, isLoading: loadingTasks } = useArtifacts('Task', envId, componentId, { enabled: isMI, active: isOnline });
  const { data: services = EMPTY_ARTIFACTS, isLoading: loadingServices } = useArtifacts('Service', envId, componentId, { enabled: !isMI && !workflowOnly, active: isOnline });
  const { data: automations = EMPTY_ARTIFACTS, isLoading: loadingAutomations } = useArtifacts('Automation', envId, componentId, { enabled: !isMI && !workflowOnly, active: isOnline });
  const { data: workflows = EMPTY_ARTIFACTS, isLoading: loadingWorkflows } = useArtifacts('Workflow', envId, componentId, { enabled: !isMI && workflowOnly, active: isOnline });

  const isLoading = isMI ? loadingApis || loadingProxies || loadingInbound || loadingTasks : workflowOnly ? loadingWorkflows : loadingServices || loadingAutomations;

  const allEntryPoints = useMemo(
    () =>
      isMI
        ? [...apis.map((a) => ({ artifact: a, type: 'RestApi' })), ...proxies.map((a) => ({ artifact: a, type: 'ProxyService' })), ...inboundEps.map((a) => ({ artifact: a, type: 'InboundEndpoint' })), ...tasks.map((a) => ({ artifact: a, type: 'Task' }))]
        : workflowOnly
          ? workflows.map((a) => ({ artifact: a, type: 'Workflow' }))
          : [...services.map((a) => ({ artifact: a, type: 'Service' })), ...automations.map((a) => ({ artifact: a, type: 'Automation' }))],
    [isMI, workflowOnly, apis, proxies, inboundEps, tasks, services, workflows, automations],
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

  useEffect(() => {
    onSelectionChange?.(selectedEntry ? { artifact: selectedEntry.artifact, type: selectedEntry.type } : null);
  }, [selectedEntry, onSelectionChange]);

  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (allEntryPoints.length === 0)
    return (
      <Stack alignItems="center" sx={{ py: 4 }} gap={2}>
        <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
          No entry points found for this integration. Add runtime to get started.
        </Typography>
        <Authorized permissions={[Permissions.INTEGRATION_MANAGE]}>
          <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => navigate(`${resourceUrl(scope, 'runtimes')}?action=add-runtime&environmentId=${encodeURIComponent(envId)}`)}>
            Add Runtime
          </Button>
        </Authorized>
      </Stack>
    );

  // Which pair of fields to show depends on the selected entry's artifact type: Tasks have
  // no URL/Context, only group/class; Proxies have neither; the remaining MI types (API/Inbound) do.
  const isTask = selectedEntry?.type === 'Task';
  const isProxy = selectedEntry?.type === 'ProxyService';
  const primaryLabel = isProxy ? '' : isTask ? 'Class' : isMI ? 'URL' : 'Package';
  const secondaryLabel = isProxy ? '' : isTask ? 'Group' : isMI ? 'Context' : 'API';
  // A workflow integration lists workflow definitions, and the management API reports no package or
  // API for them - Package read as an em dash and API only repeated the name in the selector - so
  // the selector is named for what it holds and those two columns are dropped.
  const selectorLabel = workflowOnly ? 'Workflow Definitions' : 'Endpoint';

  return (
    <>
      {/* Selector / Package / API grid — mirrors devant's endpoint panel layout. MI components
          don't have a package/API concept, so they show URL/Context instead (or group/class for Tasks);
          workflow integrations have neither and show the selector alone. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: workflowOnly ? 'minmax(220px, 360px) 1fr' : '220px 1fr 1fr', columnGap: 2, rowGap: 0.75, alignItems: 'start', mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {selectorLabel}
        </Typography>
        {workflowOnly ? (
          // Empty header cell above the actions, so grid auto-placement keeps the selector and the
          // buttons on the same row.
          <Box />
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {primaryLabel}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {secondaryLabel}
            </Typography>
          </>
        )}

        <Select
          size="small"
          value={activeKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          inputProps={{ 'aria-label': selectorLabel }}
          sx={{ fontSize: '13px', width: '100%' }}
          renderValue={(val) => {
            const entry = allEntryPoints.find(({ artifact: a, type }) => `${type}::${type === 'Automation' ? a.packageName : a.name}` === val);
            if (!entry) return '';
            const cfg = ENTRY_POINT_CONFIG[entry.type];
            const raw = (cfg?.primaryDisplay && cfg.metaField ? (entry.artifact[cfg.metaField]?.toString() ?? entry.artifact.name?.toString()) : entry.type === 'Automation' ? entry.artifact.packageName?.toString() : entry.artifact.name?.toString()) ?? '';
            // Chip is intentionally omitted here (closed box) — it would eat into the fixed-width
            // box's space and truncate long names. It only shows in the open dropdown list below.
            return raw.replace(/^\//, '');
          }}>
          {allEntryPoints.map(({ artifact: a, type }) => {
            const cfg = ENTRY_POINT_CONFIG[type];
            const rawLabel = (cfg?.primaryDisplay && cfg.metaField ? (a[cfg.metaField]?.toString() ?? a.name?.toString()) : type === 'Automation' ? a.packageName?.toString() : a.name?.toString()) ?? '';
            const label = rawLabel.replace(/^\//, '');
            const key = `${type}::${type === 'Automation' ? a.packageName : a.name}`;
            return (
              <MenuItem key={key} value={key} sx={{ fontSize: '13px' }}>
                {isMI ? (
                  <Stack direction="row" alignItems="center" gap={1}>
                    <EntryTypeChip cfg={cfg} />
                    <span>{label}</span>
                  </Stack>
                ) : (
                  label
                )}
              </MenuItem>
            );
          })}
        </Select>

        {workflowOnly && selectedEntry && (
          <Stack direction="row" gap={1} sx={{ alignSelf: 'center', justifyContent: 'flex-end' }}>
            <WorkflowActions componentId={componentId} envId={envId} workflowType={selectedEntry.artifact.name?.toString() ?? ''} />
          </Stack>
        )}
        {!workflowOnly &&
          (() => {
            if (isProxy)
              return (
                <>
                  <Box />
                  <Box />
                </>
              );
            const primaryValue = (isTask ? selectedEntry?.artifact.class : isMI ? selectedEntry?.artifact.url : selectedEntry?.artifact.package)?.toString();
            const secondaryValue = (isTask ? selectedEntry?.artifact.group : isMI ? selectedEntry?.artifact.context : selectedEntry?.artifact.name)?.toString();
            return (
              <>
                <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0, alignSelf: 'center' }}>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}>
                    {isTask ? <Layers size={15} /> : isMI ? <LinkIcon size={15} /> : <Package size={15} />}
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {primaryValue ?? '—'}
                  </Typography>
                  {primaryValue ? <CopyButton value={primaryValue} label={primaryLabel} /> : null}
                </Stack>

                <Stack direction="row" alignItems="center" gap={0.75} sx={{ alignSelf: 'center' }}>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}>
                    <Tag size={15} />
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {secondaryValue ?? '—'}
                  </Typography>
                </Stack>
              </>
            );
          })()}
      </Box>
      {selectedEntry && <EntryPointDetail selected={{ artifact: selectedEntry.artifact, artifactType: selectedEntry.type, envId, componentId, projectId }} onOpenDrawerTab={(tab) => onOpenDrawer(selectedEntry.artifact, selectedEntry.type, envId, tab)} />}
    </>
  );
}

export default function Environment({
  env,
  componentId,
  projectId,
  componentType,
  displayType,
  onSelectArtifact,
  onOpenDrawerForTab,
}: {
  env: GqlEnvironment;
  componentId: string;
  projectId: string;
  componentType: string;
  displayType?: string;
  onSelectArtifact: (a: GqlArtifact, type: string, envId: string) => void;
  onOpenDrawerForTab: (a: GqlArtifact, type: string, envId: string, tab: string) => void;
}) {
  const refreshEnvironmentArtifacts = useRefreshEnvironmentArtifacts();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'entryPoints' | 'allArtifacts'>('entryPoints');
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [currentEntryPoint, setCurrentEntryPoint] = useState<{ artifact: GqlArtifact; type: string } | null>(null);

  // MI users state
  const [selectedRuntimeId, setSelectedRuntimeId] = useState('');
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<{ username: string; domain: string } | null>(null);
  const [newUserId, setNewUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDomain, setNewDomain] = useState('primary');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  const { data: runtimes = [], error: runtimesError, isLoading: runtimesLoading } = useComponentRuntimes(env.id, projectId, componentId, !!env.id && !!projectId && !!componentId);
  const validatedRuntimeId = runtimes.some((r) => r.runtimeId === selectedRuntimeId) ? selectedRuntimeId : '';
  const activeRuntimeId = validatedRuntimeId || (runtimes.length === 1 ? runtimes[0].runtimeId : '');
  const createMiUser = useCreateMiUser();
  const deleteMiUser = useDeleteMiUser();
  const { data: miUsers = [], error: miUsersError, isLoading: miUsersLoading } = useListMiUsers(componentId, activeRuntimeId, componentType === 'MI' && settingsPanelOpen && !!activeRuntimeId);

  const FILE_BASED_USER_STORE_ERROR = 'User management is not supported with the file-based user store. Please plug in a user store for the correct functionality';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshEnvironmentArtifacts(env.id, componentId);
      queryClient.invalidateQueries({ queryKey: ['componentRuntimes', env.id, projectId, componentId] });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const closeCreateUserDialog = () => {
    setCreateUserDialogOpen(false);
    setNewUserId('');
    setNewPassword('');
    setNewDomain('primary');
    setNewIsAdmin(false);
    setCreateUserError(null);
  };

  const onlineCount = runtimes.filter((r) => r.status === 'RUNNING').length;
  const totalCount = runtimes.length;
  const isOnline = onlineCount > 0;
  const showSourceButton = currentEntryPoint ? ['RestApi', 'ProxyService', 'InboundEndpoint', 'Task'].includes(currentEntryPoint.type) : false;

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
              {env.name}
            </Typography>
            {totalCount > 0 && (
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ flexShrink: 0 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: isOnline ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
                <Typography variant="body2" color="text.secondary">
                  {`${onlineCount}/${totalCount} Active`}
                </Typography>
              </Stack>
            )}
          </Stack>
          <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
            {currentEntryPoint && showSourceButton && (componentType !== 'MI' || viewMode === 'entryPoints') && (
              <Button variant="text" size="small" startIcon={<Code size={14} />} onClick={() => onOpenDrawerForTab(currentEntryPoint.artifact, currentEntryPoint.type, env.id, 'Source')} sx={{ textTransform: 'none' }}>
                View Source
              </Button>
            )}
            {currentEntryPoint && (componentType !== 'MI' || viewMode === 'entryPoints') && (
              <Button variant="text" size="small" startIcon={<Server size={14} />} onClick={() => onOpenDrawerForTab(currentEntryPoint.artifact, currentEntryPoint.type, env.id, 'Runtimes')} sx={{ textTransform: 'none' }}>
                View Runtimes
              </Button>
            )}
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
                <Tooltip title={miUsersError?.message === FILE_BASED_USER_STORE_ERROR ? 'User store not configured' : 'Add user'}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setNewUserId('');
                        setNewPassword('');
                        setNewDomain('primary');
                        setNewIsAdmin(false);
                        setCreateUserError(null);
                        setCreateUserDialogOpen(true);
                      }}
                      disabled={!activeRuntimeId || miUsersError?.message === FILE_BASED_USER_STORE_ERROR}
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
                <>
                  {miUsersError.message === FILE_BASED_USER_STORE_ERROR ? (
                    <Stack gap={1}>
                      <Typography variant="body2" color="text.secondary">
                        Your MI runtime does not have a user store configured. Users will appear here once configured.
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        See{' '}
                        <Link href="https://mi.docs.wso2.com/en/latest/install-and-setup/setup/user-stores/setting-up-a-userstore-in-mi/" target="_blank" rel="noopener noreferrer">
                          user store configuration documentation
                        </Link>
                        .
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="error">
                      Failed to load users: {miUsersError.message}
                    </Typography>
                  )}
                </>
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
                        <Tooltip title={u.username === 'admin' && u.domain === 'primary' ? 'Cannot delete the default admin user' : `Delete ${u.username}`}>
                          <span>
                            <IconButton size="small" color="error" onClick={() => setDeleteUserTarget({ username: u.username, domain: u.domain })} disabled={u.username === 'admin' && u.domain === 'primary'} aria-label={`Delete ${u.username}`}>
                              <Trash2 size={14} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      }>
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" gap={1}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {u.username}
                            </Typography>
                            {u.domain !== 'primary' && (
                              <Tooltip title="User from a secondary user store">
                                <Chip label={u.domain} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                              </Tooltip>
                            )}
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
              <TextField
                label="Domain"
                fullWidth
                size="small"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                helperText="Only change this if you have a secondary user store configured in MI and want to create the user in that store."
                slotProps={{ formHelperText: { sx: { color: 'text.disabled', fontSize: '0.7rem' } } }}
              />
              <FormControlLabel control={<Checkbox size="small" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />} label="Admin user" sx={{ m: 0 }} />
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
                  { componentId, runtimeId: activeRuntimeId, username: newUserId.trim(), password: newPassword, isAdmin: newIsAdmin, domain: newDomain.trim() || 'primary' },
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
              Are you sure you want to delete user <strong>{deleteUserTarget?.username}</strong> from the runtime? This action cannot be undone.
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
                  { componentId, runtimeId: activeRuntimeId, username: deleteUserTarget.username, domain: deleteUserTarget.domain },
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
        {(componentType !== 'MI' || viewMode === 'entryPoints') && (
          <EntryPointsList envId={env.id} componentId={componentId} projectId={projectId} componentType={componentType} displayType={displayType} isOnline={isOnline} onOpenDrawer={onOpenDrawerForTab} onSelectionChange={setCurrentEntryPoint} />
        )}
        {componentType === 'MI' && viewMode === 'allArtifacts' && <ArtifactTypeSelector envId={env.id} componentId={componentId} onSelectArtifact={onSelectArtifact} />}
      </CardContent>
    </Card>
  );
}
