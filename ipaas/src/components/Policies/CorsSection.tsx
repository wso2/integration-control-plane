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

import { Alert, Autocomplete, Checkbox, Chip, Collapse, FormControlLabel, Stack, Switch, Typography, TextField } from '@wso2/oxygen-ui';
import { Info } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { CORS_METHOD_OPTIONS, DEFAULT_CORS_HEADERS } from '../../constants/policy';
import type { CorsConfig } from '../../types/policy';
import { isPlatformEntry } from '../../utils/endpointPolicy';
import { allowsAllOrigins } from '../../utils/policy';

interface CorsSectionProps {
  value: CorsConfig;
  onChange: (value: CorsConfig) => void;
  disabled?: boolean;
}

function TagField({ label, options, values, onChange, disabled, seeded }: { label: string; options: string[]; values: string[]; onChange: (v: string[]) => void; disabled?: boolean; seeded?: string[] }) {
  return (
    <Autocomplete
      multiple
      freeSolo
      disableCloseOnSelect
      options={options}
      value={values}
      disabled={disabled}
      onChange={(_, v) => onChange(v as string[])}
      renderTags={(tags: string[], getTagProps) =>
        tags.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          // Marked, not locked: removing it is allowed, and costs the Test Console its access.
          const isSeeded = isPlatformEntry(option, seeded);
          return (
            <Chip
              key={key}
              label={option}
              size="small"
              variant="outlined"
              icon={isSeeded ? <Info size={11} /> : undefined}
              title={isSeeded ? 'Added by default so the Test Console can call this endpoint. Removing it stops the console testing this endpoint.' : undefined}
              {...tagProps}
            />
          );
        })
      }
      renderInput={(params) => <TextField labelPlacement="top" {...params} size="small" label={label} optional />}
    />
  );
}

/**
 * Editor for the MCP API's CORS configuration. Controlled by the parent page
 * so it can track dirty state and save the whole API in one PUT.
 */
export default function CorsSection({ value, onChange, disabled }: CorsSectionProps): ReactNode {
  const wildcardOrigins = allowsAllOrigins(value);
  return (
    <Stack gap={1.5}>
      <FormControlLabel control={<Switch size="small" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} disabled={disabled} />} label={<Typography variant="body2">Enable CORS</Typography>} />

      {!value.enabled && (
        <Alert severity="warning" sx={{ mt: -0.5 }}>
          With CORS off the gateway returns no Access-Control-Allow-Origin, so browsers cannot use responses from this endpoint — the Test Console included. Server-side callers (curl, backends) are unaffected.
        </Alert>
      )}

      <Collapse in={value.enabled} unmountOnExit>
        <Stack gap={2} sx={{ pl: 0.5 }}>
          {/* Ticking allow-all clears credentials in the model, not just in the view. */}
          <FormControlLabel
            control={<Checkbox size="small" checked={value.allowAllOrigins} onChange={(e) => onChange({ ...value, allowAllOrigins: e.target.checked, allowCredentials: e.target.checked ? false : value.allowCredentials })} disabled={disabled} />}
            label={<Typography variant="body2">Allow all origins (*)</Typography>}
          />

          {!value.allowAllOrigins && <TagField label="Access control allow origins" options={[]} values={value.origins} onChange={(v) => onChange({ ...value, origins: v })} disabled={disabled} seeded={value.platformOrigins} />}

          <TagField label="Access control allow headers" options={DEFAULT_CORS_HEADERS} values={value.headers} onChange={(v) => onChange({ ...value, headers: v })} disabled={disabled} seeded={value.platformHeaders} />

          <TagField label="Access control allow methods" options={CORS_METHOD_OPTIONS} values={value.methods} onChange={(v) => onChange({ ...value, methods: v })} disabled={disabled} />

          {/* Credentials + a wildcard origin makes the gateway 500 every request, so don't offer it. */}
          <FormControlLabel
            control={<Checkbox size="small" checked={value.allowCredentials && !wildcardOrigins} onChange={(e) => onChange({ ...value, allowCredentials: e.target.checked })} disabled={disabled || wildcardOrigins} />}
            label={
              <Typography variant="body2" color={wildcardOrigins ? 'text.disabled' : undefined}>
                Allow credentials{wildcardOrigins ? ' — unavailable while all origins are allowed' : ''}
              </Typography>
            }
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
