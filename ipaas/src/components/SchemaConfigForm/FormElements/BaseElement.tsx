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

import { useEffect, useMemo, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import { Box, Button, Chip, IconButton, InputAdornment, MenuItem, Popover, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import { Eye, EyeOff, Link2, Link2Off, Lock, Pencil, Unlock } from '@wso2/oxygen-ui-icons-react';
import type { BaseType, JSONSchema } from '../../../types/schema';
import { type LinkingInfo, isNumberType, typeDisplayName } from '../schemaUtils';
import { LinkedElement } from '../LinkedElement';
import { useLinkedFrom } from '../linkedFrom';

interface ConfigGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: { keyUuid: string; key: string; isSensitive?: boolean }[];
}

interface BaseElementProps {
  type: string;
  title: string;
  jsonPath: string;
  valueMap: Map<string, BaseType>;
  validationMap: Map<string, boolean>;
  handleValueChange: (key: string, value: BaseType, valueMap?: Map<string, BaseType>) => void;
  handleValidationChange: (jsonPath: string, isValid: boolean, validationMap?: Map<string, boolean>) => void;
  isRequired?: boolean;
  isRequiredAtRequiredLevel: boolean;
  schema?: JSONSchema;
  isSkipLabel?: boolean;
  allowLinking?: boolean;
  configGroups?: ConfigGroup[];
  linkingMap?: Map<string, LinkingInfo>;
  setLinkingMap?: Dispatch<SetStateAction<Map<string, LinkingInfo>>>;
  sensitiveMap?: Map<string, boolean>;
  setSensitiveMap?: Dispatch<SetStateAction<Map<string, boolean>>>;
}

export function BaseElement(props: BaseElementProps) {
  const source = useLinkedFrom(props.jsonPath);
  return source ? <LinkedElement title={props.title} source={source} /> : <EditableElement {...props} />;
}

function EditableElement({
  type,
  title,
  jsonPath,
  valueMap,
  validationMap,
  handleValueChange,
  handleValidationChange,
  isRequired,
  isRequiredAtRequiredLevel,
  schema,
  isSkipLabel,
  allowLinking,
  configGroups,
  linkingMap,
  setLinkingMap,
  sensitiveMap,
  setSensitiveMap,
}: BaseElementProps) {
  const numberRegex = /^-?\d+(\.\d+)?$/;
  const [showContent, setShowContent] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [error, setError] = useState('');
  const [showSensitiveInput, setShowSensitiveInput] = useState(true);
  // Secret popover state
  const [secretAnchorEl, setSecretAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [secretValue, setSecretValue] = useState('');
  const [secretError, setSecretError] = useState('');
  const [isValidSecret, setIsValidSecret] = useState(false);
  // Linking popover state
  const [linkAnchorEl, setLinkAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState('');

  const linked = useMemo(() => linkingMap?.has(jsonPath) || false, [linkingMap, jsonPath]);
  const linkedInfo = linkingMap?.get(jsonPath);
  const isSensitive = useMemo(() => sensitiveMap?.get(jsonPath) || false, [sensitiveMap, jsonPath]);
  const isExistingSensitiveConfig = useMemo(() => isSensitive && valueMap.has(jsonPath) && !valueMap.get(jsonPath), [isSensitive, valueMap, jsonPath]);

  useEffect(() => {
    if (isExistingSensitiveConfig) setShowSensitiveInput(false);
  }, [isExistingSensitiveConfig]);

  // Validation on mount
  useEffect(() => {
    if (isRequired && isRequiredAtRequiredLevel && type === 'boolean') {
      handleValidationChange(jsonPath, true);
      handleValueChange(jsonPath, valueMap.get(jsonPath) === 'true' || valueMap.get(jsonPath) === true || false);
    } else if (isRequired && isRequiredAtRequiredLevel && (valueMap.get(jsonPath) === undefined || valueMap.get(jsonPath) === null || valueMap.get(jsonPath) === '')) {
      if (isSensitive && valueMap.has(jsonPath)) {
        handleValidationChange(jsonPath, true);
      } else {
        handleValidationChange(jsonPath, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSensitive = () => {
    if (!setSensitiveMap || type === 'secret') return;
    setSensitiveMap((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(jsonPath) || false;
      newMap.set(jsonPath, !current);
      if (current) setShowSensitiveInput(true);
      return newMap;
    });
  };

  const updateLinking = (updates: Partial<LinkingInfo>) => {
    if (!setLinkingMap) return;
    const isUnlink = updates.configKeyId === '' || updates.isDynamic === true;
    setLinkingMap((prev) => {
      const newMap = new Map(prev);
      if (isUnlink) {
        newMap.delete(jsonPath);
        handleValueChange(jsonPath, '');
        if (isRequired && isRequiredAtRequiredLevel) handleValidationChange(jsonPath, false);
        return newMap;
      }
      const existing = newMap.get(jsonPath) || {};
      const next = { ...existing, ...updates };
      newMap.set(jsonPath, next);
      handleValidationChange(jsonPath, true);
      if (next.configGroupId && next.configKeyId && Array.isArray(configGroups)) {
        const group = configGroups.find((g) => g.groupUuid === next.configGroupId);
        const keyObj = group?.configurations.find((c) => c.keyUuid === next.configKeyId);
        if (group?.groupName && keyObj?.key) handleValueChange(jsonPath, `$${group.groupName}.${keyObj.key}`);
      }
      return newMap;
    });
  };

  const handleChange = (value: string) => {
    setIsEdited(true);
    handleValueChange(jsonPath, value);
    if (linked) {
      handleValidationChange(jsonPath, true);
      setError('');
    } else if (isRequired && !value) {
      handleValidationChange(jsonPath, false);
      setError('This field is required');
    } else if (isNumberType(type) && !isRequired && !value) {
      handleValidationChange(jsonPath, true);
      setError('');
    } else if (isNumberType(type) && !numberRegex.test(value)) {
      handleValidationChange(jsonPath, false);
      setError('Must consist of numbers only');
    } else {
      handleValidationChange(jsonPath, true);
      setError('');
    }
  };

  const handleSecretChange = (value: string) => {
    setIsEdited(true);
    setSecretValue(value);
    if (isRequired && !value) {
      setIsValidSecret(false);
      setSecretError('This field is required');
    } else {
      setIsValidSecret(true);
      setSecretError('');
    }
  };

  const handleSecretSave = () => {
    if (secretValue) {
      handleValueChange(jsonPath, secretValue);
      handleValidationChange(jsonPath, true);
    } else {
      setIsValidSecret(false);
      handleValidationChange(jsonPath, false);
    }
    setSecretAnchorEl(null);
    setShowSensitiveInput(true);
  };

  const handleLinkOpen = (e: MouseEvent<HTMLButtonElement>) => {
    setSelectedGroupId(linkedInfo?.configGroupId || '');
    setSelectedKeyId(linkedInfo?.configKeyId || '');
    setLinkAnchorEl(e.currentTarget);
  };

  const handleLinkSave = () => {
    if (selectedGroupId && selectedKeyId) {
      updateLinking({ configGroupId: selectedGroupId, configKeyId: selectedKeyId, isDynamic: false });
    }
    setLinkAnchorEl(null);
  };

  const handleUnlink = () => {
    updateLinking({ configKeyId: '', isDynamic: false });
    setSelectedGroupId('');
    setSelectedKeyId('');
    setLinkAnchorEl(null);
  };

  const selectedGroup = configGroups?.find((g) => g.groupUuid === selectedGroupId) ?? null;
  const sensitiveAdornment = (
    <Tooltip title={isSensitive ? 'Mark as non-sensitive (stored in database)' : 'Mark as sensitive (stored in Key Vault)'}>
      <IconButton size="small" onClick={toggleSensitive} sx={{ p: 0.25 }}>
        {isSensitive ? <Lock size={14} /> : <Unlock size={14} />}
      </IconButton>
    </Tooltip>
  );

  const linkAdornment = allowLinking && (
    <>
      <Tooltip title={linked ? 'Linked to config group' : 'Link to config group'}>
        <IconButton size="small" onClick={linked ? handleUnlink : handleLinkOpen} sx={{ p: 0.25 }}>
          {linked ? <Link2Off size={14} /> : <Link2 size={14} />}
        </IconButton>
      </Tooltip>
      <Popover open={Boolean(linkAnchorEl)} anchorEl={linkAnchorEl} onClose={() => setLinkAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 2, minWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Link Configuration Group
          </Typography>
          <TextField
            select
            fullWidth
            size="small"
            label="Config Group"
            value={selectedGroupId}
            onChange={(e) => {
              setSelectedGroupId(e.target.value);
              setSelectedKeyId('');
            }}
            sx={{ mb: 1.5 }}>
            {(configGroups || []).map((g) => (
              <MenuItem key={g.groupUuid} value={g.groupUuid}>
                {g.groupDisplayName || g.groupName}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth size="small" label="Config Key" value={selectedKeyId} onChange={(e) => setSelectedKeyId(e.target.value)} disabled={!selectedGroupId} sx={{ mb: 1.5 }}>
            {(selectedGroup?.configurations || []).map((c) => (
              <MenuItem key={c.keyUuid} value={c.keyUuid}>
                {c.key}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" justifyContent="flex-end" gap={1}>
            <Button size="small" onClick={() => setLinkAnchorEl(null)}>
              Cancel
            </Button>
            <Button size="small" variant="contained" disabled={!selectedGroupId || !selectedKeyId} onClick={handleLinkSave}>
              Link
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );

  if (schema?.enum) {
    return (
      <Box sx={{ mt: 1.5 }}>
        {!isSkipLabel && (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {title}
            </Typography>
            {isRequired && (
              <Typography component="span" variant="body2" sx={{ color: 'error.main', lineHeight: 1, fontFamily: 'monospace' }}>
                *
              </Typography>
            )}
            <Chip label={typeDisplayName(type)} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
            {!isRequired && isRequiredAtRequiredLevel && <Chip label="optional" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />}
          </Stack>
        )}
        <TextField
          select
          fullWidth
          size="small"
          value={String(valueMap.get(jsonPath) ?? '')}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!!linked}
          error={isEdited && !linked && validationMap.get(jsonPath) === false}
          helperText={isEdited && !linked && validationMap.get(jsonPath) === false ? error : undefined}
          inputProps={{ 'aria-required': Boolean(isRequired) }}
          InputProps={{ endAdornment: linkAdornment ? <InputAdornment position="end">{linkAdornment}</InputAdornment> : undefined }}>
          <MenuItem value="">
            <em>Select an option</em>
          </MenuItem>
          {(schema.enum as (string | number)[]).map((item) => (
            <MenuItem key={String(item)} value={String(item)}>
              {String(item)}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    );
  }

  if (type === 'boolean') {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          {!isSkipLabel && (
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {title}
            </Typography>
          )}
          {!isSkipLabel && isRequired && (
            <Typography component="span" variant="body2" sx={{ color: 'error.main', lineHeight: 1, fontFamily: 'monospace' }}>
              *
            </Typography>
          )}
          <Chip label="boolean" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
          <Switch
            size="small"
            checked={valueMap.get(jsonPath) === 'true' || valueMap.get(jsonPath) === true || false}
            disabled={!!linked}
            inputProps={{ 'aria-required': Boolean(isRequired) }}
            onChange={(e) => {
              handleValueChange(jsonPath, e.target.checked);
              handleValidationChange(jsonPath, true);
            }}
          />
          {linkAdornment}
        </Stack>
      </Box>
    );
  }

  if (type === 'secret') {
    return (
      <>
        <Popover open={Boolean(secretAnchorEl)} anchorEl={secretAnchorEl} onClose={() => setSecretAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
          <Box sx={{ p: 2, minWidth: 320 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Update Secret Content
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Updating the value removes the previous value permanently and cannot be restored.
            </Typography>
            <TextField
              fullWidth
              size="small"
              label={!isSkipLabel ? title : ''}
              type={showContent ? 'text' : 'password'}
              value={secretValue}
              onChange={(e) => handleSecretChange(e.target.value)}
              error={!isValidSecret && isEdited}
              helperText={secretError}
              inputProps={{ 'aria-required': Boolean(isRequired) }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowContent((p) => !p)} sx={{ p: 0.25 }}>
                      {showContent ? <EyeOff size={14} /> : <Eye size={14} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1.5 }}>
              <Button size="small" onClick={() => setSecretAnchorEl(null)}>
                Cancel
              </Button>
              <Button size="small" variant="contained" disabled={!secretValue} onClick={handleSecretSave}>
                Save
              </Button>
            </Stack>
          </Box>
        </Popover>

        <Box sx={{ mt: 1.5 }}>
          {valueMap.has(jsonPath) && !showSensitiveInput ? (
            <>
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
                {!isSkipLabel && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {title}
                  </Typography>
                )}
                {!isSkipLabel && isRequired && (
                  <Typography component="span" variant="body2" sx={{ color: 'error.main', lineHeight: 1, fontFamily: 'monospace' }}>
                    *
                  </Typography>
                )}
                <Chip label="secret" size="small" variant="outlined" color="info" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
              </Stack>
              <Button size="small" variant="text" startIcon={<Pencil size={13} />} onClick={(e) => setSecretAnchorEl(e.currentTarget as HTMLButtonElement)} sx={{ textTransform: 'none' }}>
                Update Secret Content
              </Button>
            </>
          ) : (
            <TextField
              fullWidth
              size="small"
              label={!isSkipLabel ? title : undefined}
              type={showContent ? 'text' : 'password'}
              value={String(valueMap.get(jsonPath) ?? '')}
              onChange={(e) => handleChange(e.target.value)}
              error={isEdited && !linked && validationMap.get(jsonPath) === false}
              helperText={isEdited && !linked && validationMap.get(jsonPath) === false ? error : undefined}
              inputProps={{ 'aria-required': Boolean(isRequired) }}
              InputProps={{
                readOnly: !!linked,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowContent((p) => !p)} sx={{ p: 0.25 }}>
                      {showContent ? <EyeOff size={14} /> : <Eye size={14} />}
                    </IconButton>
                    {linkAdornment}
                  </InputAdornment>
                ),
              }}
            />
          )}
        </Box>
      </>
    );
  }

  // string / number types
  if (isSensitive && !showSensitiveInput) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
          {!isSkipLabel && (
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {title}
            </Typography>
          )}
          {!isSkipLabel && isRequired && (
            <Typography component="span" variant="body2" sx={{ color: 'error.main', lineHeight: 1, fontFamily: 'monospace' }}>
              *
            </Typography>
          )}
          <Chip label="secret" size="small" variant="outlined" color="info" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
          <Tooltip title="Mark as non-sensitive (stored in database)">
            <IconButton size="small" onClick={toggleSensitive} sx={{ p: 0.25 }}>
              <Lock size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Button size="small" variant="text" startIcon={<Pencil size={13} />} onClick={() => setShowSensitiveInput(true)} sx={{ textTransform: 'none' }}>
          Update Sensitive Content
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      {!isSkipLabel && (
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {title}
          </Typography>
          {isRequired && (
            <Typography component="span" variant="body2" sx={{ color: 'error.main', lineHeight: 1, fontFamily: 'monospace' }}>
              *
            </Typography>
          )}
          <Chip label={isSensitive ? 'secret' : typeDisplayName(type)} size="small" variant="outlined" color={isSensitive ? 'info' : 'default'} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
          {!isRequired && isRequiredAtRequiredLevel && <Chip label="optional" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />}
        </Stack>
      )}
      <TextField
        fullWidth
        size="small"
        type={isSensitive && !showContent ? 'password' : 'text'}
        value={String(valueMap.get(jsonPath) ?? '')}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter a value"
        error={isEdited && !linked && validationMap.get(jsonPath) === false}
        helperText={isEdited && !linked && validationMap.get(jsonPath) === false ? error : undefined}
        inputProps={{ 'aria-required': Boolean(isRequired) }}
        InputProps={{
          readOnly: !!linked,
          endAdornment: (
            <InputAdornment position="end">
              {sensitiveAdornment}
              {isSensitive && (
                <IconButton size="small" onClick={() => setShowContent((p) => !p)} sx={{ p: 0.25 }}>
                  {showContent ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconButton>
              )}
              {linkAdornment}
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
}
