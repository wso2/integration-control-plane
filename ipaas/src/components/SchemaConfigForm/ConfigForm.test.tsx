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
import { ConfigForm } from './ConfigForm';
import type { JSONSchema } from '../../types/schema';

// The schema the BFF serves for package wso2/sfdemo: root-module configurables
// beside module sfdemo.support's, under the package.
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

describe('ConfigForm with links', () => {
  it('shows the configurables a link supplies read-only and asks no value for them', async () => {
    const handleValidationChange = vi.fn();
    const linkedFrom = new Map([
      ['wso2.sfdemo.sfSalesBaseUrl', { resource: 'salesforce-sales' }],
      ['wso2.sfdemo.support.sfSupportBaseUrl', { resource: 'salesforce-support', noValuesIn: 'production' }],
    ]);
    await act(async () =>
      root.render(
        <ConfigForm
          schema={schema}
          valueMap={new Map()}
          validationMap={new Map()}
          linkingMap={new Map()}
          setLinkingMap={vi.fn()}
          sensitiveMap={new Map()}
          setSensitiveMap={vi.fn()}
          handleValueChange={vi.fn()}
          handleValidationChange={handleValidationChange}
          linkedFrom={linkedFrom}
        />,
      ),
    );

    const linked = Array.from(container.querySelectorAll('input')).filter((i) => i.value.startsWith('from '));
    expect(linked.map((i) => [i.getAttribute('aria-label'), i.value, i.disabled])).toEqual([
      ['sfSalesBaseUrl is supplied by salesforce-sales', 'from salesforce-sales', true],
      ['sfSupportBaseUrl is supplied by salesforce-support', 'from salesforce-support · no values in production', true],
    ]);
    const validated = handleValidationChange.mock.calls.map(([key]) => key);
    expect(validated).not.toContain('wso2.sfdemo.sfSalesBaseUrl');
    expect(validated).not.toContain('wso2.sfdemo.support.sfSupportBaseUrl');
    expect(Array.from(container.querySelectorAll('input')).filter((i) => !i.disabled)).toHaveLength(2);
  });

  it("lists a submodule's required configurables under Required", async () => {
    await act(async () =>
      root.render(<ConfigForm schema={schema} valueMap={new Map()} validationMap={new Map()} linkingMap={new Map()} setLinkingMap={vi.fn()} sensitiveMap={new Map()} setSensitiveMap={vi.fn()} handleValueChange={vi.fn()} handleValidationChange={vi.fn()} />),
    );

    const section = (title: string) =>
      Array.from(container.querySelectorAll('h6'))
        .find((h) => h.textContent === title)!
        .closest('.MuiBox-root')!.textContent;
    expect(section('Required')).toContain('wso2/sfdemo.support');
    expect(section('Required')).toContain('sfSupportBaseUrl');
    expect(section('Required')).not.toContain('sfSupportRegion');
    expect(section('Optional')).toContain('sfSupportRegion');
  });
});
