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

import { getRequiredPathsAtLevel } from '../../SchemaConfigForm/schemaUtils';
import type { SchemaConfigData } from '../../../types/configuration';
import { hasPersistedSchemaConfigValue } from '../../../utils/schemaConfig';

/**
 * True when the schema declares required configuration keys that have no value
 * yet. Shared across the types whose env card has a Configure button —
 * automation, file/event integrations — so the rule lives in one place; each
 * caller fetches `useSchemaConfig` (de-duplicated by react-query) and passes
 * the result here. Drives the Configure button colour/label ("Configure to
 * Continue") and the disabling of Run/Schedule actions.
 */
export function hasMissingRequiredConfigs(schemaConfig: SchemaConfigData | null | undefined): boolean {
  if (!schemaConfig?.jsonSchema) return false;
  try {
    const schema = JSON.parse(atob(schemaConfig.jsonSchema));
    const allRequired = getRequiredPathsAtLevel(schema).filter((p) => !p.includes('[*]') && !p.includes('.*'));
    if (allRequired.length === 0) return false;
    const filledKeys = new Set((schemaConfig.configurations ?? []).filter(hasPersistedSchemaConfigValue).map((c) => c.key));
    return allRequired.some((k) => !filledKeys.has(k));
  } catch {
    return false;
  }
}
