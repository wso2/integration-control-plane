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

import { Alert, AlertTitle, Box, IconButton, PageContent, PageTitle, Stack, Tooltip } from '@wso2/oxygen-ui';
import { Layers, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import DeploymentTrackBar from '../../DeploymentTrackBar';
import EmptyListing from '../../EmptyListing';
import NotDeployedAlert from '../../NotDeployedAlert';
import NotFound from '../../NotFound';
import UserPortalPrompt from '../../UserPortal/UserPortalPrompt';
import EnvironmentSelect from '../../common/EnvironmentSelect';
import { useComponentByHandler } from '../../../hooks/useComponents';
import { useComponentDeployment } from '../../../hooks/useDeployments';
import { useEnvironments } from '../../../hooks/useEnvironments';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import { useProjectId } from '../../../hooks/useProjects';
import { useSelectedTrack } from '../../../hooks/useSelectedTrack';
import { broaden, overviewUrl, resourceUrl, type ComponentScope } from '../../../nav';
import type { Component } from '../../../types/component';
import type { Environment } from '../../../types/environment';
import type { NotDeployedPurpose } from '../../../utils/deploymentNotice';
import { isNotFoundError } from '../../../utils/apiErrors';
import { isWorkflowIntegration } from '../../../utils/workflowIntegration';
import { isScopedWorkflowKey } from '../api/queryKeys';
import { useWorkflowApi, type ReadyWorkflowApi, type WorkflowApi } from '../api/useWorkflowApi';
import { WORKFLOW_ENV_PARAM } from '../routing/useWorkflowRoutes';
import AutoRefreshToggle from './AutoRefreshToggle';
import { retryAction } from './retryAction';
import TestKeyNotice from './TestKeyNotice';
import { WorkflowContentSkeleton, WorkflowPageSkeleton } from './WorkflowPageSkeleton';
import * as styles from './WorkflowPageShell.styles';

/** What a workflow page's placeholder gets: the integration and the environment shown. */
export interface WorkflowPagePlaceholderProps {
  scope: ComponentScope;
  component: Component;
  /** The environment shown; its id is what `?env=` links carry. */
  environment: Environment;
  environments: Environment[];
}

/** What a workflow page's content gets once the management API answers. */
export interface WorkflowPageSlotProps extends WorkflowPagePlaceholderProps {
  /** The client and the ready connection, for this environment and deployment track. */
  api: ReadyWorkflowApi;
}

interface WorkflowPageShellProps {
  scope: ComponentScope;
  title: string;
  /** What the page needs a deployment for, as the not-deployed notice says it. */
  purpose: Extract<NotDeployedPurpose, 'runWorkflows' | 'workOnTasks'>;
  /** The page's own content, rendered only once the connection is ready. */
  children: (slot: WorkflowPageSlotProps) => ReactNode;
  /**
   * What stands in for the page's content while the console can't serve it yet, for the environment shown. With one,
   * the page makes no connection to the management API.
   */
  placeholder?: (slot: WorkflowPagePlaceholderProps) => ReactNode;
}

/** The auto-refresh switch and the refresh button for every read of the connection. */
function RefreshControls({ scopeId }: { scopeId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const predicate = (query: { queryKey: readonly unknown[] }) => isScopedWorkflowKey(query.queryKey, scopeId);
  const fetching = useIsFetching({ predicate }) > 0;
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <AutoRefreshToggle scopeId={scopeId} />
      <Tooltip title="Refresh">
        <span>
          <IconButton size="small" aria-label="Refresh" disabled={fetching} onClick={() => void queryClient.invalidateQueries({ predicate })}>
            <RefreshCw size={18} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

/**
 * What the page shows until the management API answers, or its content once it does. Where the API's security comes by
 * promotion and takes no test key, the User Portal is the way left to manage the workflow here, so `portalPrompt` shows
 * the next step towards it.
 */
function ConnectionBody({ api, purpose, portalPrompt, children }: { api: WorkflowApi; purpose: WorkflowPageShellProps['purpose']; portalPrompt: ReactNode; children: (api: ReadyWorkflowApi) => ReactNode }): ReactNode {
  if (api.client) return children(api);
  const { connection } = api;
  switch (connection.status) {
    case 'loading':
      return <WorkflowContentSkeleton caption="Connecting to the workflow engine…" />;
    case 'not-deployed':
      // Not a failure: say so, and what deploying is for, as the Test Console does.
      return <NotDeployedAlert status={connection.deploymentStatus} purpose={purpose} />;
    case 'unavailable':
      if (connection.reason === 'secured-by-promotion') {
        return (
          <Stack gap={2}>
            <TestKeyNotice notice={connection.notice} action={connection.action} />
            <Stack alignItems="center">{portalPrompt}</Stack>
          </Stack>
        );
      }
      return <TestKeyNotice notice={connection.notice} action={connection.action} />;
    case 'refused':
      return (
        <Alert severity="error" action={retryAction(connection.retry)}>
          <AlertTitle>Credentials refused</AlertTitle>
          {connection.message}
        </Alert>
      );
    case 'error':
      return (
        <Alert severity="error" action={retryAction(connection.retry)}>
          {connection.message}
        </Alert>
      );
  }
}

/**
 * The frame both workflow pages share: the deployment track picker and the environment selector
 * the Test Console uses, the page title, the auto-refresh switch, and the states a page shows before
 * its content (not deployed yet, the management API out of reach, connecting, credentials refused).
 * The content renders in `children` once the connection is ready, so it starts with a client.
 *
 * The environment shown is held in `?env=`, which links from the overview set; without one, the
 * first environment.
 */
export default function WorkflowPageShell({ scope, title, purpose, children, placeholder }: WorkflowPageShellProps): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { projectId, isLoading: loadingProject, isError: projectError, refetch: refetchProject } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent, error: componentError, refetch: refetchComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [], isLoading: loadingEnvironments, isError: environmentsError, refetch: refetchEnvironments } = useEnvironments(orgUuid, projectId);
  const { trackId } = useSelectedTrack(component);

  const [params, setParams] = useSearchParams();
  const linkedEnvId = params.get(WORKFLOW_ENV_PARAM);
  const environment = environments.find((env) => env.id === linkedEnvId) ?? environments[0];
  const selectEnvironment = (envId: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(WORKFLOW_ENV_PARAM, envId);
        return next;
      },
      { replace: true },
    );

  const componentId = component?.id ?? '';
  // A placeholder needs no connection, so no deployment is read for one: with none to connect to, none is made.
  const reads = !!component && !placeholder;
  const { data: deployment, isLoading: loadingDeployment } = useComponentDeployment(reads ? scope.org : '', reads ? orgUuid : '', componentId, trackId, environment?.id ?? '');
  const api = useWorkflowApi({ componentId, environmentId: environment?.id ?? '', trackId, deployment: placeholder ? null : deployment, isDeploymentLoading: !placeholder && loadingDeployment });

  if (loadingProject || loadingComponent || loadingEnvironments) return <WorkflowPageSkeleton title={title} />;
  // A failed read is not a missing integration; only a 404 says it does not exist.
  if (projectError || (!component && componentError && !isNotFoundError(componentError))) {
    return (
      <PageContent fullWidth>
        <PageTitle>
          <PageTitle.Header>{title}</PageTitle.Header>
        </PageTitle>
        <Alert severity="error" action={retryAction(() => void (projectError ? refetchProject() : refetchComponent()))}>
          Could not load this integration.
        </Alert>
      </PageContent>
    );
  }
  if (!component) return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to project" />;
  if (!isWorkflowIntegration(component)) {
    return <NotFound message={`${title} are available only for workflow integrations.`} backTo={overviewUrl(scope)} backLabel="Back to overview" />;
  }

  let body: ReactNode;
  if (environmentsError) {
    body = (
      <Alert severity="error" action={retryAction(() => void refetchEnvironments())}>
        Could not load the project’s environments.
      </Alert>
    );
  } else if (!environment) {
    body = <EmptyListing icon={<Layers size={48} />} title="No environments" description="This project has no environments yet, so there is nowhere this integration runs." />;
  } else if (placeholder) {
    body = placeholder({ scope, component, environment, environments });
  } else {
    body = (
      <ConnectionBody api={api} purpose={purpose} portalPrompt={<UserPortalPrompt componentId={component.id} environment={environment} />}>
        {(ready) => children({ scope, component, environment, environments, api: ready })}
      </ConnectionBody>
    );
  }

  const envSelector = environment && environments.length > 1 && <EnvironmentSelect environments={environments} value={environment.id} onChange={selectEnvironment} deployment={{ orgHandler: scope.org, orgUuid, componentId, versionId: trackId }} />;

  return (
    <Box sx={styles.page}>
      <DeploymentTrackBar component={component} extra={envSelector} />
      <PageContent fullWidth>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap" sx={styles.titleRow}>
          <PageTitle>
            <PageTitle.Header>{title}</PageTitle.Header>
          </PageTitle>
          {api.client && <RefreshControls scopeId={api.connection.scopeId} />}
        </Stack>
        {body}
      </PageContent>
    </Box>
  );
}
