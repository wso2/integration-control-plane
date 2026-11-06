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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineSpan } from '../model/workflowFlow';
import WorkflowTimeline from './WorkflowTimeline';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const START = Date.now() - 10_000;
const SPANS: TimelineSpan[] = [
  { key: 'workflow', eventId: '1', label: 'orderWorkflow', category: 'WORKFLOW', status: 'RUNNING', start: START, end: START + 4000, running: true },
  { key: 'act-5', eventId: '5', label: 'orderWorkflow.reserveStock', category: 'ACTIVITY', status: 'COMPLETED', start: START + 1000, end: START + 3000, running: false },
];

let root: Root;
let container: HTMLDivElement;

async function renderTimeline(onSelect: (span: TimelineSpan | null) => void = vi.fn(), selectedKey: string | null = null) {
  await act(async () => root.render(<WorkflowTimeline timeline={{ spans: SPANS, start: START, end: START + 4000 }} visibleIds={null} selectedKey={selectedKey} onSelect={onSelect} />));
}

/** The element whose native tooltip starts with `prefix`: a bar names its span, status and duration. */
const byTitle = (prefix: string) => {
  const found = [...container.querySelectorAll<HTMLElement>('[title]')].find((el) => el.title.startsWith(prefix));
  if (!found) throw new Error(`no element titled ${prefix}`);
  return found;
};

const rowNamed = (name: string) => {
  const found = [...container.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.includes(name));
  if (!found) throw new Error(`no row named ${name}`);
  return found;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// A test DOM cannot render the dash pattern itself; what can be checked is that nothing paints a
// solid fill under it, and which bars glow.
describe('WorkflowTimeline', () => {
  it('draws a running span as a live dashed bar with no solid fill', async () => {
    await renderTimeline();
    const running = byTitle('orderWorkflow: Running');
    // The inline style is the claim; the bar's static rules live in its class.
    expect(running.style.backgroundColor).toBe('');
    expect(running.style.filter).toContain('drop-shadow');
  });

  it('leaves a finished span static', async () => {
    await renderTimeline();
    const done = byTitle('orderWorkflow.reserveStock: Completed');
    expect(done.style.filter).toBe('');
  });

  it('says how long the run has been going while anything runs', async () => {
    await renderTimeline();
    expect(container.textContent).toMatch(/Running for 0:1\d/);
  });

  it('reports a clicked span', async () => {
    const onSelect = vi.fn();
    await renderTimeline(onSelect);
    await act(async () => rowNamed('reserveStock').click());
    expect(onSelect).toHaveBeenLastCalledWith(SPANS[1]);
  });

  it('clicking the selected span clears the selection', async () => {
    const onSelect = vi.fn();
    await renderTimeline(onSelect, '5');
    await act(async () => rowNamed('reserveStock').click());
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
