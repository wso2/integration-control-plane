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

import { Card, CardActions, CardContent, Divider, Tooltip } from '@wso2/oxygen-ui';
import { ArrowRight } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DeploymentStatus } from '../../../types/deployment';
import { useComponentDeployment, useDeploymentStatus, useDeploymentTrackImages, useEnvEndpoints } from '../../../hooks/useDeployments';
import { useExecutionConfigs } from '../../../hooks/useExecutions';
import { useGetConfigMgt, useSchemaConfig } from '../../../hooks/useConfiguration';
import { useRedeployDeployment, useStopDeployment } from '../../../hooks/useDeployments';
import { nextCronRunMs, formatTimeUntil, describeCron } from '../../../utils/cronUtils';
import { deploymentPollInterval } from '../../../utils/deploymentStatus';
import ConfigureDrawer from '../../EnvironmentCard/ConfigureDrawer';
import ScheduleDialog from '../../Overview/_shared/ScheduleDialog';
import PromoteButton from '../../EnvironmentCard/PromoteButton';
import DeployEnvironmentCardHeader from './DeployEnvironmentCardHeader';
import DeployEnvironmentCardBody from './DeployEnvironmentCardBody';
import DeploymentHistoryDrawer from './DeploymentHistoryDrawer';
import EndpointsDrawer from './EndpointsDrawer';
import type { DeployEnvironmentCardProps } from '../../../types/deploy';
import { IS_CLOUD } from '../../../features';

