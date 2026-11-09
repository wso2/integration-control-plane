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
import LastSuccessfulSync from './LastSuccessfulSync';
import type { KnowledgeBase, KnowledgeBaseDataSource } from '../../types/knowledgeBase';

const runs = vi.hoisted(() => ({ current: [] as { status: string; startTime: string; completionTime?: string }[] }));
vi.mock('../../hooks/useExecutions', () => ({ useTaskExecutions: () => ({ data: runs.current, isLoading: false, isError: false }) }));

const kb = { name: 'docs-kb', environment: 'development', projectName: 'ai-services' } as KnowledgeBase;
const NOT_STARTED = 'The data source was created, but its first ingestion could not be started. Run it with Ingest.';
const source = (firstRunError: string) => ({ name: 'docs-s3', releaseName: 'docs-s3-1', firstRunError }) as KnowledgeBaseDataSource;

let container: HTMLDivElement;
let root: Root;
const show = async (ds: KnowledgeBaseDataSource) => {
  await act(async () => root.render(<LastSuccessfulSync kb={kb} dataSource={ds} />));
  return container.textContent ?? '';
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
  runs.current = [];
});
afterEach(() => act(() => root.unmount()));

describe('LastSuccessfulSync', () => {
  it("says a one-time source's first ingestion did not start", async () => {
    expect(await show(source(NOT_STARTED))).toContain(NOT_STARTED);
  });

  it('stops saying so once the source has a run', async () => {
    runs.current = [{ status: 'Succeeded', startTime: '2026-11-09T10:00:00Z', completionTime: '2026-11-09T10:01:00Z' }];
    expect(await show(source(NOT_STARTED))).not.toContain(NOT_STARTED);
  });

  it('says nothing for a source whose first run started', async () => {
    expect(await show(source(''))).toBe('—');
  });
});
