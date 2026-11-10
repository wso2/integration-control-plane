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

import { Alert, Button, Link, ListingTable, PageContent, PageTitle, RelativeTime, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { Mic, Plus } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import EmptyListing from '../components/EmptyListing';
import SearchField from '../components/SearchField';
import { INTEGRATION_TYPE_INFO } from '../constants/integrationTypes';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useActiveProjects } from '../hooks/useProjects';
import { useOrgVoiceAgents } from '../hooks/useVoiceAgents';
import { newProjectUrl, type OrgScope } from '../nav';
import { componentOverviewUrl, newVoiceAgentUrl } from '../paths';
import type { Project } from '../types/project';
import { formatDateTime, formatDistanceToNow } from '../utils/time';

const SEARCH_SX = { mb: 2 } as const;
const NAME_CELL_SX = { display: 'flex', alignItems: 'center', gap: 1 } as const;

function VoiceAgentsSkeleton(): JSX.Element {
  return (
    <Stack gap={1}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" height={48} />
      ))}
    </Stack>
  );
}

export default function VoiceAgents(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: projects, isLoading, isError, refetch } = useActiveProjects();

  return (
    <PageContent fullWidth sx={{ pt: 5 }}>
      <PageTitle>
        <PageTitle.Header>Voice agents</PageTitle.Header>
        <PageTitle.SubHeader>Let callers talk to your agents. Each voice agent turns speech into text for an agent and speaks its answers back.</PageTitle.SubHeader>
        {projects && projects.length > 0 && (
          <PageTitle.Actions>
            <CreateVoiceAgentButton org={scope.org} />
          </PageTitle.Actions>
        )}
      </PageTitle>
      {isLoading ? (
        <VoiceAgentsSkeleton />
      ) : isError || !projects ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Could not load the projects.
        </Alert>
      ) : projects.length === 0 ? (
        <EmptyListing icon={<Mic size={48} />} title="No projects" description="Create a project first; voice agents live in a project." showAction actionLabel="Create project" onAction={() => navigate(newProjectUrl(scope))} />
      ) : (
        <VoiceAgentList org={scope.org} projects={projects} />
      )}
    </PageContent>
  );
}

function CreateVoiceAgentButton({ org }: { org: string }): JSX.Element {
  const navigate = useAppNavigate();
  return (
    <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(newVoiceAgentUrl(org))}>
      Create voice agent
    </Button>
  );
}

function VoiceAgentList({ org, projects }: { org: string; projects: Project[] }): JSX.Element {
  const navigate = useAppNavigate();
  const { rows, isLoading, isError, refetch } = useOrgVoiceAgents(org, projects);
  const [query, setQuery] = useState('');

  if (isLoading) return <VoiceAgentsSkeleton />;
  if (isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={refetch}>
            Retry
          </Button>
        }>
        Could not load the voice agents.
      </Alert>
    );
  if (rows.length === 0)
    return <EmptyListing icon={<Mic size={48} />} title="No voice agents" description="Create a voice agent to let callers talk to one of your agents." showAction actionLabel="Create voice agent" onAction={() => navigate(newVoiceAgentUrl(org))} />;

  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter((r) => `${r.component.displayName} ${r.component.handler} ${r.project.name} ${r.targetAgent?.displayName ?? ''}`.toLowerCase().includes(needle)) : rows;
  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Search voice agents" width="standard" sx={SEARCH_SX} />
      <ListingTable.Container>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Name</ListingTable.Cell>
              <ListingTable.Cell>Project</ListingTable.Cell>
              <ListingTable.Cell>AI agent</ListingTable.Cell>
              <ListingTable.Cell>Description</ListingTable.Cell>
              <ListingTable.Cell>Type</ListingTable.Cell>
              <ListingTable.Cell align="right">Last updated</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {visible.map(({ component, project, targetAgent }) => {
              const updated = component.lastBuildDate || component.createdAt;
              return (
                <ListingTable.Row key={`${project.id}/${component.id}`}>
                  <ListingTable.Cell>
                    <Link component={RouterLink} to={componentOverviewUrl(org, project.handler, component.handler)} sx={NAME_CELL_SX}>
                      <Mic size={16} />
                      {component.displayName || component.handler}
                    </Link>
                  </ListingTable.Cell>
                  <ListingTable.Cell>{project.name}</ListingTable.Cell>
                  <ListingTable.Cell>
                    {targetAgent ? (
                      <Link component={RouterLink} to={componentOverviewUrl(org, project.handler, targetAgent.handler)}>
                        {targetAgent.displayName || targetAgent.handler}
                      </Link>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        External
                      </Typography>
                    )}
                  </ListingTable.Cell>
                  <ListingTable.Cell>{component.description || '—'}</ListingTable.Cell>
                  <ListingTable.Cell>{INTEGRATION_TYPE_INFO['voice-agent'].displayName}</ListingTable.Cell>
                  <ListingTable.Cell align="right">{updated ? <RelativeTime time={formatDistanceToNow(updated)} dateTime={updated} tooltip={formatDateTime(updated)} /> : '—'}</ListingTable.Cell>
                </ListingTable.Row>
              );
            })}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {visible.length === rows.length ? `${rows.length} voice agent${rows.length === 1 ? '' : 's'}` : `${visible.length} of ${rows.length} voice agents`}
      </Typography>
    </>
  );
}
