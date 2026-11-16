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

import { describe, expect, it, vi } from 'vitest';
import { addContextSource, getContextEngine } from '../api/contextEngine';
import type { ContextEngineDetail } from '../types/contextEngine';
import { stageEngineSources, type StagedEngineSource } from './stagedEngineSources';

vi.mock('../api/contextEngine', () => ({ getContextEngine: vi.fn(), addContextSource: vi.fn() }));
vi.mock('./contextUploads', () => ({ rememberSourceRules: vi.fn(), startUploads: vi.fn() }));

const staged = (name: string): StagedEngineSource => ({ source: { type: 'file_upload', name, values: {}, audience: [] }, files: [], visibility: { kind: 'everyone' }, audience: [] });

describe('stageEngineSources', () => {
  it('refreshes the engine once its sources are added', async () => {
    vi.mocked(getContextEngine).mockResolvedValue({ state: 'ready' } as ContextEngineDetail);
    vi.mocked(addContextSource).mockResolvedValue({ id: 's1', name: 'Docs', type: 'file_upload', state: 'ready' });
    const onAdded = vi.fn();
    stageEngineSources('e1', [staged('Docs')], onAdded);
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
  });
});
