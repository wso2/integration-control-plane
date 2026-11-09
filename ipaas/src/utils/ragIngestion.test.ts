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
  buildRagEnvVars,
  buildRetrievePayload,
  chromaCollectionNameError,
  componentNameError,
  isAutomationValid,
  isChunkingValid,
  isDatasourceValid,
  isEmbeddingValid,
  isFormComplete,
  isRetrievalQueryValid,
  isVectorStoreValid,
  pineconeIndexNameError,
  postgresTableNameError,
  slugify,
  splitRagEnvVars,
  weaviateCollectionNameError,
} from './ragIngestion';
import { DEFAULT_CHUNKING, DEFAULT_RETRIEVAL_QUERY } from '../constants/ragIngestion';
import type { RagIngestionForm } from '../types/ragIngestion';

describe('name validators', () => {
  it('accepts a valid pinecone index and rejects bad ones', () => {
    expect(pineconeIndexNameError('devantdemo')).toBe('');
    expect(pineconeIndexNameError('Devant')).not.toBe(''); // uppercase
    expect(pineconeIndexNameError('-x')).not.toBe(''); // leading hyphen
    expect(pineconeIndexNameError('a'.repeat(46))).not.toBe(''); // too long
    expect(pineconeIndexNameError('')).toBe(''); // empty is "no error yet"
  });

  it('validates chroma / weaviate / postgres names', () => {
    expect(chromaCollectionNameError('docs')).toBe('');
    expect(chromaCollectionNameError('ab')).not.toBe(''); // too short
    expect(chromaCollectionNameError('1.2.3.4')).not.toBe(''); // ipv4
    expect(weaviateCollectionNameError('Documents')).toBe('');
    expect(weaviateCollectionNameError('documents')).not.toBe(''); // must start uppercase
    expect(postgresTableNameError('my_table$1')).toBe('');
    expect(postgresTableNameError('1table')).not.toBe(''); // starts with digit
  });

  it('validates component names and slugifies display names', () => {
    expect(componentNameError('rag-ingest')).toBe('');
    expect(componentNameError('Rag Ingest')).not.toBe('');
    expect(slugify('Devant Demo Ingestion')).toBe('devant-demo-ingestion');
    expect(slugify('  Weird__Name!! ')).toBe('weird-name');
  });
});

