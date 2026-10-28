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

import { ScalingMethod } from '../types/scaling';

export interface ScalingMethodCard {
  value: typeof ScalingMethod.ScaleToZero | typeof ScalingMethod.HPA | typeof ScalingMethod.None;
  title: string;
  description: string;
}

export const SCALE_TO_ZERO_CARD: ScalingMethodCard = {
  value: ScalingMethod.ScaleToZero,
  title: 'Scale to Zero',
  description: 'Your deployment will automatically scale down to zero during inactivity and swiftly scale up upon receiving new requests.',
};

export const HPA_CARD: ScalingMethodCard = {
  value: ScalingMethod.HPA,
  title: 'HPA',
  description: 'Your deployment will automatically scale based on the CPU and memory usage.',
};

/** Cloud's HPA always scales on CPU, and on memory too when a memory target is set. */
export const CLOUD_HPA_CARD: ScalingMethodCard = {
  value: ScalingMethod.HPA,
  title: 'HPA',
  description: 'Your deployment will automatically scale between a minimum and maximum number of replicas based on CPU and, optionally, memory usage.',
};

export const NO_AUTOSCALING_CARD: ScalingMethodCard = {
  value: ScalingMethod.None,
  title: 'No Autoscaling',
  description: 'Your deployment runs with a fixed number of replicas.',
};

/** Cloud (shared) data planes cap max replicas; private data planes are effectively unbounded. */
export const CLOUD_DP_MAX_REPLICAS = 5;

export const CPU_THRESHOLD = { min: 10, max: 100, default: 50, step: 1 };
export const MEMORY_THRESHOLD = { min: 20, max: 200, default: 50, step: 1 };

/**
 * Cloud's memory target, relative to the memory request (which is also the limit, so 100 is the
 * ceiling). The runtimes hold most of their heap once warm, so a low target would pin a component
 * at its maximum replicas; the default stays high.
 */
export const CLOUD_MEMORY_THRESHOLD = { min: 20, max: 100, default: 80, step: 1 };
