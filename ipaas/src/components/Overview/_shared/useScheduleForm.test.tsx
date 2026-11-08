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

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ScheduleFields from './ScheduleFields';
import { useScheduleForm, type ScheduleFormApi } from './useScheduleForm';
import type { ExecutionConfigs } from '../../../types/executions';
import type { PlanAccess } from '../../../utils/billing';

let container: HTMLDivElement;
let root: Root;
let form: ScheduleFormApi;

function Probe({ saved, plan, executionSettings }: { saved: ExecutionConfigs | null; plan: PlanAccess | null; executionSettings?: boolean }) {
  form = useScheduleForm(saved, plan);
  return <ScheduleFields form={form} executionSettings={executionSettings} />;
}

const render = (saved: ExecutionConfigs | null, plan: PlanAccess | null, executionSettings?: boolean) => act(() => root.render(<Probe saved={saved} plan={plan} executionSettings={executionSettings} />));
const saved = (cron: string, timeoutSeconds?: number): ExecutionConfigs => ({ cronjobFrequency: cron, cronjobTimezone: 'UTC', timeoutSeconds }) as ExecutionConfigs;
const free: PlanAccess = { state: 'free' };
const paid: PlanAccess = { state: 'paid' };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe('useScheduleForm plan limits', () => {
  it('starts a new schedule at every 5 minutes, which a free plan can save', async () => {
    await render(null, free);
    expect(form.cron).toBe('*/5 * * * *');
    expect(form.isValid).toBe(true);
    expect(container.textContent).toContain('Schedules that run more often than every 5 minutes, and job timeouts over 300 seconds, can only be configured on a paid plan.');
  });

  it('starts a new schedule at every minute on a paid plan', async () => {
    await render(null, paid);
    expect(form.cron).toBe('*/1 * * * *');
    expect(form.isValid).toBe(true);
  });

  it('moves an untouched new schedule to the paid default once the plan loads, but keeps an edited one', async () => {
    await render(null, null);
    expect(form.cron).toBe('*/5 * * * *');
    await render(null, paid);
    expect(form.cron).toBe('*/1 * * * *');

    await act(() => root.unmount());
    root = createRoot(container);
    await render(null, null);
    await act(() => form.setIntervalCount(10));
    await render(null, paid);
    expect(form.cron).toBe('*/10 * * * *');
  });

  it('keeps a saved schedule whatever the plan', async () => {
    await render(saved('*/2 * * * *'), null);
    await render(saved('*/2 * * * *'), paid);
    expect(form.cron).toBe('*/2 * * * *');
  });

  it('blocks a free plan from running more often, and says why', async () => {
    await render(null, free);
    await act(() => form.setIntervalCount(1));
    expect(form.cron).toBe('*/1 * * * *');
    expect(form.errors.frequency).toMatch(/needs a paid plan/);
    expect(form.isValid).toBe(false);
    expect(container.textContent).toContain('Running more often than every 5 minutes needs a paid plan');
  });

  it('lets a paid plan save any schedule, with no plan notice', async () => {
    await render(null, paid);
    await act(() => form.setTimeoutSeconds('3600'));
    expect(form.errors).toEqual({ timeout: undefined, intervalCount: undefined, cron: {}, frequency: undefined });
    expect(form.isValid).toBe(true);
    expect(container.textContent).not.toContain('paid plan');
  });

  it('applies the free limits while the plan loads', async () => {
    await render(null, null);
    await act(() => form.setIntervalCount(1));
    expect(form.isValid).toBe(false);
  });

  it('lets a free plan save the schedule it already runs, but not raise it', async () => {
    await render(saved('*/2 * * * *', 3600), free);
    expect(form.isValid).toBe(true);

    await act(() => form.setTimeoutSeconds('900'));
    expect(form.errors.timeout).toMatch(/over 300 seconds needs a paid plan/);
    expect(form.isValid).toBe(false);

    await act(() => form.setTimeoutSeconds('3600'));
    await act(() => form.setIntervalCount(1));
    expect(form.errors.frequency).toBeDefined();
  });

  it('starts an environment with no schedule at every 5 minutes', async () => {
    await render(saved(''), free);
    expect(form.cron).toBe('*/5 * * * *');
    expect(form.isValid).toBe(true);
  });

  it('names only the schedule when the timeout is not shown', async () => {
    await render(saved('0 0 * * *'), free, false);
    expect(container.textContent).toContain('Schedules that run more often than every 5 minutes can only be configured on a paid plan.');
    expect(container.textContent).not.toContain('job timeouts');
  });

  it('offers a retry when the plan could not be read', async () => {
    let retried = false;
    await render(null, { state: 'unavailable', retry: () => (retried = true) });
    expect(container.textContent).toContain("Couldn't check your plan.");
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    await act(() => retry?.click());
    expect(retried).toBe(true);
  });
});
