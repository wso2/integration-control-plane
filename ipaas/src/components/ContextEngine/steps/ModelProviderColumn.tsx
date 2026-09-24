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

import { Box, Checkbox, FormControlLabel, MenuItem, Select, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import SelectableCard from '../../Databases/create/SelectableCard';
import SecretField from '../../RagIngestion/SecretField';
import { modelColumnSx, modelTileGridSx } from '../styles';

/** The fields every model config shares, whichever provider union it belongs to. */
export interface ModelLike {
  provider: string;
  model: string;
  apiKey: string;
  azureBaseUrl: string;
  azureApiVersion: string;
}

export interface ProviderOption {
  id: string;
  name: string;
  /** Full logo URL. */
  logo: string;
  /** Selectable model ids; empty means a free-text deployment id (Azure). */
  models: string[];
}

interface ShareKeyOption {
  /** Both models use the same provider, so one key can serve both. */
  available: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface ModelProviderColumnProps<T extends ModelLike> {
  title: string;
  purpose: string;
  providers: ProviderOption[];
  value: T | null;
  onChange: (value: T) => void;
  /** A blank config for a provider id. */
  blank: (providerId: string) => T;
  /** Language-model column only: reuse the embedding key instead of asking for one. */
  shareKey?: ShareKeyOption;
  /** Accessible name for the model selector. */
  modelLabel: string;
}

/** One model choice — provider tiles, model, credentials — laid out as a column so two fit side by side. */
export default function ModelProviderColumn<T extends ModelLike>({ title, purpose, providers, value, onChange, blank, shareKey, modelLabel }: ModelProviderColumnProps<T>): JSX.Element {
  const providerInfo = providers.find((p) => p.id === value?.provider);
  const models = providerInfo?.models ?? [];
  const keyShared = !!shareKey?.available && shareKey.checked;

  return (
    <Box sx={modelColumnSx}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {purpose}
        </Typography>
      </Box>

      <Box sx={modelTileGridSx}>
        {providers.map((p) => (
          <SelectableCard key={p.id} title={p.name} logo={p.logo} selected={value?.provider === p.id} onSelect={() => onChange(blank(p.id))} />
        ))}
      </Box>

      {value && (
        <Stack gap={2}>
          {models.length > 0 ? (
            <Select
              size="small"
              fullWidth
              displayEmpty
              required
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              inputProps={{ 'aria-label': modelLabel }}
              renderValue={(selected) =>
                selected ? (
                  String(selected)
                ) : (
                  <Typography component="span" color="text.secondary">
                    Model{' '}
                    <Typography component="span" sx={{ color: 'error.main' }}>
                      *
                    </Typography>
                  </Typography>
                )
              }>
              {models.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <TextField label="Deployment Id" required fullWidth size="small" value={value.model} placeholder="Enter the deployment/model id" onChange={(e) => onChange({ ...value, model: e.target.value })} sx={REQUIRED_FIELD_SX} />
          )}

          {value.provider === 'azure_openai' && (
            <>
              <TextField label="Base URL" required fullWidth size="small" value={value.azureBaseUrl} placeholder="https://<resource>.openai.azure.com" onChange={(e) => onChange({ ...value, azureBaseUrl: e.target.value })} sx={REQUIRED_FIELD_SX} />
              <TextField label="API Version" required fullWidth size="small" value={value.azureApiVersion} onChange={(e) => onChange({ ...value, azureApiVersion: e.target.value })} sx={REQUIRED_FIELD_SX} />
            </>
          )}

          {shareKey?.available && <FormControlLabel control={<Checkbox size="small" checked={shareKey.checked} onChange={(_e, checked) => shareKey.onChange(checked)} />} label="Use the same API key as the embedding model" />}

          {!keyShared && <SecretField label="API Key" required value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />}
        </Stack>
      )}
    </Box>
  );
}
