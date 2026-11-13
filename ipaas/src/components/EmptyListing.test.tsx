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

import { StrictMode, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('../services/telemetry/consoleActions', async (importOriginal) => ({ ...(await importOriginal<object>()), trackConsoleAction: track }));

import EmptyListing from './EmptyListing';
import { ConsoleAction } from '../services/telemetry/consoleActions';

let root: Root;
let container: HTMLElement;
const show = (ui: ReactNode) => act(() => root.render(ui));
const reports = () => track.mock.calls.filter(([name]) => name === ConsoleAction.EmptyState).map(([, dims]) => dims);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  track.mockClear();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe('EmptyListing report', () => {
  it('reports the empty state once when shown', () => {
    show(<EmptyListing icon={null} title="No projects yet" description="Create one to get started." report={{ resource: 'projects', state: 'no-data' }} />);
    expect(container.textContent).toContain('No projects yet');
    expect(reports()).toEqual([{ resource: 'projects', state: 'no-data' }]);
  });

  it('reports nothing without a report prop', () => {
    show(<EmptyListing icon={null} title="No projects yet" description="Create one to get started." />);
    expect(container.textContent).toContain('No projects yet');
    expect(reports()).toEqual([]);
  });

  it('does not report again when the page re-renders it with a new report object', () => {
    show(<EmptyListing icon={null} title="No projects found" description="Create one to get started." report={{ resource: 'projects', state: 'no-data' }} />);
    show(<EmptyListing icon={null} title="No projects found" description="Create one to get started." report={{ resource: 'projects', state: 'no-data' }} />);
    expect(reports()).toHaveLength(1);
  });

  it('reports once under StrictMode', () => {
    show(
      <StrictMode>
        <EmptyListing icon={null} title="No projects yet" description="Create one to get started." report={{ resource: 'projects', state: 'no-data' }} />
      </StrictMode>,
    );
    expect(reports()).toHaveLength(1);
  });

  it('reports again when the listing empties again after showing results', () => {
    show(<EmptyListing icon={null} title="No integrations found" description="Create one to get started." report={{ resource: 'integrations', state: 'no-results' }} />);
    show(<p>3 integrations</p>);
    show(<EmptyListing icon={null} title="No integrations found" description="Create one to get started." report={{ resource: 'integrations', state: 'no-results' }} />);
    expect(reports()).toEqual([
      { resource: 'integrations', state: 'no-results' },
      { resource: 'integrations', state: 'no-results' },
    ]);
  });
});
