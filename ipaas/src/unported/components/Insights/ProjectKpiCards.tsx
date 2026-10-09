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

import { Box, Paper, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { ColorDot } from './shared';
import { KIND_DOT, KIND_SHORT } from '../../../constants/insights';
import { KPI_ICONS } from '../../constants/insightsIcons';
import type { ProjectInsightsKpi } from '../../../types/insights';

/** Richer KPI row for the project Usage Insights view: uppercase label + icon,
 * large value, optional delta chip, and (for Active Integrations) a per-kind
 * dot+count type-mix. Kept separate from KpiCards so the API/automation views
 * keep their simpler cards. */
export function ProjectKpiCards({ kpis, loading = false }: { kpis: ProjectInsightsKpi[]; loading?: boolean }): JSX.Element {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
      {kpis.map((k) => {
        const ic = KPI_ICONS[k.key];
        return (
          <Paper key={k.key} variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 600 }}>
                {k.label}
              </Typography>
              {ic?.icon && <Box sx={{ color: `${ic.color}.main`, display: 'flex' }}>{ic.icon}</Box>}
            </Stack>
            {loading ? (
              <Skeleton variant="text" width={80} sx={{ fontSize: (t) => t.typography.h4.fontSize }} />
            ) : (
              <Typography variant="h4" sx={{ fontWeight: 700, color: k.danger ? 'error.main' : k.key === 'successRate' ? 'success.main' : 'text.primary' }}>
                {k.value}
              </Typography>
            )}
            {!loading && k.typeMix && k.typeMix.length > 0 ? (
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
                {k.typeMix.map((t) => (
                  <Stack key={t.kind} direction="row" alignItems="center" gap={0.5}>
                    <ColorDot color={KIND_DOT[t.kind]} size={8} />
                    <Typography variant="caption" color="text.secondary">
                      {t.count} {KIND_SHORT[t.kind]}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : !loading && k.sub ? (
              <Typography variant="caption" color="text.secondary">
                {k.sub}
              </Typography>
            ) : null}
          </Paper>
        );
      })}
    </Box>
  );
}