export default function DeployEnvironmentCard({
  orgHandler,
  orgUuid,
  projectId,
  componentId,
  versionId,
  deploymentPipelineId,
  flags,
  hideEndpoints = false,
  env,
  componentName,
  projectHandler,
  nextEnvId,
  onPromoteStarted,
  onPromoteSettled,
}: DeployEnvironmentCardProps): JSX.Element {
  // File/event integrations deploy like a service but expose no endpoints —
  // treat them as "service, minus endpoints" on the deploy card.
  const showEndpoints = !flags.isAutomation && !hideEndpoints;
  const qc = useQueryClient();
  const [configureOpen, setConfigureOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [endpointsOpen, setEndpointsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tracks which action button is showing an in-flight label (persists through post-mutation refetch)
  const [actionInFlight, setActionInFlight] = useState<'stop' | 'redeploy' | null>(null);
  // Set to true in mutation onSettled so the useEffect below knows to wait for isFetching to end
  const waitingForRefetch = useRef(false);
  // After a stop/redeploy mutation, poll briefly in case the backend is slow to update its status
  const postMutationPollingUntil = useRef<number>(0);

  const {
    data: rawDeployment,
    isLoading,
    isFetching,
  } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, env.id, {
    refetchInterval: (query) => {
      const interval = deploymentPollInterval(query.state.data?.deploymentStatusV2, 5000);
      if (interval) return interval;
      if (Date.now() < postMutationPollingUntil.current) return 2000;
      return false;
    },
  });
  const deployment = rawDeployment
    ? (() => {
        const raw = rawDeployment.deploymentStatusV2;
        let deploymentStatusV2: DeploymentStatus;
        if (!rawDeployment.releaseId) {
          deploymentStatusV2 = DeploymentStatus.NotDeployed;
        } else if (raw === 'ACTIVE') {
          deploymentStatusV2 = DeploymentStatus.Active;
        } else if (raw === 'SUSPENDED') {
          deploymentStatusV2 = DeploymentStatus.Suspended;
        } else if (raw === 'IN_PROGRESS') {
          deploymentStatusV2 = DeploymentStatus.InProgress;
        } else if (raw === 'ERROR') {
          deploymentStatusV2 = DeploymentStatus.Error;
        } else if (flags.isAutomation) {
          deploymentStatusV2 = rawDeployment.cron ? DeploymentStatus.Active : DeploymentStatus.Suspended;
        } else {
          deploymentStatusV2 = DeploymentStatus.Active;
        }
        return { ...rawDeployment, deploymentStatusV2 };
      })()
    : null;

  // Once the post-mutation refetch completes, clear the in-flight action label
  useEffect(() => {
    if (!isFetching && waitingForRefetch.current) {
      waitingForRefetch.current = false;
      setActionInFlight(null);
    }
  }, [isFetching]);

  const releaseId = deployment?.releaseId ?? '';
  const status = deployment?.deploymentStatusV2;

  const { data: executionConfigs } = useExecutionConfigs(flags.isAutomation ? componentId : '', flags.isAutomation ? releaseId : '');
  const scheduleDescription = executionConfigs?.cronjobFrequency ? `${describeCron(executionConfigs.cronjobFrequency)}, ${executionConfigs.cronjobTimezone || 'UTC'}` : null;

  const [nextRunLabel, setNextRunLabel] = useState<string | null>(null);
  const cronFreq = executionConfigs?.cronjobFrequency ?? null;
  const updateNextRun = useCallback(() => {
    if (!cronFreq) {
      setNextRunLabel(null);
      return;
    }
    const ms = nextCronRunMs(cronFreq);
    if (ms !== null) setNextRunLabel(`Next run in ${formatTimeUntil(ms)}`);
    else setNextRunLabel(null);
  }, [cronFreq]);
  useEffect(() => {
    updateNextRun();
    const timer = setInterval(updateNextRun, 1000);
    return () => clearInterval(timer);
  }, [updateNextRun]);

  const { data: trackImages = [] } = useDeploymentTrackImages(componentId, versionId);
  const { data: deploymentStatus = [] } = useDeploymentStatus(componentId, versionId);
  const { data: endpoints = [], isLoading: endpointsLoading } = useEnvEndpoints(showEndpoints ? componentId : '', showEndpoints ? versionId : '', showEndpoints && releaseId ? releaseId : '');

  const deployedRunId = deployment?.build?.runId ?? null;
  const deployedBuildId = deployment?.build?.buildId ?? null;

  // Find the track image: by runId first (direct build), then by imageId (promotion).
  const matchedTrackImage = deployedRunId
    ? (trackImages.find((img) => img.runId === deployedRunId) ?? trackImages.find((img) => img.imageId === deployedBuildId) ?? null)
    : deployedBuildId
      ? (trackImages.find((img) => img.imageId === deployedBuildId) ?? null)
      : null;

  // Construct displayed image from componentDeployment.build (per-environment source of truth).
  // builtAt: use trackImage.builtAt when runId matches (direct build), otherwise fall back to
  // deploymentStatus.completedAt for the run (same as Devant), then deployedAt as last resort.
  const deployedImage: typeof matchedTrackImage =
    deployedRunId && deployment?.build?.commit
      ? {
          imageId: deployedBuildId ?? '',
          runId: deployedRunId,
          commitHash: deployment.build.commit.sha,
          commitMessage: deployment.build.commit.message,
          builtAt: (matchedTrackImage?.runId === deployedRunId ? matchedTrackImage.builtAt : null) ?? deploymentStatus.find((s) => s.id.toString() === deployedRunId)?.completedAt ?? deployment.build.deployedAt ?? '',
          author: deployment.build.commit.author,
          createdAt: matchedTrackImage?.createdAt ?? '',
          updatedAt: matchedTrackImage?.updatedAt ?? '',
        }
      : matchedTrackImage;

  const deployedAt = deployment?.build?.deployedAt ?? matchedTrackImage?.builtAt ?? null;

  // commitHash for ConfigureDrawer: only use the commit of what is deployed in this environment.
  const configCommitHash = deployment?.build?.commit?.sha ?? matchedTrackImage?.commitHash;

  // Drives a skeleton while track images are being fetched — covers two cases:
  // 1. Navigation: componentId changes → force a fresh fetch for the new component.
  // 2. Post-deploy: a new runId/buildId appears → refresh so builtAt and metadata fill in.
  const [refetchingImages, setRefetchingImages] = useState(false);
  const prevComponentIdRef = useRef(componentId);
  const prevDeployRunIdRef = useRef<string | null>(deployedRunId ?? deployedBuildId);

  useEffect(() => {
    if (prevComponentIdRef.current !== componentId) {
      prevComponentIdRef.current = componentId;
      setRefetchingImages(true);
      void qc.refetchQueries({ queryKey: ['deploymentTrackImages', componentId, versionId] }).then(() => setRefetchingImages(false));
    }
  }, [componentId, versionId, qc]);

  useEffect(() => {
    const currentId = deployedRunId ?? deployedBuildId;
    if (prevDeployRunIdRef.current !== null && prevDeployRunIdRef.current !== currentId && currentId !== null) {
      setRefetchingImages(true);
      void qc.refetchQueries({ queryKey: ['deploymentTrackImages', componentId, versionId] }).then(() => setRefetchingImages(false));
    }
    prevDeployRunIdRef.current = currentId;
  }, [deployedRunId, deployedBuildId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Configurables count — sourced from the GQL componentDeployment response.
  const envTemplateId = env.templateId ?? env.id;
  // Pre-warm cache so ConfigureDrawer opens instantly (result consumed there via shared query key).
  useGetConfigMgt(orgHandler, projectId, componentId, flags.isAutomation ? envTemplateId : env.id, versionId, componentName, configCommitHash, !!configCommitHash && !flags.isAutomation);
  useSchemaConfig(projectId, componentId, envTemplateId, versionId, configCommitHash);
  const configurablesCount = rawDeployment?.configCount ?? 0;

  const stopDeployment = useStopDeployment();
  const redeployDeployment = useRedeployDeployment();

  // Button labels remain in-flight until both the mutation AND the subsequent refetch finish
  const isStopPending = stopDeployment.isPending || actionInFlight === 'stop';
  const isRedeployPending = redeployDeployment.isPending || actionInFlight === 'redeploy';
  const isActionPending = isStopPending || isRedeployPending;

  const handleStop = () => {
    if (!releaseId) return;
    setActionInFlight('stop');
    postMutationPollingUntil.current = Date.now() + 20000;
    stopDeployment.mutate(
      {
        orgHandler,
        componentId,
        releaseId,
        // cloud: OpenChoreo's stop endpoint is per-environment; wip ignores it.
        ...(IS_CLOUD ? { environment: env.id } : {}),
        type: flags.isAutomation ? 'scheduledTask' : 'service',
        clearCron: flags.isAutomation,
      },
      {
        onSuccess: () => {
          // Scope invalidation to this environment only
          void qc.invalidateQueries({ queryKey: ['componentDeployment', orgHandler, componentId, versionId, env.id] });
          if (flags.isAutomation) {
            void qc.invalidateQueries({ queryKey: ['executionConfigs', componentId, releaseId] });
          }
        },
        onSettled: () => {
          waitingForRefetch.current = true;
        },
        onError: () => setActionInFlight(null),
      },
    );
  };

  const handleRedeploy = () => {
    if (!releaseId) return;
    setActionInFlight('redeploy');
    postMutationPollingUntil.current = Date.now() + 20000;
    redeployDeployment.mutate(
      {
        orgHandler,
        componentId,
        releaseId,
        type: flags.isAutomation ? 'scheduledTask' : 'service',
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: ['componentDeployment', orgHandler, componentId, versionId, env.id] });
          if (flags.isAutomation) {
            void qc.invalidateQueries({ queryKey: ['executionConfigs', componentId, releaseId] });
          }
        },
        onSettled: () => {
          waitingForRefetch.current = true;
        },
        onError: () => setActionInFlight(null),
      },
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Scope to this environment only
    await qc.invalidateQueries({ queryKey: ['componentDeployment', orgHandler, componentId, versionId, env.id] });
    if (flags.isAutomation && releaseId) {
      await qc.invalidateQueries({ queryKey: ['executionConfigs', componentId, releaseId] });
    }
    setIsRefreshing(false);
  };

  const isActive = status === DeploymentStatus.Active;
  const isError = status === DeploymentStatus.Error;
  const isInProgress = status === DeploymentStatus.InProgress;
  const hasRelease = !!releaseId;

  const isSuspended = status === DeploymentStatus.Suspended;
  // Keep button visible while in-flight. Suppress the opposing button while an action is in-flight
  // to prevent both showing simultaneously when status transitions mid-flight (header scatter).
  const showStop = ((isActive || isError || isInProgress) && hasRelease && !isRedeployPending) || isStopPending;
  const showStart = (isSuspended && hasRelease && !isStopPending) || isRedeployPending;
  // In cloud the pipeline decides whether this env promotes at all — including out
  // of the last card, which has no nextEnvId — so PromoteButton renders null when
  // there is no hop. Elsewhere, adjacency still gates it.
  const showPromote = IS_CLOUD || !!nextEnvId;

  return (
    <>
      <Card variant="outlined">
        <CardContent sx={{ pb: showPromote ? 1 : undefined }}>
          <DeployEnvironmentCardHeader
            envName={env.name}
            envCritical={env.critical}
            showStop={showStop}
            stopDisabled={isInProgress || isActionPending}
            isStopPending={isStopPending}
            onStop={handleStop}
            showStart={showStart}
            isRedeployPending={isRedeployPending}
            onStart={handleRedeploy}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />

          <Divider sx={{ mb: 2 }} />

          <DeployEnvironmentCardBody
            status={status}
            flags={flags}
            deployment={deployment ?? null}
            scheduleDescription={scheduleDescription}
            nextRunLabel={nextRunLabel}
            releaseId={releaseId}
            releaseName={deployment?.releaseMgtDeployment?.releaseMgtReleaseName ?? ''}
            isLoading={isLoading || isRefreshing}
            isImageLoading={refetchingImages}
            deployedImage={deployedImage}
            deployedAt={deployedAt}
            envCritical={env.critical}
            endpointCount={endpoints.length}
            scaleToZeroEnabled={env.scaleToZeroEnabled}
            onConfigClick={() => setConfigureOpen(true)}
            onJobConfigClick={flags.isAutomation ? () => setScheduleOpen(true) : undefined}
            onHistoryClick={() => setHistoryOpen(true)}
            configurablesCount={configurablesCount}
            onEndpointsClick={showEndpoints ? () => setEndpointsOpen(true) : undefined}
          />
        </CardContent>

        {showPromote && (
          <>
            <CardActions sx={{ px: 2, pb: 2, pt: 2, justifyContent: 'flex-end' }}>
              <Tooltip title={!hasRelease ? 'No deployment to promote' : ''}>
                <span>
                  <PromoteButton
                    orgHandler={orgHandler}
                    componentId={componentId}
                    versionId={versionId}
                    deploymentPipelineId={deploymentPipelineId}
                    sourceEnvId={env.id}
                    targetEnvId={nextEnvId}
                    icon={<ArrowRight size={14} />}
                    onPromoteStarted={onPromoteStarted}
                    onPromoteSettled={onPromoteSettled}
                  />
                </span>
              </Tooltip>
            </CardActions>
          </>
        )}
      </Card>

      <ConfigureDrawer
        open={configureOpen}
        onClose={() => setConfigureOpen(false)}
        orgHandler={orgHandler}
        projectId={projectId}
        componentId={componentId}
        envId={flags.isAutomation ? envTemplateId : env.id}
        versionId={versionId}
        componentName={componentName}
        projectHandler={projectHandler}
        commitHash={configCommitHash}
        releaseId={releaseId}
        displayType={flags.isAutomation ? 'scheduledTask' : 'service'}
        isAutomation={flags.isAutomation}
        envTemplateId={envTemplateId}
        hideEndpoints={hideEndpoints}
      />

      {flags.isAutomation && hasRelease && scheduleOpen && (
        <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} envId={env.id} envName={env.name} componentId={componentId} orgHandler={orgHandler} versionId={versionId} deploymentPipelineId={deploymentPipelineId} />
      )}

      <DeploymentHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} orgUuid={orgUuid} projectId={projectId} componentId={componentId} versionId={versionId} environmentId={env.id} envName={env.name} />

      {showEndpoints && (
        <EndpointsDrawer
          open={endpointsOpen}
          onClose={() => setEndpointsOpen(false)}
          endpoints={endpoints}
          isLoading={endpointsLoading}
          envName={env.name}
          componentId={componentId}
          versionId={versionId}
          releaseId={releaseId}
          buildId={deployedBuildId ?? undefined}
          environmentId={env.id}
        />
      )}
    </>
  );
}
