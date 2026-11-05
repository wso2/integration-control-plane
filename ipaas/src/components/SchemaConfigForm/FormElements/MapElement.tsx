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

import React, { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Box, Button, Chip, IconButton, Paper, Popover, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { Edit2, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { BaseType, JSONSchema } from '../../../types/schema';
import { type LinkingInfo, extractAllMapKeySet, extractMapKey, extractUniqueMapKeySet, generateArrayJsonPath, isBaseType } from '../schemaUtils';
import { AnyOfElement } from './AnyOfElement';
import { ArrayElement } from './ArrayElement';
import { BaseElement } from './BaseElement';
import { ObjectElementContainer } from './ObjectElementContainer';

interface ConfigGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: { keyUuid: string; key: string; isSensitive?: boolean }[];
}

interface MapElementProps {
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

export const MapElement: React.FC<MapElementProps> = ({
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
}) => {
  const [localValueMap, setLocalValueMap] = useState<Map<string, BaseType>>(new Map());
  const [localValidationMap, setLocalValidationMap] = useState<Map<string, boolean>>(new Map());
  const [uniqueKeySet, setUniqueKeySet] = useState<Set<string>>(new Set());
  const [isAddNewMapElement, setIsAddNewMapElement] = useState(false);
  const [isDisableAddBtn, setIsDisableAddBtn] = useState(false);
  const [pendingKeyUpdates, setPendingKeyUpdates] = useState<Map<string, string>>(new Map());
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
  const debounceTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const valueSchema = schema.additionalProperties && typeof schema.additionalProperties === 'object' ? { ...(schema.additionalProperties as JSONSchema), required: schema.required } : undefined;

  const onAddMapElement = () => {
    const basePath = jsonPath.replace(/\.\*$/, '');
    const newJsonPath = `${basePath}.<new-key>`;
    setUniqueKeySet((prev) => new Set(prev.add(newJsonPath)));
  };

  const handleOpenPopover = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    setIsPopoverOpen(true);
    const uniqueKeys = extractUniqueMapKeySet(valueMap, jsonPath);
    if (uniqueKeys.size === 0) {
      onAddMapElement();
      setIsAddNewMapElement(true);
    }
  };

  const resetLocalValueMap = (configValueMap: Map<string, BaseType>, configValidationMap: Map<string, boolean>) => {
    if (!configValueMap || configValueMap.size === 0) {
      setLocalValueMap(new Map());
      setLocalValidationMap(new Map());
    } else {
      const allKeys = extractAllMapKeySet(configValueMap, jsonPath);
      const localConfigValueMap = new Map<string, BaseType>();
      const localConfigValidationMap = new Map<string, boolean>();
      allKeys.forEach((key) => {
        localConfigValueMap.set(key, configValueMap.get(key) ?? '');
        localConfigValidationMap.set(key, configValidationMap.get(key) || false);
      });
      setLocalValueMap(localConfigValueMap);
      setLocalValidationMap(localConfigValidationMap);
    }
    const uniqueKeys = extractUniqueMapKeySet(configValueMap, jsonPath);
    if (uniqueKeys.size === 0 && !isAddNewMapElement) {
      onAddMapElement();
      setIsAddNewMapElement(true);
    } else {
      setUniqueKeySet(uniqueKeys);
      setIsAddNewMapElement(false);
    }
    setDuplicateKeys(new Set());
    setPendingKeyUpdates(new Map());
  };

  const handleClosePopover = () => {
    setIsPopoverOpen(false);
    setAnchorEl(null);
    resetLocalValueMap(valueMap, validationMap);
  };

  const handlePopoverSave = () => {
    const mergedValueMap = new Map(valueMap);
    const mergedValidationMap = new Map(validationMap);
    localValueMap.forEach((value, key) => mergedValueMap.set(key, value));
    localValidationMap.forEach((isValid, key) => mergedValidationMap.set(key, isValid));
    const allKeys = extractAllMapKeySet(valueMap, jsonPath);
    allKeys.forEach((key) => {
      if (!localValueMap.has(key)) {
        mergedValueMap.delete(key);
        mergedValidationMap.delete(key);
      }
    });
    handleValueChange('', '', mergedValueMap);
    handleValidationChange('', true, mergedValidationMap);
    setIsPopoverOpen(false);
    setAnchorEl(null);
  };

  const handleLocalValueChange = (key: string, value: BaseType, configMap?: Map<string, BaseType>) => {
    if (configMap) setLocalValueMap(configMap);
    else
      setLocalValueMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(key, value ?? '');
        return newMap;
      });
  };

  const handleLocalValidationChange = (key: string, isValid: boolean, configValidationMap?: Map<string, boolean>) => {
    if (configValidationMap) setLocalValidationMap(configValidationMap);
    else
      setLocalValidationMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(key, isValid);
        return newMap;
      });
  };

  const commitKeyUpdate = (oldKey: string, newKeyValue: string) => {
    if (oldKey.includes('<new-key>') && !newKeyValue.trim()) return;
    const basePath = jsonPath.replace(/\.\*$/, '');
    const newKey = `${basePath}.${newKeyValue}`;
    if (oldKey === newKey) return;

    const isDuplicate =
      !!newKeyValue.trim() &&
      Array.from(uniqueKeySet).some((existingKey) => {
        if (existingKey === oldKey) return false;
        const pendingValue = pendingKeyUpdates.get(existingKey);
        const keyValue = pendingValue !== undefined ? pendingValue : extractMapKey(existingKey, jsonPath);
        return keyValue === newKeyValue.trim();
      });

    setDuplicateKeys((prev) => {
      const updated = new Set(prev);
      if (isDuplicate) updated.add(oldKey);
      else updated.delete(oldKey);
      return updated;
    });
    if (isDuplicate) return;

    const isObjectType = valueSchema && valueSchema.type === 'object';
    const isArrayType = valueSchema && valueSchema.type === 'array';

    setLocalValueMap((prev) => {
      const newMap = new Map(prev);
      if (isObjectType || isArrayType) {
        const valuesToTransfer = new Map<string, BaseType>();
        Array.from(prev.keys()).forEach((key) => {
          if (key === oldKey || key.startsWith(`${oldKey}.`)) {
            valuesToTransfer.set(key, prev.get(key)!);
            newMap.delete(key);
          }
        });
        if (newKeyValue.trim()) {
          valuesToTransfer.forEach((value, key) => {
            if (key === oldKey) newMap.set(newKey, value);
            else if (key.startsWith(`${oldKey}.`)) newMap.set(`${newKey}${key.substring(oldKey.length)}`, value);
          });
        }
      } else {
        const oldValue = prev.get(oldKey) ?? '';
        newMap.delete(oldKey);
        if (newKeyValue.trim()) newMap.set(newKey, oldValue);
      }
      return newMap;
    });

    setUniqueKeySet((prev) => {
      const newSet = new Set(prev);
      newSet.delete(oldKey);
      if (newKeyValue.trim()) newSet.add(newKey);
      return newSet;
    });

    setLocalValidationMap((prev) => {
      const newMap = new Map(prev);
      if (isObjectType || isArrayType) {
        const validationsToTransfer = new Map<string, boolean>();
        Array.from(prev.keys()).forEach((key) => {
          if (key === oldKey || key.startsWith(`${oldKey}.`)) {
            validationsToTransfer.set(key, prev.get(key) || false);
            newMap.delete(key);
          }
        });
        if (newKeyValue.trim()) {
          validationsToTransfer.forEach((validation, key) => {
            if (key === oldKey) newMap.set(newKey, validation);
            else if (key.startsWith(`${oldKey}.`)) newMap.set(`${newKey}${key.substring(oldKey.length)}`, validation);
          });
        }
      } else {
        const oldValidation = prev.get(oldKey) || false;
        newMap.delete(oldKey);
        if (newKeyValue.trim()) newMap.set(newKey, oldValidation);
      }
      return newMap;
    });

    setPendingKeyUpdates((prev) => {
      const updated = new Map(prev);
      updated.delete(oldKey);
      return updated;
    });
  };

  const handleKeyInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, oldKey: string) => {
    const { value } = event.target;
    const isDuplicate =
      !!value.trim() &&
      Array.from(uniqueKeySet).some((existingKey) => {
        if (existingKey === oldKey) return false;
        const pendingValue = pendingKeyUpdates.get(existingKey);
        const keyValue = pendingValue !== undefined ? pendingValue : extractMapKey(existingKey, jsonPath);
        return keyValue === value.trim();
      });
    setDuplicateKeys((prev) => {
      const updated = new Set(prev);
      if (isDuplicate) updated.add(oldKey);
      else updated.delete(oldKey);
      return updated;
    });
    setPendingKeyUpdates((prev) => {
      const updated = new Map(prev);
      updated.set(oldKey, value);
      return updated;
    });

    const existingTimeout = debounceTimeouts.current.get(oldKey);
    if (existingTimeout) clearTimeout(existingTimeout);
    const newTimeout = setTimeout(() => {
      commitKeyUpdate(oldKey, value);
      debounceTimeouts.current.delete(oldKey);
    }, 500);
    debounceTimeouts.current.set(oldKey, newTimeout);
  };

  const handleKeyInputBlur = (oldKey: string) => {
    const pendingValue = pendingKeyUpdates.get(oldKey);
    if (pendingValue !== undefined) {
      const existingTimeout = debounceTimeouts.current.get(oldKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        debounceTimeouts.current.delete(oldKey);
      }
      commitKeyUpdate(oldKey, pendingValue);
    }
  };

  const handleDeleteKey = (keyToDelete: string) => {
    setLocalValueMap((prev) => {
      const newMap = new Map(prev);
      Array.from(prev.keys()).forEach((key) => {
        if (key === keyToDelete || key.startsWith(`${keyToDelete}.`)) newMap.delete(key);
      });
      return newMap;
    });
    setUniqueKeySet((prev) => {
      const newSet = new Set(prev);
      newSet.delete(keyToDelete);
      return newSet;
    });
    setLocalValidationMap((prev) => {
      const newMap = new Map(prev);
      Array.from(prev.keys()).forEach((key) => {
        if (key === keyToDelete || key.startsWith(`${keyToDelete}.`)) newMap.delete(key);
      });
      return newMap;
    });
    setDuplicateKeys((prev) => {
      const updated = new Set(prev);
      updated.delete(keyToDelete);
      return updated;
    });
    setPendingKeyUpdates((prev) => {
      const updated = new Map(prev);
      updated.delete(keyToDelete);
      return updated;
    });
    const existingTimeout = debounceTimeouts.current.get(keyToDelete);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      debounceTimeouts.current.delete(keyToDelete);
    }
  };

  useEffect(() => {
    resetLocalValueMap(valueMap, validationMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, valueMap, validationMap]);
  useEffect(() => {
    setIsDisableAddBtn(Array.from(uniqueKeySet).some((key) => key.includes('<new-key>')));
  }, [uniqueKeySet]);
  useEffect(
    () => () => {
      debounceTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      debounceTimeouts.current.clear();
    },
    [],
  );

  const isSaveDisabled = (): boolean => {
    if (duplicateKeys.size > 0) return true;
    const hasNewOrEmptyKey = Array.from(uniqueKeySet).some((key) => {
      const pendingValue = pendingKeyUpdates.get(key);
      const keyValue = pendingValue !== undefined ? pendingValue : extractMapKey(key, jsonPath);
      return key.includes('<new-key>') || !keyValue.trim();
    });
    if (hasNewOrEmptyKey) return true;
    if (valueSchema && valueSchema.type === 'array') {
      const hasInsufficientArrayElements = Array.from(uniqueKeySet).some((key) => {
        const arrayElements = Array.from(localValueMap.keys()).filter((mapKey) => mapKey === key || mapKey.startsWith(`${key}.[`));
        return arrayElements.length === 0;
      });
      if (hasInsufficientArrayElements) return true;
    }
    return Array.from(localValidationMap.values()).some((isValid) => !isValid);
  };

  return (
    <Box>
      <Popover open={isPopoverOpen} anchorEl={anchorEl} onClose={handleClosePopover} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} transformOrigin={{ horizontal: 'right', vertical: 'top' }}>
        <Paper sx={{ p: 2, minWidth: 360, maxWidth: 480 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Add values
          </Typography>
          {Array.from(uniqueKeySet).map((key) => (
            <Box key={key} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, minWidth: 32 }}>
                  Key
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Enter the key"
                  value={pendingKeyUpdates.get(key) !== undefined ? pendingKeyUpdates.get(key) : extractMapKey(key, jsonPath)}
                  onChange={(event) => handleKeyInputChange(event as React.ChangeEvent<HTMLInputElement>, key)}
                  onBlur={() => handleKeyInputBlur(key)}
                  error={duplicateKeys.has(key)}
                  helperText={duplicateKeys.has(key) ? 'Key already exists' : ' '}
                />
                <IconButton size="small" color="error" onClick={() => handleDeleteKey(key)} aria-label="delete map entry">
                  <Trash2 size={14} />
                </IconButton>
              </Stack>
              <Box>
                {(() => {
                  if (valueSchema && (isBaseType(valueSchema.type) || valueSchema.enum)) {
                    return (
                      <BaseElement
                        title="Value"
                        type={valueSchema.enum ? 'string' : valueSchema.type || ''}
                        jsonPath={key}
                        valueMap={localValueMap}
                        handleValueChange={handleLocalValueChange}
                        isRequired={isRequired}
                        handleValidationChange={handleLocalValidationChange}
                        validationMap={localValidationMap}
                        isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                        allowLinking={allowLinking}
                        configGroups={configGroups}
                        linkingMap={linkingMap}
                        setLinkingMap={setLinkingMap}
                        sensitiveMap={sensitiveMap}
                        setSensitiveMap={setSensitiveMap}
                        isSkipLabel
                      />
                    );
                  }
                  if (valueSchema && valueSchema.type === 'object') {
                    return (
                      <ObjectElementContainer
                        title="Value"
                        type="object"
                        schema={valueSchema}
                        valueMap={localValueMap}
                        handleValueChange={handleLocalValueChange}
                        jsonPath={key}
                        isRequired={isRequired}
                        handleValidationChange={handleLocalValidationChange}
                        validationMap={localValidationMap}
                        isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                        allowLinking={allowLinking}
                        configGroups={configGroups}
                        linkingMap={linkingMap}
                        setLinkingMap={setLinkingMap}
                        sensitiveMap={sensitiveMap}
                        setSensitiveMap={setSensitiveMap}
                      />
                    );
                  }
                  if (valueSchema && valueSchema.type === 'array') {
                    return (
                      <ArrayElement
                        title="Value"
                        type="array"
                        schema={valueSchema.items}
                        jsonPath={generateArrayJsonPath(key)}
                        valueMap={localValueMap}
                        handleValueChange={handleLocalValueChange}
                        validationMap={localValidationMap}
                        handleValidationChange={handleLocalValidationChange}
                        disableAddButton={(() => {
                          const pendingValue = pendingKeyUpdates.get(key);
                          const keyValue = pendingValue !== undefined ? pendingValue : extractMapKey(key, jsonPath);
                          return !keyValue.trim();
                        })()}
                        isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                        allowLinking={allowLinking}
                        configGroups={configGroups}
                        linkingMap={linkingMap}
                        setLinkingMap={setLinkingMap}
                        sensitiveMap={sensitiveMap}
                        setSensitiveMap={setSensitiveMap}
                      />
                    );
                  }
                  if (valueSchema && valueSchema.anyOf) {
                    return (
                      <AnyOfElement
                        key={key}
                        title="Value"
                        jsonPath={key}
                        valueMap={localValueMap}
                        handleValueChange={handleLocalValueChange}
                        validationMap={localValidationMap}
                        handleValidationChange={handleLocalValidationChange}
                        schema={valueSchema}
                        isRequiredAtRequiredLevel={isRequiredAtRequiredLevel}
                        allowLinking={allowLinking}
                        configGroups={configGroups}
                        linkingMap={linkingMap}
                        setLinkingMap={setLinkingMap}
                        sensitiveMap={sensitiveMap}
                        setSensitiveMap={setSensitiveMap}
                      />
                    );
                  }
                  return null;
                })()}
              </Box>
            </Box>
          ))}
          <Box key={`${jsonPath}-ADD`}>
            <Button variant="text" size="small" startIcon={<Plus size={13} />} onClick={onAddMapElement} disabled={isDisableAddBtn} sx={{ textTransform: 'none' }}>
              Add
            </Button>
          </Box>
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1.5 }}>
            <Button size="small" variant="outlined" color="inherit" onClick={handleClosePopover}>
              Cancel
            </Button>
            <Button size="small" variant="contained" onClick={handlePopoverSave} disabled={isSaveDisabled()}>
              Save
            </Button>
          </Stack>
        </Paper>
      </Popover>

      <Box sx={{ mt: 1 }}>
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Typography variant="body2" color="text.secondary">
            {!isRequired && isRequiredAtRequiredLevel ? `${title} (Optional)` : title}
          </Typography>
          <Chip label="map" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="text" size="small" startIcon={uniqueKeySet.size > 1 || (uniqueKeySet.size === 1 && !isAddNewMapElement) ? <Edit2 size={13} /> : <Plus size={13} />} onClick={handleOpenPopover} sx={{ textTransform: 'none' }}>
            {uniqueKeySet.size > 1 || (uniqueKeySet.size === 1 && !isAddNewMapElement) ? 'Edit' : 'Add'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default MapElement;
