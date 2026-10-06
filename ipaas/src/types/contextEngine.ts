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
  /** How the engine holds the key: `encrypted` from a typed key, `reference` resolved at call time. The key never comes back. */
  keyKind?: 'encrypted' | 'reference' | 'unknown' | string;
  dimensions?: number;
  baseUrl?: string;
  apiVersion?: string;
}

export interface ContextEngineModels {
  embedding: ContextModelSummary | null;
  llm: ContextModelSummary | null;
  /** The engine holds indexed content, so the embedding model cannot change until it can re-index. */
  embeddingLocked?: boolean;
  /** Configuration version and when it last changed, when the engine reports them. */
  version?: number;
  updatedAt?: string;
}

/** One model to save. Sent without a key or reference, an unchanged model keeps its stored key. */
export interface ContextModelInput {
  provider: string;
  model: string;
  apiKey?: string;
  /** `env:NAME` from the engine's environment, or `cp:<id>` from the control plane. */
  apiKeyRef?: string;
  baseUrl?: string;
  apiVersion?: string;
  dimensions?: number;
}

/** One model while it is edited on a running engine; an empty key or reference keeps the stored one when the model is unchanged. */
export interface ModelDraft {
  provider: string;
  model: string;
  baseUrl: string;
  apiVersion: string;
  dimensions?: number;
  keyMode: 'key' | 'ref';
  apiKey: string;
  apiKeyRef: string;
}

