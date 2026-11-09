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
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import DeployEnvironmentCardBody from './DeployEnvironmentCardBody';
import { getComponentTypeFlags } from '../../../utils/componentType';
import { DeploymentStatus } from '../../../types/deployment';

vi.mock('../../Deploy/BuildImageCard', () => ({ default: () => null }));

const render = async (onConfigClick?: () => void) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const props = {
    status: DeploymentStatus.Error,
    flags: getComponentTypeFlags('Service'),
    deployment: { releaseId: 'r', cron: '', cronTimezone: '' },
    scheduleDescription: null,
    nextRunLabel: null,
    releaseId: 'r',
    releaseName: 'r',
    isLoading: false,
    deployedImage: null,
    deployedAt: null,
    envCritical: false,
  };
  await act(async () => root.render(<DeployEnvironmentCardBody {...props} missingConfigsReason="GitHub Acme has no values in production. Add them on WSO2 Cloud." onConfigClick={onConfigClick} />));
  return container;
};

describe('the Deploy page environment card', () => {
  it('offers "Configure to Continue" beside the reason to a role that can configure', async () => {
    const onConfigClick = vi.fn();
    const button = Array.from((await render(onConfigClick)).querySelectorAll('button')).find((b) => b.textContent === 'Configure to Continue');
    await act(async () => button!.click());
    expect(onConfigClick).toHaveBeenCalledOnce();
  });

  it('gives only the reason to a role that cannot configure', async () => {
    const container = await render();
    expect(container.textContent).toContain('GitHub Acme has no values in production.');
    expect(container.textContent).not.toContain('Configure to Continue');
  });
});
