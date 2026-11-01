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
import { Activity, RefreshCw } from '@wso2/oxygen-ui-icons-react';
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
  const { data: environments = [], isLoading: loadingEnvironments, isError: environmentsError } = useEnvironments(orgUuid ?? '', projectId);

  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);

  const [rangeMinutes, setRangeMinutes] = useState<number>(DEFAULT_RANGE_MINUTES);
  // A fixed instant, or every render would shift "now" and the cursor would stop lining up.
  const [windowAnchor, setWindowAnchor] = useState(() => new Date());
  const [cursors, setCursors] = useState<string[]>([]);

  const window = useMemo<TraceQuery>(
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
  const spanWindow = useMemo<TraceQuery>(() => ({ startTime: window.startTime, endTime: window.endTime }), [window.startTime, window.endTime]);

  const componentId = comp?.id ?? '';
  const { data, isLoading: loadingTraces, isError: tracesError, isFetching, refetch } = useTraces(componentId, envId, window);

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
    setEnvId(nextEnvId);
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

  // The sidebar offers this page for agents alone; this covers a URL typed or shared.
  if (identifyIntegration(comp.displayType ?? '', comp.componentSubType ?? null).type !== 'ai-agent') {
    return (
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Traces
        </Typography>
        <Alert severity="info">Traces are collected for AI agents only.</Alert>
      </PageContent>
    );
  }

  if (environmentsError) {
    return (
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Traces
        </Typography>
        <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
          Could not load environments.
        </Alert>
      </PageContent>
    );
  }

  const traces = data?.traces ?? [];

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
        ) : tracesError ? (
          <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
            Could not load traces for this agent.
          </Alert>
        ) : traces.length === 0 ? (
          <EmptyListing
            icon={<Activity size={48} />}
            title="No traces in this range"
            description="Invoke the agent in this environment, or widen the time range. Traces appear once the agent has handled a request."
          />
        ) : (
          <>
            <TracesTable
              traces={traces}
              onSelect={(trace) => {
                setSelectedTrace(trace);
                setDrawerOpen(true);
              }}
            />

            {data?.truncated ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                The search stopped before the range ran out. Continue with Next, or narrow the range.
              </Alert>
            ) : null}

            <Stack direction="row" gap={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
              <Button size="small" disabled={cursors.length === 0} onClick={() => setCursors((prev) => prev.slice(0, -1))}>
                Previous
              </Button>
              <Button size="small" disabled={!data?.nextCursor} onClick={() => data?.nextCursor && setCursors((prev) => [...prev, data.nextCursor as string])}>
                Next
              </Button>
            </Stack>
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