/** Both models go together: the engine drops a model left out, and refuses a locked embedding that is not sent back unchanged. */
export interface UpdateContextModelsInput {
  engineId: string;
  embedding: ContextModelInput | null;
  llm: ContextModelInput | null;
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
 * newline-separated list of them; `secret` is masked and travels as a credential;
 * `select` is one of a fixed set of `options`.
 */
export type SourceFieldKind = 'text' | 'secret' | 'url' | 'urls' | 'multiline' | 'select';

/** One choice in a `select` field. */
export interface SourceFieldOption {
  value: string;
  label: string;
}

/**
 * A field shows only when another field holds one of these values — how a connector
 * with alternative modes (e.g. Salesforce's OAuth2 flows) reveals just the inputs
 * that mode needs. Hidden fields are skipped by validation and left out of the payload.
 */
export interface SourceFieldCondition {
  field: string;
  equals: string[];
}

export interface SourceFieldDef {
  key: string;
  label: string;
  kind: SourceFieldKind;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  defaultValue?: string;
  /** Choices for a `select` field. */
  options?: SourceFieldOption[];
  /** Render this field only when its condition is met; always shown when absent. */
  showWhen?: SourceFieldCondition;
  /**
   * Section this field belongs to. Consecutive fields sharing a group render under
   * one collapsible subheading, so a connector with many inputs (e.g. Salesforce)
   * reads as Connection / Data / Sync options instead of one long column. Fields
   * without a group, and connectors with only one group, render flat with no heading.
   */
  group?: string;
  /** Start this field's group collapsed (e.g. advanced options). */
  groupCollapsed?: boolean;
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
/**
 * One visibility rule: items the connector labels with `group` may be seen by
 * members of org role `role`. The engine holds back (quarantines) any item that
 * carries a group with no rule, and only role members with query access see the rest.
 */
export interface AudienceRule {
  /** The group label exactly as the connector sends it. */
  group: string;
  /** Org role handle — the same identifier the Access step grants query access to. */
  role: string;
}

export interface ContextSourceConfig {
  type: string;
  name: string;
  values: Record<string, string>;
  audience: AudienceRule[];
  /** File Upload only: files chosen in the wizard, uploaded right after the engine exists. The bytes live in {@link stagedFiles}, not here. */
  staged?: StagedFileMeta[];
  /** File Upload only: who can see the staged files; everyone who can query when unset. */
  stagedVisibility?: FileVisibility;
}

/**
 * Who can see uploaded files. `everyone` is anyone who can query the engine;
 * `roles` narrows that to members of the chosen org roles. The UI sends the role
 * handles as the files' audience tags and keeps the source's rules mapping each
 * handle to itself, so there are no labels to invent.
 */
export type FileVisibility = { kind: 'everyone' } | { kind: 'roles'; roles: string[] };

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

// ── File uploads ────────────────────────────────────────────────────────────

/** A file chosen for upload, without its bytes; drafts keep this and the bytes are re-added. */
export interface StagedFileMeta {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

/** Why a chosen file cannot be uploaded, or what to warn about. */
export interface StagedFileCheck {
  /** Blocks the upload. */
  problem?: 'too-large' | 'unsupported';
  /** Uploads, but is worth a warning. */
  warning?: 'pdf';
  /** A file of this name is already in the source; uploading replaces it. */
  replaces: boolean;
}

/** The engine's per-record index state. */
export type ContextIndexState = 'pending' | 'indexed' | 'failed' | 'reconcile_required' | 'not_indexed';

/** `GET /v1/sources/{id}/records/{recordId}`. */
export interface ContextRecordStatus {
  recordId: string;
  state: 'active' | 'quarantined' | 'deleted' | string;
  currentVersion: string;
  sourceAclVersion: string;
  quarantineReason?: string;
  indexState: ContextIndexState | string;
  indexError?: string;
  updatedAt: string;
}

/**
 * Where an uploaded file is, in plain words: the transfer, the engine's job,
 * then the record's index state. `stored` is a file the engine keeps but cannot
 * search because its knowledge backend is off; `unreadable` is a kept file whose type has no reader yet.
 */
export type UploadFileStatus = 'uploading' | 'queued' | 'indexing' | 'searchable' | 'stored' | 'unreadable' | 'held' | 'failed';

/** One file the UI uploaded to a source; remembered per browser until the engine lists records. */
export interface UploadedFile {
  recordId: string;
  name: string;
  size: number;
  contentType: string;
  /** Who the file was shared with. Absent on files uploaded under a label before this choice existed. */
  visibility?: FileVisibility;
  /** The audience tags sent with the file: role handles, or the legacy label. */
  audience: string[];
  /** The label of a file uploaded before visibility was chosen by role. */
  label?: string;
  version: string;
  uploadedAt: string;
  /** The engine job that applied, or will apply, the latest delivery; followed after a reload until it finishes. */
  jobId?: string;
}

export interface UploadEntry extends UploadedFile {
  status: UploadFileStatus;
  /** 0–100 while uploading. */
  progress: number;
  /** Why the file failed or is held back, for the row. */
  detail?: string;
  /** The engine refused the caller; the owner grant would fix it. */
  forbidden?: boolean;
}

export interface IngestFileInput {
  engineId: string;
  sourceId: string;
  recordId: string;
  content: Blob;
  contentType: string;
  /** Audience tags the source's rules map to engine groups: here, org role handles. */
  audience: string[];
  /** Numeric, growing: epoch milliseconds. */
  version: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface RecordEventInput {
  engineId: string;
  sourceId: string;
  recordId: string;
  operation: 'delete' | 'acl_changed';
  /** Audience tags; a delete ignores them, a visibility change replaces them. */
  audience: string[];
  version: string;
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
  /** Engine ids of the registered sources, by the name the wizard gave them. */
  sources: Record<string, string>;
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

/** A first-to-last range, counted from one: lines as editors count them, sentences by the engine's rules. */
export interface ContextRange {
  first: number;
  last: number;
}

/**
 * Where a passage sits in its record version. The engine sets each part only
 * when it is certain: lines for text and Markdown, the nearest heading for
 * Markdown and HTML, the JSON path for JSON. Other types carry the chunk alone.
 */
export interface ContextEvidenceLocator {
  /** From zero. */
  chunkIndex?: number;
  /** Code-point offsets in the version's extracted text, end exclusive. */
  characters?: { start: number; end: number };
  sentences?: ContextRange;
  lines?: ContextRange;
  heading?: string;
  path?: string;
}

export interface ContextEvidence {
  id: string;
  recordId: string;
  sourceId: string;
  /** The record version the passage comes from; uploads use epoch milliseconds. */
  sourceVersion: string;
  passage: string;
  /** The compact `chunk:<n>` form; `locator` has the exact place. */
  location?: string;
  locator?: ContextEvidenceLocator;
  sourceUrl?: string;
}

export interface ContextQueryResult {
  queryId: string;
  state: 'completed' | 'insufficient_evidence' | string;
  /** Answer mode only; each `[n]` cites `evidence[n - 1]`, and every passage listed was given to the model. */
  answer?: string;
  /** A reopened answer whose passages the reader can no longer all see: the text is withheld, the visible evidence stays. */
  answerWithheld?: boolean;
  evidence: ContextEvidence[];
  insufficientEvidence: boolean;
  traceId: string;
}

/**
 * A question asked from this browser, kept so it can be reopened. The engine
 * stores every query for its asker but has no route that lists them yet, and a
 * reopened query does not carry its question or time.
 */
export interface AskedQuestion {
  queryId: string;
  engineId: string;
  question: string;
  mode: ContextQueryMode;
  askedAt: string;
  /** What came back: a written answer, passages only, or nothing to show; `hidden` once a reopen withheld the answer. */
  outcome: 'answered' | 'passages' | 'none' | 'hidden';
  /** Passages returned when it was asked, to tell when some have gone since. */
  passages: number;
}

// ── Access ──────────────────────────────────────────────────────────────────

export interface ContextGrant {
  id: string;
  resourceId: string;
  actions: string[];
  principalId?: string;
  group?: string;
}

/** A change to a registered source; every field is optional, but one must be set. */
export interface UpdateContextSourceInput {
  sourceId: string;
  name?: string;
  /** Replaces all of the source's visibility rules. */
  audience?: AudienceRule[];
  state?: 'ready' | 'paused';
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

export type GetStartedStepId = 'index' | 'ask' | 'publish' | 'grant';

export interface GetStartedStep {
  /** Button label when it differs from the step's default. */
  action?: string;
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
