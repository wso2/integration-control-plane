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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const put = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, put } };
});

import { updateBuildpackConfigs } from './repository';
import type { UpdateBuildpackConfigsInput } from '../types/build';

const baseInput: UpdateBuildpackConfigsInput = {
  componentId: 'demo-svc',
  versionId: '',
  buildContext: '',
  languageVersion: '',
  isUnitTestEnabled: true,
  pullLatestSubmodules: false,
  enableTrivyScan: false,
};

describe('updateBuildpackConfigs', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ success: true });
  });

  it('sends the unit test opt-in and build environment variables without row ids', async () => {
    await updateBuildpackConfigs({
      ...baseInput,
      environmentVariables: [
        { id: 'row-1', key: 'FOO', value: 'bar' },
        { key: 'MI_VERSION', value: '4.4.0' },
      ],
    });

    expect(put).toHaveBeenCalledWith('/components/demo-svc/buildpack-config', {
      isUnitTestEnabled: true,
      environmentVariables: [
        { key: 'FOO', value: 'bar' },
        { key: 'MI_VERSION', value: '4.4.0' },
      ],
    });
  });

  it('sends an empty list so removing every variable clears them', async () => {
    await updateBuildpackConfigs({ ...baseInput, environmentVariables: [] });

    expect(put.mock.calls[0][1]).toEqual({ isUnitTestEnabled: true, environmentVariables: [] });
  });

  it('sends neither setting when the panel could not load them', async () => {
    await updateBuildpackConfigs({ ...baseInput, isUnitTestEnabled: undefined, environmentVariables: undefined });

    expect(JSON.parse(JSON.stringify(put.mock.calls[0][1]))).toEqual({});
  });

  it('leaves the stored variables untouched when none are given', async () => {
    await updateBuildpackConfigs(baseInput);

    const body = put.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.parse(JSON.stringify(body))).toEqual({ isUnitTestEnabled: true });
  });
});
