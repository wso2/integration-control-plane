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
import type { GqlComponent } from '../api/queries';
import type { JSX } from 'react';
import { integrationTypeLabel } from '../constants/integrationTypes';

export default function IntegrationTypesCard({ components }: { components: GqlComponent[] }): JSX.Element {
  const counts = components.reduce<Record<string, number>>((acc, c) => {
    const label = integrationTypeLabel(c.displayType, c.componentSubType);
    if (!label) return acc;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <PlugZap size={20} aria-hidden="true" />
          Integration Types
        </Typography>
        <Stack>
          {Object.entries(counts).map(([label, count]) => (
            <Stack key={label} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
              <Typography variant="body2">{label}</Typography>
              <Typography variant="body2">{count}</Typography>
            </Stack>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
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
