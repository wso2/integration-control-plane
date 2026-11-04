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
import { cpuLabel, memoryLabel, planLabel, planPrice } from '../../utils/databases';
import type { TemporalPlan } from '../../types/temporal';

interface TemporalPlanCardProps {
  plan: TemporalPlan;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A selectable Temporal plan card showing the plan's size, throughput and list price. */
export default function TemporalPlanCard({ plan, selected, disabled, onSelect }: TemporalPlanCardProps): JSX.Element {
  const price = planPrice(plan);
  return (
    <Card variant="outlined" sx={{ width: 240, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1, opacity: disabled ? 0.5 : 1 }}>
      <CardActionArea disabled={disabled} onClick={onSelect} aria-pressed={selected} sx={{ p: 2, alignItems: 'flex-start' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {planLabel(plan.id)}
        </Typography>
        <Typography variant="body2">Replicas: {plan.replicas}</Typography>
        {plan.cpu && <Typography variant="body2">CPU: {cpuLabel(plan.cpu)}</Typography>}
        {plan.memory && <Typography variant="body2">Memory: {memoryLabel(plan.memory)}</Typography>}
        {plan.historyShards !== undefined && <Typography variant="body2">History shards: {plan.historyShards}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {plan.replicas > 1 ? 'Highly available: every Temporal service runs on separate nodes.' : 'Single replica. For development use.'}
        </Typography>
        {price && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle1" sx={{ color: 'primary.main', fontWeight: 600 }}>
              {price.monthly}
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}
                / month
              </Typography>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {price.hourly} / hour
            </Typography>
          </>
        )}
      </CardActionArea>
    </Card>
  );
}
