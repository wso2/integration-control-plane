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

import type { ArtifactToggleKind, ArtifactToggleStatusInput } from '../types/artifact';

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] artifactToggleMutations.${name}: not implemented`));
// Synchronous stubs can't reject, so they throw.
const niSync = (name: string): never => {
  throw new Error(`[cloud] artifactToggleMutations.${name}: not implemented`);
};

export const toBackendArtifactType = (_artifactType: string): string => niSync('toBackendArtifactType');
export const updateArtifactToggleStatus = (_kind: ArtifactToggleKind, _input: ArtifactToggleStatusInput): Promise<{ status: string; message: string }> => ni('updateArtifactToggleStatus');
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export const TOGGLE_CONFIG: any = {};
