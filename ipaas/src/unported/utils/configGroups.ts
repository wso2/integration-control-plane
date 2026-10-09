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

/**
 * Pure helpers for the Config Groups two-phase create/edit flow: display-name → slug,
 * key validation, and flattening the (keys × value-sets) editor state into the API's
 * per-environment `configurations` payload. No React, no I/O. Unit-tested.
 */

import { CONFIG_KEY_REGEX } from '../constants/configGroups';
import type { ConfigGroup, ConfigGroupInitialValues, ConfigValueType, Configuration, CreateConfigGroupRequest, EditConfigGroupRequest, KeyDefinition, ValueSetDraft } from '../../types/configGroups';

/** Derive the API `groupName` slug from a human display name (lowercase, hyphenated). */
export function slugifyGroupName(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidConfigKey(key: string): boolean {
  return CONFIG_KEY_REGEX.test(key);
}

/** The value-input type for a key: file → 'file', else secret → 'secret', else 'text'. */
export function keyToValueType(key: Pick<KeyDefinition, 'isFile' | 'isSensitive'>): ConfigValueType {
  return key.isFile ? 'file' : key.isSensitive ? 'secret' : 'text';
}

/**
 * Flatten keys + value-sets into the API's `configurations`. A key collects a
 * `{ environmentUuid, value }` for every environment a value-set gives it a non-empty
 * value (later sets win). Keys with no values are kept (empty `values`).
 */
export function buildConfigurations(keys: KeyDefinition[], valueSets: ValueSetDraft[]): Configuration[] {
  return keys.map((k) => {
    const name = k.key.trim();
    const byEnv = new Map<string, string>();
    valueSets.forEach((set) => {
      const v = set.values[name];
      if (v != null && v.trim() !== '') set.environmentIds.forEach((envId) => byEnv.set(envId, v));
    });
    return {
      keyUuid: k.keyUuid ?? '',
      key: name,
      isSensitive: k.isSensitive,
      isFile: k.isFile,
      values: [...byEnv.entries()].map(([environmentUuid, value]) => ({ environmentUuid, value })),
    };
  });
}

/** Build the `POST /configs/groups` body. `scopes` (the org) is required by the backend. */
export function buildCreatePayload(orgUuid: string, handle: string, displayName: string, description: string, configurations: Configuration[]): CreateConfigGroupRequest {
  if (!orgUuid.trim()) {
    throw new Error('Cannot build a configuration group payload without an organization scope.');
  }
  return {
    groupName: handle.trim() || slugifyGroupName(displayName),
    groupDisplayName: displayName.trim(),
    description: description.trim(),
    scopes: [{ organizationUuid: orgUuid }],
    configurations,
  };
}

/** Edit payload: the create body plus the immutable group id. */
export function buildEditPayload(orgUuid: string, groupUuid: string, handle: string, displayName: string, description: string, configurations: Configuration[]): EditConfigGroupRequest {
  return { groupUuid, ...buildCreatePayload(orgUuid, handle, displayName, description, configurations) };
}

/**
 * Rebuild the wizard's step-1 keys + step-2 value-sets from a persisted group's flat
 * per-environment values — environments sharing an identical value map collapse into one set.
 */
export function configGroupToFormValues(group: ConfigGroup): ConfigGroupInitialValues {
  const keys: KeyDefinition[] = (group.configurations ?? []).map((c) => ({ keyUuid: c.keyUuid, key: c.key, isFile: c.isFile, isSensitive: c.isSensitive }));
  const byEnv = new Map<string, Record<string, string>>();
  (group.configurations ?? []).forEach((c) =>
    (c.values ?? []).forEach((v) => {
      const m = byEnv.get(v.environmentUuid) ?? {};
      m[c.key] = v.value ?? '';
      byEnv.set(v.environmentUuid, m);
    }),
  );
  const bySig = new Map<string, ValueSetDraft>();
  byEnv.forEach((values, env) => {
    const sig = JSON.stringify(Object.entries(values).sort());
    const existing = bySig.get(sig);
    if (existing) existing.environmentIds.push(env);
    else bySig.set(sig, { environmentIds: [env], values });
  });
  const valueSets = [...bySig.values()];
  return {
    displayName: group.groupDisplayName || group.groupName,
    handle: group.groupName,
    description: group.description ?? '',
    keys,
    valueSets: valueSets.length ? valueSets : [{ environmentIds: [], values: {} }],
  };
}
