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
import LabelDialog from './LabelDialog';
import type { ComponentDetail } from '../types/component';

const saved = vi.hoisted(() => ({ labels: undefined as string[] | undefined }));
vi.mock('../hooks/useComponents', () => ({
  useUpdateComponent: () => ({ isPending: false, mutate: (input: { labels: string[] }) => (saved.labels = input.labels) }),
}));
vi.mock('../hooks/useProjects', () => ({ useProjectComponentLabels: () => ({ data: [] }) }));

const KB_LABEL = 'knowledge-base-as-service';
const kbService = { id: 'docs-kb', handler: 'docs-kb', displayName: 'Docs', lockedLabels: [KB_LABEL] } as unknown as ComponentDetail;

let root: Root;
const chips = () => [...document.body.querySelectorAll<HTMLElement>('.MuiChip-root')];
const chip = (label: string) => chips().find((c) => c.textContent === label);
const click = (el: Element | null | undefined) => act(async () => void el?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const buttonNamed = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent === name);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  saved.labels = undefined;
  root = createRoot(document.createElement('div'));
});
afterEach(() => act(() => root.unmount()));

const open = (currentLabels: string[]) => act(async () => root.render(<LabelDialog open onClose={() => {}} component={kbService} projectId="ai-services" currentLabels={currentLabels} />));

describe('LabelDialog', () => {
  it("shows a locked label without a way to remove it, and a user's label with one", async () => {
    await open([KB_LABEL, 'payments']);
    expect(chip(KB_LABEL)?.querySelector('.MuiChip-deleteIcon')).toBeNull();
    expect(chip('payments')?.querySelector('.MuiChip-deleteIcon')).not.toBeNull();
  });

  it('keeps a locked label in what it saves when the other labels are removed', async () => {
    // Stored without it, as a component labelled before its label was locked.
    await open(['payments']);
    await click(chip('payments')?.querySelector('.MuiChip-deleteIcon'));
    await click(buttonNamed('Save'));
    expect(saved.labels).toEqual([KB_LABEL]);
  });

  it('shows a locked label the stored labels lack', async () => {
    await open([]);
    expect(chip(KB_LABEL)).toBeDefined();
  });
});
