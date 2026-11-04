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

import type { AutomationConfig, ChunkingConfig, ChunkingStrategy, DatasourceConfig, DatasourceType, EmbeddingConfig, EmbeddingProvider, GdriveAuthType, VectorStoreConfig, VectorStoreProvider } from '../types/ragIngestion';

const RAG_LOGO_BASE = 'assets/images/rag/';
const DB_LOGO_BASE = 'assets/images/databases/';

/** Resolve a public logo path against the app base URL. */
export const ragLogoUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

// ── Step 1: vector store providers ──────────────────────────────────────────

export interface VectorStoreProviderInfo {
  id: VectorStoreProvider;
  name: string;
  description: string;
  /** Logo path under the public folder, resolved with {@link ragLogoUrl}. */
  logo: string;
  /** `true` when the provider stores/needs a WSO2-managed vector database (shown only if one exists). */
  managed?: boolean;
}

export const VECTOR_STORE_PROVIDERS: VectorStoreProviderInfo[] = [
  { id: 'pinecone', name: 'Pinecone', description: 'A managed vector database for high-performance similarity search.', logo: `${RAG_LOGO_BASE}pinecone.svg` },
  { id: 'chroma', name: 'Chroma', description: 'An open-source embedding database.', logo: `${RAG_LOGO_BASE}chroma.svg` },
  { id: 'weaviate', name: 'Weaviate', description: 'An open-source vector database with a hosted cloud option.', logo: `${RAG_LOGO_BASE}weaviate.svg` },
  { id: 'pgvector', name: 'PostgreSQL', description: 'Bring your own PostgreSQL database with the pgvector extension.', logo: `${DB_LOGO_BASE}postgresql.svg` },
  { id: 'pgvector-devant', name: 'WSO2 Integration Platform Managed', description: 'Use a vector-enabled database provisioned on this platform.', logo: `${DB_LOGO_BASE}postgresql.svg`, managed: true },
];

/** Blank config for a freshly-selected vector store provider. */
export function blankVectorStore(provider: VectorStoreProvider): VectorStoreConfig {
  switch (provider) {
    case 'pinecone':
      return { provider, apiKey: '', indexName: '' };
    case 'chroma':
      return { provider, host: '', port: '8000', collectionName: '' };
    case 'weaviate':
      return { provider, clusterUrl: '', apiKey: '', collectionName: '' };
    case 'pgvector':
      return { provider, host: '', port: '5432', user: '', password: '', dbName: '', tableName: '' };
    case 'pgvector-devant':
      return { provider, serverId: '', host: '', port: '5432', user: '', password: '', dbName: '', tableName: '' };
  }
}

// ── Step 2: embedding model providers ───────────────────────────────────────

export interface EmbeddingProviderInfo {
  id: EmbeddingProvider;
  name: string;
  /** Logo path under the public folder, resolved with {@link ragLogoUrl}. */
  logo: string;
  /** Selectable model ids. Empty means the provider takes a free-text model id (Azure). */
  models: string[];
}

