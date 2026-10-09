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

import { Box, MenuItem } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { useEffect, useState, type JSX } from 'react';
import { InsightsCard, TrendBarChart } from './shared';
import { UNIT_BY_KIND } from '../../../constants/insights';
import type { InsightsRange, IntegrationKind, ProjectActivityData } from '../../../types/insights';

const ALL = 'all';

/** "Activity over time" — one bar chart across all integration types with a type
 * filter (top-right). "All" stacks every type's per-bucket count in its own
 * colour; picking a type filters to that type alone. */
export function ActivityOverTime({ chart, range, loading = false }: { chart: ProjectActivityData; range: InsightsRange; loading?: boolean }): JSX.Element {
  const [sel, setSel] = useState<string>(ALL);
  // Keep the selection valid when the available series change (e.g. project switch).
  useEffect(() => {
    if (sel !== ALL && !chart.series.some((s) => s.key === sel)) setSel(ALL);
  }, [chart.series, sel]);

  const showAll = sel === ALL;
  const series = showAll ? chart.series : chart.series.filter((s) => s.key === sel);
  const areas = series.map((s) => ({ key: s.key, name: s.label, color: s.color, ...(showAll ? { stackId: 'activity' } : {}) }));

  const unit = showAll ? 'activity' : UNIT_BY_KIND[sel as IntegrationKind];
  const subtitle = `All ${unit} over last ${range}`;

  const filter = (
    <TextField select size="small" value={sel} onChange={(e) => setSel(e.target.value)} inputProps={{ 'aria-label': 'Integration type' }} sx={{ minWidth: 190 }}>
      <MenuItem value={ALL}>All types</MenuItem>
      {chart.series.map((s) => (
        <MenuItem key={s.key} value={s.key}>
          {s.label}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <InsightsCard title="Activity over time" subtitle={subtitle} action={filter}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <TrendBarChart data={chart.points} areas={areas} height={300} loading={loading} />
      </Box>
    </InsightsCard>
  );
}
