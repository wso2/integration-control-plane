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

import { describe, expect, it } from 'vitest';
import {
  buildDataSourceSettings,
  buildKnowledgeBaseSettings,
  chunkingFromConfig,
  dataSourceLabel,
  embeddingFromConfig,
  ingestionNotice,
  isEditedSettingsValid,
  isManualSchedule,
  isNameValid,
  knowledgeBaseNameError,
  knowledgeBaseNameFrom,
  knowledgeBaseSummary,
  secretsForUpdate,
  retrievalUnavailableReason,
  vectorStoreFromConfig,
} from './knowledgeBase';
import type { EmbeddingConfig, VectorStoreConfig } from '../types/ragIngestion';

const pinecone: VectorStoreConfig = { provider: 'pinecone', apiKey: 'pc-key', indexName: 'docs' };
const openai: EmbeddingConfig = { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'oa-key', azureApiVersion: '', azureBaseUrl: '' };
const chunking = { strategy: 'sentence' as const, maxSegmentSize: 800, maxOverlapSize: 100 };

describe('buildKnowledgeBaseSettings', () => {
  it('splits secrets from plain settings and carries chunking', () => {
    expect(buildKnowledgeBaseSettings(pinecone, openai, chunking)).toEqual({
      config: {
        VECTORDB_PROVIDER: 'pinecone',
        COLLECTION_NAME: 'docs',
        EMBEDDING_MODEL_PROVIDER: 'openai',
        EMBEDDING_MODEL: 'text-embedding-3-small',
        CHUNKING_STRATEGY: 'sentence',
        MAX_SEGMENT_SIZE: '800',
        MAX_OVERLAP_SIZE: '100',
      },
      secrets: { PINECONE_APIKEY: 'pc-key', EMBEDDING_MODEL_APIKEY: 'oa-key' },
    });
  });
});

