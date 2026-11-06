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
