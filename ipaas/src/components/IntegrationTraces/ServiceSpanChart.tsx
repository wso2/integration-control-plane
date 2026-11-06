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

import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@wso2/oxygen-ui';
import { LineChart } from '@wso2/oxygen-ui-charts-react';
import { useState, type JSX } from 'react';
import { INSIGHTS_CHART_COLORS } from '../../constants/insights';
import type { ServiceSpanSeries } from '../../types/integrationTraces';
import * as styles from './IntegrationTraces.styles';

const PALETTE = Object.values(INSIGHTS_CHART_COLORS);

/** Span counts per Ballerina service over the selected window, with a checklist of the services to plot. */
export default function ServiceSpanChart({ data }: { data: ServiceSpanSeries }): JSX.Element {
  // Services the user unticked. Tracking the hidden ones keeps a service that appears on refresh plotted.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Colours follow a service's place in the full list, so ticking another never recolours it.
  const series = data.series.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] as string, total: data.points.reduce((sum, p) => sum + (p[s.key] as number), 0) }));
  const shown = series.filter((s) => !hidden.has(s.service));

  const toggle = (service: string): void =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(service)) next.add(service);
      return next;
    });

  return (
    <Box sx={styles.chartLayout}>
      <Box sx={styles.chartBox}>
        {shown.length > 0 ? (
          <LineChart
            data={data.points}
            xAxisDataKey="label"
            height={280}
            colors={shown.map((s) => s.color)}
            lines={shown.map((s) => ({ dataKey: s.key, name: s.service, stroke: s.color, type: 'monotone' as const, dot: false }))}
            legend={{ show: false }}
            margin={{ top: 16 }}
            tooltip={{ show: true }}
            grid={{ show: true }}
          />
        ) : (
          <Typography color="text.secondary" sx={styles.chartEmpty}>
            Select a service to plot its spans.
          </Typography>
        )}
      </Box>
      <Box role="group" aria-label="Services" sx={styles.serviceList}>
        <Stack direction="row" sx={styles.serviceListHeader}>
          <Typography variant="caption" color="text.secondary">
            Services
          </Typography>
          <Button size="small" onClick={() => setHidden(shown.length > 0 ? new Set(series.map((s) => s.service)) : new Set())}>
            {shown.length > 0 ? 'Clear' : 'Select all'}
          </Button>
        </Stack>
        {series.map((s) => (
          <FormControlLabel
            key={s.key}
            sx={styles.serviceOption}
            control={<Checkbox size="small" checked={!hidden.has(s.service)} onChange={() => toggle(s.service)} sx={{ color: s.color, '&.Mui-checked': { color: s.color } }} />}
            label={
              <Stack direction="row" sx={styles.serviceLabel}>
                <Typography sx={styles.serviceName} title={s.service}>
                  {s.service}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.total.toLocaleString()}
                </Typography>
              </Stack>
            }
          />
        ))}
      </Box>
    </Box>
  );
}
