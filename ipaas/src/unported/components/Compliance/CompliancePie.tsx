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

import { Box, Card, CardContent, Skeleton, Stack, Typography, useTheme } from '@wso2/oxygen-ui';
import { PieChart } from '@wso2/oxygen-ui-charts-react';
import { useMemo, type JSX } from 'react';
import type { CompliancePieSlice } from '../../../types/compliance';
import ComplianceEmptyState from './ComplianceEmptyState';

interface CompliancePieProps {
  title: string;
  /** Total entity count shown next to the title, e.g. Project Compliance (8). */
  count: number;
  slices: CompliancePieSlice[];
  isLoading?: boolean;
}

/** Donut summary card matching Devant's compliance pie charts. */
export default function CompliancePie({ title, count, slices, isLoading }: CompliancePieProps): JSX.Element {
  const theme = useTheme();
  const toneColor = useMemo(
    () => ({
      success: theme.palette.primary.main,
      error: theme.palette.error.light,
      neutral: theme.palette.grey[400],
    }),
    [theme],
  );

  const data = slices.map((s) => ({ name: `${s.name} (${s.value})`, value: s.value }));
  const colors = slices.map((s) => toneColor[s.tone]);

  if (isLoading) {
    return <Skeleton variant="rounded" height={280} sx={{ flexGrow: 1 }} />;
  }

  return (
    <Card variant="outlined" sx={{ flexGrow: 1, height: '100%' }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6">
            {title}{' '}
            <Typography component="span" variant="h6" color="primary">
              ({count})
            </Typography>
          </Typography>
          {count === 0 ? (
            <ComplianceEmptyState message="No data available" height={240} />
          ) : (
            <Box sx={{ height: 240 }}>
              {/* paddingAngle must stay 0 — recharts drops a full-circle sector
                  (single nonzero slice) when a padding gap is applied. A side
                  legend shifts the pie off-canvas, so keep it bottom-centered.
                  Fixed cy pins every donut to the same top offset regardless of
                  how many legend rows a card ends up with. */}
              <PieChart
                data={data}
                nameKey="name"
                colors={colors}
                height={230}
                cy={88}
                innerRadius={48}
                outerRadius={72}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                pies={[{ dataKey: 'value', nameKey: 'name' }]}
                legend={{ show: true, align: 'center', verticalAlign: 'bottom' }}
              />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
