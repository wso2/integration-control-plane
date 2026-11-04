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

import type { Dispatch, SetStateAction } from 'react';
import { Box, Button, IconButton, Paper, Popover, Stack, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { BaseType, JSONSchema } from '../../../types/schema';
import { type LinkingInfo, generateArrayJsonPath, generateMapJsonPath, isBaseType } from '../schemaUtils';
import { AnyOfElement } from './AnyOfElement';
import { ArrayElement } from './ArrayElement';
import { BaseElement } from './BaseElement';
import MapElement from './MapElement';
import { ObjectElementContainer } from './ObjectElementContainer';

interface ConfigGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: { keyUuid: string; key: string; isSensitive?: boolean }[];
}

export interface PopOverComponentProps {
  jsonPath: string;
  open: boolean;
  anchorEl: HTMLButtonElement | null;
  onClose: () => void;
  onValueAdd?: () => void;
  addArrayElement: () => void;
  onDeleteArrayElement: (id: string) => void;
  uniqueKeySet: Set<string>;
  schema: JSONSchema;
  title: string;
  valueMap: Map<string, BaseType>;
  allowLinking?: boolean;
  configGroups?: ConfigGroup[];
  linkingMap?: Map<string, LinkingInfo>;
  setLinkingMap?: Dispatch<SetStateAction<Map<string, LinkingInfo>>>;
  sensitiveMap?: Map<string, boolean>;
  setSensitiveMap?: Dispatch<SetStateAction<Map<string, boolean>>>;
  handleValueChange: (key: string, value: BaseType, valueMap?: Map<string, BaseType>) => void;
  validationMap: Map<string, boolean>;
  handleValidationChange: (jsonPath: string, isValid: boolean, validationMap?: Map<string, boolean>) => void;
  isDisableSaveBtn: boolean;
  isRequiredAtRequiredLevel: boolean;
}

export function PopOverComponent({
  jsonPath,
  open,
  anchorEl,
  onClose,
  onValueAdd,
  addArrayElement,
  onDeleteArrayElement,
  uniqueKeySet,
  schema,
  title,
  valueMap,
  allowLinking,
  configGroups,
  linkingMap,
  setLinkingMap,
  sensitiveMap,
  setSensitiveMap,
  handleValueChange,
  validationMap,
  handleValidationChange,
  isDisableSaveBtn,
  isRequiredAtRequiredLevel,
}: PopOverComponentProps) {
  return (
    <Popover open={open} anchorEl={anchorEl} onClose={onClose} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} transformOrigin={{ horizontal: 'right', vertical: 'top' }}>
      <Paper sx={{ p: 2, minWidth: 320, maxWidth: 420 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          Add values
        </Typography>
        {Array.from(uniqueKeySet)
          .sort()
          .map((key) => {
            if (schema && (isBaseType(schema.type) || schema.enum || schema.properties?.[key]?.enum)) {
              return (
                <Box key={key} sx={{ display: 'flex', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <BaseElement
                      title={title || key}
                      type={schema.enum || schema.properties?.[key]?.enum ? 'string' : schema.type || ''}
                      valueMap={valueMap}
                      handleValueChange={handleValueChange}
                      jsonPath={key}
                      validationMap={validationMap}
                      handleValidationChange={handleValidationChange}
                      isRequired
                      isSkipLabel
                      isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                      schema={schema.enum || isBaseType(schema.type) ? schema : schema.properties?.[key]}
                      allowLinking={allowLinking}
                      configGroups={configGroups}
                      linkingMap={linkingMap}
                      setLinkingMap={setLinkingMap}
                      sensitiveMap={sensitiveMap}
                      setSensitiveMap={setSensitiveMap}
                    />
                  </Box>
                  <Box sx={{ pt: 4.5 }}>
                    <IconButton size="small" color="error" onClick={() => onDeleteArrayElement(key)} aria-label="delete element">
                      <Trash2 size={14} />
                    </IconButton>
                  </Box>
                </Box>
              );
            }

            if (schema && schema.type === 'object' && schema.properties?.[key]?.additionalProperties) {
              return (
                <MapElement
                  key={key}
                  title={title}
                  jsonPath={generateMapJsonPath(jsonPath)}
                  valueMap={valueMap}
                  handleValueChange={handleValueChange}
                  handleValidationChange={handleValidationChange}
                  validationMap={validationMap}
                  isRequired
                  schema={schema.properties![key]}
                  isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                  sensitiveMap={sensitiveMap}
                  setSensitiveMap={setSensitiveMap}
                />
              );
            }

            if (schema && schema.type === 'object') {
              return (
                <ObjectElementContainer
                  key={key}
                  title={title || key}
                  type={schema.type}
                  schema={schema || { type: 'object', properties: {} }}
                  valueMap={valueMap}
                  handleValueChange={handleValueChange}
                  jsonPath={key}
                  validationMap={validationMap}
                  handleValidationChange={handleValidationChange}
                  hasDeleteBtn
                  onDelete={onDeleteArrayElement}
                  isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                  sensitiveMap={sensitiveMap}
                  setSensitiveMap={setSensitiveMap}
                />
              );
            }

            if (schema && schema.anyOf) {
              return (
                <Box key={key} sx={{ display: 'flex', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <AnyOfElement
                      title={title || key}
                      jsonPath={key}
                      schema={schema}
                      valueMap={valueMap}
                      handleValueChange={handleValueChange}
                      validationMap={validationMap}
                      handleValidationChange={handleValidationChange}
                      isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                      allowLinking={allowLinking}
                      configGroups={configGroups}
                      linkingMap={linkingMap}
                      setLinkingMap={setLinkingMap}
                      sensitiveMap={sensitiveMap}
                      setSensitiveMap={setSensitiveMap}
                    />
                  </Box>
                  <Box sx={{ pt: 1 }}>
                    <IconButton size="small" color="error" onClick={() => onDeleteArrayElement(key)} aria-label="delete anyOf element">
                      <Trash2 size={14} />
                    </IconButton>
                  </Box>
                </Box>
              );
            }

            if (schema && schema.type === 'array') {
              return (
                <Box key={key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <ArrayElement
                      title=""
                      type={schema.type}
                      schema={schema.items}
                      jsonPath={generateArrayJsonPath(key)}
                      valueMap={valueMap}
                      handleValueChange={handleValueChange}
                      validationMap={validationMap}
                      handleValidationChange={handleValidationChange}
                      isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                      sensitiveMap={sensitiveMap}
                      setSensitiveMap={setSensitiveMap}
                    />
                  </Box>
                  <Box sx={{ pt: 1 }}>
                    <IconButton size="small" color="error" onClick={() => onDeleteArrayElement(key)} aria-label="delete array element">
                      <Trash2 size={14} />
                    </IconButton>
                  </Box>
                </Box>
              );
            }

            return null;
          })}

        <Box key={`${jsonPath}-ADD`}>
          <Button variant="text" size="small" startIcon={<Plus size={13} />} onClick={addArrayElement} sx={{ textTransform: 'none' }}>
            Add
          </Button>
        </Box>

        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1.5 }}>
          <Button size="small" variant="outlined" color="inherit" onClick={onClose}>
            Cancel
          </Button>
          <Button size="small" variant="contained" disabled={isDisableSaveBtn} onClick={onValueAdd}>
            Save
          </Button>
        </Stack>
      </Paper>
    </Popover>
  );
}

export default PopOverComponent;
