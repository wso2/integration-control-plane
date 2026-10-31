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

import { useMemo } from 'react';
import { getRequiredPathsAtLevel } from '../../SchemaConfigForm/schemaUtils';
import { useResourceLinks } from '../../../hooks/useConfiguration';
import type { ResourceLink, SchemaConfigData } from '../../../types/configuration';
import { linkedConfigurables } from '../../../utils/resourceLinks';

/**
 * True when the schema declares required configuration keys that have no value
 * yet. Shared across the types whose env card has a Configure button —
 * automation, file/event integrations — so the rule lives in one place; each
 * caller fetches `useSchemaConfig` (de-duplicated by react-query) and passes
 * the result here. Drives the Configure button colour/label ("Configure to
 * Continue") and the disabling of Run/Schedule actions. A configurable counts
 * as filled where env's release carries a link that supplies it and the
 * resource has values there.
 */
export function hasMissingRequiredConfigs(schemaConfig: SchemaConfigData | null | undefined, links: ResourceLink[] = [], env = ''): boolean {
  if (!schemaConfig?.jsonSchema) return false;
  try {
    const schema = JSON.parse(atob(schemaConfig.jsonSchema));
    const allRequired = getRequiredPathsAtLevel(schema).filter((p) => !p.includes('[*]') && !p.includes('.*'));
    if (allRequired.length === 0) return false;
    const filledKeys = new Set([...(schemaConfig.configurations ?? []).filter((c) => c.values?.[0]?.value).map((c) => c.key), ...Array.from(linkedConfigurables(links, env)).flatMap(([key, source]) => (source.noValuesIn ? [] : [key]))]);
    return allRequired.some((k) => !filledKeys.has(k));
  } catch {
    return false;
  }
}

/** `hasMissingRequiredConfigs` in env with the integration's links, read once the schema has configurables. */
export function useMissingRequiredConfigs(schemaConfig: SchemaConfigData | null | undefined, projectId: string, componentId: string, env: string): boolean {
  const { data: links } = useResourceLinks(projectId, componentId, !!schemaConfig?.jsonSchema);
  return useMemo(() => hasMissingRequiredConfigs(schemaConfig, links, env), [schemaConfig, links, env]);
}
