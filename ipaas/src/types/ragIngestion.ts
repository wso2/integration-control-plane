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

/**
 * Typed model for the RAG Ingestion setup wizard.
 *
 * Unlike Devant's ~40 loose context fields, provider-specific configuration is
 * expressed as discriminated unions keyed by `provider`/`type`, so invalid
 * combinations are unrepresentable and serialization/validation can switch
 * exhaustively. Every field is a defined string (defaulting to `''`) rather than
 * optional, so form editing never deals with `undefined`.
 */

// ── Step 1: vector store ────────────────────────────────────────────────────

export type VectorStoreProvider = 'pinecone' | 'chroma' | 'weaviate' | 'pgvector' | 'pgvector-devant';

export interface PineconeConfig {
  provider: 'pinecone';
  apiKey: string;
  indexName: string;
}
export interface ChromaConfig {
  provider: 'chroma';
  host: string;
  port: string;
  collectionName: string;
}
export interface WeaviateConfig {
  provider: 'weaviate';
  clusterUrl: string;
  apiKey: string;
  collectionName: string;
}
export interface PostgresConfig {
  provider: 'pgvector';
  host: string;
  port: string;
  user: string;
  password: string;
  dbName: string;
  tableName: string;
}
/** WSO2-managed vector DB — same Postgres fields, plus the managed server id it was resolved from. */
export interface ManagedPostgresConfig {
  provider: 'pgvector-devant';
  serverId: string;
  host: string;
  port: string;
  user: string;
  password: string;
  dbName: string;
  tableName: string;
}
export type VectorStoreConfig = PineconeConfig | ChromaConfig | WeaviateConfig | PostgresConfig | ManagedPostgresConfig;

// ── Step 2: embedding model ─────────────────────────────────────────────────

export type EmbeddingProvider = 'openai' | 'azure_openai' | 'mistral';

/** `azureApiVersion`/`azureBaseUrl` are only consumed when `provider === 'azure_openai'`. */
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey: string;
  azureApiVersion: string;
  azureBaseUrl: string;
}

// ── Step 3: chunking ────────────────────────────────────────────────────────

export type ChunkingStrategy = 'recursive' | 'sentence' | 'character';

export interface ChunkingConfig {
  strategy: ChunkingStrategy;
  maxSegmentSize: number;
  maxOverlapSize: number;
}

/** How a knowledge base reads its files, sent as ENABLE_OCR. */
export interface ParsingConfig {
  /** OCR every PDF page, for scanned PDFs. */
  ocrEnabled: boolean;
}

// ── Step 4: automation (the component to create) ────────────────────────────

export interface AutomationConfig {
  projectId: string;
  displayName: string;
  name: string;
  description: string;
}

// ── Step 5: datasource ──────────────────────────────────────────────────────

export type DatasourceType = 'gdrive' | 'amazons3';
export type GdriveAuthType = 'api_Key' | 'oauth';

/** Google Drive holds both auth variants' fields; `authType` selects which are used/validated. */
export interface GdriveConfig {
  type: 'gdrive';
  authType: GdriveAuthType;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
}
export interface AmazonS3Config {
  type: 'amazons3';
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}
export type DatasourceConfig = GdriveConfig | AmazonS3Config;

// ── The whole wizard ────────────────────────────────────────────────────────

export interface RagIngestionForm {
  /** null until the user picks a provider on step 1. */
  vectorStore: VectorStoreConfig | null;
  /** null until the user picks a provider on step 2. */
  embedding: EmbeddingConfig | null;
  chunking: ChunkingConfig;
  automation: AutomationConfig;
  /** null until the user picks a datasource on step 5. */
  datasource: DatasourceConfig | null;
}

// ── RAG Retrieval ────────────────────────────────────────────────────────────

/** Query controls for the Retrieval feature's "Query & Retrieve" step. */
export interface RetrievalQuery {
  userQuery: string;
  maxChunks: number;
  minSimilarity: number;
  rerankingEnabled: boolean;
  rerankerApiKey: string;
  rerankerModel: string;
}

export interface RagRetrievalForm {
  vectorStore: VectorStoreConfig | null;
  embedding: EmbeddingConfig | null;
  query: RetrievalQuery;
}

/** One retrieved chunk from the vector store. */
export interface RetrievedChunk {
  text: string;
  source: string;
}

/**
 * Response from `POST {ragBackendUrl}/retrieve`. The `query`/`retrieved_chunks`
 * snake_case is intentional — it mirrors the `devant-rag-backend` image's
 * response contract verbatim (same as {@link RetrieveRequestBody}).
 */
export interface RetrieveResponse {
  query: string;
  retrieved_chunks: RetrievedChunk[];
}

/** Snake-case request body for `POST {ragBackendUrl}/retrieve`. Mirrors Devant's contract. */
export interface RetrieveRequestBody {
  vectordb_provider: string;
  collection_name: string;
  pinecone_apikey?: string;
  weaviate_apikey?: string;
  weaviate_url?: string;
  chroma_host?: string;
  chroma_port?: string;
  postgres_host?: string;
  postgres_port?: string;
  postgres_user?: string;
  postgres_password?: string;
  postgres_dbname?: string;
  postgres_table_name?: string;
  embedding_model_provider: string;
  embedding_model: string;
  embedding_model_apikey: string;
  azure_openai_baseurl?: string;
  azure_openai_apiversion?: string;
  max_retrieve_chunks: number;
  min_similarity_threshold: number;
  user_query: string;
  reranking_enabled: boolean;
  reranker_apikey?: string;
  reranker_model?: string;
}
