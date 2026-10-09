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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createVolume, createVolumeMount, deleteVolume, deleteVolumeMount, listStorageClasses, listVolumeMounts, listVolumes, updateVolumeMount } from '#api/storage';
import { IS_WIP } from '../../features';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import type { VolumeCreateData, VolumeMountCreateData, VolumeMountPath, VolumeMountUpdateData } from '../../types/storage';

const ROOT = 'storage';

/** Storage is a wip-only surface for now (cloud/icp API stubs throw). */
export function isStorageEnabled(): boolean {
  return IS_WIP;
}

export function useVolumes(projectId: string, environmentId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'volumes', orgUuid, projectId, environmentId],
    queryFn: () => listVolumes(orgUuid!, projectId, environmentId),
    enabled: isStorageEnabled() && !!orgUuid && !!projectId && !!environmentId,
    retry: false,
  });
}

export function useVolumeMounts(projectId: string, componentId: string, releaseId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'mounts', orgUuid, projectId, componentId, releaseId],
    queryFn: () => listVolumeMounts(orgUuid!, projectId, componentId, releaseId),
    enabled: isStorageEnabled() && !!orgUuid && !!projectId && !!componentId && !!releaseId,
    retry: false,
  });
}

export function useStorageClasses(projectId: string, environmentId: string, enabled = true) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'storage-classes', orgUuid, projectId, environmentId],
    queryFn: () => listStorageClasses(orgUuid!, projectId, environmentId),
    enabled: isStorageEnabled() && enabled && !!orgUuid && !!projectId && !!environmentId,
    retry: false,
  });
}

export function useCreateVolume(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VolumeCreateData) => createVolume(orgUuid!, projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useDeleteVolume(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (volumeId: string) => deleteVolume(orgUuid!, projectId, volumeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useCreateVolumeMount(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: VolumeMountPath; data: VolumeMountCreateData }) => createVolumeMount(orgUuid!, projectId, vars.path, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useUpdateVolumeMount(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: VolumeMountPath; mountId: string; data: VolumeMountUpdateData }) => updateVolumeMount(orgUuid!, projectId, vars.path, vars.mountId, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useDeleteVolumeMount(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: VolumeMountPath; mountId: string }) => deleteVolumeMount(orgUuid!, projectId, vars.path, vars.mountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}
