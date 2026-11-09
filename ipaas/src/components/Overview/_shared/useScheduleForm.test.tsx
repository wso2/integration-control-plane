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
import { cloudConsoleSubscriptionsUrl } from '../../../paths';
import { useScheduleForm, type ScheduleFormApi } from './useScheduleForm';
import { SCHEDULE_POLICIES } from '../../../constants/scheduleLimits';
import type { ExecutionConfigs } from '../../../types/executions';
import type { SchedulePolicy } from '../../../types/schedule';

const { automation, ingestion } = SCHEDULE_POLICIES;
import type { PlanAccess } from '../../../utils/billing';

let container: HTMLDivElement;
let root: Root;
let form: ScheduleFormApi;

function Probe({ saved, plan, policy, executionSettings }: { saved: ExecutionConfigs | null; plan: PlanAccess | null; policy: SchedulePolicy; executionSettings?: boolean }) {
  form = useScheduleForm(saved, plan, policy);
  return <ScheduleFields form={form} executionSettings={executionSettings} />;
}

const render = (saved: ExecutionConfigs | null, plan: PlanAccess | null, policy: SchedulePolicy = automation, executionSettings?: boolean) => act(() => root.render(<Probe saved={saved} plan={plan} policy={policy} executionSettings={executionSettings} />));
const saved = (cron: string, timeoutSeconds?: number, cronjobAllowConcurrency?: boolean): ExecutionConfigs => ({ cronjobFrequency: cron, cronjobTimezone: 'UTC', timeoutSeconds, cronjobAllowConcurrency }) as ExecutionConfigs;
const free: PlanAccess = { state: 'free' };
const paid: PlanAccess = { state: 'paid' };
const timeoutField = () => container.querySelector<HTMLInputElement>('input[type="number"]');
const warnings = () => [...container.querySelectorAll('.MuiAlert-colorWarning')].map((a) => a.textContent);

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
    await render(null, plan, ingestion);
    expect(form.cron).toBe('0 0 */1 * *');
    expect([form.tab, form.intervalCount, form.intervalUnit]).toEqual([0, 1, 'Day']);
    expect(form.isValid).toBe(true);
  });

  it('keeps a saved schedule', async () => {
    await render(saved('*/2 * * * *'), paid);
    expect(form.cron).toBe('*/2 * * * *');
  });

  it('shows the default timeout of each kind in the empty field', async () => {
    await render(null, paid);
    expect(timeoutField()?.placeholder).toBe('Default: 300');
    await render(null, paid, ingestion);
    expect(timeoutField()?.placeholder).toBe('Default: 3600');
  });
});

