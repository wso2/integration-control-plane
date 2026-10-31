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

import { requiredConfigKeys } from '../../../utils/configValues';
import type { SchemaConfigData } from '../../../types/configuration';

/**
 * True when the schema declares required configuration keys that have no value
 * yet. Shared across the types whose env card has a Configure button —
 * automation, file/event integrations — so the rule lives in one place; each
 * caller fetches `useSchemaConfig` (de-duplicated by react-query) and passes
 * the result here. Drives the Configure button colour/label ("Configure to
 * Continue") and the disabling of Run/Schedule actions.
 */
export function hasMissingRequiredConfigs(schemaConfig: SchemaConfigData | null | undefined): boolean {
  if (!schemaConfig) return false;
  const filledKeys = new Set((schemaConfig.configurations ?? []).filter((c) => c.values?.[0]?.value).map((c) => c.key));
  return requiredConfigKeys(schemaConfig.jsonSchema).some((k) => !filledKeys.has(k));
}
