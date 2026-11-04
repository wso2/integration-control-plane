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

import type { PaletteColor } from '../config/statusColors';

/** Provisioning milestones (percent complete) for a Private Data Plane. */
export const PDP_PROVISION_STEPS: { name: string; completedAtProgress: number }[] = [
  { name: 'Provisioning a dedicated cloud account', completedAtProgress: 3 },
  { name: 'Generating Infrastructure-as-Code (IaC) for the PDP', completedAtProgress: 5 },
  { name: 'Initializing IaC state', completedAtProgress: 10 },
  { name: 'Bootstrapping infrastructure and setting up Kubernetes', completedAtProgress: 30 },
  { name: 'Installing Vault and the Flux system', completedAtProgress: 50 },
  { name: 'Registering the new PDP in the Choreo control plane', completedAtProgress: 55 },
  { name: 'Injecting Choreo system secrets to the Vault', completedAtProgress: 60 },
  { name: 'Installing the Choreo system components on the cluster', completedAtProgress: 65 },
  { name: 'Installing Cilium CNI and configuring network policies', completedAtProgress: 70 },
  { name: 'Verifying system installation', completedAtProgress: 80 },
  { name: 'Setting up health monitors for the PDP', completedAtProgress: 90 },
  { name: 'Finalizing the PDP provisioning process', completedAtProgress: 100 },
];

/** Show at least 1% so a freshly-started PDP doesn't read as 0%. */
export function displayPdpProgress(progress: number): number {
  return progress === 0 ? 1 : progress;
}

/** PDP creationStatus → chip label + palette colour. */
export function pdpStatusChip(status: string): { label: string; color: PaletteColor } {
  switch (status) {
    case 'IN_PROGRESS':
      return { label: 'Provisioning', color: 'info' };
    case 'SUCCESS':
      return { label: 'Success', color: 'success' };
    case 'FAILURE':
      return { label: 'Failed — contact support', color: 'error' };
    case 'PENDING':
      return { label: 'Pending', color: 'secondary' };
    default:
      return { label: status, color: 'default' };
  }
}
