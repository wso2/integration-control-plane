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

import { Button, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { GitCommit, RefreshCw, RotateCw, Square } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRedeployDeployment, useStopDeployment } from '../../../hooks/useDeployments';
import { useSchemaConfig } from '../../../hooks/useConfiguration';
import { IS_CLOUD } from '../../../features';
import type { CustomHeaderProps } from '../../../types/integration';
import StatusDot from './StatusDot';
import ConfigureButton from './ConfigureButton';
import { hasMissingRequiredConfigs } from './configStatus';
// Transitional: legacy ConfigureDrawer (defaults to the generic-service form
// when `isAutomation` is absent) until its genericisation in phase 4.5.
import ConfigureDrawer from '../../EnvironmentCard/ConfigureDrawer';

/**
 * Shared header for the two runtime-logs integration types — **file-integration**
 * and **event-integration**
 */
export default function FileEventHeader({
  component,
  env,
  projectId,
  versionId,
  orgHandler,
  projectHandler,
  componentHandler,
  envTemplateId,
  latestCommit,
  hasDeployment,
  deploymentStatusV2,
  deployedCommitSha,
  releaseId,
  releaseMgtReleaseId,
  releaseMgtDeploymentId,
  buildId,
  onNotify,
  requestPoll,
  isRefreshing,
  onRefresh,
}: CustomHeaderProps): ReactNode {
  const [configureOpen, setConfigureOpen] = useState(false);
  const stopMutation = useStopDeployment();
  const redeployMutation = useRedeployDeployment();
  const isActionPending = stopMutation.isPending || redeployMutation.isPending;

  const canStop = deploymentStatusV2 === 'ACTIVE';
  const canStart = deploymentStatusV2 === 'SUSPENDED';
  const hasError = deploymentStatusV2 === 'ERROR';
  const isInProgress = deploymentStatusV2 === 'IN_PROGRESS';

  // Switch the Configure button to "Configure to Continue" when the schema has
  // required configs without values (devant: `hasAllRequiredConfigs`).
  const { data: schemaConfig } = useSchemaConfig(projectId, component.id, envTemplateId, versionId, deployedCommitSha);
  const missingConfigs = useMemo(() => hasMissingRequiredConfigs(schemaConfig), [schemaConfig]);

  const handleStop = () => {
    stopMutation.mutate(
      // cloud: OpenChoreo's stop endpoint is per-environment; wip ignores it.
      { orgHandler, componentId: component.id, releaseId, ...(IS_CLOUD ? { environment: env.id } : {}), type: 'service', clearCron: false },
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
    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
      {/* Left: env name + commit + status dot + Critical chip + Configure */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
          {env.name}
        </Typography>

        {hasDeployment && latestCommit && (
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
            <GitCommit size={14} style={{ opacity: 0.55, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', flexShrink: 0 }}>
              {latestCommit.sha.substring(0, 7)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {latestCommit.message}
            </Typography>
          </Stack>
        )}

        <StatusDot status={deploymentStatusV2} />

        {hasDeployment && (
          <>
            <ConfigureButton onClick={() => setConfigureOpen(true)} hasMissingConfigs={missingConfigs} />
            <ConfigureDrawer
              onSaved={() => onNotify({ text: 'Configuration saved successfully.', severity: 'success' })}
              open={configureOpen}
              onClose={() => setConfigureOpen(false)}
              orgHandler={orgHandler}
              projectId={projectId}
              componentId={component.id}
              envId={env.id}
              versionId={versionId}
              componentName={componentHandler}
              projectHandler={projectHandler}
              commitHash={deployedCommitSha}
              releaseId={releaseId}
              displayType={component.displayType}
              releaseMgtReleaseId={releaseMgtReleaseId}
              releaseMgtDeploymentId={releaseMgtDeploymentId}
              envTemplateId={envTemplateId}
              buildId={buildId}
              // File/event have no endpoints — match devant's ConfigurationWizard
              // (Configurations + Certificate Mount only, no Endpoints step).
              hideEndpoints
            />
          </>
        )}
      </Stack>

      {/* Right: Stop / Start + Refresh */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
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
        <Tooltip title="Refresh">
          <IconButton size="small" disabled={isRefreshing} aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none', transformOrigin: 'center' }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
