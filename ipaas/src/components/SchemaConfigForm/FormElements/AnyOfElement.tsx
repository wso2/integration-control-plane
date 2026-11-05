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

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Box, Chip, MenuItem, Select, Stack, Typography } from '@wso2/oxygen-ui';
import type { BaseType, JSONSchema } from '../../../types/schema';
import { type LinkingInfo, generateArrayJsonPath, isBaseType } from '../schemaUtils';
import { ArrayElement } from './ArrayElement';
import { BaseElement } from './BaseElement';
import { ObjectElementContainer } from './ObjectElementContainer';

interface ConfigGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: { keyUuid: string; key: string; isSensitive?: boolean }[];
}

export interface AnyOfElementProps {
  title: string;
  jsonPath: string;
  valueMap: Map<string, BaseType>;
  allowLinking?: boolean;
  configGroups?: ConfigGroup[];
  linkingMap?: Map<string, LinkingInfo>;
  setLinkingMap?: Dispatch<SetStateAction<Map<string, LinkingInfo>>>;
  sensitiveMap?: Map<string, boolean>;
  setSensitiveMap?: Dispatch<SetStateAction<Map<string, boolean>>>;
  handleValueChange: (key: string, value: BaseType, valueMap?: Map<string, BaseType>) => void;
  handleValidationChange: (jsonPath: string, isValid: boolean, validationMap?: Map<string, boolean>) => void;
  validationMap: Map<string, boolean>;
  isRequired?: boolean;
  schema: JSONSchema;
  isRequiredAtRequiredLevel: boolean;
}

interface TypeOption {
  type: string;
  label: string;
  schema: JSONSchema;
}

const getTypeLabel = (type: string | undefined, schema?: JSONSchema): string => {
  switch (type) {
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'object':
      return schema?.title || schema?.name || 'Object';
    case 'array':
      return schema?.title || schema?.name || 'Array';
    default:
      return type || 'Not supported';
  }
};

export function AnyOfElement({
  title,
  jsonPath,
  valueMap,
  allowLinking,
  configGroups,
  linkingMap,
  setLinkingMap,
  sensitiveMap,
  setSensitiveMap,
  handleValueChange,
  handleValidationChange,
  validationMap,
  isRequired,
  schema,
  isRequiredAtRequiredLevel,
}: AnyOfElementProps) {
  const typeOptions = useMemo<TypeOption[]>(() => {
    if (!schema.anyOf) return [];
    return schema.anyOf.map((subSchema) => ({
      type: subSchema.type || 'unknown',
      label: getTypeLabel(subSchema.type, subSchema),
      schema: subSchema,
    }));
  }, [schema.anyOf]);

  const currentValue = valueMap.get(jsonPath);
  const [selectedType, setSelectedType] = useState<TypeOption | null>(() => {
    if (currentValue !== undefined) {
      const valueType = typeof currentValue;
      return typeOptions.find((opt) => opt.type === valueType) || null;
    }
    return null;
  });

  const handleTypeChange = (newType: string) => {
    const newTypeOption = typeOptions.find((opt) => opt.type === newType) || null;
    if (!newTypeOption || newTypeOption === selectedType) return;
    setSelectedType(newTypeOption);

    if (isBaseType(newTypeOption.type)) {
      const newValueMap = new Map(valueMap);
      newValueMap.delete(jsonPath);
      handleValueChange(jsonPath, '', newValueMap);
      const newValidationMap = new Map(validationMap);
      newValidationMap.set(jsonPath, false);
      handleValidationChange(jsonPath, false, newValidationMap);
    } else {
      const newValueMap = new Map(valueMap);
      const newValidationMap = new Map(validationMap);
      for (const [key] of valueMap) {
        if (key.startsWith(jsonPath)) newValueMap.delete(key);
      }
      for (const [key] of validationMap) {
        if (key.startsWith(jsonPath)) newValidationMap.delete(key);
      }
      handleValueChange(jsonPath, '', newValueMap);
      handleValidationChange(jsonPath, true, newValidationMap);
    }
  };

  if (!schema.anyOf || typeOptions.length === 0) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {!isRequired && isRequiredAtRequiredLevel ? `${title} (Optional)` : title}
        </Typography>
        <Chip label="oneOf" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
      </Stack>

      <Select
        size="small"
        fullWidth
        displayEmpty
        value={selectedType?.type || ''}
        onChange={(e) => handleTypeChange(e.target.value as string)}
        renderValue={(value) => {
          if (!value)
            return (
              <Typography variant="body2" color="text.disabled">
                Select type
              </Typography>
            );
          return typeOptions.find((o) => o.type === value)?.label || value;
        }}
        sx={{ mb: 1 }}>
        {typeOptions.map((opt) => (
          <MenuItem key={opt.type} value={opt.type}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>

      {selectedType && (isBaseType(selectedType.type) || selectedType.schema?.enum) && (
        <BaseElement
          key={`${jsonPath}-${selectedType.type}`}
          type={selectedType.schema?.enum ? 'string' : selectedType.type}
          title={title}
          jsonPath={jsonPath}
          valueMap={valueMap}
          validationMap={validationMap}
          handleValueChange={handleValueChange}
          handleValidationChange={handleValidationChange}
          isRequired={isRequired}
          schema={selectedType.schema}
          isSkipLabel
          isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
          allowLinking={allowLinking}
          configGroups={configGroups}
          linkingMap={linkingMap}
          setLinkingMap={setLinkingMap}
          sensitiveMap={sensitiveMap}
          setSensitiveMap={setSensitiveMap}
        />
      )}

      {selectedType && selectedType.type === 'object' && (
        <ObjectElementContainer
          key={`${jsonPath}-${selectedType.type}`}
          type={selectedType.type}
          title={selectedType.label}
          jsonPath={jsonPath}
          valueMap={valueMap}
          validationMap={validationMap}
          handleValueChange={handleValueChange}
          handleValidationChange={handleValidationChange}
          isRequired={isRequired}
          schema={selectedType.schema}
          isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
          sensitiveMap={sensitiveMap}
          setSensitiveMap={setSensitiveMap}
        />
      )}

      {selectedType && selectedType.type === 'array' && (
        <ArrayElement
          key={`${jsonPath}-${selectedType.type}`}
          type={selectedType.type}
          title={title}
          jsonPath={generateArrayJsonPath(jsonPath)}
          valueMap={valueMap}
          validationMap={validationMap}
          handleValueChange={handleValueChange}
          handleValidationChange={handleValidationChange}
          schema={selectedType.schema?.items}
          isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
          allowLinking={allowLinking}
          configGroups={configGroups}
          linkingMap={linkingMap}
          setLinkingMap={setLinkingMap}
          sensitiveMap={sensitiveMap}
          setSensitiveMap={setSensitiveMap}
        />
      )}
    </Box>
  );
}
