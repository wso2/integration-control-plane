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
import type { ContextEvidence } from '../../../types/contextEngine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The UI library's bundle pulls in syntax highlighting that Vitest cannot resolve; plain elements are enough to click.
vi.mock('@wso2/oxygen-ui', () => {
  const plain =
    (tag: string) =>
    ({ component, sx: _sx, startIcon: _s, endIcon: _e, variant: _v, size: _z, color: _c, children, ...props }: Record<string, unknown> & { children?: ReactNode }) =>
      createElement(typeof component === 'string' ? component : tag, props, children);
  return { Box: plain('div'), Stack: plain('div'), Typography: plain('span'), Chip: plain('span'), Link: plain('a'), Tooltip: plain('span'), IconButton: plain('button'), Button: plain('button'), ButtonBase: plain('button') };
});
// The icon package ships a stylesheet Node cannot import; the source mark pulls in dozens of icons, so it is stubbed whole.
vi.mock('@wso2/oxygen-ui-icons-react', () => {
  const icon = () => null;
  return { ArrowRight: icon, Check: icon, ChevronDown: icon, ChevronRight: icon, ExternalLink: icon, History: icon, Info: icon, Link: icon, Waypoints: icon };
});
vi.mock('../SourceMark', () => ({ default: () => null }));

const evidence: ContextEvidence[] = [1, 2].map((n) => ({
  id: `evi_${n}`,
  recordId: `file-${n}.md`,
  sourceId: 'src_1',
  sourceVersion: '1',
  passage: `Passage ${n}.`,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter>
        <AnsweredTurn answer="One fact [1]. Another fact [2]." evidence={evidence} sources={[]} hrefFor={(ev) => `/evidence/${ev.id}`} onOpen={() => undefined} />
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (label: RegExp): HTMLButtonElement => {
  const found = [...host.querySelectorAll('button')].find((b) => label.test(b.getAttribute('aria-label') ?? ''));
  if (!found) throw new Error(`no button matching ${label}`);
  return found;
};
const click = (b: HTMLButtonElement) => act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('AnsweredTurn pinning', () => {
  it('releases a passage pinned from a citation mark when its rail number is clicked', () => {
    click(button(/^Evidence 2$/));
    expect(button(/passage 2$/).getAttribute('aria-label')).toBe('Release passage 2');
    click(button(/^Release passage 2$/));
    expect(button(/passage 2$/).getAttribute('aria-label')).toBe('Pin passage 2');
    expect(button(/^Evidence 2$/).getAttribute('aria-pressed')).toBe('false');
  });

  it('pins and releases from the rail alone', () => {
    click(button(/^Pin passage 1$/));
    expect(button(/^Evidence 1$/).getAttribute('aria-pressed')).toBe('true');
    click(button(/^Release passage 1$/));
    expect(button(/^Evidence 1$/).getAttribute('aria-pressed')).toBe('false');
  });

  it('still moves a pin from one passage to another', () => {
    click(button(/^Evidence 1$/));
    click(button(/^Evidence 2$/));
    expect(button(/passage 1$/).getAttribute('aria-label')).toBe('Pin passage 1');
    expect(button(/passage 2$/).getAttribute('aria-label')).toBe('Release passage 2');
  });
});