export const EMBEDDING_PROVIDERS: EmbeddingProviderInfo[] = [
  { id: 'openai', name: 'Open AI', logo: `${RAG_LOGO_BASE}openai.svg`, models: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'] },
  { id: 'azure_openai', name: 'Azure Open AI', logo: `${RAG_LOGO_BASE}azure-openai.svg`, models: [] },
  { id: 'mistral', name: 'Mistral AI', logo: `${RAG_LOGO_BASE}mistral.svg`, models: ['mistral-embed'] },
];

export const AZURE_DEFAULT_API_VERSION = '2024-06-01';

/** Blank config for a freshly-selected embedding provider. */
export function blankEmbedding(provider: EmbeddingProvider): EmbeddingConfig {
  return { provider, model: '', apiKey: '', azureApiVersion: AZURE_DEFAULT_API_VERSION, azureBaseUrl: '' };
}

// ── Step 3: chunking ────────────────────────────────────────────────────────

export const CHUNKING_STRATEGIES: { value: ChunkingStrategy; label: string }[] = [
  { value: 'recursive', label: 'Recursive (Default)' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'character', label: 'Character' },
];

export const DEFAULT_CHUNKING: ChunkingConfig = { strategy: 'recursive', maxSegmentSize: 1000, maxOverlapSize: 200 };

// ── Retrieval ───────────────────────────────────────────────────────────────

export const DEFAULT_RERANKER_MODEL = 'rerank-english-v3.0';
export const MAX_RETRIEVE_CHUNKS = 10;

export const DEFAULT_RETRIEVAL_QUERY = { userQuery: '', maxChunks: 5, minSimilarity: 0.7, rerankingEnabled: false, rerankerApiKey: '', rerankerModel: DEFAULT_RERANKER_MODEL };

// ── Step 4: automation ──────────────────────────────────────────────────────

export function blankAutomation(): AutomationConfig {
  return { projectId: '', displayName: '', name: '', description: '' };
}

// ── Step 5: datasources ─────────────────────────────────────────────────────

export interface DatasourceInfo {
  id: DatasourceType;
  name: string;
  /** Logo path under the public folder, resolved with {@link ragLogoUrl}. */
  logo: string;
}

export const DATASOURCES: DatasourceInfo[] = [
  { id: 'gdrive', name: 'Google Drive', logo: `${RAG_LOGO_BASE}googledrive.svg` },
  { id: 'amazons3', name: 'Amazon S3', logo: `${RAG_LOGO_BASE}amazons3.svg` },
];

export const GDRIVE_AUTH_TYPES: { value: GdriveAuthType; label: string }[] = [
  { value: 'api_Key', label: 'API Key' },
  { value: 'oauth', label: 'OAuth' },
];

/** Blank config for a freshly-selected datasource. */
export function blankDatasource(type: DatasourceType): DatasourceConfig {
  return type === 'gdrive' ? { type, authType: 'api_Key', apiKey: '', clientId: '', clientSecret: '', refreshToken: '', folderId: '' } : { type: 'amazons3', accessKeyId: '', secretAccessKey: '', bucketName: '' };
}

// ── Component / deployment ──────────────────────────────────────────────────

/** `componentSubType` tag identifying a RAG ingestion component. */
export const RAG_INGESTION_SUBTYPE = 'rag-ingestion';
/** BYOI component type — a scheduled cronjob (shares Devant's `byoiCronjob`). */
export const RAG_INGESTION_COMPONENT_TYPE = 'byoiCronjob';
/** Default ingestion container image, overridable via the `RAG_INGESTION_IMAGE` runtime config key. */
export const RAG_INGESTION_DEFAULT_IMAGE = 'choreoanonymouspullable.azurecr.io/devant/devant-rag-backend:v1.1.0';

/** RAG "Service" — a shared retrieval API deployed as a BYOI service component. */
export const RAG_SERVICE_SUBTYPE = 'rag-service';
export const RAG_SERVICE_COMPONENT_TYPE = 'byoiService';
export const RAG_SERVICE_DEFAULT_IMAGE = 'choreoanonymouspullable.azurecr.io/devant/devant-rag-service:rag-api-service-0.1.0';

/**
 * RAG Retrieval Service — the shared backend auto-created alongside a RAG
 * ingestion. A BYOI service surfaced as an Integration as API. One per project;
 * reused across ingestions.
 */
export const RAG_RETRIEVAL_SERVICE_SUBTYPE = 'rag-retrieval-service';
export const RAG_RETRIEVAL_SERVICE_NAME = 'rag-retrieval-service';
export const RAG_RETRIEVAL_SERVICE_DISPLAY_NAME = 'RAG Retrieval Service';
export const RAG_RETRIEVAL_SERVICE_DEFAULT_IMAGE = 'choreoanonymouspullable.azurecr.io/devant/devant-rag-retrieval-service:rag-retrieval-service-0.1.1';

/**
 * Component subtypes that are RAG-provisioned and have no source repo, commit,
 * or build step — the overview hides Source/Commit + the Build card, and the
 * Build tab shows "not available".
 */
export const RAG_NO_SOURCE_SUBTYPES: ReadonlySet<string> = new Set([RAG_INGESTION_SUBTYPE, RAG_RETRIEVAL_SERVICE_SUBTYPE, RAG_SERVICE_SUBTYPE]);

/**
 * Env-var keys whose values are sensitive and must be stored as a Secret rather
 * than a ConfigMap. Mirrors Devant's `RAG_SECRET_KEYS`.
 */
export const RAG_SECRET_KEYS: ReadonlySet<string> = new Set([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'GOOGLE_APIKEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'PINECONE_APIKEY',
  'WEAVIATE_APIKEY',
  'POSTGRES_PASSWORD',
  'EMBEDDING_MODEL_APIKEY',
]);
