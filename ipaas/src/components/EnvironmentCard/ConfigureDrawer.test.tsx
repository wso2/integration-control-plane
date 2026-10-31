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

import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfigureDrawer from './ConfigureDrawer';
import { renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER } from '../../test/roles';

// A service with one required configurable, stored, and one optional, left to the integration's default.
const jsonSchema = btoa(JSON.stringify({ type: 'object', requiredLevel: 2, properties: { hello: { type: 'object', properties: { greeting: { type: 'string' }, port: { type: 'integer' } }, required: ['greeting'] } } }));
const schemaConfig = { jsonSchema, configurations: [{ key: 'hello.greeting', values: [{ environmentUuid: 'development', value: 'hi' }] }] };
vi.mock('../../hooks/useConfiguration', () => ({ useSchemaConfig: () => ({ data: schemaConfig, isLoading: false }) }));
vi.mock('../../hooks/useMiConfig', () => ({ useMiConfig: () => ({ data: undefined, isLoading: false }) }));

let unmount = () => {};
afterEach(() => unmount());

describe('the read-only Configure drawer', () => {
  it('lists the optional configurables the editor shows, as their default', async () => {
    const r = await renderWithScopes(
      <ConfigureDrawer open readOnly onClose={() => {}} orgHandler="acme" projectId="default" componentId="hello" envId="development" versionId="v1" componentName="hello" projectHandler="default" displayType="ballerinaService" />,
      DEVELOPER,
    );
    unmount = r.unmount;
    const rows = [...document.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(rows).toEqual([
      ['hello.greeting', 'hi'],
      ['hello.port', 'Default'],
    ]);
  });
});
