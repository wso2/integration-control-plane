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
import { ConfigForm, type ConfigFormProps } from './ConfigForm';
import type { FieldLink, FieldLinkPicker } from './linkedFrom';
import type { JSONSchema } from '../../types/schema';

// The schema the BFF serves for package wso2/sfdemo: root-module configurables
// beside module sfdemo.support's, under the package, and the ballerina/http library's.
const schema = {
  type: 'object',
  requiredLevel: 3,
  properties: {
    wso2: {
      type: 'object',
      properties: {
        sfdemo: {
          type: 'object',
          required: ['sfSalesBaseUrl', 'greeting'],
          properties: {
            sfSalesBaseUrl: { type: 'string', description: '' },
            greeting: { type: 'string', description: '' },
            support: {
              type: 'object',
              required: ['sfSupportBaseUrl'],
              properties: { sfSupportBaseUrl: { type: 'string', description: '' }, sfSupportRegion: { type: 'string', description: '' } },
            },
          },
        },
      },
    },
    ballerina: {
      type: 'object',
      properties: { http: { type: 'object', properties: { maxActiveConnections: { type: 'integer', description: '' } } } },
    },
  },
} as unknown as JSONSchema;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: Partial<ConfigFormProps> = {}) =>
  act(async () =>
    root.render(
      <ConfigForm schema={schema} valueMap={new Map()} validationMap={new Map()} linkingMap={new Map()} setLinkingMap={vi.fn()} sensitiveMap={new Map()} setSensitiveMap={vi.fn()} handleValueChange={vi.fn()} handleValidationChange={vi.fn()} {...props} />,
    ),
  );
const box = (title: string) =>
  Array.from(container.querySelectorAll('h6'))
    .find((h) => h.textContent === title)!
    .closest('.MuiStack-root')!.parentElement!;
const labels = (el: Element) => Array.from(el.querySelectorAll('p.MuiTypography-body2')).map((p) => p.textContent);

describe('ConfigForm', () => {
  it("lists each group's required configurables first, then its optional ones, tagged", async () => {
    await render();
    expect(labels(box('Configurables'))).toEqual(['sfSalesBaseUrl', 'greeting', 'support.sfSupportBaseUrl', 'support.sfSupportRegion']);
    expect(box('Configurables').textContent).toMatch(/support\.sfSupportRegionstringoptional/);
    expect(box('Configurables').textContent).not.toMatch(/greetingstringoptional/);
  });

  it("puts a connection's configurables in its own box, the rest under Other configurables", async () => {
    const title = <h6>sfSales</h6>;
    await render({ groups: [{ id: 'sfSales', title, actions: <button>Unlink</button>, keys: ['wso2.sfdemo.sfSalesBaseUrl'] }] });
    expect(labels(box('sfSales'))).toEqual(['sfSalesBaseUrl']);
    expect(box('sfSales').textContent).toContain('Unlink');
    expect(labels(box('Other configurables'))).toEqual(['greeting', 'support.sfSupportBaseUrl', 'support.sfSupportRegion']);
  });

  it("keeps a library's configurables in their package's box, collapsed", async () => {
    await render();
    const http = Array.from(container.querySelectorAll('[role="button"]')).find((b) => b.textContent === 'ballerina/http') as HTMLElement;
    expect(http.getAttribute('aria-expanded')).toBe('false');
    expect(labels(box('Configurables'))).not.toContain('maxActiveConnections');
    await act(async () => http.click());
    expect(http.getAttribute('aria-expanded')).toBe('true');
    expect(labels(http.parentElement!)).toEqual(['ballerina/http', 'maxActiveConnections']);
  });
});

describe('ConfigForm with links', () => {
  it('shows the configurables a link supplies read-only and asks no value for them', async () => {
    const handleValidationChange = vi.fn();
    const sources: Record<string, FieldLink> = {
      'wso2.sfdemo.sfSalesBaseUrl': { source: { resource: 'Salesforce Sales', key: 'SALESFORCE_BASE_URL', overrides: true } },
      'wso2.sfdemo.support.sfSupportBaseUrl': { source: { resource: 'salesforce-support', key: 'SALESFORCE_BASE_URL', noValuesIn: 'Production' } },
    };
    await render({ handleValidationChange, fieldLinks: (path) => sources[path] });

    const linked = Array.from(container.querySelectorAll('input')).filter((i) => i.value.startsWith('from '));
    expect(linked.map((i) => [i.getAttribute('aria-label'), i.value, i.disabled])).toEqual([
      ['sfSalesBaseUrl is supplied by Salesforce Sales', 'from Salesforce Sales · SALESFORCE_BASE_URL', true],
      ['support.sfSupportBaseUrl is supplied by salesforce-support', 'from salesforce-support · SALESFORCE_BASE_URL', true],
    ]);
    expect(container.textContent).toContain('Overrides selected Link');
    expect(container.textContent).toContain('No Production values. Add them in WSO2 Cloud.');
    const validated = handleValidationChange.mock.calls.map(([key]) => key);
    expect(validated).not.toContain('wso2.sfdemo.sfSalesBaseUrl');
    expect(validated).not.toContain('wso2.sfdemo.support.sfSupportBaseUrl');
    expect(Array.from(box('Configurables').querySelectorAll('input')).filter((i) => !i.disabled)).toHaveLength(2);
  });

  it("offers a field's sources from its link icon, a key in use disabled, and links the one picked", async () => {
    const onPick = vi.fn();
    const picker: FieldLinkPicker = {
      first: 'Enter a value',
      selected: 'orders-db|URL',
      resources: [{ id: 'orders-db', name: 'orders-db', keys: [{ key: 'URL' }, { key: 'PASSWORD', usedBy: 'ordersDbPassword' }] }],
      onPick,
    };
    await render({ fieldLinks: (path) => (path === 'wso2.sfdemo.greeting' ? { picker } : undefined) });
    await act(async () => (container.querySelector('button[aria-label="Link greeting"]') as HTMLButtonElement).click());

    const items = Array.from(document.querySelectorAll('[aria-label="Source of greeting"] li')).map((li) => [li.textContent, li.getAttribute('aria-disabled') === 'true', li.classList.contains('Mui-selected')]);
    expect(items).toEqual([
      ['Enter a value', false, false],
      ['orders-db', false, false],
      ['URL', false, true],
      ['PASSWORDused by ordersDbPassword', true, false],
    ]);
    await act(async () => (Array.from(document.querySelectorAll('[aria-label="Source of greeting"] li')).find((li) => li.textContent === 'Enter a value') as HTMLElement).click());
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
