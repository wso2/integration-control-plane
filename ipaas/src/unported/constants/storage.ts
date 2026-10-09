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

import { VolumeFormType, type VolumeAccessMode, type VolumeFormType as VolumeFormTypeT } from '../../types/storage';

export interface VolumeTypeCardInfo {
  value: VolumeFormTypeT;
  title: string;
  description: string;
  /** Disk + Persistent volumes require a private data plane. */
  pdpOnly: boolean;
}

export const VOLUME_TYPE_CARDS: VolumeTypeCardInfo[] = [
  {
    value: VolumeFormType.EmptyDirMemory,
    title: 'Empty Directory (In-Memory)',
    description: 'A fast temporary in-memory (tmpfs) storage location. This volume will be erased when the attached container is restarted or removed.',
    pdpOnly: false,
  },
  {
    value: VolumeFormType.EmptyDirDisk,
    title: 'Empty Directory (Disk)',
    description: 'A temporary storage location on disk. This volume will be destroyed when the attached container is restarted or removed.',
    pdpOnly: true,
  },
  {
    value: VolumeFormType.Pvc,
    title: 'Persistent Volume',
    description: 'A Persistent Volume on your Data Plane. This volume will be persisted even when the attached container is restarted or removed.',
    pdpOnly: true,
  },
];

export const VOLUME_ACCESS_MODES: VolumeAccessMode[] = ['ReadWriteMany', 'ReadOnlyMany', 'ReadWriteOnce'];

export const PVC_CAPACITY_MIN_GI = 1;
export const PVC_CAPACITY_MAX_GI = 500;
export const PVC_CAPACITY_DEFAULT_GI = 5;