describe('buildDataSourceSettings', () => {
  it('keeps S3 credentials secret', () => {
    expect(buildDataSourceSettings({ type: 'amazons3', accessKeyId: 'id', secretAccessKey: 'sk', bucketName: 'b' })).toEqual({
      config: { DATASOURCE: 'amazons3', AWS_BUCKET_NAME: 'b' },
      secrets: { AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'sk' },
    });
  });

  it('sends only the Google credentials of the chosen auth type', () => {
    const settings = buildDataSourceSettings({ type: 'gdrive', authType: 'oauth', apiKey: 'unused', clientId: 'c', clientSecret: 's', refreshToken: 'r', folderId: 'f' });
    expect(settings.config).toEqual({ DATASOURCE: 'gdrive', GOOGLE_AUTH_TYPE: 'oauth', GOOGLE_DRIVE_FOLDER_ID: 'f' });
    expect(settings.secrets).toEqual({ GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r' });
  });
});

describe('reading settings back', () => {
  const { config } = buildKnowledgeBaseSettings(pinecone, openai, chunking);

  it('round-trips everything but the secrets', () => {
    expect(vectorStoreFromConfig(config)).toEqual({ ...pinecone, apiKey: '' });
    expect(embeddingFromConfig(config)).toMatchObject({ provider: 'openai', model: 'text-embedding-3-small', apiKey: '' });
    expect(chunkingFromConfig(config)).toEqual(chunking);
  });

  it('falls back to default chunking for missing or bad values', () => {
    expect(chunkingFromConfig({ CHUNKING_STRATEGY: 'nope', MAX_SEGMENT_SIZE: 'x' })).toEqual({ strategy: 'recursive', maxSegmentSize: 1000, maxOverlapSize: 200 });
  });

  it('returns null for providers it cannot edit', () => {
    expect(vectorStoreFromConfig({ VECTORDB_PROVIDER: 'pgvector-devant' })).toBeNull();
    expect(embeddingFromConfig({ EMBEDDING_MODEL_PROVIDER: 'cohere' })).toBeNull();
  });
});

describe('editing secrets', () => {
  it('accepts an empty secret field when the secret is stored', () => {
    expect(isEditedSettingsValid({ ...pinecone, apiKey: '' }, { ...openai, apiKey: '' }, ['PINECONE_APIKEY', 'EMBEDDING_MODEL_APIKEY'])).toBe(true);
  });

  it('requires a secret the knowledge base does not store yet', () => {
    const weaviate: VectorStoreConfig = { provider: 'weaviate', clusterUrl: 'https://w', apiKey: '', collectionName: 'Docs' };
    expect(isEditedSettingsValid(weaviate, openai, ['PINECONE_APIKEY', 'EMBEDDING_MODEL_APIKEY'])).toBe(false);
  });

  it('keeps stored secrets left empty and drops the ones no longer used', () => {
    const edited = { config: {}, secrets: { WEAVIATE_APIKEY: 'wv', EMBEDDING_MODEL_APIKEY: '' } };
    expect(secretsForUpdate(edited, ['PINECONE_APIKEY', 'EMBEDDING_MODEL_APIKEY'])).toEqual({ WEAVIATE_APIKEY: 'wv', EMBEDDING_MODEL_APIKEY: '' });
  });
});

describe('names', () => {
  it.each([
    ['', ''],
    ['docs-kb', ''],
    ['a', ''],
    ['Docs', 'Use lowercase letters, digits and hyphens; start with a letter and end with a letter or digit.'],
    ['docs-', 'Use lowercase letters, digits and hyphens; start with a letter and end with a letter or digit.'],
    ['1docs', 'Use lowercase letters, digits and hyphens; start with a letter and end with a letter or digit.'],
    ['a'.repeat(41), 'Name must be at most 40 characters.'],
  ])('knowledgeBaseNameError(%j)', (name, error) => {
    expect(knowledgeBaseNameError(name)).toBe(error);
  });

  it.each([
    ['Product Docs', 'product-docs'],
    ['  2024 Handbook! ', 'handbook'],
    ['x'.repeat(39) + ' y', 'x'.repeat(39)],
  ])('knowledgeBaseNameFrom(%j)', (displayName, name) => {
    expect(knowledgeBaseNameFrom(displayName)).toBe(name);
    expect(knowledgeBaseNameError(name)).toBe('');
  });
});

describe('display', () => {
  it('summarises the stored settings', () => {
    expect(knowledgeBaseSummary(buildKnowledgeBaseSettings(pinecone, openai, chunking).config)).toEqual({
      vectorStore: 'Pinecone',
      collection: 'docs',
      embedding: 'Open AI · text-embedding-3-small',
      chunking: 'Sentence · 800 / 100',
    });
    expect(dataSourceLabel({ DATASOURCE: 'gdrive' })).toBe('Google Drive');
  });
});

describe('isNameValid', () => {
  it('needs a display name and a valid name', () => {
    expect(isNameValid({ displayName: 'Docs', name: 'docs', description: '' })).toBe(true);
    expect(isNameValid({ displayName: '  ', name: 'docs', description: '' })).toBe(false);
    expect(isNameValid({ displayName: 'Docs', name: 'Docs', description: '' })).toBe(false);
  });
});

describe('retrievalUnavailableReason', () => {
  it.each([
    [{ status: 'ACTIVE', serviceUrl: 'https://kb' }, null],
    [{ status: 'ACTIVE', serviceUrl: '' }, 'The knowledge base service has no public URL yet.'],
    [{ status: 'IN_PROGRESS', serviceUrl: '' }, 'The knowledge base service is still deploying. You can query it once it is active.'],
    [{ status: '', serviceUrl: '' }, 'The knowledge base service is still deploying. You can query it once it is active.'],
    [{ status: 'ERROR', serviceUrl: 'https://kb' }, 'The knowledge base service failed to deploy, so it cannot be queried.'],
  ])('%j', (kb, reason) => {
    expect(retrievalUnavailableReason(kb)).toBe(reason);
  });
});

describe('isManualSchedule', () => {
  it.each([
    ['', true],
    ['0 0 31 2 *', true],
    [' 0 0 31 2 * ', true],
    ['0 2 * * *', false],
    ['*/30 * * * *', false],
  ])('%j → %s', (cron, manual) => {
    expect(isManualSchedule(cron)).toBe(manual);
  });
});

describe('ingestionNotice', () => {
  it('is null when every first run started, or none was asked for', () => {
    expect(ingestionNotice([{ displayName: 'Drive', ingestionStarted: true }, { displayName: 'S3' }])).toBeNull();
  });

  it('names each source whose first run did not start', () => {
    expect(
      ingestionNotice([
        { displayName: 'Drive', ingestionStarted: false, ingestionError: 'Run it with Ingest.' },
        { displayName: 'S3', ingestionStarted: false },
      ]),
    ).toEqual({ ingestionNotice: 'Drive: Run it with Ingest. S3: its first ingestion could not be started. Run it with Ingest.' });
  });
});
