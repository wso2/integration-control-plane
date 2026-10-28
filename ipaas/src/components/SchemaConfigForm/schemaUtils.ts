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

import type { BaseType, JSONSchema } from '../../types/schema';

export interface SchemaAtLevel {
  schema: JSONSchema;
  path: string;
}

export type LinkingInfo = { configGroupId?: string; configKeyId?: string; isDynamic?: boolean };

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const extractUniqueKeySet = (valueMap: Map<string, BaseType>, jsonPath: string): Set<string> => {
  const uniqueKeySet = new Set<string>();
  const escapedPath = escapeRegex(jsonPath).replace(/\\\[\\\*\\\]/g, '\\[(\\d+)\\]');
  const pattern = new RegExp(`^${escapedPath}`);
  valueMap.forEach((_, key) => {
    if (pattern.test(key)) {
      const match = key.match(pattern);
      if (match) uniqueKeySet.add(match[0]);
    }
  });
  return uniqueKeySet;
};

export const extractAllKeySet = (valueMap: Map<string, BaseType>, jsonPath: string): string[] => {
  const allKeys: string[] = [];
  const basePath = jsonPath.replace(/\[\*\]$/, '');
  const escapedBasePath = escapeRegex(basePath);
  const pattern = new RegExp(`^${escapedBasePath}\\[(\\d+)\\]`);
  valueMap.forEach((_, key) => {
    if (key.startsWith(basePath) && pattern.test(key)) allKeys.push(key);
  });
  return allKeys;
};

export const extractAllMapKeySet = (valueMap: Map<string, BaseType>, jsonPath: string): string[] => {
  const allKeys: string[] = [];
  const basePath = jsonPath.replace(/\.\*$/, '');
  const escapedBasePath = escapeRegex(basePath);
  const pattern = new RegExp(`^${escapedBasePath}\\.(\\w+)`);
  valueMap.forEach((_, key) => {
    if (key.startsWith(basePath) && pattern.test(key)) allKeys.push(key);
  });
  return allKeys;
};

export const extractUniqueMapKeySet = (valueMap: Map<string, BaseType>, jsonPath: string): Set<string> => {
  const uniqueKeySet = new Set<string>();
  const basePath = jsonPath.replace(/\.\*$/, '');
  const escapedBasePath = escapeRegex(basePath);
  const pattern = new RegExp(`^${escapedBasePath}\\.(\\w+)`);
  valueMap.forEach((_, key) => {
    if (pattern.test(key)) {
      const match = key.match(pattern);
      if (match) uniqueKeySet.add(match[0]);
    }
  });
  return uniqueKeySet;
};

/** A module's node in a Ballerina config schema: it has neither the description every configurable gets nor the name a record type gets. */
const isModuleNode = (s: JSONSchema): boolean => s.type === 'object' && !!s.properties && s.description === undefined && s.name === undefined;

/**
 * Splits a package's schema into its root module's configurables and one schema per submodule
 * (path `<org>.<package>.<module>`), so each module's required configurables count as required.
 */
const splitModules = (schema: JSONSchema, path: string): SchemaAtLevel[] => {
  const entries = Object.entries(schema.properties ?? {});
  const modules = entries.filter(([, s]) => isModuleNode(s));
  if (modules.length === 0) return [{ schema, path }];
  return [{ schema: { ...schema, properties: Object.fromEntries(entries.filter(([, s]) => !isModuleNode(s))) }, path }, ...modules.map(([name, s]) => ({ schema: s, path: `${path}.${name}` }))];
};

export const getSchemasAtLevel = (schema: JSONSchema, targetLevel: number, currentLevel = 1, currentPath = ''): SchemaAtLevel[] => {
  const schemas: SchemaAtLevel[] = [];
  if (currentLevel === targetLevel) {
    schemas.push(...splitModules(schema, currentPath));
    return schemas;
  }
  if (currentLevel < targetLevel && schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      const childSchema = schema.properties![key];
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      schemas.push(...getSchemasAtLevel(childSchema, targetLevel, currentLevel + 1, newPath));
    });
  }
  return schemas.reverse();
};

export function getRequiredPathsAtLevel(schema: JSONSchema): string[] {
  const schemas = getSchemasAtLevel(schema, schema.requiredLevel || 1);
  const paths: string[] = [];
  schemas.forEach(({ schema: levelSchema, path }) => {
    paths.push(...getRequiredPaths(levelSchema, path));
  });
  return paths;
}

export function getRequiredPaths(schema: JSONSchema, basePath = ''): string[] {
  const paths: string[] = [];
  if (schema.type === 'object' && schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      if (schema.required?.includes(key)) {
        const newPath = basePath ? `${basePath}.${key}` : key;
        const childPaths = getRequiredPaths(schema.properties[key], newPath);
        if (childPaths.length === 0) {
          if (schema.properties[key].additionalProperties) {
            paths.push(`${newPath}.*`);
          } else if (schema.properties[key].type !== 'object' || !schema.properties[key].properties) {
            paths.push(newPath);
          }
        } else {
          paths.push(...childPaths);
        }
      }
    }
  } else if (schema.type === 'array' && schema.items) {
    const arrayBasePath = basePath ? `${basePath}[*]` : '[*]';
    const arrayPaths = getRequiredPaths(schema.items, arrayBasePath);
    if (arrayPaths.length === 0) paths.push(arrayBasePath);
    else paths.push(...arrayPaths);
  }
  return paths;
}

export const generateArrayJsonPath = (jsonPath: string) => `${jsonPath}.[*]`;
export const generateMapJsonPath = (jsonPath: string) => `${jsonPath}.*`;
export const generateObjectJsonPath = (jsonPath: string, key: string) => `${jsonPath}.${key}`;
export const generatedNestedLabel = (title: string, subTitle: string) => `${title} / ${subTitle}`;

export const extractMapKey = (key: string, jsonPath: string): string => {
  const basePath = jsonPath.replace(/\.\*$/, '');
  if (key.startsWith(`${basePath}.`)) {
    const lastPart = key.substring(basePath.length + 1);
    return lastPart !== '<new-key>' ? lastPart : '';
  }
  return key;
};

export const isNumberType = (type: string | undefined): boolean => type === 'number' || type === 'integer' || type === 'float';

export const isBaseType = (type: string | undefined): boolean => type === 'string' || isNumberType(type) || type === 'boolean' || type === 'secret';

export const typeDisplayName = (type: string | undefined): string => {
  if (type === 'string' || type === 'boolean' || type === 'secret') return type;
  if (isNumberType(type)) return 'number';
  return type || 'oneOf';
};

export const setArrayType = (type: string): string => {
  if (type === 'array') return `${type} [ ][ ]`;
  if (type) return `${type} [ ]`;
  return `oneOf [ ]`;
};
