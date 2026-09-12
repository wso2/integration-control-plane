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

import { Card, CardContent, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { PlugZap } from '@wso2/oxygen-ui-icons-react';
import type { Component } from '../types/component';
import type { JSX } from 'react';
import { getDisplayLabel, isSupportedIntegration } from '../constants/integrations';

export default function IntegrationTypesCard({ components }: { components: Component[] }): JSX.Element {
  const hasNonIntegrations = components.some((c) => !isSupportedIntegration(c.displayType ?? '', c.componentSubType ?? null, c.buildpackType));

  let rows: { label: string; count: number }[];
  if (hasNonIntegrations) {
    const integrationCounts: Record<string, number> = {};
    let nonIntegrationCount = 0;
    for (const c of components) {
      if (isSupportedIntegration(c.displayType ?? '', c.componentSubType ?? null, c.buildpackType)) {
        const label = getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null);
        integrationCounts[label] = (integrationCounts[label] || 0) + 1;
      } else {
        nonIntegrationCount++;
      }
    }
    rows = [...Object.entries(integrationCounts).map(([label, count]) => ({ label, count })), { label: 'Non Integrations', count: nonIntegrationCount }];
  } else {
    const counts = components.reduce<Record<string, number>>((acc, c) => {
      const label = getDisplayLabel(c.displayType ?? '', c.componentSubType ?? null);
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    rows = Object.entries(counts).map(([label, count]) => ({ label, count }));
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <PlugZap size={20} aria-hidden="true" />
          Integration Count by Type
        </Typography>
        <Stack>
          {rows.map(({ label, count }, i) => (
            <Stack key={label}>
              {i > 0 && <Divider />}
              <Stack direction="row" justifyContent="space-between" sx={{ py: 1 }}>
                <Typography variant="body2">{label}</Typography>
                <Typography variant="body2">{count}</Typography>
              </Stack>
            </Stack>
          ))}
          <Divider />
          <Stack direction="row" justifyContent="space-between" sx={{ py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Total
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {components.length}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
