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

import { Grid, MenuItem, Select, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { blankLlm, contextLogoUrl, LLM_PROVIDERS } from '../../../constants/contextEngine';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import SelectableCard from '../../Databases/create/SelectableCard';
import SecretField from '../../RagIngestion/SecretField';
import { fieldStackSx, stepHeadingSx, stepHintSx, tileGridSx } from '../styles';
import type { LlmConfig } from '../../../types/contextEngine';

interface LlmModelStepProps {
  value: LlmConfig | null;
  onChange: (value: LlmConfig) => void;
}

/** The language model that answers questions over retrieved context. Mirrors the embedding step's layout. */
export default function LlmModelStep({ value, onChange }: LlmModelStepProps): JSX.Element {
  const providerInfo = LLM_PROVIDERS.find((p) => p.id === value?.provider);
  const models = providerInfo?.models ?? [];

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure Language Model
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Used in answer mode to compose a response from the evidence the engine retrieves.
      </Typography>

      <Grid container spacing={2} sx={tileGridSx}>
        {LLM_PROVIDERS.map((p) => (
          <Grid key={p.id} size={{ xs: 12, sm: 6, md: 3 }}>
            <SelectableCard title={p.name} logo={contextLogoUrl(p.logo)} selected={value?.provider === p.id} onSelect={() => onChange(blankLlm(p.id))} />
          </Grid>
        ))}
      </Grid>

      {value && (
        <Stack sx={fieldStackSx}>
          {models.length > 0 ? (
            <Select
              size="small"
              fullWidth
              displayEmpty
              required
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              inputProps={{ 'aria-label': 'Language model' }}
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

          <SecretField label="API Key" required value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />
        </Stack>
      )}
    </>
  );
}
