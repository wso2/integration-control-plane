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
// Absolute mount path (Devant): no `//`, no `..`, no trailing slash.
const MOUNT_PATH_RE = /^\/(?!\/)(?!.*\/\.\.)(?!.*\/$)[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export function validateConfigKey(key: string): string {
  if (!key.trim()) return 'Key is required.';
  if (key.length > 250) return 'Key must be 250 characters or fewer.';
  if (!ENV_KEY_RE.test(key)) return 'Use letters, numbers, and underscores; must start with a letter or underscore.';
  return '';
}

export function validateMountPath(path: string): string {
  if (!path.trim()) return 'Mount path is required.';
  if (path.length > 2048) return 'Path must be 2048 characters or fewer.';
  if (!MOUNT_PATH_RE.test(path)) return 'Enter an absolute path including the filename, e.g. /app/configs/config.json.';
  return '';
}

export function validateDisplayName(name: string): string {
  if (!name.trim()) return 'Display name is required.';
  if (name.length > 250) return 'Display name must be 250 characters or fewer.';
  return '';
}

// The MI configure drawer owns env-var groups named `mi-env-vars` and `mi-secret-<KEY>`
// (miConfigs.ts) and would adopt, and may delete, a user's group with such a name.
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
