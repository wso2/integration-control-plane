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
  dataSourceNameFor,
  embeddingFromConfig,
  isEditedSettingsValid,
  isManualSchedule,
  isNameValid,
  knowledgeBaseNameError,
  knowledgeBaseNameFrom,
  knowledgeBaseOfComponent,
  knowledgeBaseReview,
  knowledgeBaseSummary,
  secretsForUpdate,
  retrievalAccessReason,
  knowledgeBaseWriteBlockedReason,
  retrievalSettingsErrors,
  retrievalUnavailableReason,
  vectorStoreFromConfig,
} from './knowledgeBase';
import type { DatasourceConfig, EmbeddingConfig, VectorStoreConfig } from '../types/ragIngestion';

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
    ['new', '"new" is reserved. Choose another name.'],
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

describe('dataSourceNameFor', () => {
  it.each([
    ['docs', 'gdrive', 'docs-gdrive'],
    // A name at or near the limit must still get its suffix, or it is the knowledge base's own name.
    ['a'.repeat(40), 'gdrive', 'a'.repeat(33) + '-gdrive'],
    ['a'.repeat(39), 'amazons3', 'a'.repeat(31) + '-amazons3'],
    ['a'.repeat(32) + '-bbbb', 'gdrive', 'a'.repeat(32) + '-gdrive'],
  ])('%j + %j', (kb, type, name) => {
    expect(dataSourceNameFor(kb, type)).toBe(name);
    expect(name).not.toBe(kb);
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

describe('knowledgeBaseWriteBlockedReason', () => {
  it.each([
    ['ACTIVE', 'add-data-source', null],
    ['IN_PROGRESS', 'save', null],
    ['CREATING', 'add-data-source', 'The knowledge base is still being created. Try again once it is.'],
    ['CREATING', 'save', 'The knowledge base is still being created. Try again once it is.'],
    ['CREATING', 'delete', 'The knowledge base is still being created. Try again once it is.'],
    ['FAILED', 'add-data-source', 'The knowledge base could not be created. Delete it and create it again.'],
    ['FAILED', 'save', 'The knowledge base could not be created. Delete it and create it again.'],
    ['FAILED', 'delete', null],
  ] as const)('%s, %s', (status, write, reason) => {
    expect(knowledgeBaseWriteBlockedReason({ status }, write)).toBe(reason);
  });
});

describe('retrievalUnavailableReason', () => {
  it.each([
    [{ status: 'ACTIVE' }, null],
    [{ status: 'IN_PROGRESS' }, 'The knowledge base service is still deploying. You can query it once it is active.'],
    [{ status: 'CREATING' }, 'The knowledge base is still being created. You can query it once it is active.'],
    [{ status: 'FAILED' }, 'The knowledge base could not be created, so it cannot be queried.'],
    [{ status: '' }, 'The knowledge base service is still deploying. You can query it once it is active.'],
    [{ status: 'ERROR' }, 'The knowledge base service failed to deploy, so it cannot be queried.'],
  ])('%j', (kb, reason) => {
    expect(retrievalUnavailableReason(kb)).toBe(reason);
  });
});

describe('retrievalAccessReason', () => {
  const ready = { keyError: null, needsApiKeyAuth: false, apiKeyNotEnforced: false, securityError: null, mode: 'api-key' as const, gatewayUrl: 'https://gw/docs-kb', isAuthorized: true, isMinting: false };
  const status = (code: number) => Object.assign(new Error(`HTTP ${code}`), { status: code });
  it.each([
    ['ready', ready, null],
    ['a key error', { ...ready, keyError: 'Could not mint a test key.', isAuthorized: false }, 'Could not mint a test key.'],
    ['another auth mode', { ...ready, needsApiKeyAuth: true, isAuthorized: false }, "The knowledge base's API takes another kind of credential, so it can't be queried with a test key."],
    ['API-key auth not enforced', { ...ready, needsApiKeyAuth: true, apiKeyNotEnforced: true, isAuthorized: false }, "The knowledge base's API is set to API key authentication, but the gateway doesn't enforce it, so it can't be queried with a test key."],
    ['not exposed (409)', { ...ready, securityError: status(409), mode: null, gatewayUrl: '', isAuthorized: false }, 'The knowledge base is not on the API gateway yet. Saving its configuration again puts it there.'],
    ['a failed read (502)', { ...ready, securityError: status(502), mode: null, gatewayUrl: '', isAuthorized: false }, "Could not check the knowledge base's API on the gateway. Trying again…"],
    ['a failed read (network)', { ...ready, securityError: new TypeError('Failed to fetch'), mode: null, gatewayUrl: '', isAuthorized: false }, "Could not check the knowledge base's API on the gateway. Trying again…"],
    ['the read not answered', { ...ready, mode: null, gatewayUrl: '', isAuthorized: false }, "Checking the knowledge base's API on the gateway…"],
    ['exposed without a URL', { ...ready, gatewayUrl: '' }, 'The knowledge base is not on the API gateway yet. Saving its configuration again puts it there.'],
    ['minting', { ...ready, isAuthorized: false, isMinting: true }, 'Getting a test key for the knowledge base…'],
    ['a mint refused for the role (403)', { ...ready, isAuthorized: false }, "Your role can't create test keys for this knowledge base, so it can't be queried here."],
  ])('%s', (_name, access, reason) => {
    expect(retrievalAccessReason(access)).toBe(reason);
  });

  const off = { ...ready, securityError: status(409), mode: null, gatewayUrl: '', isAuthorized: false };
  it.each([
    [{ status: 'FAILED', error: 'GATEWAY_UNAVAILABLE' }, 'The API gateway for this environment is being set up. The knowledge base can be queried once it is published there.'],
    [{ status: 'RUNNING', error: 'GATEWAY_PROVISIONING' }, 'The API gateway for this environment is being set up. The knowledge base can be queried once it is published there.'],
    [{ status: 'FAILED', error: 'APIP_ERROR' }, 'Publishing the knowledge base on the API gateway failed. It is retried automatically.'],
    [{ status: 'PENDING' }, 'The knowledge base is being published on the API gateway.'],
  ])('says why it is not on the gateway: %j', (apiStatus, reason) => {
    expect(retrievalAccessReason(off, apiStatus)).toBe(reason);
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

describe('knowledgeBaseOfComponent', () => {
  it("names a KB Service's knowledge base after the service", () => {
    expect(knowledgeBaseOfComponent({ handler: 'docs-kb', componentSubType: 'knowledge-base' })).toBe('docs-kb');
  });

  it("names a data source's knowledge base from its annotation", () => {
    expect(knowledgeBaseOfComponent({ handler: 'docs-kb-amazons3', componentSubType: 'kb-ingestion', knowledgeBase: 'docs-kb' })).toBe('docs-kb');
  });

  it('gives none for a data source without one, or for any other integration', () => {
    expect(knowledgeBaseOfComponent({ handler: 'orphan', componentSubType: 'kb-ingestion' })).toBeNull();
    expect(knowledgeBaseOfComponent({ handler: 'orders-api', componentSubType: null, knowledgeBase: 'docs-kb' })).toBeNull();
  });
});

describe('knowledgeBaseReview', () => {
  const base = {
    names: { displayName: ' Docs KB ', name: 'docs-kb', description: '' },
    vectorStore: { provider: 'pinecone', apiKey: 'pc-secret', indexName: 'docs' } as VectorStoreConfig,
    embedding: { provider: 'mistral', model: 'mistral-embed', apiKey: 'm-secret', azureApiVersion: '', azureBaseUrl: '' } as EmbeddingConfig,
    chunking: { strategy: 'recursive' as const, maxSegmentSize: 1000, maxOverlapSize: 200 },
  };
  const s3: DatasourceConfig = { type: 'amazons3', accessKeyId: 'AKIA', secretAccessKey: 's3-secret', bucketName: 'hr-docs' };
  const valuesOf = (sections: ReturnType<typeof knowledgeBaseReview>) => Object.fromEntries(sections.map((s) => [s.id, s.rows.map((r) => r.value)]));

  it('summarises a knowledge base created without a data source, with no schedule', () => {
    const sections = knowledgeBaseReview({ ...base, dataSource: null });
    expect(sections.map((s) => s.id)).toEqual(['name', 'vectorStore', 'embedding', 'chunking', 'dataSource']);
    expect(valuesOf(sections)).toMatchObject({
      name: ['Docs KB', 'docs-kb', '—'],
      vectorStore: ['Pinecone', 'docs'],
      embedding: ['Mistral AI · mistral-embed'],
      chunking: ['Recursive (default) · 1000 / 200'],
    });
  });

  it('shows a one-time ingestion as once, now', () => {
    expect(valuesOf(knowledgeBaseReview({ ...base, dataSource: { config: s3, schedule: null } }))).toMatchObject({ dataSource: ['Amazon S3', 'hr-docs'], schedule: ['Once, now'] });
  });

  it('describes a scheduled ingestion with its time zone', () => {
    const schedule = valuesOf(knowledgeBaseReview({ ...base, dataSource: { config: s3, schedule: { cron: '0 0 * * *', timezone: 'Asia/Colombo' } } })).schedule;
    expect(schedule[1]).toBe('Asia/Colombo');
    expect(schedule[0]).not.toBe('');
  });

  it('never shows a credential', () => {
    const text = JSON.stringify(knowledgeBaseReview({ ...base, dataSource: { config: s3, schedule: null } }));
    for (const secret of ['pc-secret', 'm-secret', 's3-secret', 'AKIA']) expect(text).not.toContain(secret);
  });
});

describe('retrievalSettingsErrors', () => {
  it('accepts the defaults and the bounds', () => {
    expect(retrievalSettingsErrors({ maxChunks: 5, minSimilarity: 0.7 })).toEqual({});
    expect(retrievalSettingsErrors({ maxChunks: 1, minSimilarity: 0 })).toEqual({});
    expect(retrievalSettingsErrors({ maxChunks: 10, minSimilarity: 1 })).toEqual({});
  });

  it.each([0, 11, 2.5, Number.NaN])('rejects %s chunks', (maxChunks) => {
    expect(retrievalSettingsErrors({ maxChunks, minSimilarity: 0.7 }).maxChunks).toBeDefined();
  });

  it.each([-0.1, 1.1, Number.NaN])('rejects a %s threshold', (minSimilarity) => {
    expect(retrievalSettingsErrors({ maxChunks: 5, minSimilarity }).minSimilarity).toBeDefined();
  });
});
