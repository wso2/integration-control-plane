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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowClient } from '../api/client';
import { clearSettling, isSettling } from '../api/settleRegistry';
import type { WorkflowDefinition } from '../api/types';
import StartWorkflowDialog from './StartWorkflowDialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEFINITIONS = [
  { workflowType: 'orderWorkflow', kind: 'WORKFLOW', inputSchema: null, isActive: true, workerCount: 1 },
  { workflowType: 'refundWorkflow', kind: 'WORKFLOW', inputSchema: null, isActive: true, workerCount: 1 },
] satisfies WorkflowDefinition[];

let root: Root;
let container: HTMLDivElement;

interface RenderOptions {
  api?: WorkflowClient | null;
  onClose?: () => void;
  onViewRun?: (run: { workflowType: string; runId: string }) => void;
}

async function renderDialog(initialWorkflowType?: string, { api = null, onClose = vi.fn(), onViewRun }: RenderOptions = {}) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <StartWorkflowDialog open api={api} scopeId="scope" definitions={DEFINITIONS} initialWorkflowType={initialWorkflowType} onClose={onClose} onViewRun={onViewRun} />
      </QueryClientProvider>,
    ),
  );
}

const startingApi = () => ({ instances: { start: vi.fn().mockResolvedValue({ workflowId: 'order-42', runId: 'run-7' }) } }) as unknown as WorkflowClient;

/** The dialog renders in a portal, so everything is looked up in the document. */
const text = () => document.body.textContent ?? '';

const button = (label: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!found) throw new Error(`no ${label} button`);
  return found;
};

const click = (label: string) => act(async () => button(label).click());

/** Types into a controlled input the way a person does, so React sees the change. */
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  clearSettling();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('StartWorkflowDialog', () => {
  it('labels the field Workflow Definition', async () => {
    await renderDialog();
    expect(text()).toContain('Workflow Definition');
  });

  it('opens on the definition it was given', async () => {
    await renderDialog('refundWorkflow');
    expect(document.querySelector('[role="combobox"]')?.textContent).toBe('refundWorkflow');
    expect(text()).not.toContain('Select a workflow definition…');
  });

  it('opens empty without one, or with one no longer listed', async () => {
    await renderDialog('goneWorkflow');
    expect(text()).toContain('Select a workflow definition…');
  });

  it('confirms a start as ICP does and opens the run from there', async () => {
    const onClose = vi.fn();
    const onViewRun = vi.fn();
    const api = startingApi();
    await renderDialog('refundWorkflow', { api, onClose, onViewRun });

    await click('Start');

    expect(api.instances.start).toHaveBeenCalledWith({ workflowType: 'refundWorkflow' });
    expect(text()).toContain('Workflow Started');
    expect(text()).toContain('order-42');
    // The list lags a start, so the new workflow keeps its reads polling for a while.
    expect(isSettling('order-42')).toBe(true);
    await click('View Running Workflow');
    expect(onViewRun).toHaveBeenCalledWith({ workflowType: 'refundWorkflow', runId: 'run-7' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the Workflow ID hint, and refuses a timeout that is not above 0', async () => {
    const api = startingApi();
    await renderDialog('refundWorkflow', { api });
    await click('Advanced');
    expect(text()).toMatch(/The engine generates one when left blank/);

    const timeout = document.querySelector<HTMLInputElement>('input[type="number"]');
    if (!timeout) throw new Error('expected the timeout field');
    await typeInto(timeout, '0');
    await click('Start');
    expect(text()).toContain('Timeout must be a whole number of seconds, above 0.');
    expect(api.instances.start).not.toHaveBeenCalled();
  });

  it('offers only Close when there is nowhere to open the run', async () => {
    await renderDialog('refundWorkflow', { api: startingApi() });

    await click('Start');

    expect(text()).toContain('Workflow Started');
    expect(text()).not.toContain('View Running Workflow');
    expect(button('Close')).toBeTruthy();
  });
});
