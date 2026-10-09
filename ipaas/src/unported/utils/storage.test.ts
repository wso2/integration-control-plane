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

import { describe, expect, it } from 'vitest';
import { buildVolumeCreatePayload, combineVolumesAndMounts, validateMountPath, validateVolumeName, volumeTypeLabel } from './storage';
import { VolumeFormType } from '../../types/storage';
import type { Volume, VolumeMount } from '../../types/storage';

const base = { name: 'vol', organizationUuid: 'org', projectId: 'proj', appEnvironmentId: 'rel', environmentId: 'env' };

describe('buildVolumeCreatePayload', () => {
  it('in-memory → EmptyDir with medium Memory', () => {
    const p = buildVolumeCreatePayload({ ...base, formType: VolumeFormType.EmptyDirMemory });
    expect(p.type).toBe('EmptyDir');
    expect(p.volume).toEqual({ emptyDir: { medium: 'Memory' } });
    expect(p.app_environment_id).toBe('rel');
    expect(p.environment_id).toBe('env');
  });

  it('disk → EmptyDir with empty medium', () => {
    const p = buildVolumeCreatePayload({ ...base, formType: VolumeFormType.EmptyDirDisk });
    expect(p.volume).toEqual({ emptyDir: { medium: '' } });
  });

  it('pvc → PVC with storageRequest/accessModes/storageClassName', () => {
    const p = buildVolumeCreatePayload({ ...base, formType: VolumeFormType.Pvc, pvc: { storageClassName: 'standard', capacityGi: 5, accessModes: ['ReadWriteOnce'] } });
    expect(p.type).toBe('PVC');
    expect(p.volume).toEqual({ persistentVolumeClaim: { storageRequest: '5Gi', accessModes: ['ReadWriteOnce'], storageClassName: 'standard' } });
  });
});

describe('volumeTypeLabel', () => {
  const mk = (type: Volume['type'], V: Volume['Volume']): Volume => ({ ID: 'v', name: 'n', type, organization_id: 'o', project_id: 'p', app_environment_id: 'r', environment_id: 'e', Volume: V });
  it('labels each backing', () => {
    expect(volumeTypeLabel(mk('EmptyDir', { emptyDir: { medium: 'Memory' } }))).toBe('Empty Directory (In-Memory)');
    expect(volumeTypeLabel(mk('EmptyDir', { emptyDir: { medium: '' } }))).toBe('Empty Directory (Disk)');
    expect(volumeTypeLabel(mk('PVC', { persistentVolumeClaim: { accessModes: [], storageClassName: '', storageRequest: '5Gi' } }))).toBe('Persistent Volume');
  });
});

describe('combineVolumesAndMounts', () => {
  const vol = (ID: string, rel: string): Volume => ({ ID, name: ID, type: 'EmptyDir', organization_id: 'o', project_id: 'p', app_environment_id: rel, environment_id: 'e', Volume: { emptyDir: { medium: 'Memory' } } });
  const mount = (ID: string, app_volume_id: string): VolumeMount => ({ ID, MountPath: '/x', ReadOnly: false, app_volume_id, container_id: 'c' });

  it('joins mounts to their volume and keeps this-release volumes', () => {
    const rows = combineVolumesAndMounts([vol('a', 'rel'), vol('b', 'other')], [mount('m1', 'a')], 'rel');
    expect(rows).toHaveLength(1);
    expect(rows[0].volume.ID).toBe('a');
    expect(rows[0].mounts.map((m) => m.ID)).toEqual(['m1']);
  });

  it('keeps a shared volume when it is mounted in this release', () => {
    const rows = combineVolumesAndMounts([vol('b', 'other')], [mount('m2', 'b')], 'rel');
    expect(rows).toHaveLength(1);
    expect(rows[0].volume.ID).toBe('b');
  });
});

describe('validateVolumeName', () => {
  it('accepts valid k8s-style names', () => {
    expect(validateVolumeName('my-vol')).toBeUndefined();
    expect(validateVolumeName('a1')).toBeUndefined();
  });
  it('requires a value', () => {
    expect(validateVolumeName('   ')).toBeDefined();
  });
  it('rejects >50 chars', () => {
    expect(validateVolumeName('a'.repeat(50))).toBeUndefined();
    expect(validateVolumeName('a'.repeat(51))).toBeDefined();
  });
  it('rejects invalid formats (uppercase, leading digit, trailing hyphen)', () => {
    expect(validateVolumeName('MyVol')).toBeDefined();
    expect(validateVolumeName('1vol')).toBeDefined();
    expect(validateVolumeName('vol-')).toBeDefined();
  });
});

describe('validateMountPath', () => {
  it('accepts absolute paths', () => {
    expect(validateMountPath('/data')).toBeUndefined();
    expect(validateMountPath('/tmp/cache')).toBeUndefined();
  });
  it('requires a value and a leading slash', () => {
    expect(validateMountPath('')).toBeDefined();
    expect(validateMountPath('data')).toBeDefined();
  });
});
