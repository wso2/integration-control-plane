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

import { Box, Checkbox, FormControlLabel, Link, MenuItem, Select, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX, type ReactNode } from 'react';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { isCustomModel } from '../../../utils/contextEngine';
import SelectableCard from '../../common/SelectableCard';
import SecretField from '../../common/SecretField';
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
  /** Full URL of the dark theme logo, when the logo is dark. */
  logoDark?: string;
  /** Selectable model ids; empty means the model id is typed in. */
  models: string[];
  /** Listed, but the engine cannot be configured with it yet. */
  unavailable?: boolean;
}

/** Select value for the last option, which swaps the list for a text field. */
const OTHER_MODEL = '__other__';

interface ShareKeyOption {
  /** Both models use the same provider, so one key can serve both. */
  available: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface ModelProviderColumnProps<T extends ModelLike> {
  title: string;
  purpose?: string;
  providers: ProviderOption[];
  value: T | null;
  onChange: (value: T) => void;
  /** A blank config for a provider id. */
  blank: (providerId: string) => T;
  /** Language-model column only: reuse the embedding key instead of asking for one. */
  shareKey?: ShareKeyOption;
  /** Accessible name for the model selector. */
  modelLabel: string;
  /** Shown under the purpose line, before the providers. */
  choice?: ReactNode;
  /** False leaves only the title, purpose and choice. */
  showProviders?: boolean;
}

/** One model choice — provider tiles, model, credentials — laid out as a column so three fit side by side. */
export default function ModelProviderColumn<T extends ModelLike>({ title, purpose, providers, value, onChange, blank, shareKey, modelLabel, choice, showProviders = true }: ModelProviderColumnProps<T>): JSX.Element {
  const providerInfo = providers.find((p) => p.id === value?.provider);
  const models = providerInfo?.models ?? [];
  const keyShared = !!shareKey?.available && shareKey.checked;
  const [otherChosen, setOtherChosen] = useState(false);
  const typed = otherChosen || (!!value && isCustomModel(value.model, models));

  return (
    <Box sx={modelColumnSx}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {purpose && (
          <Typography variant="body2" color="text.secondary">
            {purpose}
          </Typography>
        )}
      </Box>

      {choice}

      {showProviders && (
        <Box sx={modelTileGridSx}>
          {providers.map((p) => (
            <SelectableCard
              key={p.id}
              title={p.name}
              description={p.unavailable ? 'Not available yet' : undefined}
              logo={p.logo}
              logoDark={p.logoDark}
              selected={value?.provider === p.id}
              disabled={p.unavailable}
              onSelect={() => {
                setOtherChosen(false);
                onChange(blank(p.id));
              }}
            />
          ))}
        </Box>
      )}
      {showProviders && providerInfo?.unavailable && (
        <Typography variant="caption" color="error">
          {providerInfo.name} is not available yet. Choose another provider.
        </Typography>
      )}

      {showProviders && value && (
        <Stack gap={2}>
          {!typed ? (
            <Select
              size="small"
              fullWidth
              displayEmpty
              required
              value={value.model}
              onChange={(e) => {
                if (e.target.value === OTHER_MODEL) {
                  setOtherChosen(true);
                  onChange({ ...value, model: '' });
                } else onChange({ ...value, model: e.target.value });
              }}
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
              <MenuItem value={OTHER_MODEL}>Other model…</MenuItem>
            </Select>
          ) : (
            <Box>
              <TextField label="Model id" required fullWidth size="small" value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} sx={REQUIRED_FIELD_SX} />
              {models.length > 0 && (
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  onClick={() => {
                    setOtherChosen(false);
                    onChange({ ...value, model: '' });
                  }}
                  sx={{ mt: 0.75 }}>
                  Choose from the list
                </Link>
              )}
            </Box>
          )}

          {shareKey?.available && <FormControlLabel control={<Checkbox size="small" checked={shareKey.checked} onChange={(_e, checked) => shareKey.onChange(checked)} />} label="Use the same API key as the embedding model" />}

          {!keyShared && <SecretField label="API Key" required value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />}
        </Stack>
      )}
    </Box>
  );
}
