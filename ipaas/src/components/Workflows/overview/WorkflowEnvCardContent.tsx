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

import { Alert, AlertTitle, Box, Button, MenuItem, Select, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type JSX, type ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router';
import { useUserPortalServed } from '../../../hooks/useUserPortal';
import { hasComponent, useScope, type ComponentScope } from '../../../nav';
import { retryWorkflowRead } from '../api/http';
import { workflowKeys } from '../api/queryKeys';
import type { WorkflowStatusFilter } from '../api/types';
import { useWorkflowApi, type ReadyWorkflowApi } from '../api/useWorkflowApi';
import type { WorkflowTarget } from '../connection/useWorkflowConnection';
import { humanTasksUrl, useWorkflowRoutes, workflowRunsUrl, type WorkItemKind } from '../routing/useWorkflowRoutes';
import StartWorkflowDialog from '../runs/StartWorkflowDialog';
import { retryAction } from '../shared/retryAction';
import type { WorkflowTimeRange } from '../shared/workflowTimeRangeFilter';
import TestKeyNotice from '../shared/TestKeyNotice';
import WorkflowStatsStrip from './WorkflowStatsStrip';
import { strip } from './WorkflowStatsStrip.styles';
import * as styles from './WorkflowEnvCardContent.styles';

interface WorkflowEnvCardContentProps {
  /** The card's integration, environment and deployment track, with its active deployment. */
  target: WorkflowTarget;
}

/** Where the card's links go: the workflow pages, opened on the card's environment and track. */
interface CardLinks {
  runs: (status?: WorkflowStatusFilter, closedWithin?: WorkflowTimeRange) => string;
  tasks: (kind: WorkItemKind) => string;
}

function cardLinks(scope: ComponentScope, search: string, envId: string, workflowType: string | undefined): CardLinks {
  return {
    runs: (status, closedWithin) => workflowRunsUrl(scope, { workflowType, status, closedWithin, envId }, search),
    tasks: (type) => humanTasksUrl(scope, { type, envId, workflowType }, search),
  };
}

/** The definition row and the six figures, while the card connects or reads its definitions. */
function WorkflowEnvCardSkeleton(): JSX.Element {
  return (
    <Stack sx={styles.skeleton} aria-busy="true" aria-label="Loading workflows">
      <Box sx={styles.skeletonRow}>
        <Skeleton variant="text" width={140} />
        <Skeleton variant="rounded" width={240} height={32} />
        <Box sx={styles.actions}>
          <Skeleton variant="rounded" width={120} height={30} />
          <Skeleton variant="rounded" width={150} height={30} />
        </Box>
      </Box>
      <Box sx={strip}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={styles.TILE_HEIGHT} />
        ))}
      </Box>
    </Stack>
  );
}

/** The definition picker, its link to the Workflows list and its Start action, and the selected definition's figures. */
function WorkflowDefinitions({ api, scope, search, envId }: { api: ReadyWorkflowApi; scope: ComponentScope; search: string; envId: string }): JSX.Element {
  const portalServed = useUserPortalServed(envId);
  const { client, connection } = api;
  const [picked, setPicked] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const { goToWorkflowRuns } = useWorkflowRoutes();
  const definitions = useQuery({
    queryKey: workflowKeys.definitions(connection.scopeId),
    queryFn: () => client.definitions.list(),
    retry: retryWorkflowRead,
  });

  if (definitions.isPending) return <WorkflowEnvCardSkeleton />;
  if (definitions.isError) {
    return (
      <Alert severity="error" action={retryAction(() => void definitions.refetch())}>
        Could not load the workflow definitions.
      </Alert>
    );
  }

  // The first definition until another is picked, or again once the picked one is gone.
  const selected = definitions.data.find((definition) => definition.workflowType === picked) ?? definitions.data[0];
  const links = cardLinks(scope, search, envId, selected?.workflowType);

  return (
    <>
      <Box sx={styles.definitionRow}>
        <Box sx={styles.definitionPicker}>
          <Typography variant="body2" color="text.secondary" sx={styles.label}>
            Workflow Definitions:
          </Typography>
          {selected ? (
            <Select size="small" value={selected.workflowType} onChange={(event) => setPicked(event.target.value)} renderValue={(workflowType) => workflowType} inputProps={{ 'aria-label': 'Workflow Definitions' }} sx={styles.select}>
              {definitions.data.map((definition) => (
                <MenuItem key={definition.workflowType} value={definition.workflowType} sx={styles.option}>
                  <Typography variant="body2" sx={styles.optionName}>
                    {definition.workflowType}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Worker count: {definition.workerCount}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No workflow definitions are registered yet.
            </Typography>
          )}
        </Box>
        <Box sx={styles.actions}>
          <Button variant="outlined" size="small" component={RouterLink} to={links.runs()}>
            View Workflows
          </Button>
          <Button variant="contained" size="small" disabled={!selected} onClick={() => setStartOpen(true)}>
            Start New Workflow
          </Button>
        </Box>
      </Box>

      {selected && !selected.isActive && (
        <Typography variant="body2" color="text.secondary" sx={styles.inactiveNote}>
          This workflow definition is currently inactive.
        </Typography>
      )}

      <WorkflowStatsStrip client={client} scopeId={connection.scopeId} workflowType={selected?.workflowType} runsLink={links.runs} tasksLink={links.tasks} portalServed={portalServed} />

      {/* The run just started opens on the Workflows page, in this card's environment and track. */}
      <StartWorkflowDialog
        open={startOpen}
        api={client}
        scopeId={connection.scopeId}
        definitions={definitions.data}
        initialWorkflowType={selected?.workflowType}
        onClose={() => setStartOpen(false)}
        onViewRun={({ workflowType, runId }) => goToWorkflowRuns({ workflowType, runId, envId })}
      />
    </>
  );
}

/**
 * The workflow content of an environment card: the definition selector, a link to
 * the definition's runs, Start New Workflow (the Workflows page's own dialog), and its figures, each
 * linking to its list in this card's environment.
 *
 * Mounted once the deployment is active. Definitions and figures come from the integration's own
 * Workflow Management API, through the one connection this card holds for its environment.
 */
export default function WorkflowEnvCardContent({ target }: WorkflowEnvCardContentProps): ReactNode {
  const api = useWorkflowApi(target);
  const scope = useScope();
  const { search } = useLocation();

  // An environment card only renders on an integration's overview, whose scope names it.
  if (!hasComponent(scope)) return null;
  if (api.client) return <WorkflowDefinitions api={api} scope={scope} search={search} envId={target.environmentId} />;

  const { connection } = api;
  switch (connection.status) {
    case 'loading':
      return <WorkflowEnvCardSkeleton />;
    case 'not-deployed':
      // The card already says this environment has no active deployment; nothing to add here.
      return null;
    case 'unavailable':
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
