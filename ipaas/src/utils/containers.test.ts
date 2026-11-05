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

import { describe, it, expect } from 'vitest';
import { containerImageName, containerToForm, cpuToMilli, formToWriteData, hasCustomImage, isMainContainer, milliToCpu } from './containers';
import type { ReleaseContainer } from '../types/devopsConfigs';

const baseContainer: ReleaseContainer = {
  ID: 'c1',
  name: 'main-1',
  type: 'MAIN',
  cpu: 210,
  cpu_limit: 500,
  memory: 350,
  memory_limit: 1024,
  limit_disabled: false,
  image_pull_policy: 'IfNotPresent',
  command: ['some', 'one'],
  args: ['hiii'],
  ports: [],
};

describe('cpu conversions', () => {
  it('converts milli-CPU to CPU and back', () => {
    expect(milliToCpu(210)).toBe(0.21);
    expect(cpuToMilli(0.21)).toBe(210);
    expect(cpuToMilli(0.5)).toBe(500);
  });
});

describe('image helpers', () => {
  it('prefers custom_image, else the built image name', () => {
    expect(hasCustomImage({ custom_image: 'x' })).toBe(true);
    expect(hasCustomImage({ custom_image: '' })).toBe(false);
    expect(containerImageName({ ...baseContainer, custom_image: 'my/img:1' })).toBe('my/img:1');
    expect(containerImageName({ ...baseContainer, custom_image: '', image: { image_name_with_tag: 'reg/app:tag' } })).toBe('reg/app:tag');
  });

  it('identifies the main container', () => {
    expect(isMainContainer({ type: 'MAIN' })).toBe(true);
    expect(isMainContainer({ type: 'INIT' })).toBe(false);
  });
});

describe('containerToForm / formToWriteData', () => {
  it('seeds the form from a container with limits enabled', () => {
    const form = containerToForm(baseContainer);
    expect(form).toMatchObject({
      imagePullPolicy: 'IfNotPresent',
      limitsEnabled: true,
      cpuRequest: 0.21,
      cpuLimit: 0.5,
      memRequest: 350,
      memLimit: 1024,
    });
  });

  it('synthesises a limit one step above request when limits are disabled', () => {
    const form = containerToForm({ ...baseContainer, limit_disabled: true, cpu: 100, cpu_limit: 0, memory: 350, memory_limit: 0 });
    expect(form.limitsEnabled).toBe(false);
    expect(form.cpuLimit).toBeCloseTo(0.11, 5);
    expect(form.memLimit).toBe(360);
  });

  it('builds the PUT body from the edited fields only, scaling CPU to milli', () => {
    const container: ReleaseContainer = { ...baseContainer, ports: [{ name: 'endpoint-9090', port: 9090, service_port: 9090, protocol: 'TCP' }] };
    const body = formToWriteData(containerToForm(container));
    // The container's command, args and ports are not sent.
    expect(body).toEqual({
      image_pull_policy: 'IfNotPresent',
      cpu: 210,
      cpu_limit: 500,
      memory: 350,
      memory_limit: 1024,
    });
  });

  it('zeroes the limits when limits are off', () => {
    const form = { ...containerToForm(baseContainer), limitsEnabled: false };
    const body = formToWriteData(form);
    expect(body.cpu_limit).toBe(0);
    expect(body.memory_limit).toBe(0);
    // request values still sent
    expect(body.cpu).toBe(210);
    expect(body.memory).toBe(350);
  });
});
