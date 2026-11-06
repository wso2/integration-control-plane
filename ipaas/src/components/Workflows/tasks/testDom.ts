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

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Just enough DOM testing for the task views' unit tests, which render with `react-dom` under
 * happy-dom as the other workflow tests do. Queries read the whole document, because dialogs and
 * tooltips are portalled to its body.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Lets pending promises (queries, mutations) settle and their renders commit. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

export async function mount(ui: ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  const created = createRoot(container);
  root = created;
  await act(async () => created.render(ui));
  await flush();
}

export async function unmount(): Promise<void> {
  const mounted = root;
  if (mounted) await act(async () => mounted.unmount());
  root = null;
  container = null;
  document.body.innerHTML = '';
}

const textMatches = (text: string | RegExp, value: string | null): boolean => (typeof text === 'string' ? (value ?? '').trim() === text : text.test(value ?? ''));

/** The innermost elements whose whole text matches. */
export function allByText(text: string | RegExp, scope: ParentNode = document.body): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>('*')].filter((el) => textMatches(text, el.textContent) && ![...el.children].some((child) => textMatches(text, child.textContent)));
}

export function queryByText(text: string | RegExp, scope?: ParentNode): HTMLElement | null {
  return allByText(text, scope)[0] ?? null;
}

export function byText(text: string | RegExp, scope?: ParentNode): HTMLElement {
  const found = queryByText(text, scope);
  if (!found) throw new Error(`Nothing reads "${String(text)}" in: ${document.body.textContent}`);
  return found;
}

/** Waits for text a query will bring. */
export async function findByText(text: string | RegExp, scope?: ParentNode): Promise<HTMLElement> {
  for (let i = 0; i < 20; i += 1) {
    const found = queryByText(text, scope);
    if (found) return found;
    await flush(1);
  }
  return byText(text, scope);
}

/** The first button a label sits in; a heading of the same words is passed over. */
export function buttonOf(text: string | RegExp, scope?: ParentNode): HTMLButtonElement {
  const button = allByText(text, scope)
    .map((el) => el.closest('button'))
    .find((candidate) => candidate !== null);
  if (!button) throw new Error(`No button reads "${String(text)}"`);
  return button;
}

/** The open dialog titled `title`. */
export function dialogTitled(title: string): HTMLElement {
  const dialog = [...document.body.querySelectorAll<HTMLElement>('[role="dialog"]')].find((candidate) => [...candidate.querySelectorAll('h2')].some((heading) => textMatches(title, heading.textContent)));
  if (!dialog) throw new Error(`No dialog titled "${title}"`);
  return dialog;
}

export async function click(element: Element): Promise<void> {
  await act(async () => (element as HTMLElement).click());
  await flush();
}

/** Types into a controlled input or textarea, as React hears it. */
export async function typeInto(element: Element, value: string): Promise<void> {
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}

/** The text fields holding `value` exactly. */
export function fieldsWithValue(value: string | RegExp): Array<HTMLInputElement | HTMLTextAreaElement> {
  return [...document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].filter((field) => (typeof value === 'string' ? field.value === value : value.test(field.value)));
}
