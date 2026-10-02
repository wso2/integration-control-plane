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

import { Alert, Autocomplete, Box, Chip, FormControlLabel, Radio, RadioGroup, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useUploadAudience } from '../../../hooks/useContextEngine';
import { visibilityError, visibilityWarnings } from '../../../utils/contextEngine';
import type { FileVisibility } from '../../../types/contextEngine';

interface FileVisibilityFieldProps {
  id: string;
  /** The question, e.g. "Who can see these 3 files". */
  label: string;
  orgHandle: string;
  value: FileVisibility;
  onChange: (value: FileVisibility) => void;
  /** Roles granted query access. Left out where query access is not chosen yet, as in the wizard's first step. */
  queryRoles?: string[];
}

/**
 * Who can see uploaded files: everyone who can query the engine, or only some
 * org roles. One choice instead of a label plus a rule; warnings say when the
 * choice would hide the files from their uploader or from roles that cannot query.
 */
export default function FileVisibilityField({ id, label, orgHandle, value, onChange, queryRoles }: FileVisibilityFieldProps): JSX.Element {
  const { roles, rolesLoading, rolesFailed, roleNames, myGroups, everyone } = useUploadAudience(orgHandle, queryRoles ?? []);
  const chosen = value.kind === 'roles' ? value.roles : [];
  const error = visibilityError(value);
  const warnings = visibilityWarnings({ visibility: value, everyone, queryRoles, myGroups, roleNames });

  return (
    <Box role="group" aria-labelledby={`${id}-label`}>
      <Typography id={`${id}-label`} variant="subtitle2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <RadioGroup value={value.kind} onChange={(_e, kind) => onChange(kind === 'roles' ? { kind: 'roles', roles: chosen } : { kind: 'everyone' })} sx={{ mt: 0.5 }}>
        <FormControlLabel
          value="everyone"
          control={<Radio size="small" />}
          label={
            <Box sx={{ py: 0.5 }}>
              <Typography variant="body2">Everyone who can query this engine</Typography>
              <Typography variant="caption" color="text.secondary">
                Roles granted access later can find them too.
              </Typography>
            </Box>
          }
        />
        <FormControlLabel value="roles" control={<Radio size="small" />} label={<Typography variant="body2">Only some roles</Typography>} />
      </RadioGroup>

      {value.kind === 'roles' &&
        (rolesFailed ? (
          <TextField
            id={`${id}-roles`}
            size="small"
            fullWidth
            label="Role handles"
            value={chosen.join(', ')}
            placeholder="e.g. developer, admin"
            error={!!error}
            helperText={error || "Couldn't load org roles — enter role handles separated by commas."}
            onChange={(e) =>
              onChange({
                kind: 'roles',
                roles: e.target.value
                  .split(',')
                  .map((r) => r.trim())
                  .filter(Boolean),
              })
            }
            sx={{ mt: 1, pl: 3.5 }}
          />
        ) : (
          <Autocomplete
            id={`${id}-roles`}
            multiple
            disableCloseOnSelect
            loading={rolesLoading}
            options={roles.map((r) => r.roleId)}
            value={chosen}
            getOptionLabel={(roleId) => roleNames[roleId] ?? roleId}
            onChange={(_e, next) => onChange({ kind: 'roles', roles: next as string[] })}
            renderTags={(tags: string[], getTagProps) =>
              tags.map((roleId, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return <Chip key={key} label={roleNames[roleId] ?? roleId} size="small" {...tagProps} />;
              })
            }
            renderInput={(params) => <TextField {...params} size="small" label="Roles" placeholder={chosen.length ? '' : 'Choose roles'} error={!!error} helperText={error || 'Members of these roles who can query this engine can find the files.'} />}
            sx={{ mt: 1, pl: 3.5 }}
          />
        ))}

      {warnings.map((w) => (
        <Alert key={w} severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
          {w}
        </Alert>
      ))}
    </Box>
  );
}
