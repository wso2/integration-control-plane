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
import type { DevopsConfigMap, DevopsConfigMount, DevopsSecret, ReleaseContainer } from '../types/devopsConfigs';
import { buildConfigRows, mainContainer, mountKind, parseDotEnv, validateConfigKey, validateDisplayName, validateMountPath, validateNewEnvGroupName } from './devopsConfigs';

const makeContainer = (overrides: Partial<ReleaseContainer>): ReleaseContainer => ({
  ID: 'c1',
  name: 'container-1',
  ...overrides,
});

const makeMount = (overrides: Partial<DevopsConfigMount>): DevopsConfigMount => ({
  ID: 'm1',
  configmap_id: null,
  secret_id: null,
  container_id: 'c1',
  app_environment_id: 'env-1',
  mount_path: '/app/config.json',
  config_key: 'config',
  mount_type: 'EnvVar',
  mount_permissions: null,
  ...overrides,
});

const makeConfigMap = (overrides: Partial<DevopsConfigMap>): DevopsConfigMap => ({
  ID: 'cm1',
  name: 'my-configmap',
  environment_id: 'env-1',
  app_environment_id: 'env-1',
  version: 1,
  config_type: 'Variable',
  ...overrides,
});

const makeSecret = (overrides: Partial<DevopsSecret>): DevopsSecret => ({
  ID: 's1',
  name: 'my-secret',
  environment_id: 'env-1',
  app_environment_id: 'env-1',
  keys: ['KEY1'],
  version: 1,
  config_type: 'Variable',
  secret_type: 'Generic',
  ...overrides,
});

describe('mainContainer', () => {
  it('finds the container with type MAIN', () => {
    const containers = [makeContainer({ ID: 'c1', type: 'SIDECAR' }), makeContainer({ ID: 'c2', type: 'MAIN' })];
    expect(mainContainer(containers)?.ID).toBe('c2');
  });

  it('finds the container with lowercase type main', () => {
    const containers = [makeContainer({ ID: 'c1', type: 'sidecar' }), makeContainer({ ID: 'c2', type: 'main' })];
    expect(mainContainer(containers)?.ID).toBe('c2');
  });

  it('falls back to the first container when none is MAIN', () => {
    const containers = [makeContainer({ ID: 'c1', type: 'SIDECAR' }), makeContainer({ ID: 'c2', type: 'OTHER' })];
    expect(mainContainer(containers)?.ID).toBe('c1');
  });

  it('returns undefined for an empty list', () => {
    expect(mainContainer([])).toBeUndefined();
  });

  it('returns undefined when containers is undefined', () => {
    expect(mainContainer(undefined)).toBeUndefined();
  });
});

describe('validateConfigKey', () => {
  it('requires a non-empty key', () => {
    expect(validateConfigKey('')).toBe('Key is required.');
    expect(validateConfigKey('   ')).toBe('Key is required.');
  });

  it('rejects keys longer than 250 characters', () => {
    expect(validateConfigKey('a'.repeat(251))).toBe('Key must be 250 characters or fewer.');
  });

  it('accepts a key at exactly 250 characters', () => {
    expect(validateConfigKey('a'.repeat(250))).toBe('');
  });

  it('rejects keys that do not match the env-var pattern', () => {
    expect(validateConfigKey('1KEY')).toBe('Use letters, numbers, and underscores; must start with a letter or underscore.');
    expect(validateConfigKey('MY-KEY')).toBe('Use letters, numbers, and underscores; must start with a letter or underscore.');
    expect(validateConfigKey('MY KEY')).toBe('Use letters, numbers, and underscores; must start with a letter or underscore.');
  });

  it('accepts a valid env-var key', () => {
    expect(validateConfigKey('MY_KEY_1')).toBe('');
    expect(validateConfigKey('_PRIVATE')).toBe('');
  });
});

describe('validateMountPath', () => {
  it('requires a non-empty path', () => {
    expect(validateMountPath('')).toBe('Mount path is required.');
    expect(validateMountPath('   ')).toBe('Mount path is required.');
  });

  it('rejects paths longer than 2048 characters', () => {
    const longPath = `/${'a'.repeat(2048)}`;
    expect(validateMountPath(longPath)).toBe('Path must be 2048 characters or fewer.');
  });

  it('rejects a relative path', () => {
    expect(validateMountPath('app/config.json')).toBe('Enter an absolute path including the filename, e.g. /app/configs/config.json.');
  });

  it('rejects a path with a double slash', () => {
    expect(validateMountPath('/app//config.json')).toBe('Enter an absolute path including the filename, e.g. /app/configs/config.json.');
  });

  it('rejects a path with a parent-directory segment', () => {
    expect(validateMountPath('/app/../config.json')).toBe('Enter an absolute path including the filename, e.g. /app/configs/config.json.');
  });

  it('rejects a path with a trailing slash', () => {
    expect(validateMountPath('/app/configs/')).toBe('Enter an absolute path including the filename, e.g. /app/configs/config.json.');
  });

  it('accepts a valid absolute path', () => {
    expect(validateMountPath('/app/configs/config.json')).toBe('');
  });
});

