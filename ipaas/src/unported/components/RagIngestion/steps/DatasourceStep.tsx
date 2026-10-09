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

import { Grid, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { type JSX } from 'react';
import { blankDatasource, DATASOURCES, GDRIVE_AUTH_TYPES, ragLogoUrl } from '../../../../constants/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../../constants/styles';
import SelectableCard from '../../Databases/create/SelectableCard';
import SecretField from '../SecretField';
import { fieldStackSx, stepHeadingSx, tileGridSx } from '../styles';
import type { DatasourceConfig, GdriveAuthType } from '../../../../types/ragIngestion';

interface DatasourceStepProps {
  value: DatasourceConfig | null;
  onChange: (value: DatasourceConfig) => void;
}

export default function DatasourceStep({ value, onChange }: DatasourceStepProps): JSX.Element {
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure Datasource
      </Typography>

      <Grid container spacing={2} sx={tileGridSx}>
        {DATASOURCES.map((d) => (
          <Grid key={d.id} size={{ xs: 12, sm: 6 }}>
            <SelectableCard title={d.name} logo={ragLogoUrl(d.logo)} selected={value?.type === d.id} onSelect={() => onChange(blankDatasource(d.id))} />
          </Grid>
        ))}
      </Grid>

      {value?.type === 'gdrive' && (
        <Stack sx={fieldStackSx}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={value.authType}
            onChange={(_e, next: GdriveAuthType | null) => {
              if (next) onChange({ ...value, authType: next });
            }}>
            {GDRIVE_AUTH_TYPES.map((a) => (
              <ToggleButton key={a.value} value={a.value}>
                {a.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {value.authType === 'api_Key' ? (
            <SecretField label="API Key" required value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />
          ) : (
            <>
              <TextField label="Client ID" required fullWidth size="small" value={value.clientId} onChange={(e) => onChange({ ...value, clientId: e.target.value })} sx={REQUIRED_FIELD_SX} />
              <SecretField label="Client Secret" required value={value.clientSecret} onChange={(v) => onChange({ ...value, clientSecret: v })} />
              <SecretField label="Refresh Token" required value={value.refreshToken} onChange={(v) => onChange({ ...value, refreshToken: v })} />
            </>
          )}
          <TextField label="Folder ID" required fullWidth size="small" value={value.folderId} onChange={(e) => onChange({ ...value, folderId: e.target.value })} sx={REQUIRED_FIELD_SX} />
        </Stack>
      )}

      {value?.type === 'amazons3' && (
        <Stack sx={fieldStackSx}>
          <SecretField label="Access Key ID" required value={value.accessKeyId} onChange={(v) => onChange({ ...value, accessKeyId: v })} />
          <SecretField label="Secret Access Key" required value={value.secretAccessKey} onChange={(v) => onChange({ ...value, secretAccessKey: v })} />
          <TextField label="Bucket Name" required fullWidth size="small" value={value.bucketName} onChange={(e) => onChange({ ...value, bucketName: e.target.value })} sx={REQUIRED_FIELD_SX} />
        </Stack>
      )}
    </>
  );
}
