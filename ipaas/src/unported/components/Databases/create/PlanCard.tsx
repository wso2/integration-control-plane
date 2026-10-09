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

import { Card, CardActionArea, Divider, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { planRegionSpec } from '../../../utils/platformServices';
import type { CloudProvider, CloudRegion, ServicePlan } from '../../../../types/platformServices';

interface PlanCardProps {
  plan: ServicePlan;
  provider: CloudProvider;
  region: CloudRegion;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

/** A selectable service-plan card showing the plan's specs and per-region price. */
export default function PlanCard({ plan, provider, region, selected, disabled, onSelect }: PlanCardProps): JSX.Element | null {
  const spec = planRegionSpec(plan, provider, region);
  if (!spec) return null;
  return (
    <Card variant="outlined" sx={{ width: 240, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1, opacity: disabled ? 0.5 : 1 }}>
      <CardActionArea disabled={disabled} onClick={onSelect} sx={{ p: 2, alignItems: 'flex-start' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {plan.name}
        </Typography>
        <Typography variant="body2">Nodes: {plan.node_count}</Typography>
        <Typography variant="body2">RAM: {spec.node_ram_gb} GB</Typography>
        <Typography variant="body2">CPU: {spec.node_cpu_count} vCPU</Typography>
        {plan.type !== 'redis' && <Typography variant="body2">Storage: {spec.storage_gb} GB</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {plan.backup_retention_days > 0 ? `Backups every ${plan.backup_interval_hours} hours. Retained for ${plan.backup_retention_days} days.` : 'No automated backups. For development use only.'}
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle1" sx={{ color: 'primary.main', fontWeight: 600 }}>
          ${spec.hourly_price_usd}
          <Typography component="span" variant="caption" color="text.secondary">
            {' '}
            / hour
          </Typography>
        </Typography>
      </CardActionArea>
    </Card>
  );
}
