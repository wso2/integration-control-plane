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

import type { ByoiEndpointFileContents, CreateByoiComponentInput, CreateByoiComponentResult, DevopsVolume, DevopsVolumeMount, VolumeMountWriteData, VolumeWriteData } from '../types/tailscale';

// Intentionally a stub: the BFF has no endpoints for this yet, so every call throws via ni().
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] tailscale.${name}: not implemented`));

export const getSampleRegistryId = (_orgUuid: string): Promise<string> => ni('getSampleRegistryId');
export const createByoiComponent = (_input: CreateByoiComponentInput): Promise<CreateByoiComponentResult> => ni('createByoiComponent');
export const deployByoiImage = (_componentId: string, _releaseId: string, _imageUrl: string): Promise<{ message: string; success: boolean }> => ni('deployByoiImage');
export const createVolume = (_orgUuid: string, _projectId: string, _data: VolumeWriteData): Promise<DevopsVolume> => ni('createVolume');
export const mountVolume = (_orgUuid: string, _projectId: string, _path: { appId: string; appEnvId: string; containerId: string }, _data: VolumeMountWriteData): Promise<DevopsVolumeMount> => ni('mountVolume');
export const getByoiEndpointsYaml = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string): Promise<ByoiEndpointFileContents> => ni('getByoiEndpointsYaml');
export const updateByoiEndpointsYaml = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string, _endpointsYaml: string): Promise<void> => ni('updateByoiEndpointsYaml');
