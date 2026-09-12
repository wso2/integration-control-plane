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

import { Alert, Card, CardContent } from '@wso2/oxygen-ui';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useComponentDeployment } from '../../../hooks/useDeployments';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import type { Component } from '../../../types/component';
import type { Environment } from '../../../types/environment';
import type { EnvCardNotification, EnvCardSlotProps, IntegrationModule } from '../../../types/integration';
import { deploymentPollInterval } from '../../../utils/deploymentStatus';
import EnvCardHeader from './EnvCardHeader';

interface EnvCardShellProps {
  component: Component;
  env: Environment;
  prevEnv?: Environment;
  versionId: string;
  projectId: string;
  orgHandler: string;
  projectHandler: string;
  deploymentPipelineId: string;
  latestCommit?: { sha: string; message: string } | null;
  isBuildInProgress?: boolean;
  module: IntegrationModule;
}

// Per-env query keys invalidated by the generic Refresh — the union across
// every migrated type's data. Invalidating a key a given type doesn't use is
// harmless; adding a new type may mean adding its key here.
const REFRESH_QUERY_KEYS = ['componentDeployment', 'envEndpoints', 'executionConfigs', 'taskExecutions', 'schemaConfig', 'component-logs'];

/**
 * The generic env-card frame. It owns ONLY what every type shares:
 *   - the per-env deployment fetch + its transitional/after-action polling,
 *   - the transient notification mechanism (set by slots via `onNotify`),
 *   - the optimistic pending-trigger bridge (actions → body),
 *   - the Refresh control.
 *
 * Everything type-specific — status dot, Configure, action buttons, body
 * content, footer — is rendered by the module's slot components, which receive
 * the shared deployment data + callbacks via `EnvCardSlotProps` and fetch any
 * type-specific data themselves. A module whose header differs entirely ships a
 * `CustomHeader`, rendered in place of the generic `EnvCardHeader`.
 */
export default function EnvCardShell({ component, env, prevEnv, versionId, projectId, orgHandler, projectHandler, deploymentPipelineId, latestCommit, isBuildInProgress, module }: EnvCardShellProps): ReactNode {
  const queryClient = useQueryClient();
  const envOrgUuid = useOrgUuid() ?? '';

  // Poll while unsettled (progressing, or failed but still able to recover) or briefly
  // after an explicit action.
  const [shouldPollOnce, setShouldPollOnce] = useState(false);
  const [refetchInterval, setRefetchInterval] = useState<number | false>(false);
  const { data: envDeployment, isLoading: loadingDeployment } = useComponentDeployment(orgHandler, envOrgUuid, component.id, versionId, env.id, { refetchInterval });
  const deploymentStatusV2 = envDeployment?.deploymentStatusV2 ?? null;

  useEffect(() => {
    const interval = deploymentPollInterval(deploymentStatusV2, 8000);
    setRefetchInterval(interval || (shouldPollOnce ? 8000 : false));
    if (shouldPollOnce && !interval) setShouldPollOnce(false);
  }, [deploymentStatusV2, shouldPollOnce]);

  const requestPoll = useCallback(() => setShouldPollOnce(true), []);

  // Transient success/error feedback raised by slot actions.
  const [notification, setNotification] = useState<EnvCardNotification | null>(null);
  useEffect(() => {
    if (!notification) return;
    const timeout = notification.severity === 'error' ? 6000 : 4000;
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
    latestCommit,
    isBuildInProgress,
    releaseId: envDeployment?.releaseId ?? '',
    deploymentStatusV2,
    hasDeployment: !!envDeployment,
    loadingDeployment,
    deployedCommitSha: envDeployment?.build?.commit?.sha,
    buildId: envDeployment?.build?.buildId,
    releaseMgtReleaseId: envDeployment?.releaseMgtDeployment?.releaseMgtReleaseId,
    releaseMgtDeploymentId: envDeployment?.releaseMgtDeployment?.releaseMgtDeploymentId,
    onNotify,
    requestPoll,
    onTrigger,
  };

  const { CustomHeader, HeaderStatus, EnvCardActions, EnvCardBody, EnvCardFooter } = module;

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent sx={{ pb: (theme) => `${theme.spacing(2)} !important` }}>
        {CustomHeader ? (
          <CustomHeader {...slotProps} isRefreshing={isRefreshing} onRefresh={handleRefresh} />
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
            actions={EnvCardActions && !loadingDeployment ? <EnvCardActions {...slotProps} /> : undefined}
          />
        )}

        {notification && (
          <Alert severity={notification.severity} sx={{ mt: 2 }}>
            {notification.text}
          </Alert>
        )}

        {EnvCardBody && <EnvCardBody {...slotProps} pendingTriggerTime={pendingTriggerTime} pendingTriggerArgs={pendingTriggerArgs} onTriggerResolved={onTriggerResolved} />}

        {EnvCardFooter && <EnvCardFooter {...slotProps} />}
      </CardContent>
    </Card>
  );
}
