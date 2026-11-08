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
import type { SchedulePolicyRead } from '../../../hooks/useScheduleLimits';
import type { ExecutionConfigs } from '../../../types/executions';
import type { SchedulePolicy } from '../../../types/schedule';
import type { PlanAccess } from '../../../utils/billing';

// The service's default policies (GET /schedule-limits).
const automation: SchedulePolicy = {
  free: { minRunIntervalMinutes: 5, maxTimeoutSeconds: 300, allowOverlap: true },
  paid: { minRunIntervalMinutes: 1, maxTimeoutSeconds: 0, allowOverlap: true },
  defaultCron: '*/5 * * * *',
  defaultTimeoutSeconds: 300,
  defaultConcurrencyPolicy: 'Forbid',
};
const ingestion: SchedulePolicy = {
  free: { minRunIntervalMinutes: 1440, maxTimeoutSeconds: 3600, allowOverlap: false },
  paid: { minRunIntervalMinutes: 0, maxTimeoutSeconds: 0, allowOverlap: true },
  defaultCron: '0 0 */1 * *',
  defaultTimeoutSeconds: 3600,
  defaultConcurrencyPolicy: 'Forbid',
};
const read = (policy: SchedulePolicy | null, isError = false, retry = () => {}): SchedulePolicyRead => ({ policy, isError, retry });

let container: HTMLDivElement;
let root: Root;
let form: ScheduleFormApi;

function Probe({ saved, plan, policy, executionSettings }: { saved: ExecutionConfigs | null; plan: PlanAccess | null; policy: SchedulePolicyRead; executionSettings?: boolean }) {
  form = useScheduleForm(saved, plan, policy);
  return <ScheduleFields form={form} executionSettings={executionSettings} />;
}

const render = (saved: ExecutionConfigs | null, plan: PlanAccess | null, policy: SchedulePolicyRead = read(automation), executionSettings?: boolean) =>
  act(() => root.render(<Probe saved={saved} plan={plan} policy={policy} executionSettings={executionSettings} />));
const saved = (cron: string, timeoutSeconds?: number, cronjobAllowConcurrency?: boolean): ExecutionConfigs => ({ cronjobFrequency: cron, cronjobTimezone: 'UTC', timeoutSeconds, cronjobAllowConcurrency }) as ExecutionConfigs;
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
  ])('starts a new automation at every 5 minutes on a %s plan', async (_name, plan) => {
    await render(null, plan);
    expect(form.cron).toBe('*/5 * * * *');
    expect(form.isValid).toBe(true);
  });

  it.each([
    ['free', free],
    ['paid', paid],
  ])('starts a new ingestion daily at 00:00 on a %s plan', async (_name, plan) => {
    await render(null, plan, read(ingestion));
    expect(form.cron).toBe('0 0 */1 * *');
    expect([form.tab, form.intervalCount, form.intervalUnit]).toEqual([0, 1, 'Day']);
    expect(form.isValid).toBe(true);
  });

  it('takes the default once the limits load, unless the schedule was edited', async () => {
    await render(null, paid, read(null));
    expect(form.isValid).toBe(false);
    await render(null, paid, read(automation));
    expect(form.cron).toBe('*/5 * * * *');

    await act(() => root.unmount());
    root = createRoot(container);
    await render(null, paid, read(null));
    await act(() => form.setIntervalCount(3));
    await act(() => form.setIntervalUnit('Hour'));
    await render(null, paid, read(automation));
    expect(form.cron).toBe('0 */3 * * *');
  });

  it('keeps a saved schedule', async () => {
    await render(saved('*/2 * * * *'), paid);
    expect(form.cron).toBe('*/2 * * * *');
  });

  it('shows the default timeout of each kind in the empty field', async () => {
    await render(null, paid);
    expect(timeoutField()?.placeholder).toBe('Default: 300');
    await render(null, paid, read(ingestion));
    expect(timeoutField()?.placeholder).toBe('Default: 3600');
  });
});

describe('useScheduleForm plan limits', () => {
  it('tells a free plan the automation limits, and blocks running more often', async () => {
    await render(null, free);
    expect(container.textContent).toContain('Schedules that run more often than every 5 minutes, and job timeouts over 300 seconds (5 minutes) can only be configured on a paid plan.');
    await act(() => form.setIntervalCount(1));
    expect(form.errors.frequency).toBe('Running more often than every 5 minutes needs a paid plan');
    expect(form.isValid).toBe(false);
  });

  it('lets a free plan overlap an automation', async () => {
    await render(null, free);
    await act(() => form.setAllowConcurrency(true));
    expect(form.errors.overlap).toBeUndefined();
    expect(form.isValid).toBe(true);
  });

  it('holds an ingestion on a free plan to one run a day, 1 hour and no overlap, and says so', async () => {
    await render(saved('0 2 * * *', 3600, false), free, read(ingestion));
    expect(container.textContent).toContain('Schedules that run more often than every 1 day, job timeouts over 3600 seconds (1 hour), and overlapping executions can only be configured on a paid plan.');
    expect(form.isValid).toBe(true);
    await act(() => form.setTimeoutSeconds('3601'));
    expect(form.errors.timeout).toBe('A timeout over 3600 seconds (1 hour) needs a paid plan');
    await act(() => form.setTimeoutSeconds('1800'));
    await act(() => form.setAllowConcurrency(true));
    expect(form.errors.overlap).toBe('Overlapping executions need a paid plan');
    await act(() => form.setAllowConcurrency(false));
    await act(() => form.setTab(0));
    await act(() => form.setIntervalCount(12));
    await act(() => form.setIntervalUnit('Hour'));
    expect(form.errors.frequency).toBe('Running more often than every 1 day needs a paid plan');
  });

  it('lets a paid plan run an ingestion every minute, for any time, overlapping, with no notice', async () => {
    await render(null, paid, read(ingestion));
    await act(() => form.setIntervalCount(1));
    await act(() => form.setIntervalUnit('Minute'));
    await act(() => form.setTimeoutSeconds('86400'));
    await act(() => form.setAllowConcurrency(true));
    expect(form.isValid).toBe(true);
    expect(container.textContent).not.toContain('paid plan');
  });

  it('applies the free limits while the plan loads', async () => {
    await render(null, null);
    await act(() => form.setIntervalCount(1));
    expect(form.isValid).toBe(false);
  });

  it('lets a free plan save values it already runs, but not raise them', async () => {
    await render(saved('*/2 * * * *', 3600, true), free, read(ingestion));
    expect(form.isValid).toBe(true);
    await act(() => form.setTimeoutSeconds('7200'));
    expect(form.errors.timeout).toBeDefined();
  });

  it('names only the schedule when the timeout is not shown', async () => {
    await render(null, free, read(ingestion), false);
    expect(container.textContent).toContain('Schedules that run more often than every 1 day can only be configured on a paid plan.');
    expect(container.textContent).not.toContain('job timeouts');
  });

  it('blocks saving, and offers a retry, when the limits could not be read', async () => {
    let retried = false;
    await render(
      null,
      paid,
      read(null, true, () => (retried = true)),
    );
    expect(form.isValid).toBe(false);
    expect(container.textContent).toContain("Couldn't load the schedule limits.");
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    await act(() => retry?.click());
    expect(retried).toBe(true);
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
