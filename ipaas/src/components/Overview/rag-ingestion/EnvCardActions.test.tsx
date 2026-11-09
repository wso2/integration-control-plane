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

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import ragIngestionModule from './index';
import automationModule from '../automation/index';
import { renderWithScopes } from '../../../test/renderWithScopes';
import { DEVELOPER } from '../../../test/roles';
import type { EnvCardActionsProps } from '../../../types/integration';
import type { ScheduleButtonProps } from '../_shared/ScheduleButton';

const mutation = { mutate: vi.fn(), isPending: false };
vi.mock('../../../hooks/useExecutions', () => ({ useExecutionConfigs: () => ({ data: undefined }), useTriggerComponent: () => mutation }));
vi.mock('../../../hooks/useConfiguration', async (importOriginal) => ({ ...(await importOriginal<object>()), useSchemaConfig: () => ({ data: undefined }) }));
const scheduleButton = vi.fn();
vi.mock('../_shared/ScheduleButton', () => ({ default: (props: ScheduleButtonProps) => (scheduleButton(props), null) }));

const slot = { component: { id: 'docs-s3' }, env: { id: 'development', name: 'Development' }, releaseId: 'r1', deploymentStatusV2: 'ACTIVE', onNotify: () => {}, onTrigger: () => {} } as unknown as EnvCardActionsProps;
let unmount = () => {};
afterEach(() => {
  unmount();
  scheduleButton.mockClear();
});

async function scheduleKind(ui: ReactElement) {
  unmount = (await renderWithScopes(ui, DEVELOPER)).unmount;
  return (scheduleButton.mock.lastCall?.[0] as ScheduleButtonProps).kind;
}

describe('the Schedule action on an overview card', () => {
  it('holds a knowledge base data source to the ingestion limits', async () => {
    const Actions = ragIngestionModule.EnvCardActions!;
    expect(await scheduleKind(<Actions {...slot} />)).toBe('ingestion');
  });

  it('holds an automation to the automation limits', async () => {
    const Actions = automationModule.EnvCardActions!;
    expect(await scheduleKind(<Actions {...slot} />)).toBe('automation');
  });
});
