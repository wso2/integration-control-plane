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

import { Tooltip } from '@wso2/oxygen-ui';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useExecutionConfigs, useRuntimeArguments, useTriggerComponent } from '../../../hooks/useExecutions';
import { useSchemaConfig } from '../../../hooks/useConfiguration';
import type { RuntimeArgument } from '../../../types/executions';
import type { EnvCardActionsProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import { hasMissingRequiredConfigs } from './configStatus';
import NextRunLabel from '../../NextRunLabel';
import ScheduleButton from './ScheduleButton';
import RunButton from '../automation/RunButton';
import RunWithArgsDialog from '../automation/RunWithArgsDialog';

const NO_ARGUMENTS: RuntimeArgument[] = [];

/**
 * Automation's right-header slot. Test runs the task as is; Test with Arguments asks for its
 * runtime arguments in a drawer first, one row per argument the task declares.
 */
export default function EnvCardActions({
  component,
  env,
  projectId,
  versionId,
  orgHandler,
  releaseId,
  buildId,
  deploymentPipelineId,
  envTemplateId,
  deployedCommitSha,
  isBuildInProgress,
  deploymentStatusV2,
  onNotify,
  onTrigger,
}: EnvCardActionsProps): ReactNode {
  const queryClient = useQueryClient();

  const { data: scheduleConfig } = useExecutionConfigs(component.id, releaseId, env.id);
  const { data: schemaConfig } = useSchemaConfig(projectId, component.id, envTemplateId, versionId, deployedCommitSha);
  const missingConfigs = useMemo(() => hasMissingRequiredConfigs(schemaConfig), [schemaConfig]);

  // Automation's Run/Schedule are always disabled while a build is in progress.
  const buildDisabled = !!isBuildInProgress;
  const deploymentActive = isDeploymentHealthy(deploymentStatusV2);
  const deploying = deploymentStatusV2 === 'IN_PROGRESS';

  // Both actions need a live workload: Run triggers one, and a schedule written against a
  // workload that is still rolling out fires against the previous revision. First match wins,
  // so the list is ordered from the most actionable cause to the least.
  const blockers: [boolean, string][] = [
    [missingConfigs, 'Set the required configuration values first.'],
    [buildDisabled, 'A build is in progress.'],
    [!releaseId, 'This integration has not been deployed to this environment yet.'],
    [deploying, 'The deployment is still in progress.'],
    [!deploymentActive, 'The deployment is not active in this environment.'],
  ];
  const blockedReason = blockers.find(([blocked]) => blocked)?.[1] ?? '';
  const actionsDisabled = !!blockedReason;

  const triggerRun = useTriggerComponent();
  const [argsDialogOpen, setArgsDialogOpen] = useState(false);
  // Read from the source only once Test with Arguments is picked, since plain Test sends
  // none. A failed lookup leaves runtimeArgs empty, so the drawer offers free-form rows only.
  const { data: runtimeArgs = NO_ARGUMENTS, isLoading: runtimeArgsLoading } = useRuntimeArguments(component.id, versionId, deployedCommitSha, argsDialogOpen);

  const handleRunSuccess = () => {
    onNotify({ text: 'Execution triggered successfully', severity: 'success' });
    // Surfaces the run in this card's executions table before the list refetches.
    onTrigger(Date.now());
    queryClient.invalidateQueries({ queryKey: ['taskExecutions'] });
  };

  const handleTest = () => {
    triggerRun.mutate(
      { orgHandler, projectId, componentId: component.id, releaseId, args: [] },
      {
        onSuccess: handleRunSuccess,
        onError: (err) => onNotify({ text: err instanceof Error ? err.message : 'Failed to trigger execution', severity: 'error' }),
      },
    );
  };

  return (
    <>
      <NextRunLabel cron={scheduleConfig?.cronjobFrequency ?? ''} timeZone={scheduleConfig?.cronjobTimezone ?? ''} sx={{ mr: 0.5 }} />
      <ScheduleButton
        envId={env.id}
        envName={env.name}
        componentId={component.id}
        orgHandler={orgHandler}
        releaseId={releaseId}
        buildId={buildId}
        versionId={versionId}
        deploymentPipelineId={deploymentPipelineId}
        hasSchedule={!!scheduleConfig?.cronjobFrequency}
        disabled={actionsDisabled}
        disabledReason={blockedReason}
        onSaveSuccess={() => onNotify({ text: 'Schedule updated successfully', severity: 'success' })}
        onSaveError={() => onNotify({ text: 'Failed to save schedule. Please try again.', severity: 'error' })}
        onStopSuccess={() => onNotify({ text: 'Schedule stopped successfully', severity: 'success' })}
      />
      <Tooltip title={blockedReason} placement="top">
        <span>
          <RunButton envCritical={env.critical} disabled={actionsDisabled} pending={triggerRun.isPending || runtimeArgsLoading} onRun={handleTest} onRunWithArgs={() => setArgsDialogOpen(true)} />
        </span>
      </Tooltip>
      {/* Mounted once the arguments have loaded, so its rows are laid out from them. */}
      {argsDialogOpen && !runtimeArgsLoading && (
        <RunWithArgsDialog open onClose={() => setArgsDialogOpen(false)} onRunSuccess={handleRunSuccess} envCritical={env.critical} orgHandler={orgHandler} projectId={projectId} componentId={component.id} releaseId={releaseId} runtimeArguments={runtimeArgs} />
      )}
    </>
  );
}