describe('step validity', () => {
  it('requires all pinecone fields', () => {
    expect(isVectorStoreValid({ provider: 'pinecone', apiKey: 'k', indexName: 'devantdemo' })).toBe(true);
    expect(isVectorStoreValid({ provider: 'pinecone', apiKey: '', indexName: 'devantdemo' })).toBe(false);
    expect(isVectorStoreValid(null)).toBe(false);
  });

  it('enforces overlap < segment for chunking', () => {
    expect(isChunkingValid(DEFAULT_CHUNKING)).toBe(true);
    expect(isChunkingValid({ strategy: 'recursive', maxSegmentSize: 100, maxOverlapSize: 100 })).toBe(false);
    expect(isChunkingValid({ strategy: 'recursive', maxSegmentSize: 0, maxOverlapSize: 0 })).toBe(false);
  });

  it('validates datasource per type/auth', () => {
    expect(isDatasourceValid({ type: 'amazons3', accessKeyId: 'a', secretAccessKey: 's', bucketName: 'b' })).toBe(true);
    expect(isDatasourceValid({ type: 'gdrive', authType: 'api_Key', apiKey: 'k', clientId: '', clientSecret: '', refreshToken: '', folderId: 'f' })).toBe(true);
    expect(isDatasourceValid({ type: 'gdrive', authType: 'oauth', apiKey: '', clientId: 'c', clientSecret: 's', refreshToken: 'r', folderId: 'f' })).toBe(true);
    expect(isDatasourceValid({ type: 'gdrive', authType: 'oauth', apiKey: '', clientId: 'c', clientSecret: '', refreshToken: '', folderId: 'f' })).toBe(false);
  });

  it('validates embedding config (openai vs azure, missing/null)', () => {
    expect(isEmbeddingValid({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk', azureApiVersion: '', azureBaseUrl: '' })).toBe(true);
    expect(isEmbeddingValid(null)).toBe(false);
    expect(isEmbeddingValid({ provider: 'openai', model: '', apiKey: 'sk', azureApiVersion: '', azureBaseUrl: '' })).toBe(false); // missing model
    expect(isEmbeddingValid({ provider: 'openai', model: 'm', apiKey: '', azureApiVersion: '', azureBaseUrl: '' })).toBe(false); // missing key
    expect(isEmbeddingValid({ provider: 'azure_openai', model: 'm', apiKey: 'az', azureApiVersion: '2024-06-01', azureBaseUrl: 'https://x.openai.azure.com' })).toBe(true);
    expect(isEmbeddingValid({ provider: 'azure_openai', model: 'm', apiKey: 'az', azureApiVersion: '2024-06-01', azureBaseUrl: '' })).toBe(false); // azure needs base url
    expect(isEmbeddingValid({ provider: 'azure_openai', model: 'm', apiKey: 'az', azureApiVersion: '', azureBaseUrl: 'https://x' })).toBe(false); // azure needs api version
  });

  it('validates automation config (required fields + name format)', () => {
    expect(isAutomationValid({ projectId: 'p1', displayName: 'Demo', name: 'demo', description: '' })).toBe(true);
    expect(isAutomationValid({ projectId: '', displayName: 'Demo', name: 'demo', description: '' })).toBe(false); // missing project
    expect(isAutomationValid({ projectId: 'p1', displayName: '', name: 'demo', description: '' })).toBe(false); // missing display name
    expect(isAutomationValid({ projectId: 'p1', displayName: 'Demo', name: '', description: '' })).toBe(false); // missing name
    expect(isAutomationValid({ projectId: 'p1', displayName: 'Demo', name: 'Bad Name', description: '' })).toBe(false); // malformed name
  });
});

const pineconeForm: RagIngestionForm = {
  vectorStore: { provider: 'pinecone', apiKey: 'pc-key', indexName: 'devantdemo' },
  embedding: { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-key', azureApiVersion: '', azureBaseUrl: '' },
  chunking: DEFAULT_CHUNKING,
  automation: { projectId: 'p1', displayName: 'Demo', name: 'demo', description: '' },
  datasource: { type: 'amazons3', accessKeyId: 'AKIA', secretAccessKey: 'secret', bucketName: 'bucket' },
};

describe('isFormComplete', () => {
  it('accepts a fully valid form and rejects missing sections', () => {
    expect(isFormComplete(pineconeForm)).toBe(true);
    expect(isFormComplete({ ...pineconeForm, vectorStore: null })).toBe(false);
    expect(isFormComplete({ ...pineconeForm, embedding: null })).toBe(false);
  });
});

describe('buildRagEnvVars + splitRagEnvVars', () => {
  it('maps a pinecone + openai + s3 form to the image env contract', () => {
    const env = buildRagEnvVars(pineconeForm);
    expect(env).toMatchObject({
      DATASOURCE: 'amazons3',
      AWS_ACCESS_KEY_ID: 'AKIA',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_BUCKET_NAME: 'bucket',
      VECTORDB_PROVIDER: 'pinecone',
      COLLECTION_NAME: 'devantdemo',
      PINECONE_APIKEY: 'pc-key',
      EMBEDDING_MODEL_PROVIDER: 'openai',
      EMBEDDING_MODEL: 'text-embedding-3-small',
      EMBEDDING_MODEL_APIKEY: 'sk-key',
    });
    // Chunking is intentionally not part of the env contract.
    expect(env).not.toHaveProperty('CHUNKING_STRATEGY');
  });

  it('routes sensitive keys to the secret set', () => {
    const { plain, secret } = splitRagEnvVars(buildRagEnvVars(pineconeForm));
    expect(Object.keys(secret).sort()).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'EMBEDDING_MODEL_APIKEY', 'PINECONE_APIKEY']);
    expect(plain).toHaveProperty('VECTORDB_PROVIDER', 'pinecone');
    expect(plain).toHaveProperty('COLLECTION_NAME', 'devantdemo');
    expect(plain).not.toHaveProperty('PINECONE_APIKEY');
  });

  it('emits postgres + azure keys for the managed/azure combo', () => {
    const env = buildRagEnvVars({
      ...pineconeForm,
      vectorStore: { provider: 'pgvector-devant', serverId: 's1', host: 'h', port: '5432', user: 'u', password: 'pw', dbName: 'db', tableName: 'tbl' },
      embedding: { provider: 'azure_openai', model: 'my-embed', apiKey: 'az-key', azureApiVersion: '2024-06-01', azureBaseUrl: 'https://x.openai.azure.com' },
    });
    expect(env).toMatchObject({ VECTORDB_PROVIDER: 'pgvector-devant', POSTGRES_HOST: 'h', POSTGRES_TABLE_NAME: 'tbl', COLLECTION_NAME: 'tbl', AZURE_OPENAI_BASEURL: 'https://x.openai.azure.com', AZURE_OPENAI_APIVERSION: '2024-06-01' });
    expect(splitRagEnvVars(env).secret).toHaveProperty('POSTGRES_PASSWORD', 'pw');
  });
});

describe('retrieval', () => {
  it('requires a query and (when reranking) a reranker key', () => {
    expect(isRetrievalQueryValid(DEFAULT_RETRIEVAL_QUERY)).toBe(false); // empty query
    expect(isRetrievalQueryValid({ ...DEFAULT_RETRIEVAL_QUERY, userQuery: 'hi' })).toBe(true);
    expect(isRetrievalQueryValid({ ...DEFAULT_RETRIEVAL_QUERY, userQuery: 'hi', rerankingEnabled: true })).toBe(false);
    expect(isRetrievalQueryValid({ ...DEFAULT_RETRIEVAL_QUERY, userQuery: 'hi', rerankingEnabled: true, rerankerApiKey: 'k' })).toBe(true);
  });

  it('builds a pinecone retrieve payload with snake_case + reranker fields', () => {
    const body = buildRetrievePayload(
      { provider: 'pinecone', apiKey: 'pc', indexName: 'devantdemo' },
      { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk', azureApiVersion: '', azureBaseUrl: '' },
      { ...DEFAULT_RETRIEVAL_QUERY, userQuery: 'what is rag?', rerankingEnabled: true, rerankerApiKey: 'co' },
    );
    expect(body).toMatchObject({
      vectordb_provider: 'pinecone',
      collection_name: 'devantdemo',
      pinecone_apikey: 'pc',
      embedding_model: 'text-embedding-3-small',
      user_query: 'what is rag?',
      max_retrieve_chunks: 5,
      reranking_enabled: true,
      reranker_apikey: 'co',
      reranker_model: 'rerank-english-v3.0',
    });
  });
});
