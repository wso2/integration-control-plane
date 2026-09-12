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

import { Alert, Box, CircularProgress, IconButton, MenuItem, PageContent, PageTitle, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectId } from '../hooks/useProjects';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useComponentHttpMetrics, useComponentUsageMetrics, rangeToIso } from '../hooks/useObservabilityMetrics';
import { useInfiniteComponentLogs } from '../hooks/useLogs';
import MetricsHeader from '../components/Observability/MetricsHeader';
import MetricGraph from '../components/Observability/MetricGraph';
import { scaleRows, MB } from '../components/Observability/format';
import LogsPanel from '../components/Logs/LogsPanel';
import LogEntry from '../components/Logs/LogEntry';
import NotFound from '../components/NotFound';
import { resourceUrl, broaden, type ComponentScope } from '../nav';
import { GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { choreologgingComponentLogsApiUrl, choreologgingComponentGatewayLogsApiUrl } from '../config/runtimeConfig';
import { DEFAULT_DP_REGION, PAGE_SIZE } from '../utils/logs';
import type { ComponentLogsRequest } from '../types/logs';
import type { MetricsRange } from '../types/observability';

const COLOR = { total: '#569CD6', success: '#2E9E5B', failed: '#EF4444', mean: '#5567D5', p50: '#569CD6', p90: '#ED6C02', p99: '#EF4444', usage: '#5567D5', requests: '#569CD6', limits: '#EF4444' };

/**
 * Integration-level Metrics page — port of Devant's ObservabilityOverview2:
 * request/latency histograms (API-like integrations only) + cpu/memory/network/disk
 * usage graphs for the selected environment's active release, with the runtime
 * logs panel underneath. Data from `choreoobsapi/0.3.0` (see api/wip/observability.ts).
 */
export default function ComponentMetrics(scope: ComponentScope): JSX.Element {
  const { projectId, project } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const orgUuid = useOrgUuid() ?? '';
  const queryClient = useQueryClient();

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const [trackId, setTrackId] = useState('');
  useEffect(() => {
    if (tracks.length) setTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : (tracks.find((t) => t.latest)?.id ?? tracks[0].id)));
  }, [tracks]);

  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(scope.org, projectId);
  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);

  const componentId = component?.id ?? '';
  const { data: deployment } = useComponentDeployment(scope.org, orgUuid, componentId, trackId, envId);
  const releaseId = deployment?.releaseId ?? '';

  const [range, setRange] = useState<MetricsRange>('24h');
  const [refreshSeconds, setRefreshSeconds] = useState(0);
  const [logsOpen, setLogsOpen] = useState(true);

  const isApiLike = GENERIC_SERVICE_TYPES.has(component?.displayType ?? '');
  const http = useComponentHttpMetrics(releaseId, range, refreshSeconds, isApiLike);
  const usage = useComponentUsageMetrics(releaseId, range, refreshSeconds);

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['componentHttpMetrics'] });
    void queryClient.invalidateQueries({ queryKey: ['componentUsageMetrics'] });
  };

  // MB-scaled copies of the byte-valued series.
  const memoryRows = useMemo(() => (usage.data ? scaleRows(usage.data.memoryRows, ['usage', 'requests', 'limits'], MB) : undefined), [usage.data]);
  const receivedRows = useMemo(() => (usage.data ? scaleRows(usage.data.receivedRows, ['received'], MB) : undefined), [usage.data]);
  const sentRows = useMemo(() => (usage.data ? scaleRows(usage.data.sentRows, ['sent'], MB) : undefined), [usage.data]);
  const diskReadRows = useMemo(() => (usage.data ? scaleRows(usage.data.diskReadRows, ['reads'], MB) : undefined), [usage.data]);
  const diskWriteRows = useMemo(() => (usage.data ? scaleRows(usage.data.diskWriteRows, ['writes'], MB) : undefined), [usage.data]);

  // ---------- Runtime logs (same request the runtime-logs page builds) ----------
  const { from: logsFrom, to: logsTo } = useMemo(() => rangeToIso(range), [range]);
  const primaryEnv = environments.find((e) => e.id === envId);
  const logsApiUrl = isApiLike ? choreologgingComponentGatewayLogsApiUrl() : choreologgingComponentLogsApiUrl();
  const logsRequest = useMemo<ComponentLogsRequest | null>(() => {
    if (!componentId || !primaryEnv) return null;
    return {
      componentId,
      environmentId: primaryEnv.id,
      versionIdList: [],
      logLevels: [],
      startTime: logsFrom,
      endTime: logsTo,
      limit: PAGE_SIZE,
      sort: 'desc',
      region: project?.region || DEFAULT_DP_REGION,
      searchPhrase: '',
      regexPhrase: '',
      ...(isApiLike ? { logType: 'singleLine' } : {}),
    };
  }, [componentId, primaryEnv, logsFrom, logsTo, project?.region, isApiLike]);
  const logs = useInfiniteComponentLogs(logsOpen ? logsRequest : null, false, logsApiUrl);
  const logItems = useMemo(() => logs.data?.pages.flat() ?? [], [logs.data]);

  if (loadingComponent || loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }
  if (!component) return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Metrics</PageTitle.Header>
      </PageTitle>

      <MetricsHeader range={range} onRangeChange={setRange} refreshSeconds={refreshSeconds} onRefreshSecondsChange={setRefreshSeconds} onRefresh={handleRefresh} isRefreshing={http.isFetching || usage.isFetching}>
        {environments.length > 1 && (
          <TextField select size="small" label="Environment" value={envId} onChange={(e) => setEnvId(e.target.value)} sx={{ minWidth: 150 }}>
            {environments.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {tracks.length > 0 && (
          <TextField select size="small" label="Version" value={trackId} onChange={(e) => setTrackId(e.target.value)} sx={{ minWidth: 120 }}>
            {tracks.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.branch || t.apiVersion || t.id}
              </MenuItem>
            ))}
          </TextField>
        )}
      </MetricsHeader>

      {!releaseId ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          This integration is not deployed in the selected environment yet — metrics appear once it is deployed and receiving traffic.
        </Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, mb: 2 }}>
          {isApiLike && (
            <>
              <MetricGraph
                title="Requests Per Minute"
                unit="requests"
                rows={http.data?.requestRows}
                isLoading={http.isLoading}
                isError={http.isError}
                onRetry={handleRefresh}
                series={[
                  { key: 'total', name: 'Total Request', color: COLOR.total },
                  { key: 'success', name: 'Successful Request', color: COLOR.success },
                  { key: 'failed', name: 'Failed Request', color: COLOR.failed },
                ]}
              />
              <MetricGraph
                title="Request Latency"
                unit="s"
                rows={http.data?.latencyRows}
                isLoading={http.isLoading}
                isError={http.isError}
                onRetry={handleRefresh}
                series={[
                  { key: 'mean', name: 'Mean Latency', color: COLOR.mean },
                  { key: 'p50', name: '50th Percentile', color: COLOR.p50 },
                  { key: 'p90', name: '90th Percentile', color: COLOR.p90 },
                  { key: 'p99', name: '99th Percentile', color: COLOR.p99 },
                ]}
              />
            </>
          )}
          <MetricGraph
            title="Memory Usage"
            unit="MB"
            rows={memoryRows}
            isLoading={usage.isLoading}
            isError={usage.isError}
            onRetry={handleRefresh}
            series={[
              { key: 'usage', name: 'Memory Usage', color: COLOR.usage },
              { key: 'requests', name: 'Memory Request', color: COLOR.requests },
              { key: 'limits', name: 'Memory Limit', color: COLOR.limits },
            ]}
          />
          <MetricGraph
            title="CPU Usage"
            unit="vCPUs"
            rows={usage.data?.cpuRows}
            isLoading={usage.isLoading}
            isError={usage.isError}
            onRetry={handleRefresh}
            series={[
              { key: 'usage', name: 'CPU Usage', color: COLOR.usage },
              { key: 'requests', name: 'CPU Request', color: COLOR.requests },
              { key: 'limits', name: 'CPU Limit', color: COLOR.limits },
            ]}
          />
          <MetricGraph title="Data Received" unit="MB" rows={receivedRows} isLoading={usage.isLoading} isError={usage.isError} onRetry={handleRefresh} series={[{ key: 'received', name: 'Data Received', color: COLOR.usage }]} />
          <MetricGraph title="Data Sent" unit="MB" rows={sentRows} isLoading={usage.isLoading} isError={usage.isError} onRetry={handleRefresh} series={[{ key: 'sent', name: 'Data Sent', color: COLOR.usage }]} />
          <MetricGraph title="Disk Usage (Reads)" unit="MB" rows={diskReadRows} isLoading={usage.isLoading} isError={usage.isError} onRetry={handleRefresh} series={[{ key: 'reads', name: 'Disk Reads', color: COLOR.usage }]} />
          <MetricGraph title="Disk Usage (Writes)" unit="MB" rows={diskWriteRows} isLoading={usage.isLoading} isError={usage.isError} onRetry={handleRefresh} series={[{ key: 'writes', name: 'Disk Writes', color: COLOR.usage }]} />
        </Box>
      )}

      {/* ---------- Runtime logs panel ---------- */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Runtime Logs
          </Typography>
          <IconButton size="small" onClick={() => setLogsOpen((v) => !v)}>
            {logsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </IconButton>
        </Stack>
        {logsOpen && (
          <Box sx={{ height: 380, borderTop: '1px solid', borderColor: 'divider' }}>
            <LogsPanel
              isLoading={logs.isLoading}
              error={logs.error}
              items={logItems}
              getKey={(l, i) => `${l.timestamp}_${i}`}
              renderRow={(l, expanded, toggle) => <LogEntry log={l} expanded={expanded} onToggle={toggle} envName={primaryEnv?.name} />}
              onRefetch={() => void logs.refetch()}
              hasNextPage={logs.hasNextPage}
              isFetchingNextPage={logs.isFetchingNextPage}
              onFetchNextPage={() => void logs.fetchNextPage()}
            />
          </Box>
        )}
      </Box>
    </PageContent>
  );
}
