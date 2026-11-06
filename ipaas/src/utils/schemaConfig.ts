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

import type { SchemaConfigItem } from '../types/configuration';
import type { BaseType } from '../types/schema';

interface SchemaConfigLink {
  configGroupId?: string;
  configKeyId?: string;
  isDynamic?: boolean;
}

/** Secret values are redacted by the BFF, so their empty value still represents a saved configuration. */
export function hasPersistedSchemaConfigValue(configuration: SchemaConfigItem): boolean {
  return configuration.isSensitive === true || Boolean(configuration.values?.[0]?.value);
}

/**
 * Returns the value used to seed the form. An empty string is retained only as
 * a presence marker for a persisted secret whose value the BFF has redacted.
 */
export function persistedSchemaConfigValue(configuration: SchemaConfigItem): string | undefined {
  const value = configuration.values?.[0]?.value;
  if (configuration.isSensitive) return value ?? '';
  return value !== undefined && value !== '' ? value : undefined;
}

/**
 * Builds the complete save payload. Redacted secrets stay present with an empty
 * value so the backend keeps them, while empty non-sensitive values remain
 * explicit deletions.
 */
export function schemaConfigurationsForSave(
  existingConfigurations: SchemaConfigItem[] | undefined,
  valueMap: ReadonlyMap<string, BaseType>,
  sensitiveMap: ReadonlyMap<string, boolean>,
  linkingMap: ReadonlyMap<string, SchemaConfigLink>,
  environmentUuid: string,
): SchemaConfigItem[] {
  const existingByKey = new Map((existingConfigurations ?? []).map((configuration) => [configuration.key, configuration]));
  const keys = new Set([...existingByKey.keys(), ...valueMap.keys()]);

  return Array.from(keys, (key) => {
    const existing = existingByKey.get(key);
    const value = valueMap.get(key);
    const linking = linkingMap.get(key);
    const isSensitive = sensitiveMap.get(key) || existing?.isSensitive || false;

    return {
      key,
      keyId: existing?.keyId,
      values: [{ environmentUuid, value: value === undefined || value === null ? '' : String(value) }],
      ...(isSensitive ? { isSensitive } : {}),
      isRequired: existing?.isRequired,
      configGroupId: linking?.configGroupId,
      configKeyId: linking?.configKeyId,
      isDynamic: linking?.isDynamic,
    };
  });
}
