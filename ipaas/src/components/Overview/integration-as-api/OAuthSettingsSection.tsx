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

import { Autocomplete, Box, Checkbox, Chip, Divider, FormControlLabel, Stack, Switch, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { DEFAULT_JWT_KEY_MANAGER } from '../../../constants/apiConsumption';
import type { EndpointPolicyOperation } from '../../../types/consumers';
import { forwardedTokenExample, splitScopes, toJwtSecurity, tokenHeaderExample, type JwtForm, type JwtFormErrors, type ScopeLists } from '../../../utils/jwtSecurity';
import * as styles from './apiConsumption.styles';

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
}

/** Free-text chips. A value typed but not yet entered is kept when the field loses focus. */
function TagInput({ label, values, onChange, disabled, error, helperText, placeholder }: TagInputProps): JSX.Element {
  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      options={[] as string[]}
      value={values}
      disabled={disabled}
      onChange={(_, v) => onChange(v as string[])}
      renderTags={(tags: string[], getTagProps) =>
        tags.map((tag, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} label={tag} size="small" variant="outlined" {...tagProps} />;
        })
      }
      renderInput={(params) => <TextField labelPlacement="top" {...params} size="small" label={label} optional placeholder={values.length ? undefined : placeholder} error={!!error} helperText={error ?? helperText} />}
    />
  );
}

interface OAuthSettingsSectionProps {
  value: JwtForm;
  onChange: (value: JwtForm) => void;
  errors: JwtFormErrors;
  /** Key managers the API trusts, as saved; shown, not chosen. */
  issuers?: string[];
  /** Routes the API secures: what scopes attach to. */
  operations: EndpointPolicyOperation[];
  disabled?: boolean;
}

/**
 * The OAuth (jwt) options of one exposed API: where the token is read from, which tokens are
 * accepted, how the token reaches the backend, and the scopes each operation requires. The token
 * header itself is edited in the scheme table above it.
 */
export default function OAuthSettingsSection({ value, onChange, errors, issuers, operations, disabled }: OAuthSettingsSectionProps): JSX.Element {
  const set = <K extends keyof JwtForm>(key: K, v: JwtForm[K]) => onChange({ ...value, [key]: v });
  const setScopes = (key: string, lists: ScopeLists) => set('scopes', { ...value.scopes, [key]: lists });
  // The examples read the form through the same cleaning a save applies.
  const preview = toJwtSecurity(value, issuers);
  const forwarded = forwardedTokenExample(preview);

  return (
    <Stack gap={2.5}>
      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={styles.sectionTitle}>
          Token
        </Typography>
        <Stack gap={2}>
          <TextField
            labelPlacement="top"
            size="small"
            label="Token prefix"
            value={value.authHeaderPrefix}
            onChange={(e) => set('authHeaderPrefix', e.target.value)}
            disabled={disabled}
            error={!!errors.authHeaderPrefix}
            helperText={errors.authHeaderPrefix ?? `Clients send ${tokenHeaderExample(preview)}.`}
          />
          <TextField labelPlacement="top" size="small" label="Key manager" value={(issuers?.length ? issuers : [DEFAULT_JWT_KEY_MANAGER]).join(', ')} disabled helperText="Tokens must be issued by this environment’s ThunderID." />
          <TagInput
            label="Audiences"
            values={value.audiences}
            onChange={(v) => set('audiences', v.map((a) => a.trim()).filter(Boolean))}
            disabled={disabled}
            error={errors.audiences}
            helperText="A token must carry at least one of these in its aud claim. Leave empty to accept any audience."
            placeholder="Add an audience"
          />
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={styles.sectionTitle}>
          Backend
        </Typography>
        <Stack gap={1.5}>
          <FormControlLabel control={<Switch size="small" checked={value.forwardToken} onChange={(e) => set('forwardToken', e.target.checked)} disabled={disabled} />} label={<Typography variant="body2">Forward the token to the backend</Typography>} />
          {value.forwardToken ? (
            <>
              <TextField
                labelPlacement="top"
                size="small"
                label="Forwarded token header"
                value={value.forwardedTokenHeader}
                onChange={(e) => set('forwardedTokenHeader', e.target.value)}
                disabled={disabled}
                error={!!errors.forwardedTokenHeader}
                helperText={errors.forwardedTokenHeader ?? 'Set it to the token header to forward the token in the same header.'}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={value.forwardTokenStripScheme} onChange={(e) => set('forwardTokenStripScheme', e.target.checked)} disabled={disabled} />}
                label={<Typography variant="body2">Forward only the token, without the prefix</Typography>}
              />
              <Typography variant="caption" color="text.secondary">
                The backend receives <Box component="code">{forwarded}</Box>.
              </Typography>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              The gateway removes the token before it passes the request to the backend.
            </Typography>
          )}
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={styles.sectionTitle}>
          Scopes
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={styles.sectionDescription}>
          A token without the scopes an operation requires gets 401. An operation with no scopes accepts any valid token.
        </Typography>
        {operations.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            This API has no operations to set scopes on.
          </Typography>
        ) : (
          <Stack gap={1.5}>
            {operations.map((op) => {
              const lists = value.scopes[op.key] ?? { allOf: [], anyOf: [] };
              const error = errors.scopes?.[op.key];
              return (
                <Box key={op.key} sx={styles.operationScopes}>
                  <Stack direction="row" alignItems="center" gap={1} sx={styles.operationHeading}>
                    <Chip label={op.method} size="small" variant="outlined" sx={styles.methodChip} />
                    <Typography variant="body2" sx={styles.operationPath}>
                      {op.path}
                    </Typography>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                    <Box sx={styles.scopeField}>
                      <TagInput label="All of" values={lists.allOf} onChange={(v) => setScopes(op.key, { ...lists, allOf: splitScopes(v) })} disabled={disabled} placeholder="Add a scope" />
                    </Box>
                    <Box sx={styles.scopeField}>
                      <TagInput label="Any of" values={lists.anyOf} onChange={(v) => setScopes(op.key, { ...lists, anyOf: splitScopes(v) })} disabled={disabled} placeholder="Add a scope" />
                    </Box>
                  </Stack>
                  {error && (
                    <Typography variant="caption" color="error.main" component="p" sx={styles.sectionDescription}>
                      {error}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
