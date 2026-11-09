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

import { AZURE_DEFAULT_API_VERSION, CHUNKING_STRATEGIES, DATASOURCES, DEFAULT_CHUNKING, EMBEDDING_PROVIDERS, RAG_SECRET_KEYS, VECTOR_STORE_PROVIDERS } from '../constants/ragIngestion';
import type { EndpointTestAccess } from '../hooks/useEndpointTestAccess';
import { httpStatusOf } from './apiErrors';
import type { KnowledgeBase, KnowledgeBaseApiStatus, KnowledgeBaseSettings } from '../types/knowledgeBase';
import type { ChunkingConfig, ChunkingStrategy, DatasourceConfig, EmbeddingConfig, EmbeddingProvider, VectorStoreConfig } from '../types/ragIngestion';
import { datasourceEnvVars, embeddingEnvVars, isEmbeddingValid, isVectorStoreValid, vectorStoreEnvVars } from './ragIngestion';

// Matches the BFF's name rule: a valid integration name with room for the
// suffixes the control plane appends to its releases.
const KNOWLEDGE_BASE_NAME_RE = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/;
export const KNOWLEDGE_BASE_NAME_MAX = 40;

/** '' when valid, else why not. Used for knowledge base and data source names. */
export function knowledgeBaseNameError(name: string): string {
  if (!name) return '';
  if (name.length > KNOWLEDGE_BASE_NAME_MAX) return `Name must be at most ${KNOWLEDGE_BASE_NAME_MAX} characters.`;
  if (!KNOWLEDGE_BASE_NAME_RE.test(name)) return 'Use lowercase letters, digits and hyphens; start with a letter and end with a letter or digit.';
  // The create page's own path segment; a knowledge base named so could not be opened.
  if (name === 'new') return '"new" is reserved. Choose another name.';
  return '';
}

export interface NameFields {
  displayName: string;
  name: string;
  description: string;
}

export function isNameValid(value: NameFields): boolean {
  return !!value.displayName.trim() && !!value.name && !knowledgeBaseNameError(value.name);
}

/** A name derived from a display name, valid whenever the display name has a letter to start from. */
export function knowledgeBaseNameFrom(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, KNOWLEDGE_BASE_NAME_MAX)
    .replace(/-+$/, '');
}

/**
 * The name of a knowledge base's first data source: the knowledge base's name with the
 * source type appended. The knowledge base part is shortened to fit, so the suffix is
 * never cut off, which would give the data source the knowledge base's own name.
 */
