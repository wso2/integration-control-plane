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
import { useIntegrationLinks } from '../../../hooks/useConfiguration';
import type { IntegrationLinks, SchemaConfigData } from '../../../types/configuration';
import { configKey } from '../../../utils/integrationLinks';
import { savedValue } from '../../../utils/savedConfig';

/**
 * True when the schema declares required configuration keys that have no value
 * yet. Shared across the types whose env card has a Configure button —
 * automation, file/event integrations — so the rule lives in one place; each
 * caller fetches `useSchemaConfig` (de-duplicated by react-query) and passes
 * the result here. Drives the Configure button colour/label ("Configure to
 * Continue") and the disabling of Run/Schedule actions. A configurable counts
 * as filled where it has a value of its own, where env's release links it to a
 * resource with values there, or where an endpoint fills it.
 */
export function hasMissingRequiredConfigs(schemaConfig: SchemaConfigData | null | undefined, links?: IntegrationLinks, env = ''): boolean {
  if (!schemaConfig?.jsonSchema) return false;
  try {
    const schema = JSON.parse(atob(schemaConfig.jsonSchema));
    const allRequired = getRequiredPathsAtLevel(schema).filter((p) => !p.includes('[*]') && !p.includes('.*'));
    if (allRequired.length === 0) return false;
    const filledKeys = new Set([
      ...(schemaConfig.configurations ?? []).filter((c) => savedValue(c) !== undefined).map((c) => c.key),
      ...linkedWithValues(links, env),
      ...linkedToEndpoints(links),
    ]);
    return allRequired.some((k) => !filledKeys.has(k));
  } catch {
    return false;
  }
}

const release = (links: IntegrationLinks | undefined, env: string) => links?.environments.find((e) => e.name === env);
const hasValues = (links: IntegrationLinks, ref: string, env: string) => !!links.resources.find((r) => r.id === ref)?.valuesIn.includes(env);
const linkedWithValues = (links: IntegrationLinks | undefined, env: string) => Object.entries(release(links, env)?.configurables ?? {}).flatMap(([id, { ref }]) => (hasValues(links!, ref, env) ? [configKey(id)] : []));

/**
 * The configurables an endpoint fills. They are asked for nowhere else: the endpoint has no values of
 * ours and no resource to hold them, because the platform resolves its address in each environment.
 */
const linkedToEndpoints = (links: IntegrationLinks | undefined) => Object.keys(links?.endpointLinks ?? {}).map(configKey);

/** `hasMissingRequiredConfigs` in env with the integration's links, read once the schema has configurables. */
export function useMissingRequiredConfigs(schemaConfig: SchemaConfigData | null | undefined, projectId: string, componentId: string, env: string): boolean {
  const { data: links } = useIntegrationLinks(projectId, componentId, !!schemaConfig?.jsonSchema);
  return useMemo(() => hasMissingRequiredConfigs(schemaConfig, links, env), [schemaConfig, links, env]);
}

/**
 * Why env can't start until configured, for a card to say beside "Configure to Continue": the linked resources its
 * release uses without values there, else the required configurables without one. Undefined when nothing is missing.
 */
export function missingConfigsReason(schemaConfig: SchemaConfigData | null | undefined, links?: IntegrationLinks, env = ''): string | undefined {
  if (!hasMissingRequiredConfigs(schemaConfig, links, env)) return undefined;
  const withoutValues = (release(links, env)?.resources ?? []).filter((r) => !hasValues(links!, r.ref, env)).map((r) => links!.resources.find((x) => x.id === r.ref)?.displayName ?? r.ref);
  if (withoutValues.length === 0) return `Required configurables have no values in ${env}.`;
  return `${withoutValues.join(', ')} ${withoutValues.length === 1 ? 'has' : 'have'} no values in ${env}. Add them on WSO2 Cloud.`;
}

/** `missingConfigsReason` in env with the integration's links, read once the schema has configurables. */
export function useMissingConfigsReason(schemaConfig: SchemaConfigData | null | undefined, projectId: string, componentId: string, env: string): string | undefined {
  const { data: links } = useIntegrationLinks(projectId, componentId, !!schemaConfig?.jsonSchema);
  return useMemo(() => missingConfigsReason(schemaConfig, links, env), [schemaConfig, links, env]);
}
