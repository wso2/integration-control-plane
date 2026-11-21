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

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnsweredTurn from './AnsweredTurn';
import type { ContextEvidence, ContextFact } from '../../../types/contextEngine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The UI library's bundle pulls in syntax highlighting that Vitest cannot resolve; plain elements are enough to click.
vi.mock('@wso2/oxygen-ui', () => {
  const plain =
    (tag: string) =>
    ({ component, sx: _sx, startIcon: _s, endIcon: _e, variant: _v, size: _z, color: _c, noWrap: _n, children, ...props }: Record<string, unknown> & { children?: ReactNode }) =>
      createElement(typeof component === 'string' ? component : tag, props, children);
  return { Box: plain('div'), Stack: plain('div'), Typography: plain('span'), Chip: plain('span'), Button: plain('button'), ButtonBase: plain('button') };
});
// The icon package ships a stylesheet Node cannot import.
vi.mock('@wso2/oxygen-ui-icons-react', () => {
  const icon = () => null;
  return { ChevronRight: icon, Waypoints: icon };
});

const evidence: ContextEvidence[] = [1, 2, 3].map((n) => ({
  id: `evi_${n}`,
  recordId: `file-${n}.md`,
  sourceId: 'src_1',
  sourceVersion: '1',
  passage: `Passage ${n}.`,
}));
const facts: ContextFact[] = [
  { subject: 'Finance', relation: 'approves', object: 'Refunds', evidenceIds: ['evi_1'] },
  { subject: 'Refunds', relation: 'take', object: 'Five days', evidenceIds: ['evi_2', 'evi_3'] },
  { subject: 'Support', relation: 'logs', object: 'Refunds', evidenceIds: ['evi_3'] },
];

let root: Root;
let host: HTMLDivElement;
const onOpenFact = vi.fn();

beforeEach(() => {
  onOpenFact.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter>
        <AnsweredTurn answer="Finance approves them. They take five days." facts={facts} evidence={evidence} sources={[{ id: 'src_1', name: 'Handbook', type: 'upload', state: 'ready' }]} onOpenFact={onOpenFact} />
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const buttons = (label: RegExp): HTMLButtonElement[] => [...host.querySelectorAll('button')].filter((b) => label.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
const button = (label: RegExp): HTMLButtonElement => {
  const [found] = buttons(label);
  if (!found) throw new Error(`no button matching ${label}`);
  return found;
};
const click = (b: HTMLElement) => act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('AnsweredTurn', () => {
  it('lists every statement that supports the answer, in order, with the sources of its evidence', () => {
    expect(buttons(/^Statement \d+:/).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Statement 1: Finance approves Refunds. Open its evidence',
      'Statement 2: Refunds take Five days. Open its evidence',
      'Statement 3: Support logs Refunds. Open its evidence',
    ]);
    expect(button(/^Statement 2:/).textContent).toContain('Handbook');
    expect(button(/^Statement 2:/).textContent).not.toContain('passage');
    // The engine does not cite statements, so none is set apart as uncited.
    expect(host.textContent).not.toMatch(/cited|Also given/i);
  });

  it("opens a statement's page from the rail", () => {
    click(button(/^Statement 2:/));
    expect(onOpenFact).toHaveBeenCalledWith(2);
  });

});
