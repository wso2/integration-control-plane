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
import { FlaskConical, List, RotateCw, Square } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useRedeployDeployment, useStopDeployment } from '../../../hooks/useDeployments';
import type { EnvCardActionsProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import ServiceLogsDrawer from './ServiceLogsDrawer';

/**
 * Integration-as-API's right-header slot: Test, View Logs, and Stop/Start —
 * gated on the deployment status. Stop/Start ask the shell to poll briefly via
 * `requestPoll` so the status settles, and report outcomes via `onNotify`.
 */
export default function EnvCardActions({
  component,
  env,
  versionId,
  releaseId,
  orgHandler,
  projectHandler,
  componentHandler,
  hasDeployment,
  deploymentStatusV2,
  isBuildInProgress,
  releaseMgtReleaseId,
  releaseMgtDeploymentId,
  onNotify,
  requestPoll,
}: EnvCardActionsProps): ReactNode {
  const navigate = useAppNavigate();
  const [logsOpen, setLogsOpen] = useState(false);
  const stopMutation = useStopDeployment();
  const redeployMutation = useRedeployDeployment();
  const isActionPending = stopMutation.isPending || redeployMutation.isPending;

  const canStop = deploymentStatusV2 === 'ACTIVE';
  const canStart = deploymentStatusV2 === 'SUSPENDED';
  const hasError = deploymentStatusV2 === 'ERROR';
  const isInProgress = deploymentStatusV2 === 'IN_PROGRESS';
  const buildDisabled = !!isBuildInProgress && !hasDeployment;
  // Testing sends a live request, so only a running workload qualifies.
  const canTest = isDeploymentHealthy(deploymentStatusV2);

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
      {hasDeployment && !env.critical && (
        <Button
          variant="text"
          size="small"
          startIcon={<FlaskConical size={14} />}
          onClick={() => navigate(`/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/test/console`)}
          disabled={buildDisabled || !canTest}
          sx={{ textTransform: 'none' }}>
          Test
        </Button>
      )}
      {hasDeployment && (
        <Button variant="text" size="small" startIcon={<List size={14} />} onClick={() => setLogsOpen(true)} sx={{ textTransform: 'none' }}>
          View Logs
        </Button>
      )}
      {(canStop || isInProgress) && (
        <Tooltip title="Stop deployment">
          <span>
            <Button variant="outlined" size="small" color="error" startIcon={<Square size={14} />} onClick={handleStop} disabled={isActionPending || isInProgress}>
              Stop
            </Button>
          </span>
        </Tooltip>
      )}
      {canStart && (
        <Tooltip title="Start deployment">
          <span>
            <Button variant="outlined" size="small" color="success" startIcon={<RotateCw size={14} />} onClick={handleRedeploy} disabled={isActionPending}>
              Start
            </Button>
          </span>
        </Tooltip>
      )}
      {hasError && (
        <Tooltip title="Redeploy">
          <span>
            <Button variant="outlined" size="small" color="error" startIcon={<RotateCw size={14} />} onClick={handleRedeploy} disabled={isActionPending}>
              Redeploy
            </Button>
          </span>
        </Tooltip>
      )}
      <ServiceLogsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} componentId={component.id} environmentId={env.id} envName={env.name} versionId={versionId} />
    </>
  );
}