describe('validateDisplayName', () => {
  it('requires a non-empty name', () => {
    expect(validateDisplayName('')).toBe('Display name is required.');
    expect(validateDisplayName('   ')).toBe('Display name is required.');
  });

  it('rejects names longer than 250 characters', () => {
    expect(validateDisplayName('a'.repeat(251))).toBe('Display name must be 250 characters or fewer.');
  });

  it('accepts a name at exactly 250 characters', () => {
    expect(validateDisplayName('a'.repeat(250))).toBe('');
  });

  it('accepts a valid display name', () => {
    expect(validateDisplayName('My Config')).toBe('');
  });
});

describe('validateNewEnvGroupName', () => {
  it('rejects the mi- prefix the MI configure drawer owns, in any case', () => {
    expect(validateNewEnvGroupName('mi-env-vars')).toBe('Names starting with "mi-" are reserved for MI configuration.');
    expect(validateNewEnvGroupName(' MI-secret-TOKEN')).toBe('Names starting with "mi-" are reserved for MI configuration.');
  });

  it('accepts other names, including ones that only contain mi-', () => {
    expect(validateNewEnvGroupName('admin-settings')).toBe('');
    expect(validateNewEnvGroupName('mini')).toBe('');
  });

  it('applies the display name rules first', () => {
    expect(validateNewEnvGroupName('')).toBe('Display name is required.');
  });
});

describe('parseDotEnv', () => {
  it('parses simple key=value lines', () => {
    expect(parseDotEnv('KEY1=value1\nKEY2=value2')).toEqual([
      { key: 'KEY1', value: 'value1' },
      { key: 'KEY2', value: 'value2' },
    ]);
  });

  it('skips blank lines and comments', () => {
    expect(parseDotEnv('KEY1=value1\n\n# a comment\nKEY2=value2')).toEqual([
      { key: 'KEY1', value: 'value1' },
      { key: 'KEY2', value: 'value2' },
    ]);
  });

  it('trims whitespace around keys and values', () => {
    expect(parseDotEnv('  KEY1  =  value1  ')).toEqual([{ key: 'KEY1', value: 'value1' }]);
  });

  it('strips matching double or single quotes around the value', () => {
    expect(parseDotEnv('KEY1="value1"\nKEY2=\'value2\'')).toEqual([
      { key: 'KEY1', value: 'value1' },
      { key: 'KEY2', value: 'value2' },
    ]);
  });

  it('skips lines without an equals sign', () => {
    expect(parseDotEnv('NOT_A_PAIR')).toEqual([]);
  });

  it('skips lines where the equals sign is the first character', () => {
    expect(parseDotEnv('=value')).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    expect(parseDotEnv('KEY1=value1\r\nKEY2=value2')).toEqual([
      { key: 'KEY1', value: 'value1' },
      { key: 'KEY2', value: 'value2' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseDotEnv('')).toEqual([]);
  });

  it('keeps the rest of the value when it contains additional equals signs', () => {
    expect(parseDotEnv('KEY1=a=b=c')).toEqual([{ key: 'KEY1', value: 'a=b=c' }]);
  });
});

describe('mountKind', () => {
  it('returns fileMount for File mount_type', () => {
    expect(mountKind(makeMount({ mount_type: 'File' }))).toBe('fileMount');
  });

  it('returns envVars for any non-File mount_type', () => {
    expect(mountKind(makeMount({ mount_type: 'EnvVar' }))).toBe('envVars');
    expect(mountKind(makeMount({ mount_type: 'file' }))).toBe('envVars');
  });
});

describe('buildConfigRows', () => {
  it('joins a configmap mount with its configmap source', () => {
    const mounts = [makeMount({ configmap_id: 'cm1', secret_id: null, mount_type: 'EnvVar' })];
    const configMaps = [makeConfigMap({ ID: 'cm1', name: 'my-configmap', keys: ['A', 'B'] })];
    const rows = buildConfigRows(mounts, configMaps, []);
    expect(rows).toEqual([
      {
        mount: mounts[0],
        isSecret: false,
        kind: 'envVars',
        name: 'my-configmap',
        keys: ['A', 'B'],
      },
    ]);
  });

  it('joins a secret mount with its secret source', () => {
    const mounts = [makeMount({ configmap_id: null, secret_id: 's1', mount_type: 'File' })];
    const secrets = [makeSecret({ ID: 's1', name: 'my-secret', keys: ['SECRET_KEY'] })];
    const rows = buildConfigRows(mounts, [], secrets);
    expect(rows).toEqual([
      {
        mount: mounts[0],
        isSecret: true,
        kind: 'fileMount',
        name: 'my-secret',
        keys: ['SECRET_KEY'],
      },
    ]);
  });

  it('falls back to the id and empty keys when the source is not found', () => {
    const mounts = [makeMount({ configmap_id: 'missing-cm', secret_id: null })];
    const rows = buildConfigRows(mounts, [], []);
    expect(rows[0].name).toBe('missing-cm');
    expect(rows[0].keys).toEqual([]);
  });

  it('falls back to the em dash when neither an id nor a source is present', () => {
    const mounts = [makeMount({ configmap_id: null, secret_id: null })];
    const rows = buildConfigRows(mounts, [], []);
    expect(rows[0].name).toBe('—');
  });

  it('returns an empty array for an empty mounts list', () => {
    expect(buildConfigRows([], [], [])).toEqual([]);
  });
});
