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

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import BuildStatusLabel from './BuildStatusLabel';

vi.mock('../StatusIcons', () => ({ FailedIcon: () => <span />, InProgressIcon: () => <span />, QueuedIcon: () => <span />, SuccessIcon: () => <span />, WarningIcon: () => <span /> }));
vi.mock('@wso2/oxygen-ui', () => {
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Stack: Plain, Typography: Plain };
});

describe('BuildStatusLabel', () => {
  it('gives the reason a build stopped before deploying', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const stopped = { reason: 'connection_missing', links: [], message: "salesforce-sales is linked through acme.sfdemo.sfSales, which this build doesn't have" };
    await act(async () => root.render(<BuildStatusLabel status="completed" conclusion="failure" stopped={stopped} />));
    expect(container.textContent).toBe(`Failed${stopped.message}`);
    act(() => root.unmount());
  });
});
