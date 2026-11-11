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

import { Alert, AlertTitle, Card, CardContent } from '@wso2/oxygen-ui';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useComponentDeployment } from '../../../hooks/useDeployments';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import type { Component } from '../../../types/component';
import type { Environment } from '../../../types/environment';
import type { EnvCardNotification, EnvCardSlotProps, IntegrationModule } from '../../../types/integration';
import { deploymentPollIntervalUntil, REQUESTED_POLL_WINDOW_MS } from '../../../utils/deploymentStatus';
import DeployButton from './DeployButton';
import EnvCardHeader from './EnvCardHeader';
import { ReleaseLinks } from '../../EnvironmentCard/ReleaseLinks';

interface EnvCardShellProps {
  component: Component;
  env: Environment;
  prevEnv?: Environment;
  versionId: string;
  projectId: string;
  orgHandler: string;
  projectHandler: string;
  deploymentPipelineId: string;
  isBuildInProgress?: boolean;
  module: IntegrationModule;
}

// Per-env query keys invalidated by the generic Refresh — the union across
// every migrated type's data. Invalidating a key a given type doesn't use is
// harmless; adding a new type may mean adding its key here. `wf` holds every
// read from a workflow integration's engine (definitions and figures).
const REFRESH_QUERY_KEYS = ['componentDeployment', 'envEndpoints', 'executionConfigs', 'taskExecutions', 'schemaConfig', 'component-logs', 'wf'];

/**
 * The generic env-card frame. It owns ONLY what every type shares:
 *   - the per-env deployment fetch + its transitional/after-action polling,
 *   - the transient notification mechanism (set by slots via `onNotify`),
 *   - the optimistic pending-trigger bridge (actions → body),
 *   - the Refresh control.
 *
 * Everything type-specific — status dot, Configure, action buttons, body
 * content — is rendered by the module's slot components, which receive
 * the shared deployment data + callbacks via `EnvCardSlotProps` and fetch any
 * type-specific data themselves. A module whose header differs entirely ships a
 * `CustomHeader`, rendered in place of the generic `EnvCardHeader`.
 */
export default function EnvCardShell({ component, env, prevEnv, versionId, projectId, orgHandler, projectHandler, deploymentPipelineId, isBuildInProgress, module }: EnvCardShellProps): ReactNode {
  const queryClient = useQueryClient();
  const envOrgUuid = useOrgUuid() ?? '';

  // Read from the query's own data so the cadence is recomputed after every fetch.
  const [pollUntil, setPollUntil] = useState(0);
  const { data: envDeployment, isLoading: loadingDeployment } = useComponentDeployment(orgHandler, envOrgUuid, component.id, versionId, env.id, {
    refetchInterval: (query) => deploymentPollIntervalUntil(query.state.data?.deploymentStatusV2, 8000, pollUntil),
  });
  const deploymentStatusV2 = envDeployment?.deploymentStatusV2 ?? null;

  const requestPoll = useCallback(() => setPollUntil(Date.now() + REQUESTED_POLL_WINDOW_MS), []);

  // Transient success/error feedback raised by slot actions.
  const [notification, setNotification] = useState<EnvCardNotification | null>(null);
  useEffect(() => {
    if (!notification) return;
    // A two-line notice needs longer to read; errors sit longer than plain confirmations.
    const timeout = notification.detail ? 10000 : notification.severity === 'error' ? 6000 : 4000;
    const timer = setTimeout(() => setNotification(null), timeout);
    return () => clearTimeout(timer);
  }, [notification]);
  const onNotify = useCallback((n: EnvCardNotification) => setNotification(n), []);

  // Optimistic pending-trigger bridge: the actions slot records a trigger, the
  // body slot's executions table shows a queued sentinel until it resolves.
  const [pendingTriggerTime, setPendingTriggerTime] = useState<number | null>(null);
  const [pendingTriggerArgs, setPendingTriggerArgs] = useState<string[] | null>(null);
  const onTrigger = useCallback((triggerTime: number, args?: string[] | null) => {
    setPendingTriggerTime(triggerTime);
    setPendingTriggerArgs(args && args.length > 0 ? args : null);
  }, []);
  const onTriggerResolved = useCallback(() => {
    setPendingTriggerTime(null);
    setPendingTriggerArgs(null);
  }, []);

  // Generic refresh.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all(REFRESH_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const slotProps: EnvCardSlotProps = {
    component,
    env,
    prevEnv,
    versionId,
    projectId,
    orgHandler,
    projectHandler,
    componentHandler: component.handler,
    deploymentPipelineId,
    envTemplateId: env.templateId ?? env.id,
    isBuildInProgress,
    releaseId: envDeployment?.releaseId ?? '',
    deploymentStatusV2,
    hasDeployment: !!envDeployment,
    loadingDeployment,
    deployedCommit: envDeployment?.build?.commit ?? null,
    deployedCommitSha: envDeployment?.build?.commit?.sha,
    buildId: envDeployment?.build?.buildId,
    releaseMgtReleaseId: envDeployment?.releaseMgtDeployment?.releaseMgtReleaseId,
    releaseMgtDeploymentId: envDeployment?.releaseMgtDeployment?.releaseMgtDeploymentId,
    onNotify,
    requestPoll,
    onTrigger,
  };

  const { CustomHeader, HeaderStatus, EnvCardActions, EnvCardSharedAction, EnvCardBody, DeployAction = DeployButton } = module;
  // With auto deploy off a build reaches no environment by itself, so the first one offers to deploy it.
  const autoDeployEnabled = component.deploymentTracks?.find((t) => t.id === versionId)?.autoDeployEnabled ?? false;
  const deployAction = !prevEnv && !autoDeployEnabled && !loadingDeployment ? <DeployAction {...slotProps} /> : undefined;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ pb: (theme) => `${theme.spacing(2)} !important` }}>
        {CustomHeader ? (
          <CustomHeader {...slotProps} isRefreshing={isRefreshing} onRefresh={handleRefresh} deployAction={deployAction} />
        ) : (
          <EnvCardHeader
            envName={env.name}
            deployedCommit={envDeployment?.build?.commit}
            hasDeployment={!!envDeployment}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            // Held back while loading so the card settles in one go: the bodies
            // already skeleton, and these would otherwise render off a null status.
            status={HeaderStatus && !loadingDeployment ? <HeaderStatus {...slotProps} /> : undefined}
            actions={
              EnvCardActions && !loadingDeployment ? (
                <>
                  <EnvCardActions {...slotProps} />
                  {deployAction}
                </>
              ) : (
                deployAction
              )
            }
          />
        )}

        {notification && (
          <Alert severity={notification.severity} onClose={() => setNotification(null)} sx={{ mt: 2 }}>
            {notification.detail ? (
              <>
                <AlertTitle>{notification.text}</AlertTitle>
                {notification.detail}
              </>
            ) : (
              notification.text
            )}
          </Alert>
        )}

        {EnvCardBody && <EnvCardBody {...slotProps} pendingTriggerTime={pendingTriggerTime} pendingTriggerArgs={pendingTriggerArgs} onTriggerResolved={onTriggerResolved} />}

        <ReleaseLinks projectId={projectId} componentId={component.id} env={slotProps.envTemplateId} />

        {/* Rendered while the deployment loads too, holding its place with its own placeholder (see EnvCardSharedAction). */}
        {EnvCardSharedAction && <EnvCardSharedAction {...slotProps} />}
      </CardContent>
    </Card>
  );
}
