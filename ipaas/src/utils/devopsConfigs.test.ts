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
import {
  buildConfigRows,
  mainContainer,
  mountKind,
  parseDotEnv,
  validateConfigKey,
  validateDisplayName,
  validateMountDirectory,
  validateFileName,
  mountedFilePath,
  byteLength,
  formatBytes,
  configCounts,
  validateNewEnvGroupName,
  keyInOtherGroupError,
} from './devopsConfigs';

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

  it("rejects Ballerina's config env var names, and only those", () => {
    expect(validateConfigKey('BAL_CONFIG_FILES')).toMatch(/reserved for Ballerina/);
    expect(validateConfigKey('BAL_CONFIG_VAR_DB_PASSWORD')).toMatch(/reserved for Ballerina/);
    expect(validateConfigKey('BAL_CONFIG_FILESX')).toBe('');
    expect(validateConfigKey('bal_config_files')).toBe('');
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

describe('validateMountDirectory', () => {
  const invalid = 'Enter an absolute directory without a trailing slash, e.g. /app/configs.';

  it('requires a non-empty directory', () => {
    expect(validateMountDirectory('')).toBe('Mount directory is required.');
    expect(validateMountDirectory('   ')).toBe('Mount directory is required.');
  });

  it('rejects directories longer than 2048 characters', () => {
    expect(validateMountDirectory(`/${'a'.repeat(2048)}`)).toBe('Directory must be 2048 characters or fewer.');
  });

  it.each(['app/configs', '/app//configs', '/app/../configs', '/app/configs/', '/'])('rejects %s', (dir) => {
    expect(validateMountDirectory(dir)).toBe(invalid);
  });

  it.each(['/app/configs', '/conf', '/home/ballerina/.certs'])('accepts %s', (dir) => {
    expect(validateMountDirectory(dir)).toBe('');
  });
});

describe('validateFileName', () => {
  const invalid = 'Use letters, numbers, dots, hyphens and underscores, e.g. config.json.';

  it('requires a name', () => {
    expect(validateFileName('')).toBe('File name is required.');
  });

  it('rejects names longer than 253 characters', () => {
    expect(validateFileName('a'.repeat(254))).toBe('File name must be 253 characters or fewer.');
    expect(validateFileName('a'.repeat(253))).toBe('');
  });

  // The service and Kubernetes accept the same names: a ConfigMap key.
  it.each(['File Size Exceed', 'a/b.txt', 'a\\b.txt', '.', '..', 'naïve.txt', 'a:b'])('rejects %s', (name) => {
    expect(validateFileName(name)).toBe(invalid);
  });

  it('rejects the Ballerina config file', () => {
    expect(validateFileName('Config.toml')).toBe('"Config.toml" is reserved for Ballerina configuration.');
  });

  it.each(['config.json', 'ca-bundle_v2.pem', '.env'])('accepts %s', (name) => {
    expect(validateFileName(name)).toBe('');
  });
});

describe('mountedFilePath', () => {
  it('joins the directory and the file name as the container sees them', () => {
    expect(mountedFilePath('/app/configs', 'config.json')).toBe('/app/configs/config.json');
    expect(mountedFilePath('/test.txt', 'test')).toBe('/test.txt/test');
  });
});

describe('byteLength and formatBytes', () => {
  it('counts UTF-8 bytes, as the service does', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('é')).toBe(2);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(4096)).toBe('4 KB');
    expect(formatBytes(153600)).toBe('150 KB');
    expect(formatBytes(1536 + 100)).toBe('1.6 KB');
  });
});

describe('configCounts', () => {
  it('counts env-var groups and non-secret files', () => {
    const mounts = [
      { ID: 'db', configmap_id: 'db', secret_id: null, container_id: 'dev', app_environment_id: 'r', mount_path: '', config_key: '', mount_type: 'ENVFile', mount_permissions: '0000' },
      { ID: 'creds', configmap_id: null, secret_id: 'creds', container_id: 'dev', app_environment_id: 'r', mount_path: '', config_key: '', mount_type: 'ENVFile', mount_permissions: '0000' },
      { ID: 'a.json', configmap_id: 'a.json', secret_id: null, container_id: 'dev', app_environment_id: 'r', mount_path: '/conf', config_key: 'data', mount_type: 'File', mount_permissions: '0644' },
      { ID: 'b.key', configmap_id: null, secret_id: 'b.key', container_id: 'dev', app_environment_id: 'r', mount_path: '/conf', config_key: 'data', mount_type: 'File', mount_permissions: '0644' },
    ];
    expect(configCounts(buildConfigRows(mounts, [], []))).toEqual({ envGroupCount: 2, plainFileCount: 1 });
  });
});

describe('validateDisplayName', () => {
  it('requires a non-empty name', () => {
    expect(validateDisplayName('')).toBe('Name is required.');
    expect(validateDisplayName('   ')).toBe('Name is required.');
  });

  it('rejects names longer than 250 characters', () => {
    expect(validateDisplayName('a'.repeat(251))).toBe('Name must be 250 characters or fewer.');
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
    expect(validateNewEnvGroupName('')).toBe('Name is required.');
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

describe('keyInOtherGroupError', () => {
  it("names the group that already sets the key, or returns ''", () => {
    const other = new Map([['DB_URL', 'db-settings']]);
    expect(keyInOtherGroupError('DB_URL', other)).toBe('"DB_URL" is already set by the "db-settings" config.');
    expect(keyInOtherGroupError('HOST', other)).toBe('');
  });
});