describe('useScheduleForm plan limits', () => {
  it('warns a free plan only once an automation runs more often than it allows, and blocks it', async () => {
    await render(null, free);
    expect(warnings()).toEqual([]);
    await act(() => form.setIntervalCount(1));
    expect(form.errors.frequency).toBe('The free plan supports intervals of 5 minutes or longer. Upgrade to save this schedule.');
    expect(warnings()).toEqual(['The free plan supports intervals of 5 minutes or longer. Upgrade to save this schedule.']);
    const upgrade = container.querySelector<HTMLAnchorElement>('.MuiAlert-colorWarning a');
    expect(upgrade?.textContent).toBe('Upgrade');
    expect(upgrade?.href).toBe(cloudConsoleSubscriptionsUrl());
    expect(upgrade?.target).toBe('_blank');
    expect(form.isValid).toBe(false);
  });

  it('hides when it runs while the frequency warning shows', async () => {
    await render(null, free);
    const allowed = form.description;
    expect(allowed).toBeTruthy();
    expect(container.textContent).toContain(allowed);
    await act(() => form.setIntervalCount(1));
    expect(form.description).toBeTruthy();
    expect(container.textContent).not.toContain(form.description);
    await act(() => form.setIntervalCount(10));
    expect(container.textContent).toContain(form.description);
    await act(() => form.setTab(1));
    await act(() => form.setCronFields((prev) => ({ ...prev, minute: '*' })));
    expect(form.errors.frequency).toBeDefined();
    expect(container.textContent).not.toContain(form.description);
  });

  it('lets a free plan overlap an automation', async () => {
    await render(null, free);
    await act(() => form.setAllowConcurrency(true));
    expect(form.errors.overlap).toBeUndefined();
    expect(form.isValid).toBe(true);
  });

  it('holds an ingestion on a free plan to one run a day, 1 hour and no overlap, with a warning for each', async () => {
    await render(saved('0 2 * * *', 3600, false), free, ingestion);
    expect(form.isValid).toBe(true);
    expect(warnings()).toEqual([]);
    await act(() => form.setTimeoutSeconds('3601'));
    expect(form.errors.timeoutLimit).toBe('The free plan allows a timeout of up to 3600 seconds (1 hour). Upgrade to save this schedule.');
    expect(form.errors.timeout).toBeUndefined();
    expect(warnings()).toEqual(['The free plan allows a timeout of up to 3600 seconds (1 hour). Upgrade to save this schedule.']);
    expect(timeoutField()?.getAttribute('aria-invalid')).toBe('false');
    await act(() => form.setTimeoutSeconds('1800'));
    await act(() => form.setAllowConcurrency(true));
    expect(form.errors.overlap).toBe('Overlapping executions are available on paid plans. Upgrade to save this schedule.');
    expect(warnings()).toEqual(['Overlapping executions are available on paid plans. Upgrade to save this schedule.']);
    await act(() => form.setAllowConcurrency(false));
    await act(() => form.setTab(0));
    await act(() => form.setIntervalCount(12));
    await act(() => form.setIntervalUnit('Hour'));
    expect(form.errors.frequency).toBe('The free plan supports intervals of 1 day or longer. Upgrade to save this schedule.');
  });

  it('lets a paid plan run an ingestion every minute, for any time, overlapping, with no notice', async () => {
    await render(null, paid, ingestion);
    await act(() => form.setIntervalCount(1));
    await act(() => form.setIntervalUnit('Minute'));
    await act(() => form.setTimeoutSeconds('86400'));
    await act(() => form.setAllowConcurrency(true));
    expect(form.isValid).toBe(true);
    expect(warnings()).toEqual([]);
  });

  it('shows no plan errors while the plan loads, but holds back a schedule beyond the free limits', async () => {
    await render(null, null);
    expect(form.isValid).toBe(true);
    await act(() => form.setIntervalCount(1));
    await act(() => form.setTimeoutSeconds('3600'));
    expect(form.errors.frequency).toBeUndefined();
    expect(form.errors.timeoutLimit).toBeUndefined();
    expect(warnings()).toEqual([]);
    expect(form.isValid).toBe(false);
  });

  it('settles once the plan loads: allowed on a paid plan, an error on a free one', async () => {
    await render(null, null);
    await act(() => form.setIntervalCount(1));
    await render(null, paid);
    expect(form.isValid).toBe(true);
    await render(null, free);
    expect(form.errors.frequency).toBe('The free plan supports intervals of 5 minutes or longer. Upgrade to save this schedule.');
    expect(form.isValid).toBe(false);
  });

  it('lets a free plan save values it already runs, but not raise them', async () => {
    await render(saved('*/2 * * * *', 3600, true), free, ingestion);
    expect(form.isValid).toBe(true);
    await act(() => form.setTimeoutSeconds('7200'));
    expect(form.errors.timeoutLimit).toBeDefined();
    expect(form.isValid).toBe(false);
  });

  it('warns about the schedule when the timeout is not shown', async () => {
    await render(null, free, ingestion, false);
    expect(warnings()).toEqual([]);
    await act(() => form.setIntervalCount(12));
    await act(() => form.setIntervalUnit('Hour'));
    expect(warnings()).toEqual(['The free plan supports intervals of 1 day or longer. Upgrade to save this schedule.']);
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
