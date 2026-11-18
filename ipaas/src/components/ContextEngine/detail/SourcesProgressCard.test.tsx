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

vi.mock('../../../hooks/useContextEngine', () => ({
  useContextEngineProgress: () => ({ data: undefined, isLoading: false, isError: false }),
  useContextIntegrations: () => ({ data: [], isError: false }),
}));
vi.mock('../../../hooks/contextUploads', () => ({ useSourceUploads: () => [] }));
vi.mock('../../../hooks/stagedEngineSources', () => ({ useStagedEngineSources: () => ({ waiting: 0, failures: [] }) }));

import SourcesProgressCard from './SourcesProgressCard';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('SourcesProgressCard', () => {
  it('says the sources are being added while setup is pending', () => {
    act(() => root.render(<SourcesProgressCard engineId="e" running={false} sources={[]} setupPending />));
    expect(host.textContent).toContain('Adding your sources. They appear here once the engine is running.');
    expect(host.textContent).not.toContain('No sources yet.');
  });

  it('says there are no sources when nothing is being added', () => {
    act(() => root.render(<SourcesProgressCard engineId="e" running sources={[]} />));
    expect(host.textContent).toContain('No sources yet.');
  });
});
