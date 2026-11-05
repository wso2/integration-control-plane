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

import { RAG_SECRET_KEYS } from '../constants/ragIngestion';
import type { AutomationConfig, ChunkingConfig, DatasourceConfig, EmbeddingConfig, RagIngestionForm, RetrievalQuery, RetrieveRequestBody, VectorStoreConfig } from '../types/ragIngestion';

// ── Name/format validators (return '' when valid, else an error message) ─────

const PINECONE_INDEX_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const WEAVIATE_COLLECTION_RE = /^[A-Z][_0-9A-Za-z]*$/;
const POSTGRES_TABLE_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const COMPONENT_NAME_RE = /^[a-z][a-z0-9-]*$/;

export function pineconeIndexNameError(name: string): string {
  if (!name) return '';
  if (name.length > 45) return 'Index name must be at most 45 characters.';
  if (!PINECONE_INDEX_RE.test(name)) return 'Use lowercase letters, digits and hyphens; must start and end with a letter or digit.';
  return '';
}

export function chromaCollectionNameError(name: string): string {
  if (!name) return '';
  if (name.length < 3 || name.length > 512) return 'Collection name must be 3–512 characters.';
  if (name.includes('..')) return 'Collection name cannot contain "..".';
  if (IPV4_RE.test(name)) return 'Collection name cannot be an IP address.';
  return '';
}

export function weaviateCollectionNameError(name: string): string {
  if (!name) return '';
  if (!WEAVIATE_COLLECTION_RE.test(name)) return 'Must start with an uppercase letter and contain only letters, digits and underscores.';
  return '';
}

export function postgresTableNameError(name: string): string {
  if (!name) return '';
  if (name.length > 63) return 'Table name must be at most 63 characters.';
  if (!POSTGRES_TABLE_RE.test(name)) return 'Must start with a letter or underscore and contain only letters, digits, underscores and $.';
  return '';
}

export function componentNameError(name: string): string {
  if (!name) return '';
  if (name.length > 63) return 'Name must be at most 63 characters.';
  if (!COMPONENT_NAME_RE.test(name)) return 'Use lowercase letters, digits and hyphens; must start with a letter.';
  return '';
}

/** Derive a component handle from a display name (kebab-case, ≤63 chars). */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

// ── Per-step validity ───────────────────────────────────────────────────────

export function isVectorStoreValid(vs: VectorStoreConfig | null): boolean {
  if (!vs) return false;
  switch (vs.provider) {
    case 'pinecone':
      return !!vs.apiKey && !!vs.indexName && !pineconeIndexNameError(vs.indexName);
    case 'chroma':
      return !!vs.host && !!vs.port && !!vs.collectionName && !chromaCollectionNameError(vs.collectionName);
    case 'weaviate':
      return !!vs.clusterUrl && !!vs.apiKey && !!vs.collectionName && !weaviateCollectionNameError(vs.collectionName);
    case 'pgvector':
      return !!vs.host && !!vs.port && !!vs.user && !!vs.password && !!vs.dbName && !!vs.tableName && !postgresTableNameError(vs.tableName);
    case 'pgvector-devant':
      // Host/port/user/password/dbName are resolved from the managed server at submit time,
      // so the step only needs a chosen server + a valid table name.
      return !!vs.serverId && !!vs.tableName && !postgresTableNameError(vs.tableName);
  }
}

export function isEmbeddingValid(em: EmbeddingConfig | null): boolean {
  if (!em) return false;
  if (!em.model || !em.apiKey) return false;
  if (em.provider === 'azure_openai') return !!em.azureBaseUrl && !!em.azureApiVersion;
  return true;
}

export function isChunkingValid(ch: ChunkingConfig): boolean {
  return Number.isFinite(ch.maxSegmentSize) && ch.maxSegmentSize > 0 && Number.isFinite(ch.maxOverlapSize) && ch.maxOverlapSize >= 0 && ch.maxOverlapSize < ch.maxSegmentSize;
}

export function isAutomationValid(a: AutomationConfig): boolean {
  return !!a.projectId && !!a.displayName && !!a.name && !componentNameError(a.name);
}

export function isDatasourceValid(ds: DatasourceConfig | null): boolean {
  if (!ds) return false;
  if (ds.type === 'amazons3') return !!ds.accessKeyId && !!ds.secretAccessKey && !!ds.bucketName;
  // gdrive
  if (!ds.folderId) return false;
  return ds.authType === 'api_Key' ? !!ds.apiKey : !!ds.clientId && !!ds.clientSecret && !!ds.refreshToken;
}

/** Whether the whole form is ready to submit. */
export function isFormComplete(form: RagIngestionForm): boolean {
  return isVectorStoreValid(form.vectorStore) && isEmbeddingValid(form.embedding) && isChunkingValid(form.chunking) && isAutomationValid(form.automation) && isDatasourceValid(form.datasource);
}

// ── Serialization: form → container env vars ─────────────────────────────────

/**
 * Map the wizard form to the ingestion container's environment variables.
 * Key names mirror the shared `devant-rag-backend` image's contract exactly
 * (see Devant's `buildRAGEnvironmentVariables`). Chunking config is intentionally
 * not emitted here — the image does not read it from env (parity with Devant);
 * it is reserved for the direct setup API.
 *
 * The vector store must already have its connection params resolved: a managed
 * `pgvector-devant` store's host/port/user/password/dbName are resolved from the
 * platform-services API before calling this.
 */
export function buildRagEnvVars(form: RagIngestionForm): Record<string, string> {
  const { vectorStore: vs, embedding: em, datasource: ds } = form;
  return { ...(ds ? datasourceEnvVars(ds) : {}), ...(vs ? vectorStoreEnvVars(vs) : {}), ...(em ? embeddingEnvVars(em) : {}) };
}

