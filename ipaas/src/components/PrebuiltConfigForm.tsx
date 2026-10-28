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

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Typography } from '@wso2/oxygen-ui';

import type { SchemaConfigItem } from '../types/configuration';
import { ConfigForm, getRequiredPathsAtLevel } from './SchemaConfigForm';
import type { BaseType, JSONSchema, LinkingInfo } from './SchemaConfigForm';

export interface PrebuiltConfigFormProps {
  configSchema: JSONSchema;
  onChange: (values: SchemaConfigItem[]) => void;
  onRequiredComplete?: (complete: boolean) => void;
  seededValues?: Map<string, BaseType>;
}

export default function PrebuiltConfigForm({ configSchema, onChange, onRequiredComplete, seededValues }: PrebuiltConfigFormProps): JSX.Element {
  const schema = configSchema;

  const [valueMap, setValueMap] = useState<Map<string, BaseType>>(new Map());
  const [validationMap, setValidationMap] = useState<Map<string, boolean>>(new Map());
  const [sensitiveMap, setSensitiveMap] = useState<Map<string, boolean>>(new Map());
  const [linkingMap, setLinkingMap] = useState<Map<string, LinkingInfo>>(new Map());

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRequiredCompleteRef = useRef(onRequiredComplete);
  onRequiredCompleteRef.current = onRequiredComplete;

  useEffect(() => {
    setValueMap(new Map());
    setValidationMap(new Map());
    setSensitiveMap(new Map());
    setLinkingMap(new Map());
  }, [configSchema]);

  useEffect(() => {
    if (!seededValues || seededValues.size === 0) return;
    setValueMap((prev) => {
      const next = new Map(prev);
      seededValues.forEach((v, k) => next.set(k, v));
      return next;
    });
  }, [seededValues]);

  // Exclude array paths (contain "[") and map paths (end with ".*")
  const scalarRequiredPaths = useMemo(() => {
    const all = schema?.properties ? getRequiredPathsAtLevel(schema) : [];
    return all.filter((p) => !p.includes('[') && !p.endsWith('.*'));
  }, [schema]);

  useEffect(() => {
    const sanitize = (raw: string): string => raw.trim().replace(/\0/g, '');
    const items: SchemaConfigItem[] = [];
    valueMap.forEach((value, key) => {
      if (value !== '' && value !== undefined && value !== null) {
        const isSensitive = sensitiveMap.get(key) ?? false;
        const linking = linkingMap.get(key);
        items.push({
          key,
          values: [{ value: sanitize(String(value)) }],
          ...(isSensitive ? { isSensitive } : {}),
          ...(linking?.configGroupId ? { configGroupId: linking.configGroupId } : {}),
          ...(linking?.configKeyId ? { configKeyId: linking.configKeyId } : {}),
          ...(linking?.isDynamic !== undefined ? { isDynamic: linking.isDynamic } : {}),
        });
      }
    });
    onChangeRef.current(items);

    // Check scalar required fields using valueMap directly.
    const allScalarRequiredFilled = scalarRequiredPaths.every((p) => {
      const val = valueMap.get(p);
      return val !== undefined && val !== null && String(val).trim() !== '';
    });
    // Still block on explicit validation failures (e.g. bad number format) for scalar fields.
    const hasInvalidScalarFields = Array.from(validationMap.entries())
      .filter(([k]) => k !== '' && !k.includes('[') && !k.endsWith('.*'))
      .some(([, v]) => v === false);
    onRequiredCompleteRef.current?.(allScalarRequiredFilled && !hasInvalidScalarFields);
  }, [valueMap, validationMap, sensitiveMap, linkingMap, scalarRequiredPaths]);

  const handleValueChange = (key: string, value: BaseType, newMap?: Map<string, BaseType>) => {
    if (newMap) {
      setValueMap(newMap);
    } else {
      setValueMap((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
    }
  };

  const handleValidationChange = (key: string, isValid: boolean, newMap?: Map<string, boolean>) => {
    if (newMap) {
      setValidationMap(newMap);
    } else {
      setValidationMap((prev) => {
        const next = new Map(prev);
        next.set(key, isValid);
        return next;
      });
    }
  };

  if (!schema?.properties) {
    return (
      <Typography variant="body2" color="text.secondary">
        No configurable fields found in the schema.
      </Typography>
    );
  }

  return (
    <ConfigForm
      schema={schema}
      valueMap={valueMap}
      validationMap={validationMap}
      linkingMap={linkingMap}
      setLinkingMap={setLinkingMap}
      sensitiveMap={sensitiveMap}
      setSensitiveMap={setSensitiveMap}
      handleValueChange={handleValueChange}
      handleValidationChange={handleValidationChange}
    />
  );
}
