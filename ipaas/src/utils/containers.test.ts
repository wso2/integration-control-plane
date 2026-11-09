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
import { CPU_MAX, CPU_MIN, CPU_STEP, MEMORY_MAX, MEMORY_MIN, containerImageName, containerToForm, formatCpu, formToWriteData, hasCustomImage, isMainContainer } from './containers';
import type { ReleaseContainer } from '../types/devopsConfigs';

const baseContainer: ReleaseContainer = {
  ID: 'c1',
  name: 'main-1',
  type: 'MAIN',
  cpu: 210,
  cpu_limit: 500,
  memory: 350,
  memory_limit: 1024,
  image_pull_policy: 'IfNotPresent',
  command: ['some', 'one'],
  args: ['hiii'],
  ports: [{ name: 'endpoint-9090', port: 9090, service_port: 9090, protocol: 'TCP' }],
};

describe('formatCpu', () => {
  it('shows milli-CPU as whole CPUs', () => {
    expect(formatCpu(210)).toBe('0.21');
    expect(formatCpu(125)).toBe('0.125');
    expect(formatCpu(2010)).toBe('2.01');
    expect(formatCpu(4000)).toBe('4');
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
  it('seeds the form in the wire units', () => {
    expect(containerToForm(baseContainer)).toEqual({
      imagePullPolicy: 'IfNotPresent',
      cpuRequest: 210,
      cpuLimit: 500,
      memRequest: 350,
      memLimit: 1024,
    });
  });

  it('sends only the pull policy when only the pull policy changed', () => {
    const initial = containerToForm(baseContainer);
    const body = formToWriteData({ ...initial, imagePullPolicy: 'Always' }, initial);
    expect(body).toEqual({ image_pull_policy: 'Always' });
  });

  it('sends all four sizes when one changed, and leaves out an unchanged pull policy', () => {
    const initial = containerToForm(baseContainer);
    const body = formToWriteData({ ...initial, memLimit: 2048 }, initial);
    expect(body).toEqual({ cpu: 210, cpu_limit: 500, memory: 350, memory_limit: 2048 });
  });

  it('sends the pull policy and the sizes when both changed', () => {
    const initial = containerToForm(baseContainer);
    const body = formToWriteData({ ...initial, imagePullPolicy: 'Always', cpuLimit: 1000 }, initial);
    expect(body).toEqual({ image_pull_policy: 'Always', cpu: 210, cpu_limit: 1000, memory: 350, memory_limit: 1024 });
  });

  it('sends unedited sizes back exactly, even off the slider step', () => {
    // A size set through the API or MCP need not be a multiple of 10m.
    const initial = containerToForm({ ...baseContainer, cpu: 125, cpu_limit: 125 });
    const body = formToWriteData({ ...initial, memLimit: 2048 }, initial);
    expect(body).toMatchObject({ cpu: 125, cpu_limit: 125 });
  });

  it('sends integer milli-CPU for every slider step', () => {
    const initial = containerToForm(baseContainer);
    for (let milli = CPU_MIN; milli <= CPU_MAX; milli += CPU_STEP) {
      const body = formToWriteData({ ...initial, cpuRequest: milli, cpuLimit: milli }, initial);
      expect(Number.isInteger(body.cpu)).toBe(true);
      expect(Number.isInteger(body.cpu_limit)).toBe(true);
    }
  });

  it('never sends command, args or ports', () => {
    const initial = containerToForm(baseContainer);
    const body = formToWriteData({ ...initial, imagePullPolicy: 'Always', memLimit: 2048 }, initial);
    expect(Object.keys(body).sort()).toEqual(['cpu', 'cpu_limit', 'image_pull_policy', 'memory', 'memory_limit']);
  });

  it('brings stored sizes above the range into it, so editing another size can be saved', () => {
    const initial = containerToForm({ ...baseContainer, cpu: 64000, cpu_limit: 64000, memory: 262144, memory_limit: 262144 });
    expect(initial).toMatchObject({ cpuRequest: CPU_MAX, cpuLimit: CPU_MAX, memRequest: MEMORY_MAX, memLimit: MEMORY_MAX });
    const body = formToWriteData({ ...initial, memRequest: 512, memLimit: 1024 }, initial);
    expect(body).toEqual({ cpu: CPU_MAX, cpu_limit: CPU_MAX, memory: 512, memory_limit: 1024 });
  });

  it('raises missing or zero sizes to the minimum', () => {
    const { cpu: _cpu, cpu_limit: _cpuLimit, ...noCpu } = baseContainer;
    expect(containerToForm({ ...noCpu, memory: 0, memory_limit: 0 })).toMatchObject({ cpuRequest: CPU_MIN, cpuLimit: CPU_MIN, memRequest: MEMORY_MIN, memLimit: MEMORY_MIN });
  });

  it('keeps the request no greater than the limit', () => {
    expect(containerToForm({ ...baseContainer, cpu: 3000, cpu_limit: 2000, memory: 64000, memory_limit: 4096 })).toMatchObject({
      cpuRequest: 2000,
      cpuLimit: 2000,
      memRequest: 4096,
      memLimit: 4096,
    });
  });

  it('still sends only the pull policy when the stored sizes are out of range', () => {
    const initial = containerToForm({ ...baseContainer, cpu: 64000, cpu_limit: 64000 });
    expect(formToWriteData({ ...initial, imagePullPolicy: 'Always' }, initial)).toEqual({ image_pull_policy: 'Always' });
  });
});
