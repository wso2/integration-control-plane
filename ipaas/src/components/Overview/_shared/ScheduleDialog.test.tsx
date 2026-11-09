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
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScheduleDialog from './ScheduleDialog';
import { buildScheduleInput } from './useScheduleForm';
import { button, renderWithScopes } from '../../../test/renderWithScopes';
import { DEVELOPER } from '../../../test/roles';

const upsertSchedule = vi.fn().mockResolvedValue(undefined);
const deployDeploymentTrack = vi.fn().mockResolvedValue('');
vi.mock('../../../api/executions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  upsertSchedule: (input: unknown) => upsertSchedule(input),
  fetchExecutionConfigs: () => Promise.resolve({ cronjobFrequency: '0 9 * * *', cronjobTimezone: 'UTC', timeoutSeconds: 300, cronjobAllowConcurrency: false }),
}));
vi.mock('../../../api/deployments', async (importOriginal) => ({ ...(await importOriginal<object>()), deployDeploymentTrack: (input: unknown) => deployDeploymentTrack(input) }));
vi.mock('../../../hooks/useBillingOrg', async (importOriginal) => ({ ...(await importOriginal<object>()), usePlanAccess: () => ({ state: 'paid' }) }));

let unmount = () => {};
afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

describe('the Schedule drawer', () => {
  it("saves onto the environment's binding through the schedule route, not a deploy", async () => {
    const r = await renderWithScopes(<ScheduleDialog open onClose={() => {}} envId="production" envName="Production" componentId="nightly" releaseId="nightly-r4" />, DEVELOPER);
    unmount = r.unmount;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const update = button(document.body, 'Update');
    expect(update?.disabled).toBe(false);
    await act(async () => update?.click());

    expect(deployDeploymentTrack).not.toHaveBeenCalled();
    expect(upsertSchedule).toHaveBeenCalledWith({ componentId: 'nightly', envId: 'production', releaseId: 'nightly-r4', cron: '0 9 * * *', timezone: 'UTC', timeoutSeconds: 300, allowConcurrency: false });
  });
});

describe('buildScheduleInput', () => {
  it('leaves out a timeout the form does not set', () => {
    const input = buildScheduleInput({ cron: '*/5 * * * *', timezone: 'UTC', timeoutSeconds: '', allowConcurrency: true }, { componentId: 'c', envId: 'development', releaseId: 'r' });
    expect(input).toEqual({ componentId: 'c', envId: 'development', releaseId: 'r', cron: '*/5 * * * *', timezone: 'UTC', allowConcurrency: true });
  });
});
