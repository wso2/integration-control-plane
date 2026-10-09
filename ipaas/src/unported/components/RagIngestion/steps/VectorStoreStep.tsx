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

import { Grid, MenuItem, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useMemo, type JSX } from 'react';
import { blankVectorStore, ragLogoUrl, VECTOR_STORE_PROVIDERS } from '../../../../constants/ragIngestion';
import { chromaCollectionNameError, pineconeIndexNameError, postgresTableNameError, weaviateCollectionNameError } from '../../../../utils/ragIngestion';
import { useDatabaseServers } from '../../../hooks/usePlatformServices';
import { REQUIRED_FIELD_SX } from '../../../../constants/styles';
import SelectableCard from '../../Databases/create/SelectableCard';
import SecretField from '../SecretField';
import { fieldStackSx, stepHeadingSx, tileGridSx } from '../styles';
import type { VectorStoreConfig } from '../../../../types/ragIngestion';

interface VectorStoreStepProps {
  value: VectorStoreConfig | null;
  onChange: (value: VectorStoreConfig) => void;
}

export default function VectorStoreStep({ value, onChange }: VectorStoreStepProps): JSX.Element {
  const servers = useDatabaseServers();
  const managedServers = useMemo(() => (servers.data ?? []).filter((s) => s.is_vector_enabled), [servers.data]);
  const hasManaged = managedServers.length > 0;

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Initialize Vector Store
      </Typography>

      <Grid container spacing={2} sx={tileGridSx}>
        {VECTOR_STORE_PROVIDERS.map((p) => {
          // The managed option only makes sense when a vector-enabled managed DB exists.
          const disabled = p.managed && !hasManaged;
          const card = <SelectableCard title={p.name} description={p.description} logo={ragLogoUrl(p.logo)} selected={value?.provider === p.id} disabled={disabled} onSelect={() => onChange(blankVectorStore(p.id))} />;
          return (
            <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4 }}>
              {disabled ? (
                <Tooltip title="Provision a vector-enabled database first to use this option.">
                  <span>{card}</span>
                </Tooltip>
              ) : (
                card
              )}
            </Grid>
          );
        })}
      </Grid>

      {value && (
        <Stack sx={fieldStackSx}>
          <ProviderFields value={value} onChange={onChange} managedServers={managedServers.map((s) => ({ id: s.id, name: s.name }))} />
        </Stack>
      )}
    </>
  );
}

function ProviderFields({ value, onChange, managedServers }: { value: VectorStoreConfig; onChange: (v: VectorStoreConfig) => void; managedServers: { id: string; name: string }[] }): JSX.Element | null {
  switch (value.provider) {
    case 'pinecone':
      return (
        <>
          <SecretField label="API Key" required value={value.apiKey} placeholder="Enter your Pinecone API Key" onChange={(v) => onChange({ ...value, apiKey: v })} />
          <TextField
            label="Index Name"
            required
            fullWidth
            size="small"
            value={value.indexName}
            placeholder="Enter your Pinecone Index Name"
            onChange={(e) => onChange({ ...value, indexName: e.target.value })}
            error={!!pineconeIndexNameError(value.indexName)}
            helperText={pineconeIndexNameError(value.indexName) || undefined}
            sx={REQUIRED_FIELD_SX}
          />
        </>
      );
    case 'chroma':
      return (
        <>
          <TextField label="Host" required fullWidth size="small" value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <TextField label="Port" required fullWidth size="small" type="number" value={value.port} onChange={(e) => onChange({ ...value, port: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <TextField
            label="Collection Name"
            required
            fullWidth
            size="small"
            value={value.collectionName}
            onChange={(e) => onChange({ ...value, collectionName: e.target.value })}
            error={!!chromaCollectionNameError(value.collectionName)}
            helperText={chromaCollectionNameError(value.collectionName) || undefined}
            sx={REQUIRED_FIELD_SX}
          />
        </>
      );
    case 'weaviate':
      return (
        <>
          <TextField label="Weaviate Cluster REST URL" required fullWidth size="small" value={value.clusterUrl} onChange={(e) => onChange({ ...value, clusterUrl: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <SecretField label="API Key" required value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />
          <TextField
            label="Collection Name"
            required
            fullWidth
            size="small"
            value={value.collectionName}
            onChange={(e) => onChange({ ...value, collectionName: e.target.value })}
            error={!!weaviateCollectionNameError(value.collectionName)}
            helperText={weaviateCollectionNameError(value.collectionName) || undefined}
            sx={REQUIRED_FIELD_SX}
          />
        </>
      );
    case 'pgvector':
      return (
        <>
          <TextField label="Host" required fullWidth size="small" value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <TextField label="Port" required fullWidth size="small" type="number" value={value.port} onChange={(e) => onChange({ ...value, port: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <TextField label="User" required fullWidth size="small" value={value.user} onChange={(e) => onChange({ ...value, user: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <SecretField label="Password" required value={value.password} onChange={(v) => onChange({ ...value, password: v })} />
          <TextField label="Database" required fullWidth size="small" value={value.dbName} onChange={(e) => onChange({ ...value, dbName: e.target.value })} sx={REQUIRED_FIELD_SX} />
          <TextField
            label="Table Name"
            required
            fullWidth
            size="small"
            value={value.tableName}
            onChange={(e) => onChange({ ...value, tableName: e.target.value })}
            error={!!postgresTableNameError(value.tableName)}
            helperText={postgresTableNameError(value.tableName) || undefined}
            sx={REQUIRED_FIELD_SX}
          />
        </>
      );
    case 'pgvector-devant':
      return (
        <>
          <TextField
            select
            label="Managed Database"
            required
            fullWidth
            size="small"
            value={value.serverId}
            onChange={(e) => onChange({ ...value, serverId: e.target.value })}
            sx={REQUIRED_FIELD_SX}
            helperText="Connection details are resolved from the selected server on creation.">
            {managedServers.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Table Name"
            required
            fullWidth
            size="small"
            value={value.tableName}
            onChange={(e) => onChange({ ...value, tableName: e.target.value })}
            error={!!postgresTableNameError(value.tableName)}
            helperText={postgresTableNameError(value.tableName) || undefined}
            sx={REQUIRED_FIELD_SX}
          />
        </>
      );
    default:
      return null;
  }
}
