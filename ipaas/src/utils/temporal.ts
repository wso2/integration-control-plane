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

import { httpStatusOf } from './apiErrors';
import { cpuLabel, memoryLabel } from './databases';
import type { TemporalPlan } from '../types/temporal';

/**
 * The provider's name rule for a Temporal server: a lowercase DNS label that
 * starts with a letter. Every server's namespace is "default", so the name is
 * not held to Temporal's namespace rules.
 */
export const TEMPORAL_NAME_REGEX = /^[a-z]([a-z0-9-]*[a-z0-9])?$/;

/** The validation message for a Temporal server name, or '' when it is acceptable. */
export function temporalNameError(name: string, takenNames: readonly string[], maxLength?: number): string {
  if (name === '') return '';
  if (!TEMPORAL_NAME_REGEX.test(name)) return 'Use lowercase letters, digits and hyphens, starting with a letter and ending with a letter or digit.';
  if (maxLength !== undefined && name.length > maxLength) return `Use at most ${maxLength} characters.`;
  if (takenNames.includes(name)) return 'A service with this name already exists.';
  return '';
}

/** One line summing up a Temporal plan's size, e.g. "2 replicas · 2.2 vCPU · 4.5 GB RAM · 16 history shards". */
export function temporalPlanSpecLine(plan: Pick<TemporalPlan, 'replicas' | 'cpu' | 'memory' | 'historyShards'>): string {
  return [
    `${plan.replicas} ${plan.replicas === 1 ? 'replica' : 'replicas'}`,
    plan.cpu && cpuLabel(plan.cpu),
    plan.memory && `${memoryLabel(plan.memory)} RAM`,
    plan.historyShards !== undefined && `${plan.historyShards} history ${plan.historyShards === 1 ? 'shard' : 'shards'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Turns a failed create into an alert. The BFF passes the provider's refusals
 * through with their own wording, so those are shown as written.
 */
export function toCreateTemporalError(error: unknown): { title: string; message: string } {
  const message = error instanceof Error ? error.message : '';
  switch (httpStatusOf(error)) {
    case 400:
    case 409:
    case 422:
      return { title: 'The Temporal server could not be created', message };
    case 403:
      return { title: 'Your subscription is suspended', message: 'Renew your subscription to create Temporal servers.' };
    case 503:
      return { title: 'Temporal is unavailable right now', message: message || 'Try again shortly.' };
    default:
      return { title: 'Failed to create the Temporal server', message: message || 'Try again.' };
  }
}
