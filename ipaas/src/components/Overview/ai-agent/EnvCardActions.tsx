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

import { Button, Tooltip } from '@wso2/oxygen-ui';
import { List, Mic, RotateCw, Square, Funnel } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { withTrackParam } from '../../../hooks/useSelectedTrack';
import { useLocation } from 'react-router';
import { useEnvEndpoints, useRedeployDeployment, useStopDeployment } from '../../../hooks/useDeployments';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { useLinkedVoiceAgents } from '../../../hooks/useVoiceAgents';
import { voiceAgentTestUrl } from '../../../paths';
import { isVoiceEndpoint } from '../../../utils/voiceAgent';
import { useSelectedAgentEndpoint } from './selectedEndpoint';
import type { EnvCardActionsProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import ServiceLogsDrawer from '../integration-as-api/ServiceLogsDrawer';

/**
 * AI Agent's right-header slot: Test, View Logs, and Stop/Start — gated on the
 * deployment status. Identical to Integration as API except Test navigates to
 * the agent chat (`test/agent-chat`) rather than the API console, matching
 * devant (`isAiAgent ? 'test/agent-chat' : 'test/console'`).
 */
export default function EnvCardActions({
  component,
  env,
  versionId,
  releaseId,
  orgHandler,
  projectHandler,
  componentHandler,
  projectId,
  hasDeployment,
  deploymentStatusV2,
  isBuildInProgress,
  releaseMgtReleaseId,
  releaseMgtDeploymentId,
  onNotify,
  requestPoll,
}: EnvCardActionsProps): ReactNode {
  const navigate = useAppNavigate();
  const location = useLocation();
  const [logsOpen, setLogsOpen] = useState(false);
  const stopMutation = useStopDeployment();
  const redeployMutation = useRedeployDeployment();
  const isActionPending = stopMutation.isPending || redeployMutation.isPending;
  const canDeployHere = useCan()(Scopes.INTEGRATION_DEPLOY);

  const canStop = deploymentStatusV2 === 'ACTIVE';
  const canStart = deploymentStatusV2 === 'SUSPENDED';
  // A failed deployment is already not serving, so stopping it achieves nothing —
  // offer the recovery action instead.
  const hasError = deploymentStatusV2 === 'ERROR';
  const isInProgress = deploymentStatusV2 === 'IN_PROGRESS';
  const buildDisabled = !!isBuildInProgress && !hasDeployment;
  // The agent chat opens a live connection, so only a running workload qualifies.
  const canTest = isDeploymentHealthy(deploymentStatusV2);

  const { data: endpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);
  const [selectedId] = useSelectedAgentEndpoint(component.id, env.id);
  const selectedEndpoint = endpoints.find((e) => e.id === selectedId) ?? endpoints[0];
  const voiceSelected = isVoiceEndpoint(selectedEndpoint);
  const voiceAgent = useLinkedVoiceAgents(orgHandler, projectId, componentHandler).voiceAgents.at(0);

  const handleStop = () => {
    stopMutation.mutate(
      // OpenChoreo's stop endpoint is per-environment.
      { orgHandler, componentId: component.id, releaseId, environment: env.id, type: 'service', clearCron: false },
      {
        onSuccess: () => {
          requestPoll();
          onNotify({ text: 'Deployment stopped successfully', severity: 'success' });
        },
        onError: (err) => onNotify({ text: err instanceof Error ? err.message : 'Failed to stop deployment', severity: 'error' }),
      },
    );
  };

  const handleRedeploy = () => {
    redeployMutation.mutate(
      { orgHandler, componentId: component.id, releaseId, type: 'service', releaseMgtReleaseId, releaseMgtDeploymentId },
      {
        onSuccess: () => {
          requestPoll();
          onNotify({ text: 'Deployment started successfully', severity: 'success' });
        },
        onError: (err) => onNotify({ text: err instanceof Error ? err.message : 'Failed to start deployment', severity: 'error' }),
      },
    );
  };

  return (
    <>
      {hasDeployment && !env.critical && voiceSelected && (
        <Tooltip title={!voiceAgent ? 'Enable the voice agent for this AI agent first.' : canTest ? 'Talk to this AI agent through its voice agent.' : 'Deploy and start this AI agent to test it by voice.'}>
          <span>
            <Button variant="text" size="small" startIcon={<Mic size={14} />} onClick={() => voiceAgent && navigate(voiceAgentTestUrl(orgHandler, projectHandler, voiceAgent.handler))} disabled={!voiceAgent || !canTest}>
              Test voice
            </Button>
          </span>
        </Tooltip>
      )}
      {hasDeployment && !env.critical && !voiceSelected && (
        <Button
          variant="text"
          size="small"
          startIcon={<Funnel size={14} />}
          onClick={() => navigate(withTrackParam(`/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/test/agent-chat`, location.search))}
          disabled={buildDisabled || !canTest}
          sx={{ textTransform: 'none' }}>
          Test
        </Button>
      )}
      {hasDeployment && (
        <Button variant="text" size="small" startIcon={<List size={14} />} onClick={() => setLogsOpen(true)} sx={{ textTransform: 'none' }}>
          View logs
        </Button>
      )}
      {canDeployHere && (canStop || isInProgress) && (
        <Tooltip title="Stop deployment">
          <span>
            <Button variant="outlined" size="small" color="error" startIcon={<Square size={14} />} onClick={handleStop} disabled={isActionPending || isInProgress}>
              Stop
            </Button>
          </span>
        </Tooltip>
      )}
      {canDeployHere && canStart && (
        <Tooltip title="Start deployment">
          <span>
            <Button variant="outlined" size="small" color="success" startIcon={<RotateCw size={14} />} onClick={handleRedeploy} disabled={isActionPending}>
              Start
            </Button>
          </span>
        </Tooltip>
      )}
      {canDeployHere && hasError && (
        <Tooltip title="Redeploy">
          <span>
            <Button variant="outlined" size="small" color="error" startIcon={<RotateCw size={14} />} onClick={handleRedeploy} disabled={isActionPending}>
              Redeploy
            </Button>
          </span>
        </Tooltip>
      )}
      <ServiceLogsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} projectId={projectId} componentHandler={componentHandler} env={env} versionId={versionId} />
    </>
  );
}