/** The data source's settings, as the ingestion image reads them. */
export function datasourceEnvVars(ds: DatasourceConfig): Record<string, string> {
  if (ds.type === 'amazons3') {
    return { DATASOURCE: ds.type, AWS_ACCESS_KEY_ID: ds.accessKeyId, AWS_SECRET_ACCESS_KEY: ds.secretAccessKey, AWS_BUCKET_NAME: ds.bucketName };
  }
  const auth: Record<string, string> = ds.authType === 'api_Key' ? { GOOGLE_APIKEY: ds.apiKey } : { GOOGLE_CLIENT_ID: ds.clientId, GOOGLE_CLIENT_SECRET: ds.clientSecret, GOOGLE_REFRESH_TOKEN: ds.refreshToken };
  return { DATASOURCE: ds.type, GOOGLE_AUTH_TYPE: ds.authType, ...auth, GOOGLE_DRIVE_FOLDER_ID: ds.folderId };
}

/** The vector store's settings, as the RAG images read them. */
export function vectorStoreEnvVars(vs: VectorStoreConfig): Record<string, string> {
  switch (vs.provider) {
    case 'pinecone':
      return { VECTORDB_PROVIDER: vs.provider, COLLECTION_NAME: vs.indexName, PINECONE_APIKEY: vs.apiKey };
    case 'weaviate':
      return { VECTORDB_PROVIDER: vs.provider, COLLECTION_NAME: vs.collectionName, WEAVIATE_APIKEY: vs.apiKey, WEAVIATE_URL: vs.clusterUrl };
    case 'chroma':
      return { VECTORDB_PROVIDER: vs.provider, COLLECTION_NAME: vs.collectionName, CHROMA_HOST: vs.host, CHROMA_PORT: vs.port };
    case 'pgvector':
    case 'pgvector-devant':
      return {
        VECTORDB_PROVIDER: vs.provider,
        POSTGRES_HOST: vs.host,
        POSTGRES_PORT: vs.port,
        POSTGRES_USER: vs.user,
        POSTGRES_PASSWORD: vs.password,
        POSTGRES_DBNAME: vs.dbName,
        POSTGRES_TABLE_NAME: vs.tableName,
        COLLECTION_NAME: vs.tableName,
      };
  }
}

/** The embedding model's settings, as the RAG images read them. */
export function embeddingEnvVars(em: EmbeddingConfig): Record<string, string> {
  const env: Record<string, string> = { EMBEDDING_MODEL_PROVIDER: em.provider, EMBEDDING_MODEL_APIKEY: em.apiKey, EMBEDDING_MODEL: em.model };
  if (em.provider === 'azure_openai') {
    env.AZURE_OPENAI_APIVERSION = em.azureApiVersion;
    env.AZURE_OPENAI_BASEURL = em.azureBaseUrl;
  }
  return env;
}

/** Partition env vars into secret (sensitive) and plain (ConfigMap) sets. */
export function splitRagEnvVars(env: Record<string, string>): { plain: Record<string, string>; secret: Record<string, string> } {
  const plain: Record<string, string> = {};
  const secret: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (RAG_SECRET_KEYS.has(key)) secret[key] = value;
    else plain[key] = value;
  }
  return { plain, secret };
}

// ── Retrieval ───────────────────────────────────────────────────────────────

/** Whether the query step can run a retrieval. */
export function isRetrievalQueryValid(query: RetrievalQuery): boolean {
  if (!query.userQuery.trim()) return false;
  if (query.minSimilarity < 0 || query.minSimilarity > 1) return false;
  return !query.rerankingEnabled || !!query.rerankerApiKey;
}

/**
 * Map a (resolved) vector store + embedding + query to the `/retrieve` request body.
 * The vector store must already have its connection params resolved (managed DBs
 * are resolved from the platform-services API before calling this).
 */
export function buildRetrievePayload(vectorStore: VectorStoreConfig, embedding: EmbeddingConfig, query: RetrievalQuery): RetrieveRequestBody {
  const body: RetrieveRequestBody = {
    vectordb_provider: vectorStore.provider,
    collection_name: '',
    embedding_model_provider: embedding.provider,
    embedding_model: embedding.model,
    embedding_model_apikey: embedding.apiKey,
    max_retrieve_chunks: query.maxChunks,
    min_similarity_threshold: query.minSimilarity,
    user_query: query.userQuery,
    reranking_enabled: query.rerankingEnabled,
  };
  switch (vectorStore.provider) {
    case 'pinecone':
      body.collection_name = vectorStore.indexName;
      body.pinecone_apikey = vectorStore.apiKey;
      break;
    case 'weaviate':
      body.collection_name = vectorStore.collectionName;
      body.weaviate_apikey = vectorStore.apiKey;
      body.weaviate_url = vectorStore.clusterUrl;
      break;
    case 'chroma':
      body.collection_name = vectorStore.collectionName;
      body.chroma_host = vectorStore.host;
      body.chroma_port = vectorStore.port;
      break;
    case 'pgvector':
    case 'pgvector-devant':
      body.collection_name = vectorStore.tableName;
      body.postgres_host = vectorStore.host;
      body.postgres_port = vectorStore.port;
      body.postgres_user = vectorStore.user;
      body.postgres_password = vectorStore.password;
      body.postgres_dbname = vectorStore.dbName;
      body.postgres_table_name = vectorStore.tableName;
      break;
  }
  if (embedding.provider === 'azure_openai') {
    body.azure_openai_baseurl = embedding.azureBaseUrl;
    body.azure_openai_apiversion = embedding.azureApiVersion;
  }
  if (query.rerankingEnabled) {
    body.reranker_apikey = query.rerankerApiKey;
    body.reranker_model = query.rerankerModel;
  }
  return body;
}
