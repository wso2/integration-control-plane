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

import type { ContainerWriteData, ImagePullPolicy, ReleaseContainer } from '../types/devopsConfigs';

// Resource bounds. CPU is in milli-CPU, the unit on the wire, and shown in whole
// CPUs only through formatCpu; memory is Mi. ipaas-service rejects sizes outside
// the same bounds, so change both together.
export const CPU_MIN = 10;
export const CPU_MAX = 4000;
export const CPU_STEP = 10;
export const MEMORY_MIN = 20;
export const MEMORY_MAX = 8192;
export const MEMORY_STEP = 10;
/** Minimum gap enforced between a resource's request and limit. */
export const MIN_GAP_CPU = 10;
export const MIN_GAP_MEMORY = 10;

/** A container built from a user-supplied image (no platform build) has `custom_image`. */
export function hasCustomImage(c: Pick<ReleaseContainer, 'custom_image'>): boolean {
  return Boolean(c.custom_image);
}

/** The image reference to display — the custom image, else the built image's name+tag. */
export function containerImageName(c: ReleaseContainer): string | undefined {
  return hasCustomImage(c) ? c.custom_image : c.image?.image_name_with_tag;
}

export function isMainContainer(c: Pick<ReleaseContainer, 'type'>): boolean {
  return c.type === 'MAIN';
}

/** milli-CPU → whole CPUs for display, e.g. 125 → "0.125". */
export function formatCpu(milli: number): string {
  return String(milli / 1000);
}

/** The editable form state for a container, in the wire's units. */
export interface ContainerFormState {
  imagePullPolicy: ImagePullPolicy;
  /** CPU request/limit in milli-CPU. */
  cpuRequest: number;
  cpuLimit: number;
  /** Memory request/limit in Mi. */
  memRequest: number;
  memLimit: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/**
 * Seed the edit form from a container. Sizes outside the sliders' range (set before the range was
 * enforced, or missing and read as 0) are brought into it, request no greater than limit. Every size
 * goes out once any one is edited, so an out-of-range one would otherwise fail the save.
 */
export function containerToForm(c: ReleaseContainer): ContainerFormState {
  const cpuLimit = clamp(c.cpu_limit ?? 0, CPU_MIN, CPU_MAX);
  const memLimit = clamp(c.memory_limit ?? 0, MEMORY_MIN, MEMORY_MAX);
  return {
    imagePullPolicy: c.image_pull_policy ?? 'IfNotPresent',
    cpuRequest: clamp(c.cpu ?? 0, CPU_MIN, cpuLimit),
    cpuLimit,
    memRequest: clamp(c.memory ?? 0, MEMORY_MIN, memLimit),
    memLimit,
  };
}

/**
 * Build the PUT body from what changed since the form was seeded. Sending the sizes needs a paid
 * plan, so a pull-policy-only change leaves them out, and ipaas-service keeps the current ones.
 */
export function formToWriteData(form: ContainerFormState, initial: ContainerFormState): ContainerWriteData {
  const policy = form.imagePullPolicy !== initial.imagePullPolicy ? { image_pull_policy: form.imagePullPolicy } : {};
  const sizesChanged = form.cpuRequest !== initial.cpuRequest || form.cpuLimit !== initial.cpuLimit || form.memRequest !== initial.memRequest || form.memLimit !== initial.memLimit;
  if (!sizesChanged) return policy;
  return { ...policy, cpu: form.cpuRequest, cpu_limit: form.cpuLimit, memory: form.memRequest, memory_limit: form.memLimit };
}
