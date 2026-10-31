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

import { getRequiredPathsAtLevel, getSchemasAtLevel } from '../components/SchemaConfigForm/schemaUtils';
import type { SchemaConfigData } from '../types/configuration';
import type { JSONSchema } from '../types/schema';
import type { MiConfig } from '../types/envGroups';

/** A configuration value as the read-only view shows it. A secret's value is never carried. */
export interface ConfigValue {
  key: string;
  value: string;
  secret: boolean;
  /** Unset and optional: the integration uses its own default. */
  optional?: boolean;
}

/** The stored values, then the schema's keys that have none: the required ones first, as the editor orders them. */
export function schemaConfigValues(data: SchemaConfigData): ConfigValue[] {
  const stored = (data.configurations ?? []).map((c) => ({ key: c.key, value: c.isSensitive ? '' : (c.values?.[0]?.value ?? ''), secret: !!c.isSensitive }));
  const storedKeys = new Set(stored.map((v) => v.key));
  const required = requiredConfigKeys(data.jsonSchema);
  const unset = (keys: string[], optional: boolean) => keys.filter((key) => !storedKeys.has(key)).map((key) => ({ key, value: '', secret: false, ...(optional && { optional }) }));
  const optional = configKeys(data.jsonSchema).filter((key) => !required.includes(key));
  return [...stored, ...unset(required, false), ...unset(optional, true)];
}

/** The scalar keys the base64 JSON schema requires. */
export function requiredConfigKeys(jsonSchema?: string): string[] {
  const schema = parseSchema(jsonSchema);
  return schema ? getRequiredPathsAtLevel(schema).filter((p) => !p.includes('[*]') && !p.includes('.*')) : [];
}

/** Every scalar key the base64 JSON schema declares, required or optional. */
export function configKeys(jsonSchema?: string): string[] {
  const schema = parseSchema(jsonSchema);
  return schema ? getSchemasAtLevel(schema, schema.requiredLevel || 1).flatMap(({ schema: level, path }) => scalarPaths(level, path)) : [];
}

const scalarPaths = (schema: JSONSchema, path: string): string[] => {
  if (schema.properties) return Object.entries(schema.properties).flatMap(([key, child]) => scalarPaths(child, path ? `${path}.${key}` : key));
  return schema.type === 'object' || schema.type === 'array' ? [] : [path];
};

function parseSchema(jsonSchema?: string): JSONSchema | null {
  if (!jsonSchema) return null;
  try {
    return JSON.parse(atob(jsonSchema)) as JSONSchema;
  } catch {
    return null;
  }
}

export const miConfigValues = (config: MiConfig): ConfigValue[] => [...config.envVars.map((e) => ({ ...e, secret: false })), ...config.secrets.map((key) => ({ key, value: '', secret: true }))];
