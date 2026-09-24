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
 * Domain model for Context Engines — the org-level feature that builds a
 * governed context graph from chosen sources and lets selected roles query it
 * in natural language, over REST, or over MCP.
 *
 * A Context Engine is backed by one *context space* on the Devant Context
 * Engine service. The public engine vocabulary (space, source, evidence, job,
 * grant) is kept here; the product name shown to users is "Context Engine".
 */

import type { EmbeddingConfig } from './ragIngestion';

// ── Engine ──────────────────────────────────────────────────────────────────

export type ContextEngineState = 'provisioning' | 'ready' | 'failed' | 'deleting';

/** Tabs on the engine detail page; the active one is a URL segment. */
export type ContextEngineTabKey = 'overview' | 'playground' | 'api' | 'mcp' | 'access';

/** Lifecycle of the knowledge graph built from the sources — distinct from the engine's own state. */
export type ContextGraphState = 'not_built' | 'building' | 'built' | 'failed';

export interface ContextGraphStatus {
  state: ContextGraphState;
  /** When the current graph finished building. */
  builtAt?: string;
  /** The running or last build job. */
  jobId?: string;
  /** Sources processed so far while building. */
  progress?: { done: number; total: number };
}

/** At-a-glance facts for the listing; absent when the engine could not report them. */
export interface ContextEngineSummary {
  sourceCount: number;
  /** Connector ids of the sources, for the mark cluster. */
  sourceTypes: string[];
  roleCount: number;
  exposure: ContextEngineExposure;
  graph: ContextGraphStatus;
  /** Source progress roll-up; null when the engine does not report progress. */
  progress: ContextEngineProgressSummary | null;
}

/** A context engine as shown in the listing. */
export interface ContextEngine {
  id: string;
  name: string;
  description: string;
  state: ContextEngineState;
  createdAt: string;
  summary?: ContextEngineSummary;
}

/** Which surfaces the engine is published on. */
export interface ContextEngineExposure {
  api: boolean;
  mcp: boolean;
}

/** Provider + model, without credentials — what the engine reports back. */
export interface ContextModelSummary {
  provider: string;
  model: string;
}

export interface ContextEngineModels {
  embedding: ContextModelSummary | null;
  llm: ContextModelSummary | null;
}

/** The full engine as shown on its detail page. */
export interface ContextEngineDetail extends ContextEngine {
  sources: ContextSource[];
  models: ContextEngineModels;
  /** Org role handles granted query access (derived from group grants). */
  queryRoles: string[];
  exposure: ContextEngineExposure;
  graph: ContextGraphStatus;
  /** Per-store placement as the engine reports it; null when it has not reported configuration. */
  storage: Record<StorageKind, StorageSummary> | null;
}

// ── Sources ─────────────────────────────────────────────────────────────────

export type ContextSourceState = 'ready' | 'paused' | 'failed' | 'pending';

/** A source registered on the engine. */
export interface ContextSource {
  id: string;
  name: string;
  /** Connector id (see {@link SourceConnector}). */
  type: string;
  state: ContextSourceState | string;
}

/**
 * How a connector field is entered. `url` must be one http(s) URL; `urls` is a
 * newline-separated list of them; `secret` is masked and travels as a credential.
 */
export type SourceFieldKind = 'text' | 'secret' | 'url' | 'urls' | 'multiline';

export interface SourceFieldDef {
  key: string;
  label: string;
  kind: SourceFieldKind;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  defaultValue?: string;
}

export type SourceCategory = 'documentation' | 'cloud-storage' | 'code' | 'collaboration' | 'databases' | 'saas' | 'web-files';

/** Icon keys the source mark can draw for connectors without a brand logo. */
export type SourceIcon = 'book' | 'building' | 'github' | 'globe' | 'upload' | 'database' | 'headset' | 'hash' | 'kanban' | 'file' | 'cloud' | 'folder' | 'mail' | 'table' | 'chat' | 'box' | 'plug' | 'shield' | 'video' | 'rss' | 'cart' | 'card' | 'code';

