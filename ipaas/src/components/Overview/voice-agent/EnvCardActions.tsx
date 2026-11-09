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
import { Lightbulb, List, RotateCw, Square } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { useRedeployDeployment, useStopDeployment } from '../../../hooks/useDeployments';
import type { EnvCardActionsProps } from '../../../types/integration';
import ServiceLogsDrawer from '../integration-as-api/ServiceLogsDrawer';
import HowToConnectDialog from './HowToConnectDialog';

export default function EnvCardActions({ component, env, versionId, releaseId, orgHandler, componentHandler, projectId, hasDeployment, deploymentStatusV2, releaseMgtReleaseId, releaseMgtDeploymentId, onNotify, requestPoll }: EnvCardActionsProps): ReactNode {
  const [logsOpen, setLogsOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const stopMutation = useStopDeployment();
  const redeployMutation = useRedeployDeployment();
  const isActionPending = stopMutation.isPending || redeployMutation.isPending;
  const canDeployHere = useCan()(Scopes.INTEGRATION_DEPLOY);

  const canStop = deploymentStatusV2 === 'ACTIVE';
  const canStart = deploymentStatusV2 === 'SUSPENDED';
  const hasError = deploymentStatusV2 === 'ERROR';
  const isInProgress = deploymentStatusV2 === 'IN_PROGRESS';

  const handleStop = () => {
    stopMutation.mutate(
      { orgHandler, componentId: component.id, releaseId, environment: env.id, type: 'service', clearCron: false },
      {
        onSuccess: () => {
          requestPoll();
          onNotify({ text: 'Voice agent stopped', severity: 'success' });
        },
        onError: (err) => onNotify({ text: err instanceof Error ? err.message : 'Failed to stop the voice agent', severity: 'error' }),
      },
    );
  };

  const handleRedeploy = () => {
    redeployMutation.mutate(
      { orgHandler, componentId: component.id, releaseId, type: 'service', releaseMgtReleaseId, releaseMgtDeploymentId },
      {
        onSuccess: () => {
          requestPoll();
          onNotify({ text: 'Voice agent started', severity: 'success' });
        },
        onError: (err) => onNotify({ text: err instanceof Error ? err.message : 'Failed to start the voice agent', severity: 'error' }),
      },
    );
  };

  return (
    <>
      <Button variant="text" size="small" startIcon={<Lightbulb size={14} />} onClick={() => setConnectOpen(true)} disabled={!hasDeployment}>
        How to connect
      </Button>
      {hasDeployment && (
        <Button variant="text" size="small" startIcon={<List size={14} />} onClick={() => setLogsOpen(true)}>
          View logs
        </Button>
      )}
      {canDeployHere && (canStop || isInProgress) && (
        <Tooltip title="Stop the voice agent">
          <span>
            <Button variant="outlined" size="small" color="error" startIcon={<Square size={14} />} onClick={handleStop} disabled={isActionPending || isInProgress}>
              Stop
            </Button>
          </span>
        </Tooltip>
      )}
      {canDeployHere && canStart && (
        <Tooltip title="Start the voice agent">
          <span>
            <Button variant="outlined" size="small" color="success" startIcon={<RotateCw size={14} />} onClick={handleRedeploy} disabled={isActionPending}>
              Start
            </Button>
          </span>
        </Tooltip>
      )}
      {canDeployHere && hasError && (
        <Tooltip title="Redeploy the voice agent">
          <span>
            <Button variant="outlined" size="small" color="error" startIcon={<RotateCw size={14} />} onClick={handleRedeploy} disabled={isActionPending}>
              Redeploy
            </Button>
          </span>
        </Tooltip>
      )}
      {hasDeployment && <HowToConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} envName={env.name} componentId={component.id} versionId={versionId} releaseId={releaseId} />}
      <ServiceLogsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} projectId={projectId} componentHandler={componentHandler} env={env} versionId={versionId} />
    </>
  );
}