export function dataSourceNameFor(knowledgeBaseName: string, type: string): string {
  const suffix = `-${type}`;
  return `${knowledgeBaseName.slice(0, KNOWLEDGE_BASE_NAME_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
}

function split(env: Record<string, string>): KnowledgeBaseSettings {
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (RAG_SECRET_KEYS.has(key)) secrets[key] = value;
    else config[key] = value;
  }
  return { config, secrets };
}

/**
 * The knowledge base's settings, as the KB Service and every data source read
 * them. Chunking travels with the knowledge base: every source must cut
 * documents the same way for retrieval to compare like with like.
 */
export function buildKnowledgeBaseSettings(vectorStore: VectorStoreConfig, embedding: EmbeddingConfig, chunking: ChunkingConfig): KnowledgeBaseSettings {
  return split({
    ...vectorStoreEnvVars(vectorStore),
    ...embeddingEnvVars(embedding),
    CHUNKING_STRATEGY: chunking.strategy,
    MAX_SEGMENT_SIZE: String(chunking.maxSegmentSize),
    MAX_OVERLAP_SIZE: String(chunking.maxOverlapSize),
  });
}

export function buildDataSourceSettings(datasource: DatasourceConfig): KnowledgeBaseSettings {
  return split(datasourceEnvVars(datasource));
}

// ── Reading stored settings back ────────────────────────────────────────────

/**
 * The vector store a knowledge base was configured with, for editing. Secret
 * fields come back empty: their values never leave the BFF, and an empty
 * secret on update keeps the stored one. null for a provider this console
 * cannot edit.
 */
export function vectorStoreFromConfig(config: Record<string, string>): VectorStoreConfig | null {
  const c = (key: string): string => config[key] ?? '';
  switch (c('VECTORDB_PROVIDER')) {
    case 'pinecone':
      return { provider: 'pinecone', apiKey: '', indexName: c('COLLECTION_NAME') };
    case 'chroma':
      return { provider: 'chroma', host: c('CHROMA_HOST'), port: c('CHROMA_PORT'), collectionName: c('COLLECTION_NAME') };
    case 'weaviate':
      return { provider: 'weaviate', clusterUrl: c('WEAVIATE_URL'), apiKey: '', collectionName: c('COLLECTION_NAME') };
    case 'pgvector':
      return { provider: 'pgvector', host: c('POSTGRES_HOST'), port: c('POSTGRES_PORT'), user: c('POSTGRES_USER'), password: '', dbName: c('POSTGRES_DBNAME'), tableName: c('POSTGRES_TABLE_NAME') };
    default:
      return null;
  }
}

export function embeddingFromConfig(config: Record<string, string>): EmbeddingConfig | null {
  const provider = config.EMBEDDING_MODEL_PROVIDER;
  if (!EMBEDDING_PROVIDERS.some((p) => p.id === provider)) return null;
  return {
    provider: provider as EmbeddingProvider,
    model: config.EMBEDDING_MODEL ?? '',
    apiKey: '',
    azureApiVersion: config.AZURE_OPENAI_APIVERSION || AZURE_DEFAULT_API_VERSION,
    azureBaseUrl: config.AZURE_OPENAI_BASEURL ?? '',
  };
}

export function chunkingFromConfig(config: Record<string, string>): ChunkingConfig {
  const strategy = CHUNKING_STRATEGIES.some((s) => s.value === config.CHUNKING_STRATEGY) ? (config.CHUNKING_STRATEGY as ChunkingStrategy) : DEFAULT_CHUNKING.strategy;
  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return raw && Number.isFinite(n) ? n : fallback;
  };
  return { strategy, maxSegmentSize: num(config.MAX_SEGMENT_SIZE, DEFAULT_CHUNKING.maxSegmentSize), maxOverlapSize: num(config.MAX_OVERLAP_SIZE, DEFAULT_CHUNKING.maxOverlapSize) };
}

// The form field holding each secret, so a stored secret can stand in for an empty field.
const VECTOR_STORE_SECRET_FIELD: Partial<Record<VectorStoreConfig['provider'], { field: string; key: string }>> = {
  pinecone: { field: 'apiKey', key: 'PINECONE_APIKEY' },
  weaviate: { field: 'apiKey', key: 'WEAVIATE_APIKEY' },
  pgvector: { field: 'password', key: 'POSTGRES_PASSWORD' },
};

/**
 * Whether an edited vector store and embedding are complete, counting a secret
 * left empty as set when the knowledge base already stores it.
 */
export function isEditedSettingsValid(vectorStore: VectorStoreConfig | null, embedding: EmbeddingConfig | null, storedSecretKeys: readonly string[]): boolean {
  if (!vectorStore || !embedding) return false;
  const stored = new Set(storedSecretKeys);
  const vsSecret = VECTOR_STORE_SECRET_FIELD[vectorStore.provider];
  const vs = vsSecret && stored.has(vsSecret.key) && !(vectorStore as unknown as Record<string, string>)[vsSecret.field] ? { ...vectorStore, [vsSecret.field]: 'stored' } : vectorStore;
  const em = stored.has('EMBEDDING_MODEL_APIKEY') && !embedding.apiKey ? { ...embedding, apiKey: 'stored' } : embedding;
  return isVectorStoreValid(vs) && isEmbeddingValid(em);
}

/**
 * The secrets to send on update. Every secret the edited settings use is sent;
 * an empty one keeps its stored value, and a stored secret the settings no
 * longer use is left out, which removes it.
 */
export function secretsForUpdate(edited: KnowledgeBaseSettings, storedSecretKeys: readonly string[]): Record<string, string> {
  const stored = new Set(storedSecretKeys);
  return Object.fromEntries(Object.entries(edited.secrets).filter(([key, value]) => value !== '' || stored.has(key)));
}

// ── Display ─────────────────────────────────────────────────────────────────

export interface KnowledgeBaseSummary {
  vectorStore: string;
  collection: string;
  embedding: string;
  chunking: string;
}

export function knowledgeBaseSummary(config: Record<string, string>): KnowledgeBaseSummary {
  const provider = VECTOR_STORE_PROVIDERS.find((p) => p.id === config.VECTORDB_PROVIDER)?.name ?? config.VECTORDB_PROVIDER ?? '';
  const embeddingProvider = EMBEDDING_PROVIDERS.find((p) => p.id === config.EMBEDDING_MODEL_PROVIDER)?.name ?? config.EMBEDDING_MODEL_PROVIDER ?? '';
  const chunking = chunkingFromConfig(config);
  const strategy = CHUNKING_STRATEGIES.find((s) => s.value === chunking.strategy)?.label.replace(' (Default)', '') ?? chunking.strategy;
  return {
    vectorStore: provider,
    collection: config.COLLECTION_NAME ?? '',
    embedding: [embeddingProvider, config.EMBEDDING_MODEL].filter(Boolean).join(' · '),
    chunking: `${strategy} · ${chunking.maxSegmentSize} / ${chunking.maxOverlapSize}`,
  };
}

/** "Google Drive" / "Amazon S3" for a data source's stored DATASOURCE. */
export function dataSourceLabel(config: Record<string, string>): string {
  return DATASOURCES.find((d) => d.id === config.DATASOURCE)?.name ?? config.DATASOURCE ?? '';
}

/** The cron the BFF gives a data source that only runs when triggered: a CronJob needs a schedule, so it gets one that never fires (Feb 31). */
export const NEVER_FIRES_CRON = '0 0 31 2 *';

export function isManualSchedule(cronExpression: string): boolean {
  const cron = cronExpression.trim();
  return cron === '' || cron === NEVER_FIRES_CRON;
}

/**
 * Why a knowledge base takes no write yet, or null when it does: while its create runs it takes
 * none, and once the create failed it can only be deleted. The BFF refuses these with 409 too.
 */
export function knowledgeBaseWriteBlockedReason(kb: Pick<KnowledgeBase, 'status'>, write: 'add-data-source' | 'save' | 'delete'): string | null {
  if (kb.status === 'CREATING') return 'The knowledge base is still being created. Try again once it is.';
  if (kb.status === 'FAILED' && write !== 'delete') return 'The knowledge base could not be created. Delete it and create it again.';
  return null;
}

/** Why a knowledge base cannot be queried yet, or null when it can. */
export function retrievalUnavailableReason(kb: Pick<KnowledgeBase, 'status'>): string | null {
  if (kb.status === 'CREATING') return 'The knowledge base is still being created. You can query it once it is active.';
  if (kb.status === 'FAILED') return 'The knowledge base could not be created, so it cannot be queried.';
  if (kb.status === 'ERROR') return 'The knowledge base service failed to deploy, so it cannot be queried.';
  if (kb.status === 'SUSPENDED') return 'The knowledge base service is stopped, so it cannot be queried.';
  if (kb.status !== 'ACTIVE') return 'The knowledge base service is still deploying. You can query it once it is active.';
  return null;
}

/** Why an active knowledge base cannot be queried on the gateway with a test key yet, or null when it can. */
export function retrievalAccessReason(access: Pick<EndpointTestAccess, 'keyError' | 'needsApiKeyAuth' | 'securityError' | 'mode' | 'gatewayUrl' | 'isAuthorized' | 'isMinting'>, apiStatus?: KnowledgeBaseApiStatus): string | null {
  if (access.keyError) return access.keyError;
  if (access.needsApiKeyAuth) return "The knowledge base's API takes another kind of credential, so it can't be queried with a test key.";
  if (access.securityError) {
    // Only a 409 says the API is not on the gateway; anything else is a read that failed, read again.
    if (httpStatusOf(access.securityError) === 409) return notOnGatewayReason(apiStatus);
    return "Could not check the knowledge base's API on the gateway. Trying again…";
  }
  if (access.mode === null) return "Checking the knowledge base's API on the gateway…";
  if (!access.gatewayUrl) return notOnGatewayReason(apiStatus);
  if (access.isAuthorized) return null;
  if (access.isMinting) return 'Getting a test key for the knowledge base…';
  // The hook leaves a permission refusal out of keyError: it is what stops a key without saying why.
  return "Your role can't create test keys for this knowledge base, so it can't be queried here.";
}

/** Why the knowledge base's API is not on the gateway, from how putting it there is going. */
function notOnGatewayReason(apiStatus: KnowledgeBaseApiStatus | undefined): string {
  // No run recorded: a knowledge base from before they were put on the gateway.
  if (!apiStatus) return 'The knowledge base is not on the API gateway yet. Saving its configuration again puts it there.';
  if (apiStatus.error === 'GATEWAY_UNAVAILABLE' || apiStatus.error === 'GATEWAY_PROVISIONING') {
    return 'The API gateway for this environment is being set up. The knowledge base can be queried once it is published there.';
  }
  if (apiStatus.status === 'FAILED' || apiStatus.status === 'DEGRADED') return 'Publishing the knowledge base on the API gateway failed. It is retried automatically.';
  return 'The knowledge base is being published on the API gateway.';
}