/**
 * One entry in the connector catalog — everything the UI needs to list it and
 * render its configuration form. The catalog is schema-driven so it can grow to
 * hundreds of connectors without a component per type.
 */
export interface SourceConnector {
  id: string;
  name: string;
  description: string;
  category: SourceCategory;
  /** Shown in the Popular row and as a quick-add chip. */
  popular?: boolean;
  /** Logo path under the public folder; `icon` is drawn when absent. */
  logo?: string;
  icon: SourceIcon;
  fields: SourceFieldDef[];
  /** Field keys shown in the one-line summary, in order. */
  summaryKeys: string[];
  /** Only one instance can be added (e.g. file upload). */
  single?: boolean;
}

/** A configured source in the wizard: the connector, a display name and the connector's field values. */
export interface ContextSourceConfig {
  type: string;
  name: string;
  values: Record<string, string>;
}

// ── Source progress ─────────────────────────────────────────────────────────

/** Whether the connector is still reading. The engine gives no percentage for this by design. */
export type SourceReadingState = 'idle' | 'reading' | 'completed';

/** `not_collected` until the engine's worker has asked the knowledge backend at least once. */
export type SourceIndexingState = 'not_collected' | 'ok' | 'unavailable';

/** Pipeline progress of one source, as `GET /v1/progress/spaces/{id}` reports it. */
export interface SourceProgress {
  sourceId: string;
  reading: { state: SourceReadingState; startedAt?: string; completedAt?: string };
  /** Deliveries since the latest sync run started. `percent` is finished (succeeded + failed) over total; null when nothing was delivered. */
  processing: { since?: string; total: number; queued: number; running: number; succeeded: number; failed: number; percent: number | null };
  records: { active: number; quarantined: number; deleted: number };
  /** Active record versions the knowledge backend has indexed, from the last background collection. */
  indexing: { state: SourceIndexingState; expected: number | null; indexed: number | null; indexing: number | null; failed: number | null; missing: number | null; percent: number | null; collectedAt?: string };
}

export interface ContextEngineProgress {
  /** False when the engine does not serve the progress route yet. */
  available: boolean;
  /** Only the sources the caller may inspect: progress needs delivery or manage rights. */
  sources: SourceProgress[];
}

/** One word for where a source is in the pipeline, derived from its progress. */
export type SourceProgressStatus = 'waiting' | 'reading' | 'processing' | 'indexing' | 'processed' | 'attention';

/** Roll-up of every source's progress, for headers and the listing. */
export interface ContextEngineProgressSummary {
  /** Sources registered on the engine. */
  sourceCount: number;
  /** Sources whose delivered items are all finished (including those finished with errors). */
  processed: number;
  /** Sources still reading, processing or indexing. */
  active: number;
  /** Of the active sources, those whose connector is still reading, so their totals are not final. */
  reading: number;
  /** Sources that have not received anything yet. */
  waiting: number;
  /** Sources the caller cannot see progress for. */
  hidden: number;
  /** Finished over delivered items across all sources in their current sync window; null when nothing was delivered. */
  percent: number | null;
  /** Delivered items that failed, across all sources. */
  failedItems: number;
}

// ── Models ──────────────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic' | 'azure_openai' | 'mistral';

/** `azureApiVersion`/`azureBaseUrl` are only consumed when `provider === 'azure_openai'`. */
export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  azureBaseUrl: string;
  azureApiVersion: string;
}

// ── Storage ─────────────────────────────────────────────────────────────────

/** The three stores a context engine keeps its data in. */
export type StorageKind = 'vector' | 'relational' | 'graph';

/** The engine's embedded store — no setup, not shared. */
export interface ManagedStorage {
  mode: 'managed';
}

