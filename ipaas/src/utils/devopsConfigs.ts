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

import type { ConfigKind, ConfigRow, DevopsConfigMap, DevopsConfigMount, DevopsSecret, ReleaseContainer } from '../types/devopsConfigs';

const MAIN_CONTAINER_TYPES = new Set(['MAIN', 'main']);

/** The container that configs/secrets mount onto — the MAIN one, or the first. */
export function mainContainer(containers: ReleaseContainer[] | undefined): ReleaseContainer | undefined {
  const list = containers ?? [];
  return list.find((c) => MAIN_CONTAINER_TYPES.has(c.type ?? '')) ?? list[0];
}

// Env-var key rule (Devant `envKeyNameValidationSchema`). Stricter than the
// backend's `^[-._a-zA-Z0-9]+$` (verified via HAR 400 on a space), so it both
// satisfies the backend and enforces valid env-var names (no leading digit, no
// `-`/`.`, no spaces).
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Absolute directory below the root: no `//`, no `..`, no trailing slash.
const MOUNT_DIRECTORY_RE = /^\/(?!\/)(?!.*\/\.\.)(?!.*\/$)[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
// The file name is the key of the ConfigMap or Secret holding the file; Kubernetes refuses
// any other key, and the whole deployment's apply fails with it.
const FILE_NAME_RE = /^[A-Za-z0-9._-]+$/;
const RESERVED_FILE_NAME = 'Config.toml';

// A Ballerina config save rebuilds these env vars and drops any other entry with
// their names, so an env-var group can't use them (the BFF rejects them too).
export const isBallerinaConfigKey = (key: string): boolean => key === 'BAL_CONFIG_FILES' || key.startsWith('BAL_CONFIG_VAR_');

export function validateConfigKey(key: string): string {
  if (!key.trim()) return 'Key is required.';
  if (key.length > 250) return 'Key must be 250 characters or fewer.';
  if (!ENV_KEY_RE.test(key)) return 'Use letters, numbers, and underscores; must start with a letter or underscore.';
  if (isBallerinaConfigKey(key)) return `"${key}" is reserved for Ballerina configuration.`;
  return '';
}

/**
 * The error for a key that another env-var group already sets, or ''. All groups'
 * keys go into the same container env, so a key can belong to one group only; the
 * BFF rejects a second one. `otherGroupKeys` maps each such key to its group's name.
 */
export function keyInOtherGroupError(key: string, otherGroupKeys: ReadonlyMap<string, string>): string {
  const group = otherGroupKeys.get(key);
  return group === undefined ? '' : `"${key}" is already set by the "${group}" config.`;
}

export function validateMountDirectory(path: string): string {
  if (!path.trim()) return 'Mount directory is required.';
  if (path.length > 2048) return 'Directory must be 2048 characters or fewer.';
  if (!MOUNT_DIRECTORY_RE.test(path)) return 'Enter an absolute directory without a trailing slash, e.g. /app/configs.';
  return '';
}

export function validateFileName(name: string): string {
  if (!name) return 'File name is required.';
  if (name.length > 253) return 'File name must be 253 characters or fewer.';
  if (!FILE_NAME_RE.test(name) || name === '.' || name === '..') return 'Use letters, numbers, dots, hyphens and underscores, e.g. config.json.';
  if (name === RESERVED_FILE_NAME) return `"${RESERVED_FILE_NAME}" is reserved for Ballerina configuration.`;
  return '';
}

/** Where a mounted file appears in the container. */
export const mountedFilePath = (directory: string, fileName: string): string => `${directory.replace(/\/+$/, '')}/${fileName}`;

/** Bytes of a string as UTF-8, which is how the service counts the limits. */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
}

export function validateDisplayName(name: string): string {
  if (!name.trim()) return 'Name is required.';
  if (name.length > 250) return 'Name must be 250 characters or fewer.';
  return '';
}

// The MI configure drawer owns env-var groups named `mi-env-vars`, `mi-secrets` and the
// older `mi-secret-<KEY>` (miConfigs.ts) and would adopt, and may delete, a user's group
// with such a name.
const MI_GROUP_PREFIX = 'mi-';

/** `validateDisplayName` for a new env-var group, whose display name becomes its group name. */
export function validateNewEnvGroupName(name: string): string {
  const err = validateDisplayName(name);
  if (err) return err;
  if (name.trim().toLowerCase().startsWith(MI_GROUP_PREFIX)) return `Names starting with "${MI_GROUP_PREFIX}" are reserved for MI configuration.`;
  return '';
}

/** Parse a `.env` file body into key/value rows, skipping comments and blanks. */
export function parseDotEnv(text: string): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key) rows.push({ key, value });
  }
  return rows;
}

/** Whether a mount injects env vars or a file, from its `mount_type`. */
export function mountKind(mount: DevopsConfigMount): ConfigKind {
  return mount.mount_type === 'File' ? 'fileMount' : 'envVars';
}

/** What an environment holds that the plan's limits count: env-var groups, and files that are not secret. */
export function configCounts(rows: ConfigRow[]): { envGroupCount: number; plainFileCount: number } {
  return { envGroupCount: rows.filter((r) => r.kind === 'envVars').length, plainFileCount: rows.filter((r) => r.kind === 'fileMount' && !r.isSecret).length };
}

/** Join a component's config-mounts with the env's configmaps/secrets for display. */
export function buildConfigRows(mounts: DevopsConfigMount[], configMaps: DevopsConfigMap[], secrets: DevopsSecret[]): ConfigRow[] {
  return mounts.map((mount) => {
    const isSecret = !!mount.secret_id;
    const source = isSecret ? secrets.find((s) => s.ID === mount.secret_id) : configMaps.find((c) => c.ID === mount.configmap_id);
    return {
      mount,
      isSecret,
      kind: mountKind(mount),
      name: source?.name ?? (isSecret ? mount.secret_id : mount.configmap_id) ?? '—',
      keys: source?.keys ?? [],
    };
  });
}
