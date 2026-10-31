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

import { Alert, Box, CircularProgress, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState, type JSX } from 'react';
import type { AgentConnectionStatus } from '../types/agentChat';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import NotFound from '../components/NotFound';
import AgentChat from '../components/AgentChat';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

/**
 * Full-page Test surface for AI Agent integrations (`test/agent-chat`).
 *
 * Chats with the agent deployed in the first non-critical environment via the
 * shared `AgentChat`. Critical (production) environments are excluded — agents
 * are only chat-testable in non-critical envs.
 */
export default function AgentChatConsole(scope: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { projectId } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [] } = useEnvironments(scope.org, projectId);

  // Agents can only be chatted with in non-critical environments.
  const testableEnvs = useMemo(() => environments.filter((e) => !e.critical), [environments]);

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  // An integration has one implicit deployment track.
  const selectedTrackId = tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '';
  const selectedEnv = testableEnvs[0] ?? null;

  const { data: deployment } = useComponentDeployment(component ? scope.org : '', component ? orgUuid : '', component?.id ?? '', selectedTrackId, selectedEnv?.id ?? '');
  const releaseId = deployment?.releaseId ?? '';

  const [connection, setConnection] = useState<AgentConnectionStatus>('connecting');
  const connectionChip = { connected: { label: 'Connected', color: 'success.main' }, connecting: { label: 'Connecting…', color: 'warning.main' }, error: { label: 'Disconnected', color: 'error.main' } }[connection];

  if (loadingComponent) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (!component) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }} flexWrap="wrap" gap={1}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Typography variant="h1">Test</Typography>
            {!!releaseId && (
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ px: 1.25, py: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connectionChip.color, flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary">
                  {connectionChip.label}
                </Typography>
              </Stack>
            )}
          </Stack>
        </Stack>

        {testableEnvs.length === 0 ? (
          <Alert severity="info">AI agent chat is only available in non-critical environments. No such environment is configured for this agent.</Alert>
        ) : !releaseId ? (
          <Alert severity="info">This agent is not deployed in {selectedEnv?.name ?? 'the selected environment'}. Deploy it to start chatting.</Alert>
        ) : (
          <AgentChat projectId={projectId} componentId={component.id} versionId={selectedTrackId} releaseId={releaseId} environmentName={selectedEnv?.id} envCritical={false} variant="page" onConnectionChange={setConnection} />
        )}
      </PageContent>
    </Box>
  );
}