/** A managed database server from Infrastructure and the logical database on it. */
export interface InfrastructureStorage {
  mode: 'infrastructure';
  serverId: string;
  serverName: string;
  database: string;
}

/** A database the organization runs elsewhere — the graph store until Infrastructure offers one. */
export interface ExternalStorage {
  mode: 'external';
  uri: string;
  database: string;
  user: string;
  password: string;
}

export type StorageSelection = ManagedStorage | InfrastructureStorage | ExternalStorage;

export type ContextEngineStorage = Record<StorageKind, StorageSelection>;

/** How the engine reports one store back, without credentials. */
export interface StorageSummary {
  provider: string;
  /** Where it lives, e.g. a server name or "Engine managed". */
  label: string;
  /** Second line, e.g. the database name. */
  detail?: string;
}

// ── Wizard form ─────────────────────────────────────────────────────────────

export interface ContextEngineForm {
  sources: ContextSourceConfig[];
  /** Org role handles allowed to query. */
  roles: string[];
  embedding: EmbeddingConfig | null;
  llm: LlmConfig | null;
  /** Reuse the embedding API key for the language model when both use the same provider. */
  shareApiKey: boolean;
  storage: ContextEngineStorage;
  name: string;
  description: string;
}

/** A wizard draft kept in session storage. Secrets are stripped before saving and re-entered on restore. */
export interface ContextEngineDraft {
  v: 1;
  savedAt: string;
  form: ContextEngineForm;
}

export interface CreateContextEngineInput {
  name: string;
  description: string;
  sources: ContextSourceConfig[];
  roles: string[];
  embedding: EmbeddingConfig;
  llm: LlmConfig;
  storage: ContextEngineStorage;
}

export interface CreateContextEngineResult {
  id: string;
  /** Steps the engine could not complete because it does not expose that route yet. */
  warnings: string[];
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export type ContextJobState = 'accepted' | 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'failed';

export interface ContextJobError {
  code: string;
  message: string;
  traceId: string;
}

export interface ContextJob {
  id: string;
  state: ContextJobState | string;
  operation: string;
  traceId: string;
  attemptCount: number;
  createdAt: string;
  error?: ContextJobError;
}

export interface ContextJobHandle {
  jobId: string;
  statusUrl: string;
}

// ── Query ───────────────────────────────────────────────────────────────────

export type ContextQueryMode = 'context' | 'answer';

export interface ContextQueryInput {
  engineId: string;
  question: string;
  mode: ContextQueryMode;
  limit?: number;
}

export interface ContextEvidence {
  id: string;
  recordId: string;
  sourceId: string;
  sourceVersion: string;
  passage: string;
  location?: string;
  sourceUrl?: string;
}

export interface ContextQueryResult {
  queryId: string;
  state: 'completed' | 'insufficient_evidence' | string;
  answer?: string;
  evidence: ContextEvidence[];
  insufficientEvidence: boolean;
  traceId: string;
}

// ── Access ──────────────────────────────────────────────────────────────────

export interface ContextGrant {
  id: string;
  resourceId: string;
  actions: string[];
  principalId?: string;
  group?: string;
}

export interface PutContextGrantInput {
  engineId: string;
  grantId: string;
  actions: string[];
  group?: string;
  principalId?: string;
}

export interface ContextPrincipal {
  id: string;
  kind: 'user' | 'service' | string;
  email?: string;
  groups: string[];
}

// ── Post-create guidance and exposure ───────────────────────────────────────

export type GetStartedStepId = 'build' | 'ask' | 'publish' | 'grant';

export interface GetStartedStep {
  id: GetStartedStepId;
  title: string;
  description: string;
  state: 'done' | 'current' | 'todo';
}

export type McpClientId = 'claude-desktop' | 'cursor' | 'vscode' | 'generic';

/** A ready-to-paste MCP client configuration for one client. */
export interface McpClientConfig {
  id: McpClientId;
  label: string;
  /** Where the client keeps this file. */
  path: string;
  json: string;
}
