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

import { Alert, Box, Button, CircularProgress, MenuItem, PageContent, Select, Stack, Typography } from '@wso2/oxygen-ui';
import { Clock } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { getDevPortalBaseUrl } from '../config/runtimeConfig';
import { useApimApi, useChangeLifecycleState, useLifecycleHistory, useLifecycleState, useUpdateApimApi } from '../hooks/useApim';
import { useComponentByHandler, useComponentEndpoints } from '../hooks/useComponents';
import ConfirmDialog from '../components/Lifecycle/ConfirmDialog';
import LCStateDiagram from '../components/Lifecycle/LCStateDiagram';
import LifecycleHistoryDrawer from '../components/Lifecycle/LifecycleHistoryDrawer';
import { ACTION_LABEL, CONFIRM_ACTIONS, HIDDEN_ACTIONS, PUBLISH_ACTIONS, SUCCESS_TEXT } from '../constants/lifecycle';
import { useProjectId } from '../hooks/useProjects';
import type { ComponentScope } from '../nav';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import { PILL_SELECT_SX } from '../constants/styles';
import { trackEvent } from '../utils/tracking';

export default function Lifecycle(scope: ComponentScope): JSX.Element {
  const { projectId, isLoading: loadingProject } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  // Derived rather than synced via an effect — an effect+render round trip here would delay
  // useComponentEndpoints and the four hooks gated on selectedApimId below from becoming enabled.
  const [selectedTrackIdState, setSelectedTrackId] = useState('');
  const selectedTrackId = tracks.some((t) => t.id === selectedTrackIdState) ? selectedTrackIdState : (tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '');

  const { data: endpoints = [], isLoading: loadingEndpoints } = useComponentEndpoints(component?.id ?? '', selectedTrackId);

  const [selectedApimIdState, setSelectedApimId] = useState<string | null>(null);
  const selectedApimId = endpoints.some((e) => e.apimId === selectedApimIdState) ? selectedApimIdState : (endpoints.find((e) => e.apimId)?.apimId ?? null);

  const endpointsWithApim = useMemo(() => {
    const seen = new Set<string>();
    return endpoints.filter((e) => {
      if (!e.apimId || seen.has(e.apimId)) return false;
      seen.add(e.apimId);
      return true;
    });
  }, [endpoints]);

  const { data: lifecycleState, isLoading: loadingState } = useLifecycleState(selectedApimId);
  const { data: lifecycleHistory } = useLifecycleHistory(selectedApimId);

  const { mutateAsync: changeState, isPending: isChanging } = useChangeLifecycleState(selectedApimId);
  const { mutateAsync: updateApim } = useUpdateApimApi();

  const { data: apimApiInfo = null } = useApimApi(selectedApimId);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [publishDisplayName, setPublishDisplayName] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setSuccessMsg('');
    setErrorMsg('');
  }, [selectedApimId]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isLoading = loadingProject || loadingComponent || (tracks.length > 0 && !selectedTrackId) || loadingEndpoints || (endpointsWithApim.length > 0 && !selectedApimId) || loadingState;

  const devPortalBaseUrl = getDevPortalBaseUrl();
  const isDevPortalEnabled = lifecycleState?.state === 'Published' || lifecycleState?.state === 'Prototyped';

  const visibleTransitions = useMemo(() => (lifecycleState?.availableTransitions ?? []).filter((t) => !HIDDEN_ACTIONS.has(t.event)), [lifecycleState]);

  const handleActionClick = (action: string) => {
    setSuccessMsg('');
    setErrorMsg('');
    if (CONFIRM_ACTIONS.has(action)) {
      if (PUBLISH_ACTIONS.has(action)) {
        setPublishDisplayName(apimApiInfo?.displayName ?? '');
      }
      setPendingAction(action);
    } else {
      void executeAction(action);
    }
  };

  const executeAction = async (action: string) => {
    setPendingAction(null);
    try {
      if (PUBLISH_ACTIONS.has(action) && apimApiInfo && selectedApimId) {
        const trimmed = publishDisplayName.trim();
        if (trimmed && trimmed !== apimApiInfo.displayName) {
          await updateApim({ apimId: selectedApimId, body: { ...apimApiInfo, displayName: trimmed } });
        }
      }
      await changeState({ action });
      if (PUBLISH_ACTIONS.has(action)) trackEvent('component-manage-lifecycle-state-change-to-publish');
      if (action === 'Demote to Created') trackEvent('component-manage-lifecycle-state-change-to-demote-to-created');
      setSuccessMsg(SUCCESS_TEXT[action] ?? 'Lifecycle state updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lifecycle state change failed');
    }
  };

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
      <DeploymentTrackBar
        tracks={tracks}
        selectedId={selectedTrackId}
        onChange={setSelectedTrackId}
        orgHandler={scope.org}
        projectHandler={scope.project}
        componentHandler={scope.component}
        versionView
        extra={
          <>
            {endpointsWithApim.length > 0 && (
              <Select size="small" value={selectedApimId ?? ''} onChange={(e) => setSelectedApimId(e.target.value as string)} disabled={endpointsWithApim.length <= 1} sx={{ ...PILL_SELECT_SX, minWidth: 140 }}>
                {endpointsWithApim.map((ep) => (
                  <MenuItem key={ep.apimId!} value={ep.apimId!}>
                    {ep.displayName}
                  </MenuItem>
                ))}
              </Select>
            )}
            {devPortalBaseUrl && (
              <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="text"
                  size="small"
                  disabled={!isDevPortalEnabled}
                  onClick={() => {
                    trackEvent('component-manage-dev-portal');
                    window.open(`${devPortalBaseUrl}/${scope.org}`, '_blank');
                  }}>
                  ↗ Go to Devportal
                </Button>
              </Box>
            )}
          </>
        }
      />

      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Lifecycle
        </Typography>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : endpointsWithApim.length === 0 ? (
          <Alert severity="info">No managed API endpoints found for this integration. Deploy an endpoint to manage its lifecycle.</Alert>
        ) : !lifecycleState ? (
          <Alert severity="warning">Unable to load lifecycle state. Please try again later.</Alert>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              <strong>Note:</strong> Lifecycle changes are applied on the API. They&apos;re not bound to an environment or to a build.
            </Typography>

            {isChanging ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" sx={{ mb: 3 }}>
                  {visibleTransitions.map((t) => (
                    <Button key={t.event} variant="outlined" size="small" onClick={() => handleActionClick(t.event)}>
                      {ACTION_LABEL[t.event] ?? t.event}
                    </Button>
                  ))}
                  {lifecycleHistory && lifecycleHistory.list.length > 0 && (
                    <Button variant="text" size="small" startIcon={<Clock size={14} />} onClick={() => setHistoryOpen(true)}>
                      History
                    </Button>
                  )}
                </Stack>

                {successMsg && (
                  <Alert severity="success" onClose={() => setSuccessMsg('')} sx={{ mb: 2 }}>
                    {successMsg}
                  </Alert>
                )}
                {errorMsg && (
                  <Alert severity="error" onClose={() => setErrorMsg('')} sx={{ mb: 2 }}>
                    {errorMsg}
                  </Alert>
                )}

                <Box
                  sx={{
                    overflowX: 'auto',
                    '& #Oval, & #Group-9 > polygon': { fill: 'rgba(0,0,0,0.02)' },
                    '[data-color-scheme="dark"] & #Oval, [data-color-scheme="dark"] & #Group-9 > polygon': { fill: 'rgba(255,255,255,0.05)' },
                  }}>
                  <LCStateDiagram currentState={lifecycleState.state} availableTransitions={lifecycleState.availableTransitions} />
                </Box>
              </>
            )}
          </>
        )}

        {pendingAction && (
          <ConfirmDialog
            action={pendingAction}
            displayName={PUBLISH_ACTIONS.has(pendingAction) ? publishDisplayName : undefined}
            onDisplayNameChange={PUBLISH_ACTIONS.has(pendingAction) ? setPublishDisplayName : undefined}
            onConfirm={() => void executeAction(pendingAction)}
            onCancel={() => setPendingAction(null)}
            isPending={isChanging}
          />
        )}

        <LifecycleHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} lifecycleHistory={lifecycleHistory ?? undefined} />
      </PageContent>
    </Box>
  );
}
