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

import type { StorageClass, Volume, VolumeCreateData, VolumeMount, VolumeMountCreateData, VolumeMountPath, VolumeMountUpdateData } from '../types/storage';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] storage.${name}: not implemented`));

export const listVolumes = (_orgUuid: string, _projectId: string, _environmentId: string): Promise<Volume[]> => ni('listVolumes');
export const createVolume = (_orgUuid: string, _projectId: string, _data: VolumeCreateData): Promise<Volume> => ni('createVolume');
export const deleteVolume = (_orgUuid: string, _projectId: string, _volumeId: string): Promise<void> => ni('deleteVolume');
export const listVolumeMounts = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string): Promise<VolumeMount[]> => ni('listVolumeMounts');
export const createVolumeMount = (_orgUuid: string, _projectId: string, _path: VolumeMountPath, _data: VolumeMountCreateData): Promise<VolumeMount> => ni('createVolumeMount');
export const updateVolumeMount = (_orgUuid: string, _projectId: string, _path: VolumeMountPath, _mountId: string, _data: VolumeMountUpdateData): Promise<VolumeMount> => ni('updateVolumeMount');
export const deleteVolumeMount = (_orgUuid: string, _projectId: string, _path: VolumeMountPath, _mountId: string): Promise<void> => ni('deleteVolumeMount');
export const listStorageClasses = (_orgUuid: string, _projectId: string, _environmentId: string): Promise<StorageClass[]> => ni('listStorageClasses');
