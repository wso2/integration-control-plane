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

import type { JSX } from 'react';
import ServicePlanCard, { type PlanSpec } from './ServicePlanCard';
import { cpuLabel, memoryLabel, planLabel, planPrice } from '../../utils/databases';
import type { DatabasePlan } from '../../types/databases';

interface PlanCardProps {
  plan: DatabasePlan;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A PostgreSQL plan option showing the plan's per-node size and list price. */
export default function PlanCard({ plan, selected, disabled, onSelect }: PlanCardProps): JSX.Element {
  const specs: PlanSpec[] = [{ label: 'Nodes', value: String(plan.nodeCount) }];
  if (plan.defaultStorageGi !== undefined) specs.push({ label: 'Storage', value: `${plan.defaultStorageGi} GB` });
  if (plan.memory) specs.push({ label: 'Memory', value: `${memoryLabel(plan.memory)} / node` });
  if (plan.cpu) specs.push({ label: 'CPU', value: `${cpuLabel(plan.cpu)} / node` });
  return (
    <ServicePlanCard
      name={planLabel(plan.id)}
      tagline={plan.nodeCount > 1 ? `${plan.nodeCount}-node cluster` : 'Single node'}
      price={planPrice(plan)}
      specs={specs}
      note={plan.backups ? 'Daily backups, kept 7 days' : 'No backups · development only'}
      noteTone={plan.backups ? 'success' : 'warning'}
      selected={selected}
      disabled={disabled}
      onSelect={onSelect}
    />
  );
}
