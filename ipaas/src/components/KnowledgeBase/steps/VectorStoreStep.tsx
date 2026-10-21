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

import { Grid, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import { type JSX } from 'react';
import { blankVectorStore, ragLogoUrl, VECTOR_STORE_PROVIDERS } from '../../../constants/ragIngestion';
import { chromaCollectionNameError, pineconeIndexNameError, postgresTableNameError, weaviateCollectionNameError } from '../../../utils/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import SelectableCard from '../../common/SelectableCard';
import SecretField from '../SecretField';
import { fieldStackSx, stepHeadingSx, tileGridSx } from '../styles';
import type { VectorStoreConfig } from '../../../types/ragIngestion';

interface VectorStoreStepProps {
  value: VectorStoreConfig | null;
  onChange: (value: VectorStoreConfig) => void;
  /** Secrets already stored for this vector store; their fields may stay empty to keep them. */
  storedSecretKeys?: readonly string[];
}

// WSO2-managed vector databases need the platform-services API, which the BFF does not serve.
const PROVIDERS = VECTOR_STORE_PROVIDERS.filter((p) => !p.managed);

export default function VectorStoreStep({ value, onChange, storedSecretKeys = [] }: VectorStoreStepProps): JSX.Element {
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Initialize Vector Store
      </Typography>

      <Grid container spacing={2} sx={tileGridSx}>
        {PROVIDERS.map((p) => (
          <Grid key={p.id} size={{ xs: 12, sm: 6, md: 3 }}>
            <SelectableCard title={p.name} description={p.description} logo={ragLogoUrl(p.logo)} selected={value?.provider === p.id} onSelect={() => onChange(blankVectorStore(p.id))} />
          </Grid>
        ))}
      </Grid>

      {value && (
        <Stack sx={fieldStackSx}>
          <ProviderFields value={value} onChange={onChange} stored={new Set(storedSecretKeys)} />
        </Stack>
      )}
    </>
  );
}

const KEEP_STORED = 'Leave empty to keep the stored value.';

function ProviderFields({ value, onChange, stored }: { value: VectorStoreConfig; onChange: (v: VectorStoreConfig) => void; stored: ReadonlySet<string> }): JSX.Element | null {
  switch (value.provider) {
    case 'pinecone':
      return (
        <>
          <SecretField label="API Key" required={!stored.has('PINECONE_APIKEY')} helperText={stored.has('PINECONE_APIKEY') ? KEEP_STORED : undefined} value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />
          <TextField
            label="Index Name"
            required
            fullWidth
            size="small"
            value={value.indexName}
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
          <SecretField label="API Key" required={!stored.has('WEAVIATE_APIKEY')} helperText={stored.has('WEAVIATE_APIKEY') ? KEEP_STORED : undefined} value={value.apiKey} onChange={(v) => onChange({ ...value, apiKey: v })} />
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
          <SecretField label="Password" required={!stored.has('POSTGRES_PASSWORD')} helperText={stored.has('POSTGRES_PASSWORD') ? KEEP_STORED : undefined} value={value.password} onChange={(v) => onChange({ ...value, password: v })} />
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
    default:
      return null;
  }
}
