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

import { VolumeFormType } from '../../types/storage';
import type { Volume, VolumeAccessMode, VolumeCreateData, VolumeFormType as VolumeFormTypeT, VolumeMount, VolumeRow } from '../../types/storage';

/** Human label for a persisted volume, derived from its type + backing. */
export function volumeTypeLabel(volume: Volume): string {
  switch (volume.type) {
    case 'PVC':
      return 'Persistent Volume';
    case 'NFS':
      return 'NFS Server';
    case 'HostPath':
      return 'Host Path';
    case 'EmptyDir': {
      const backing = volume.Volume as { emptyDir?: { medium?: string } };
      return backing.emptyDir?.medium === 'Memory' ? 'Empty Directory (In-Memory)' : 'Empty Directory (Disk)';
    }
    default:
      return volume.type;
  }
}

export interface BuildVolumeArgs {
  name: string;
  formType: VolumeFormTypeT;
  organizationUuid: string;
  projectId: string;
  /** Release id (the `app_environment_id`). */
  appEnvironmentId: string;
  environmentId: string;
  pvc?: { storageClassName: string; capacityGi: number; accessModes: VolumeAccessMode[] };
}

export function buildVolumeCreatePayload(args: BuildVolumeArgs): VolumeCreateData {
  const { name, formType, organizationUuid, projectId, appEnvironmentId, environmentId, pvc } = args;
  const base = {
    name: name.trim(),
    organization_id: organizationUuid,
    project_id: projectId,
    app_environment_id: appEnvironmentId,
    environment_id: environmentId,
    metadata: {},
  };
  if (formType === VolumeFormType.Pvc) {
    return {
      ...base,
      type: 'PVC',
      volume: { persistentVolumeClaim: { storageRequest: `${pvc?.capacityGi ?? 0}Gi`, accessModes: pvc?.accessModes ?? [], storageClassName: pvc?.storageClassName ?? '' } },
    };
  }
  const medium = formType === VolumeFormType.EmptyDirMemory ? 'Memory' : '';
  return { ...base, type: 'EmptyDir', volume: { emptyDir: { medium } } };
}

/** Join volumes with the mounts that reference them, keeping volumes owned by or mounted in this release. */
export function combineVolumesAndMounts(volumes: Volume[], mounts: VolumeMount[], releaseId: string): VolumeRow[] {
  return volumes.map((volume) => ({ volume, mounts: mounts.filter((m) => m.app_volume_id === volume.ID) })).filter((row) => row.volume.app_environment_id === releaseId || row.mounts.length > 0);
}

export function componentStorageBase(org: string, project: string, component: string): string {
  return `/organizations/${org}/projects/${project}/components/${component}/admin/storage`;
}

const K8S_NAME_RE = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;

/** Volume name — mirrors Devant's `validatek8sResourceName50`. Returns an error message or `undefined`. */
export function validateVolumeName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'This field is required';
  if (v.length > 50) return 'Maximum length of 50 characters exceeded';
  if (!K8S_NAME_RE.test(v)) return "Must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character";
  return undefined;
}

/** Mount path — mirrors Devant's `mountPathSchema` (required, must start with `/`). */
export function validateMountPath(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'This field is required';
  if (!v.startsWith('/')) return 'Mount path must start with /';
  return undefined;
}
