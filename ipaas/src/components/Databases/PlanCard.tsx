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
import { planLabel, planPrice } from '../../utils/databases';
import type { DatabasePlan } from '../../types/databases';

interface PlanCardProps {
  plan: DatabasePlan;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A selectable service-plan card showing the plan's per-node size and list price. */
export default function PlanCard({ plan, selected, disabled, onSelect }: PlanCardProps): JSX.Element {
  const price = planPrice(plan);
  return (
    <Card variant="outlined" sx={{ width: 240, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1, opacity: disabled ? 0.5 : 1 }}>
      <CardActionArea disabled={disabled} onClick={onSelect} aria-pressed={selected} sx={{ p: 2, alignItems: 'flex-start' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {planLabel(plan.id)}
        </Typography>
        <Typography variant="body2">Nodes: {plan.nodeCount}</Typography>
        {plan.memory && <Typography variant="body2">Memory: {plan.memory} per node</Typography>}
        {plan.cpu && <Typography variant="body2">CPU: {plan.cpu} per node</Typography>}
        {plan.defaultStorageGi !== undefined && <Typography variant="body2">Storage: {plan.defaultStorageGi} GB</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {plan.backups ? 'Daily backups included, kept for 7 days.' : 'No backups. For development use only.'}
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
