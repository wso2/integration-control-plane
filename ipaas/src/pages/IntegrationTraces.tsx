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

import { PageContent, Typography } from '@wso2/oxygen-ui';
import { Waypoints } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useOrgs } from '../hooks/useOrg';
import { useProjects } from '../hooks/useProjects';
import { useComponentByHandler } from '../hooks/useComponents';
import { useAllEnvironments, useEnvironments } from '../hooks/useEnvironments';
import { useComponentTraces, useTraceSpans, useTracesFetching, type TraceSpans } from '../hooks/useIntegrationTraces';
import { spanSeriesByService, summarizeServiceTraces, traceStats } from '../utils/integrationTraces';
import type { ComponentTracesRequest, TracePage } from '../types/integrationTraces';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import TracesError from '../components/IntegrationTraces/TracesError';
import TracesToolbar from '../components/IntegrationTraces/TracesToolbar';
import TraceStatCards from '../components/IntegrationTraces/TraceStatCards';
import TraceSection from '../components/IntegrationTraces/TraceSection';
import ServiceSpanChart from '../components/IntegrationTraces/ServiceSpanChart';
import ServiceTraces from '../components/IntegrationTraces/ServiceTraces';
import TracesPageSkeleton, { TraceSectionsSkeleton, TraceStatCardsSkeleton } from '../components/IntegrationTraces/TracesSkeletons';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

const DEFAULT_RANGE_HOURS = 24;
const HOUR_MS = 3_600_000;

function spansNote(page: TracePage, spans: TraceSpans): string {
  const listed = page.traces.length.toLocaleString();
  const base = spans.pending > 0 ? `From the spans of ${spans.read.toLocaleString()} of ${listed} traces so far` : page.truncated ? `From the spans of the newest ${listed} traces` : `From the spans of all ${listed} traces`;
  return spans.failed > 0 ? `${base}; ${spans.failed.toLocaleString()} could not be read` : base;
}

/** The per-service chart and trace view, built from the spans of every listed trace. */
function ServiceSections({ traceSpans, page, request }: { traceSpans: TraceSpans; page: TracePage; request: ComponentTracesRequest }): JSX.Element {
  const startMs = Date.parse(request.startTime);
  const endMs = Date.parse(request.endTime);
  const traces = page.traces;
  const { spans } = traceSpans;
  const series = useMemo(() => spanSeriesByService(spans, startMs, endMs), [spans, startMs, endMs]);
  const summaries = useMemo(() => summarizeServiceTraces(traces, spans), [traces, spans]);
  const note = spansNote(page, traceSpans);
  return (
    <>
      <TraceSection title="Spans per service" subtitle={`${note}. Tick the services to plot.`}>
        <ServiceSpanChart data={series} />
      </TraceSection>
      <TraceSection title="Traces by service" subtitle={`${note}. Select a service to see the traces it took part in; expand a trace to see its spans, and select a span to see its attributes.`}>
        <ServiceTraces summaries={summaries} traces={traces} spans={spans} />
      </TraceSection>
    </>
  );
}

/** Everything under the toolbar, for one environment and window. */
function TracesContent({ request }: { request: ComponentTracesRequest }): JSX.Element {
  const traces = useComponentTraces(request);
  const spans = useTraceSpans(request, traces.data?.traces);
  // Counted from the spans read so far, so it shows once the first trace's arrive.
  const services = useMemo(() => (spans.read > 0 ? new Set(spans.spans.map((s) => s.serviceName)).size : undefined), [spans.read, spans.spans]);

  if (traces.isPending) {
    return (
      <>
        <TraceStatCardsSkeleton />
        <TraceSectionsSkeleton />
      </>
    );
  }
  if (traces.isError) {
    return <TracesError title="Couldn't load traces" onRetry={() => void traces.refetch()} />;
  }
  if (traces.data.traces.length === 0) {
    return (
      <EmptyListing
        icon={<Waypoints size={48} />}
        title="No traces in this time range"
        description="Traces appear once the integration handles requests. They are collected for integrations built with Ballerina 2201.14 or later, from their next deploy. Try a wider time range."
      />
    );
  }

  const sections =
    spans.read === 0 && spans.pending > 0 ? (
      <TraceSectionsSkeleton />
    ) : spans.read === 0 ? (
      <TracesError title="Couldn't load the spans of these traces" onRetry={spans.retryFailed} />
    ) : (
      <ServiceSections traceSpans={spans} page={traces.data} request={request} />
    );
  // Not every trace's services are known while spans load, after some fail, or past the list's limit.
  const servicesLowerBound = spans.pending > 0 || spans.failed > 0 || traces.data.truncated;

  return (
    <>
      <TraceStatCards stats={traceStats(traces.data)} services={services} servicesLowerBound={servicesLowerBound} />
      {sections}
    </>
  );
}

export default function IntegrationTraces(scope: ComponentScope): JSX.Element {
  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const { data: projects, isLoading: loadingProjects } = useProjects();

  const project = projects?.find((p) => p.id === scope.project || p.handler === scope.project);
  const projectId = project?.id ?? '';
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: projectEnvs = [], isLoading: loadingProjectEnvs } = useEnvironments(orgUuid, projectId);
  const { data: globalEnvs = [], isLoading: loadingGlobalEnvs } = useAllEnvironments();
  // Prefer project-scoped environments (needs the org UUID); fall back to the global list without it, as Runtime Logs does.
  const environments = orgUuid ? projectEnvs : globalEnvs;
  const loadingEnvironments = orgUuid ? loadingProjectEnvs : loadingGlobalEnvs;

  const [chosenEnvId, setChosenEnvId] = useState<string | null>(null);
  const [rangeHours, setRangeHours] = useState(DEFAULT_RANGE_HOURS);
  // The window ends where it was last anchored, so a render never shifts it; Refresh and a new range re-anchor it.
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const refreshing = useTracesFetching();

  const environmentId = environments.find((e) => e.id === chosenEnvId)?.id ?? environments[0]?.id;

  const request = useMemo<ComponentTracesRequest | null>(() => {
    if (!component || !environmentId) return null;
    return {
      componentId: component.id,
      environmentId,
      startTime: new Date(anchorMs - rangeHours * HOUR_MS).toISOString(),
      endTime: new Date(anchorMs).toISOString(),
    };
  }, [component, environmentId, anchorMs, rangeHours]);

  if (loadingOrgs || loadingProjects || loadingComponent || loadingEnvironments) return <TracesPageSkeleton />;
  if (!component) return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  if (!request) {
    return (
      <PageContent>
        <EmptyListing icon={<Waypoints size={48} />} title="No environments available" description="No deployment environments were found for this project. Deploy your integration first." />
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Traces
      </Typography>
      <TracesToolbar
        environments={environments}
        environmentId={request.environmentId}
        onEnvironmentChange={setChosenEnvId}
        rangeHours={rangeHours}
        onRangeChange={(hours) => {
          setRangeHours(hours);
          setAnchorMs(Date.now());
        }}
        onRefresh={() => setAnchorMs(Date.now())}
        refreshing={refreshing}
      />
      <TracesContent request={request} />
    </PageContent>
  );
}
