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

import { Avatar, Box, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Activity, AlertTriangle, Clock, TrendingUp } from '@wso2/oxygen-ui-icons-react';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import { useComponentInsights, useInsightsEnvironments } from '../../../hooks/useInsights';
import type { ComponentInsights } from '../../../types/insights';

const ZERO_METRICS: ComponentInsights = { requestCount: 0, errorCount: 0, errorRate: 0, latency: 0 };

// ---------- MetricTile ----------

interface MetricTileProps {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  unit?: string;
  loading: boolean;
  isLast?: boolean;
}

function MetricTile({ icon, label, value, unit, loading, isLast }: MetricTileProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 1.5,
        borderRight: isLast ? 'none' : '1px solid',
        borderColor: 'divider',
      }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ width: '100%' }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: 'action.selected', flexShrink: 0 }}>{icon}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
            {label}
          </Typography>
          {loading ? (
            <CircularProgress size={16} />
          ) : (
            <Stack direction="row" alignItems="baseline" gap={0.5}>
              <Typography variant="h6" component="span" fontWeight={600}>
                {value ?? '—'}
              </Typography>
              {unit && value !== null && (
                <Typography variant="caption" color="text.secondary">
                  {unit}
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

// ---------- ServiceInsights ----------

interface ServiceInsightsProps {
  envName: string;
  envId: string;
  apimEnvId?: string;
  projectId: string;
  apiId: string;
}

export default function ServiceInsights({ envName, envId, apimEnvId, projectId, apiId }: ServiceInsightsProps) {
  const orgUuid = useOrgUuid() ?? '';

  // Shared React Query hook — deduplicated across all env cards for the same project
  const { data: insightsEnvs } = useInsightsEnvironments(orgUuid, projectId);

  const insightsEnv = insightsEnvs?.find((e) => (apimEnvId && e.externalEnvId === apimEnvId) || e.externalEnvId === envId || e.name?.toLowerCase() === envName?.toLowerCase()) ?? null;

  const { data: insightsRaw } = useComponentInsights(orgUuid, insightsEnv, apiId);

  // Resolve display state from query results:
  //   - matched env, fetched → use data (or zeros on error)
  //   - matched env, still fetching → null (show loading)
  //   - no match but envs loaded → zeros (default)
  //   - envs still loading → null
  const insights: ComponentInsights | null = insightsEnv ? (insightsRaw === undefined ? null : (insightsRaw ?? ZERO_METRICS)) : insightsEnvs && apiId ? ZERO_METRICS : null;
  const loading = insights === null;

  const tiles = [
    { key: 'traffic', label: 'Total traffic', icon: <TrendingUp size={16} />, value: insights?.requestCount ?? null, unit: undefined },
    { key: 'errors', label: 'Error count', icon: <AlertTriangle size={16} />, value: insights?.errorCount ?? null, unit: undefined },
    { key: 'errorRate', label: 'Avg error rate', icon: <Activity size={16} />, value: insights?.errorRate ?? null, unit: '%' },
    { key: 'latency', label: 'P99 latency', icon: <Clock size={16} />, value: insights?.latency ?? null, unit: 'ms' },
  ] as const;

  return (
    <>
      {/* Thin separator matching devant's cardHeaderDivider */}
      <Box sx={{ height: '1px', bgcolor: 'divider', mt: 2 }} />
      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        }}>
        {tiles.map((tile, idx) => (
          <MetricTile key={tile.key} icon={tile.icon} label={tile.label} value={tile.value} unit={tile.unit} loading={loading} isLast={idx === tiles.length - 1} />
        ))}
      </Box>
    </>
  );
}
