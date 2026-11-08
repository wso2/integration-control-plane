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
import type { ScheduleKind } from '../../../utils/scheduleValidation';

let container: HTMLDivElement;
let root: Root;
let form: ScheduleFormApi;

function Probe({ saved, plan, kind, executionSettings }: { saved: ExecutionConfigs | null; plan: PlanAccess | null; kind: ScheduleKind; executionSettings?: boolean }) {
  form = useScheduleForm(saved, plan, kind);
  return <ScheduleFields form={form} executionSettings={executionSettings} />;
}

const render = (saved: ExecutionConfigs | null, plan: PlanAccess | null, kind: ScheduleKind = 'automation', executionSettings?: boolean) => act(() => root.render(<Probe saved={saved} plan={plan} kind={kind} executionSettings={executionSettings} />));
const saved = (cron: string, timeoutSeconds?: number): ExecutionConfigs => ({ cronjobFrequency: cron, cronjobTimezone: 'UTC', timeoutSeconds }) as ExecutionConfigs;
const free: PlanAccess = { state: 'free' };
const paid: PlanAccess = { state: 'paid' };
const timeoutField = () => container.querySelector<HTMLInputElement>('input[type="number"]');

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe('useScheduleForm defaults', () => {
  it.each([
    ['free', free],
    ['paid', paid],
  ])('starts a new schedule at every 5 minutes on a %s plan', async (_name, plan) => {
    await render(null, plan);
    expect(form.cron).toBe('*/5 * * * *');
    expect(form.isValid).toBe(true);
  });

  it('starts an environment with no schedule at every 5 minutes', async () => {
    await render(saved(''), free);
    expect(form.cron).toBe('*/5 * * * *');
  });

  it('shows the default timeout of each kind in the empty field', async () => {
    await render(null, paid);
    expect(timeoutField()?.placeholder).toBe('Default: 300');
    await render(null, paid, 'ingestion');
    expect(timeoutField()?.placeholder).toBe('Default: 3600');
  });

  it('keeps a saved schedule', async () => {
    await render(saved('*/2 * * * *'), paid);
    expect(form.cron).toBe('*/2 * * * *');
  });
});

describe('useScheduleForm plan limits', () => {
  it('tells a free plan the automation limits, and blocks running more often', async () => {
    await render(null, free);
    expect(container.textContent).toContain('Schedules that run more often than every 5 minutes, and job timeouts over 300 seconds (5 minutes), can only be configured on a paid plan.');
    await act(() => form.setIntervalCount(1));
    expect(form.errors.frequency).toBe('Running more often than every 5 minutes needs a paid plan');
    expect(form.isValid).toBe(false);
  });

  it('holds an automation on a free plan to 300 seconds', async () => {
    await render(null, free);
    await act(() => form.setTimeoutSeconds('301'));
    expect(form.errors.timeout).toBe('A timeout over 300 seconds (5 minutes) needs a paid plan');
  });

  it('holds an ingestion on a free plan to 2 hours, and says so', async () => {
    await render(saved('0 2 * * *', 3600), free, 'ingestion');
    expect(container.textContent).toContain('job timeouts over 7200 seconds (2 hours), can only be configured on a paid plan.');
    await act(() => form.setTimeoutSeconds('7200'));
    expect(form.isValid).toBe(true);
    await act(() => form.setTimeoutSeconds('7201'));
    expect(form.errors.timeout).toBe('A timeout over 7200 seconds (2 hours) needs a paid plan');
  });

  it('lets a paid plan run every minute with any timeout, with no plan notice', async () => {
    await render(null, paid);
    await act(() => form.setIntervalCount(1));
    await act(() => form.setTimeoutSeconds('86400'));
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
    expect(form.errors.timeout).toBeDefined();
  });

  it('names only the schedule when the timeout is not shown', async () => {
    await render(null, free, 'ingestion', false);
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
