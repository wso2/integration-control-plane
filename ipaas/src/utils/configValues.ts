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

import { generatedNestedLabel, getRequiredPathsAtLevel, getSchemasAtLevel, isBaseType } from '../components/SchemaConfigForm/schemaUtils';
import type { SchemaConfigData } from '../types/configuration';
import type { JSONSchema } from '../types/schema';
import type { MiConfig } from '../types/envGroups';

/** A configuration value as the read-only view shows it. A secret's value is never carried. */
export interface ConfigValue {
  key: string;
  /** The editor's label for the field; the key when absent. */
  label?: string;
  value: string;
  secret: boolean;
  /** Unset and optional: the integration uses its own default. */
  optional?: boolean;
  /** The editor's section for the field; absent when the values have no schema. */
  section?: 'Required' | 'Optional';
  /** The module the editor lists the field under (`ballerina.http`); absent for a schema without modules. */
  module?: string;
}

export const MASK = '••••••••';

/** The editor's fields in its order, with their stored values (a list, map or choice as JSON); without a schema, the stored values. */
export function schemaConfigValues(data: SchemaConfigData): ConfigValue[] {
  const stored = (data.configurations ?? []).map((c) => ({ key: c.key, value: c.values?.[0]?.value ?? '', secret: !!c.isSensitive }));
  const schema = parseSchema(data.jsonSchema);
  if (!schema) return stored.map((c) => ({ ...c, value: c.secret ? '' : c.value }));
  return schemaFields(schema).map(({ path, label, scalar, required, module }) => {
    const exact = stored.find((c) => c.key === path);
    const entries = scalar ? [] : stored.filter((c) => c.key.startsWith(`${path}.`));
    const secret = !entries.length && !!exact?.secret;
    const value = entries.length ? compact(entries.map((c) => [unescapeKey(c.key.slice(path.length + 1)), c.secret ? MASK : c.value])) : exact && !secret ? exact.value : '';
    return { key: path, label, value, secret, ...(!required && { optional: true }), section: required ? 'Required' : 'Optional', ...(module && { module }) };
  });
}

interface SchemaField {
  path: string;
  label: string;
  /** A single value, rather than a list, map or choice. */
  scalar: boolean;
  required: boolean;
  module: string;
}

/** The fields ConfigForm renders: the Required section, then the Optional one, each module by module. */
function schemaFields(schema: JSONSchema): SchemaField[] {
  const levels = getSchemasAtLevel(schema, schema.requiredLevel || 1);
  const section = (required: boolean) =>
    levels.flatMap(({ schema: level, path: module }) =>
      Object.entries(level.properties ?? {})
        .filter(([key]) => (level.required ?? []).includes(key) === required)
        .flatMap(([key, prop]) => elementFields(prop, prop.title || key, module ? `${module}.${key}` : key, false).map((f) => ({ ...f, required, module }))),
    );
  return [...section(true), ...section(false)];
}

/** What ConfigElement (or, `nested`, ObjectElement) renders for one property: an object's fields sit under its label. */
function elementFields(prop: JSONSchema, label: string, path: string, nested: boolean): { path: string; label: string; scalar: boolean }[] {
  const type: string | undefined = prop.type ?? (nested ? undefined : 'anyOf');
  if (type === 'object' && prop.additionalProperties) return [{ path, label, scalar: false }];
  if (type === 'object') return Object.entries(prop.properties ?? {}).flatMap(([key, child]) => elementFields(child, generatedNestedLabel(label, child.title || key), `${path}.${key}`, true));
  if (isBaseType(type) || prop.enum) return [{ path, label, scalar: true }];
  if (type === 'array' || (prop.anyOf && (nested || type === 'anyOf'))) return [{ path, label, scalar: false }];
  return [];
}

/** A list's items as a JSON array, in index order; anything else as a JSON object of its entries. */
function compact(entries: [string, string][]): string {
  const index = (key: string) => Number(/^\[(\d+)\]$/.exec(key)?.[1] ?? NaN);
  const list = entries.every(([key]) => !Number.isNaN(index(key)));
  return JSON.stringify(list ? [...entries].sort(([a], [b]) => index(a) - index(b)).map(([, v]) => v) : Object.fromEntries(entries));
}

/** A map key as the user wrote it: the schema escapes a dot inside one (`icp\.runtimeId`). */
const unescapeKey = (key: string): string => key.replace(/\\\./g, '.');

/** The scalar keys the base64 JSON schema requires. */
export function requiredConfigKeys(jsonSchema?: string): string[] {
  const schema = parseSchema(jsonSchema);
  return schema ? getRequiredPathsAtLevel(schema).filter((p) => !p.includes('[*]') && !p.includes('.*')) : [];
}

function parseSchema(jsonSchema?: string): JSONSchema | null {
  if (!jsonSchema) return null;
  try {
    return JSON.parse(atob(jsonSchema)) as JSONSchema;
  } catch {
    return null;
  }
}

/** The Configure control's label and colour: a role that may only read is not urged to act. */
export function configureControl(readOnly: boolean, hasMissingConfigs: boolean): { label: string; color: 'error' | 'primary' } {
  if (readOnly) return { label: 'View configuration', color: 'primary' };
  return hasMissingConfigs ? { label: 'Configure to continue', color: 'error' } : { label: 'Configure', color: 'primary' };
}

export const miConfigValues = (config: MiConfig): ConfigValue[] => [...config.envVars.map((e) => ({ ...e, secret: false })), ...config.secrets.map((key) => ({ key, value: '', secret: true }))];
