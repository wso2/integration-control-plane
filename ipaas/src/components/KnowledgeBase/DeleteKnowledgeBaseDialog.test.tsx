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
import DeleteKnowledgeBaseDialog from './DeleteKnowledgeBaseDialog';
import type { KnowledgeBase, KnowledgeBaseDataSource } from '../../types/knowledgeBase';

const deleted = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock('../../hooks/useKnowledgeBases', () => ({
  useDeleteKnowledgeBase: () => ({ isPending: false, error: null, mutate: (name: string) => deleted.names.push(name) }),
}));

const kb = (dataSources: Partial<KnowledgeBaseDataSource>[] = []) => ({ name: 'docs-kb', displayName: 'Docs KB', dataSources }) as unknown as KnowledgeBase;

let root: Root;
const buttonNamed = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent === name);
const confirmInput = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Knowledge base name"]');
const click = (el: Element | null | undefined) => act(async () => void el?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const type = (el: HTMLInputElement | null, value: string) =>
  act(async () => {
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const open = (knowledgeBase: KnowledgeBase) => act(async () => root.render(<DeleteKnowledgeBaseDialog knowledgeBase={knowledgeBase} onClose={() => {}} onDeleted={() => {}} />));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  deleted.names = [];
  root = createRoot(document.createElement('div'));
});
afterEach(() => act(() => root.unmount()));

describe('DeleteKnowledgeBaseDialog', () => {
  it('keeps Delete disabled until the exact name is typed', async () => {
    await open(kb());
    expect(buttonNamed('Delete')?.disabled).toBe(true);
    await type(confirmInput(), 'Docs KB');
    expect(buttonNamed('Delete')?.disabled).toBe(true);
    await type(confirmInput(), 'docs-kb');
    expect(buttonNamed('Delete')?.disabled).toBe(false);
    await click(buttonNamed('Delete'));
    expect(deleted.names).toEqual(['docs-kb']);
  });

  it('names the data sources that block the delete and offers no way to confirm', async () => {
    await open(kb([{ name: 'docs-kb-amazons3', displayName: 'Docs KB Amazon S3' }]));
    expect(document.body.textContent).toContain('Docs KB Amazon S3');
    expect(confirmInput()).toBeNull();
    expect(buttonNamed('Delete')?.disabled).toBe(true);
    expect(buttonNamed('Close')).toBeDefined();
  });
});
