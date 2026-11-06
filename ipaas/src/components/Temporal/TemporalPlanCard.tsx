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
import ServicePlanCard, { type PlanSpec } from '../Databases/ServicePlanCard';
import { cpuLabel, memoryLabel, planLabel, planPrice } from '../../utils/databases';
import type { TemporalPlan } from '../../types/temporal';

interface TemporalPlanCardProps {
  plan: TemporalPlan;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A Temporal plan option showing the plan's size, throughput and list price. */
export default function TemporalPlanCard({ plan, selected, disabled, onSelect }: TemporalPlanCardProps): JSX.Element {
  const highlyAvailable = plan.replicas > 1;
  const specs: PlanSpec[] = [{ label: 'Replicas', value: String(plan.replicas) }];
  if (plan.historyShards !== undefined) specs.push({ label: 'History shards', value: String(plan.historyShards) });
  if (plan.memory) specs.push({ label: 'Memory', value: memoryLabel(plan.memory) });
  if (plan.cpu) specs.push({ label: 'CPU', value: cpuLabel(plan.cpu) });
  return (
    <ServicePlanCard
      name={planLabel(plan.id)}
      tagline={highlyAvailable ? `${plan.replicas} replicas · highly available` : 'Single replica'}
      price={planPrice(plan)}
      specs={specs}
      note={highlyAvailable ? 'Every Temporal service runs on separate nodes' : 'No redundancy · development only'}
      noteTone={highlyAvailable ? 'success' : 'warning'}
      selected={selected}
      disabled={disabled}
      onSelect={onSelect}
    />
  );
}
