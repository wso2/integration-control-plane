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

import type { ContainerWriteData, ReleaseContainer } from '../types/devopsConfigs';

// Resource bounds mirror Devant's containerUtils. CPU is in whole CPUs at the
// UI layer (0.01–4) and converted to milli-CPU (×1000) on the wire; memory is Mi.
// ipaas-service rejects sizes outside the same bounds, so change both together.
export const CPU_MIN = 0.01;
export const CPU_MAX = 4;
export const CPU_STEP = 0.01;
export const MEMORY_MIN = 20;
export const MEMORY_MAX = 8192;
export const MEMORY_STEP = 10;
/** Minimum gap enforced between a resource's request and limit. */
export const MIN_GAP_CPU = 0.01;
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

/** milli-CPU (wire) → CPU (display). */
export function milliToCpu(milli: number): number {
  return milli / 1000;
}

/** CPU (display) → milli-CPU (wire), rounded to the CPU step. */
export function cpuToMilli(cpu: number): number {
  return (Math.round((cpu + Number.EPSILON) * 100) / 100) * 1000;
}

/** The editable form state for a container. */
export interface ContainerFormState {
  imagePullPolicy: ContainerWriteData['image_pull_policy'];
  limitsEnabled: boolean;
  /** CPU request/limit in whole CPUs. */
  cpuRequest: number;
  cpuLimit: number;
  /** Memory request/limit in Mi. */
  memRequest: number;
  memLimit: number;
}

/** Seed the edit form from a container. When limits are disabled the API stores
 *  `0` for the limits, so we synthesise a sensible limit one step above the request. */
export function containerToForm(c: ReleaseContainer): ContainerFormState {
  const limitsEnabled = !(c.limit_disabled ?? false);
  const cpuRequest = milliToCpu(c.cpu ?? 0);
  const memRequest = c.memory ?? 0;
  return {
    imagePullPolicy: c.image_pull_policy ?? 'IfNotPresent',
    limitsEnabled,
    cpuRequest,
    cpuLimit: c.limit_disabled ? cpuRequest + CPU_STEP : milliToCpu(c.cpu_limit ?? 0),
    memRequest,
    memLimit: c.limit_disabled ? memRequest + MEMORY_STEP : (c.memory_limit ?? 0),
  };
}

/** Build the PUT body from form state. ipaas-service rejects any field it does not model, so the
 *  body carries only what the form edits. */
export function formToWriteData(form: ContainerFormState): ContainerWriteData {
  return {
    image_pull_policy: form.imagePullPolicy,
    cpu: cpuToMilli(form.cpuRequest),
    cpu_limit: form.limitsEnabled ? cpuToMilli(form.cpuLimit) : 0,
    memory: form.memRequest,
    memory_limit: form.limitsEnabled ? form.memLimit : 0,
  };
}
