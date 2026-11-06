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
import { ConfigForm } from '../SchemaConfigForm';
import { renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER } from '../../test/roles';
import { schemaConfigValues } from '../../utils/configValues';

// Ballerina's shape: organization, then module, then its configurables. It has a scalar, an enum, an
// object holding a list, a map with an escaped key, and a list.
const module = (properties: object, required: string[] = []) => ({ type: 'object', properties, required });
const schema = {
  type: 'object',
  requiredLevel: 3,
  properties: {
    acme: { type: 'object', properties: { hello: module({ greeting: { type: 'string' }, port: { type: 'integer' } }, ['greeting']) } },
    ballerina: {
      type: 'object',
      properties: {
        http: module({ maxActiveConnections: { type: 'integer' }, accessLogConfig: { type: 'object', properties: { console: { type: 'boolean' }, attributes: { type: 'array', items: { type: 'string' } } } } }),
        log: module({
          level: { type: 'string', enum: ['DEBUG', 'INFO'] },
          keyValues: { type: 'object', additionalProperties: { type: 'string' }, properties: { 'icp\\.runtimeId': { type: 'string' } } },
          destinations: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' } } } },
        }),
      },
    },
  },
};
const schemaConfig = vi.hoisted(() => ({ jsonSchema: '', configurations: [] }));
vi.mock('../../hooks/useConfiguration', () => ({ useSchemaConfig: () => ({ data: schemaConfig, isLoading: false }) }));
vi.mock('../../hooks/useMiConfig', () => ({ useMiConfig: () => ({ data: undefined, isLoading: false }) }));

// The editor's leaf fields, reduced to the path and label each is given; ObjectElement and the sections stay real.
const field = vi.hoisted(() => () => ({ jsonPath, title }: { jsonPath: string; title: string }) => <div data-field={jsonPath.replace(/\.(\*|\[\*\])$/, '')} data-label={title} />);
vi.mock('../SchemaConfigForm/FormElements/BaseElement', () => ({ BaseElement: field() }));
vi.mock('../SchemaConfigForm/FormElements/ArrayElement', () => ({ ArrayElement: field() }));
vi.mock('../SchemaConfigForm/FormElements/AnyOfElement', () => ({ AnyOfElement: field() }));
vi.mock('../SchemaConfigForm/FormElements/MapElement', () => ({ default: field(), MapElement: field() }));

let unmount = () => {};
afterEach(() => unmount());

/** The editor's headings and field labels in page order, and its fields' paths. */
async function editor() {
  const noop = () => {};
  const r = await renderWithScopes(
    <ConfigForm schema={schema as never} valueMap={new Map()} handleValueChange={noop} validationMap={new Map()} handleValidationChange={noop} linkingMap={new Map()} setLinkingMap={noop} sensitiveMap={new Map()} setSensitiveMap={noop} />,
    DEVELOPER,
  );
  const nodes = [...r.container.querySelectorAll<HTMLElement>('.MuiTypography-root, [data-field]')];
  const result = { rows: nodes.map((n) => n.dataset.label ?? n.textContent), keys: nodes.flatMap((n) => (n.dataset.field ? [n.dataset.field] : [])) };
  r.unmount();
  return result;
}

/** The read-only drawer's headings and field labels in row order. */
async function readOnly() {
  const r = await renderWithScopes(
    <ConfigureDrawer open readOnly onClose={() => {}} orgHandler="acme" projectId="default" componentId="hello" envId="development" versionId="v1" componentName="hello" projectHandler="default" displayType="ballerinaService" />,
    DEVELOPER,
  );
  unmount = r.unmount;
  return [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent);
}

describe('the read-only Configure drawer', () => {
  it("shows exactly the editor's fields, with its labels, in its order, under its sections and modules", async () => {
    schemaConfig.jsonSchema = btoa(JSON.stringify(schema));
    const expected = await editor();
    expect(await readOnly()).toEqual(expected.rows);
    expect(schemaConfigValues(schemaConfig).map((v) => v.key)).toEqual(expected.keys);
  });
});
