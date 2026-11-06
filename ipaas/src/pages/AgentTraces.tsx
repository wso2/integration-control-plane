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

import { Alert, Box, Button, MenuItem, PageContent, Select, Stack, Typography } from '@wso2/oxygen-ui';
import { RefreshCw, Waypoints } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import AgentTracesSkeleton from '../components/Traces/AgentTracesSkeleton';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import TracesTable from '../components/Traces/TracesTable';
import TraceSpansDrawer from '../components/Traces/TraceSpansDrawer';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { useTraces } from '../hooks/useTraces';
import { apiErrorMessage } from '../utils/apiErrors';
import { identifyIntegration } from '../utils/identifyIntegration';
import { TRACE_RANGES, traceWindow } from '../utils/traces';
import { resourceUrl, type ComponentScope } from '../nav';
import type { TraceOverview, TraceQuery } from '../types/traces';

const PAGE_SIZE = 25;
const DEFAULT_RANGE_MINUTES = 60;

export default function AgentTraces(scope: ComponentScope): JSX.Element {
  const { org, project, component } = scope;
  const orgUuid = useOrgUuid();
  const { projectId, isLoading: loadingProject } = useProjectId(project);
  const { data: comp, isLoading: loadingComponent } = useComponentByHandler(projectId, component);
  const { data: environments = [], isLoading: loadingEnvironments, isError: environmentsError, refetch: refetchEnvironments } = useEnvironments(orgUuid ?? '', projectId);

  // The environment the user picked, falling back to the first once the listing
  // arrives. Derived rather than stored: an effect runs after paint, so the page
  // would show one frame of "no traces" before it had an environment to ask about.
  const [pickedEnvId, setPickedEnvId] = useState('');
  const envId = environments.some((environment) => environment.id === pickedEnvId) ? pickedEnvId : (environments[0]?.id ?? '');

  const [rangeMinutes, setRangeMinutes] = useState<number>(DEFAULT_RANGE_MINUTES);
  // A fixed instant, or every render would shift "now" and the cursor would stop lining up.
  const [windowAnchor, setWindowAnchor] = useState(() => new Date());
  const [cursors, setCursors] = useState<string[]>([]);
  // The route survives an integration switch, so the cursor has to be dropped
  // explicitly or it is sent against a listing it did not come from. Each handler
  // below drops it in the same tick; this covers the environment going away.
  useEffect(() => setCursors([]), [comp?.id, envId]);

  const range = useMemo<TraceQuery>(
    () => ({
      ...traceWindow(rangeMinutes, windowAnchor),
      limit: PAGE_SIZE,
      sortOrder: 'desc',
      cursor: cursors[cursors.length - 1],
      include: ['models', 'tools'],
    }),
    [rangeMinutes, windowAnchor, cursors],
  );

  // The drawer reads spans over the same window, without the listing's paging.
  const spanWindow = useMemo<TraceQuery>(() => ({ startTime: range.startTime, endTime: range.endTime }), [range.startTime, range.endTime]);

  const componentId = comp?.id ?? '';
  const { data, isLoading: loadingTraces, isError: tracesFailed, error: tracesError, isFetching, refetch } = useTraces(componentId, envId, range);

  const [selectedTrace, setSelectedTrace] = useState<TraceOverview | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = () => {
    setCursors([]);
    setWindowAnchor(new Date());
  };

  const changeRange = (minutes: number) => {
    setRangeMinutes(minutes);
    setCursors([]);
    setWindowAnchor(new Date());
  };

  const changeEnvironment = (nextEnvId: string) => {
    setPickedEnvId(nextEnvId);
    // In the same tick as the environment. Left to the effect, one render would
    // pair the new environment with a cursor the old one issued.
    setCursors([]);
  };

  if (loadingProject || loadingComponent || loadingEnvironments) {
    return (
      <PageContent>
        <AgentTracesSkeleton />
      </PageContent>
    );
  }

  if (!comp) {
    return <NotFound message="Integration not found." backTo={resourceUrl({ level: 'projects', org, project }, 'overview')} backLabel="Back to project" />;
  }

  // The sidebar offers this page for agents and Ballerina integrations, and the route sends
  // the latter to IntegrationTraces; this covers any other integration's URL, typed or shared.
  if (identifyIntegration(comp.displayType ?? '', comp.componentSubType ?? null).type !== 'ai-agent') {
    return (
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Traces
        </Typography>
        <Alert severity="info">Traces are collected for AI agents and Ballerina integrations only.</Alert>
      </PageContent>
    );
  }

  if (environmentsError) {
    return (
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Traces
        </Typography>
        <Alert severity="error" action={<Button onClick={() => refetchEnvironments()}>Retry</Button>}>
          Could not load environments.
        </Alert>
      </PageContent>
    );
  }

  // Traces are read per environment, so with none there is nothing to ask for —
  // distinct from an agent that has simply not run yet.
  if (environments.length === 0) {
    return (
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Traces
        </Typography>
        <EmptyListing
          icon={<Waypoints size={48} />}
          title="No environments in this project"
          description="Traces are recorded per environment. Create one and deploy the agent to it, and its executions appear here."
        />
      </PageContent>
    );
  }

  const traces = data?.traces ?? [];
  const onFirstPage = cursors.length === 0;

  return (
    <Box>
      <PageContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
          <Typography variant="h1">Traces</Typography>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Select size="small" value={envId} onChange={(event) => changeEnvironment(String(event.target.value))} aria-label="Environment">
              {environments.map((environment) => (
                <MenuItem key={environment.id} value={environment.id}>
                  {environment.name}
                </MenuItem>
              ))}
            </Select>
            <Select size="small" value={rangeMinutes} onChange={(event) => changeRange(Number(event.target.value))} aria-label="Time range">
              {TRACE_RANGES.map((range) => (
                <MenuItem key={range.minutes} value={range.minutes}>
                  {range.label}
                </MenuItem>
              ))}
            </Select>
            <Button size="small" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={refresh} disabled={isFetching}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        {loadingTraces ? (
          <AgentTracesSkeleton />
        ) : tracesFailed ? (
          <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
            {apiErrorMessage(tracesError, 'Could not load traces for this agent.')}
          </Alert>
        ) : (
          <>
            {traces.length === 0 ? (
              <EmptyListing
                icon={<Waypoints size={48} />}
                title={onFirstPage ? 'No traces in this range' : 'No traces on this page'}
                description={
                  onFirstPage
                    ? 'Invoke the agent in this environment, or widen the time range. Traces appear once the agent has handled a request.'
                    : 'The search found none here. Continue with Next, or go back.'
                }
              />
            ) : (
              <TracesTable
                traces={traces}
                onSelect={(trace) => {
                  setSelectedTrace(trace);
                  setDrawerOpen(true);
                }}
              />
            )}

            {data?.truncated ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                The search stopped before the range ran out. Continue with Next, or narrow the range.
              </Alert>
            ) : null}

            {/* Outside the listing: an empty page still has to be navigable, both
                back to the previous one and on through a truncated search. */}
            {!onFirstPage || data?.nextCursor ? (
              <Stack direction="row" gap={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
                <Button size="small" disabled={onFirstPage || isFetching} onClick={() => setCursors((prev) => prev.slice(0, -1))}>
                  Previous
                </Button>
                {/* While a page loads, data still holds the previous one and its
                    cursor; a second click would push that same cursor again. */}
                <Button size="small" disabled={!data?.nextCursor || isFetching} onClick={() => data?.nextCursor && setCursors((prev) => [...prev, data.nextCursor as string])}>
                  Next
                </Button>
              </Stack>
            ) : null}
          </>
        )}
      </PageContent>

      <TraceSpansDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        trace={selectedTrace}
        componentId={componentId}
        envId={envId}
        window={spanWindow}
      />
    </Box>
  );
}
