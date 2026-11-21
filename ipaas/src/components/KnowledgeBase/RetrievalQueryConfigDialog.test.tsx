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
import RetrievalQueryConfigDialog from './RetrievalQueryConfigDialog';
import type { RetrievalSettings } from '../../utils/knowledgeBase';

let root: Root;
let applied: RetrievalSettings | null;
const inputs = () => [...document.body.querySelectorAll<HTMLInputElement>('input[type="number"]')];
const buttonNamed = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent === name);
const click = (el: Element | null | undefined) => act(async () => void el?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const type = (el: HTMLInputElement | undefined, value: string) =>
  act(async () => {
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  applied = null;
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<RetrievalQueryConfigDialog value={{ maxChunks: 5, minSimilarity: 0.7 }} onClose={() => {}} onApply={(v) => (applied = v)} />));
});
afterEach(() => act(() => root.unmount()));

describe('RetrievalQueryConfigDialog', () => {
  it('applies new settings', async () => {
    const [chunks, threshold] = inputs();
    await type(chunks, '8');
    await type(threshold, '0.5');
    await click(buttonNamed('Apply'));
    expect(applied).toEqual({ maxChunks: 8, minSimilarity: 0.5 });
  });

  it('will not apply settings out of range', async () => {
    const [chunks, threshold] = inputs();
    await type(chunks, '11');
    expect(buttonNamed('Apply')?.disabled).toBe(true);
    await type(chunks, '3');
    await type(threshold, '1.5');
    expect(buttonNamed('Apply')?.disabled).toBe(true);
    await type(threshold, '');
    expect(buttonNamed('Apply')?.disabled).toBe(true);
  });

  it('resets to the defaults', async () => {
    const [chunks] = inputs();
    await type(chunks, '9');
    await click(buttonNamed('Reset to defaults'));
    await click(buttonNamed('Apply'));
    expect(applied).toEqual({ maxChunks: 5, minSimilarity: 0.7 });
  });
});
