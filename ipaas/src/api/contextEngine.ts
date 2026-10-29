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
 * Context Engines. The BFF lists, creates and deletes engines (`/context-engines`); each engine
 * lives in one environment and is named within it, so the console keys it by both (see
 * `contextEngineKey`). Everything inside an engine — sources, uploads, queries, grants, the graph —
 * is the engine's own REST API (`/v1`), called through the org gateway with a console key from the
 * BFF and the user's platform token (`_contextEngineAccess.ts`). Sources that run as integrations
 * are added through the BFF, which deploys them next to the engine. Models come from the engine's
 * environment, set at create, and are read back through `GET /v1/engine`.
 *
 * Reads that hit a missing route degrade to an empty section so the detail page still renders.
 */

import { CONTEXT_ENGINE_ID, CONTEXT_OWNER_ACTIONS, CONTEXT_QUERY_ACTIONS } from '../constants/contextEngine';
import {
  audienceMappingFromRules,
  contextEngineKey,
  deliveryIdentity,
  engineMessage,
  integrationTypeFor,
  ownerGrantId,
  roleGrantId,
  rolesFromGrants,
  summarizeEngineProgress,
  toBffCreateRequest,
  toIntegrationRequest,
  toSourceRegistration,
} from '../utils/contextEngine';
import { HttpError } from '../types/http';
import { bff, items, q, seg, type ListResponse } from './_client';
import { asHttpError, enginePath, engineRequest, engineUpload, forgetConsoleAccess } from './_contextEngineAccess';
import type {
  ContextApiKey,
  ContextEngine,
  ContextEngineDetail,
  ContextEngineExposure,
  ContextEngineModels,
  ContextModelSummary,
  ContextEngineProgress,
  ContextEngineSetupInput,
  ContextEngineSetupResult,
  ContextEngineState,
  ContextEngineSummary,
  ContextEvidence,
  ContextGrant,
  ContextIntegration,
  ContextJob,
  ContextJobHandle,
  ContextPrincipal,
  ContextQueryInput,
  ContextQueryResult,
  ContextRecordStatus,
  ContextSource,
  CreateContextEngineInput,
  CreatedContextApiKey,
  IngestFileInput,
  ContextSourceConfig,
  UpdateContextSourceInput,
  UpdateContextModelsInput,
  PutContextGrantInput,
  RecordDeleteInput,
  SourceIndexingState,
  SourceProgress,
  SourceReadingState,
  StorageKind,
  StorageSummary,
  ContextEntityView,
  ContextFact,
  ContextGraph,
  ContextGraphEntity,
  ContextQueryMode,
  ContextQueryTrace,
} from '../types/contextEngine';

const contextEngineClient = {
  get: <T>(engineId: string, path: string) => engineRequest<T>(engineId, 'GET', path),
  post: <T>(engineId: string, path: string, body?: unknown) => engineRequest<T>(engineId, 'POST', path, body),
  put: <T>(engineId: string, path: string, body?: unknown) => engineRequest<T>(engineId, 'PUT', path, body),
  patch: <T>(engineId: string, path: string, body?: unknown) => engineRequest<T>(engineId, 'PATCH', path, body),
  delete: <T>(engineId: string, path: string) => engineRequest<T>(engineId, 'DELETE', path),
};

/** A BFF call whose failure surfaces as an `HttpError`, like an engine call's. */
async function viaBff<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw asHttpError(err);
  }
}

const V1 = '/v1';
/** Grants on the engine itself; every engine uses the same root resource. */
const grantsPath = (): string => `${V1}/resources/${encodeURIComponent(CONTEXT_ENGINE_ID)}/grants`;

const provisioningRefused = (what: string): Error => new Error(`${what} is not supported yet: an engine keeps the models it was created with.`);

// ── Raw wire shapes — private to this file ──────────────────────────────────

interface RawSource {
  id: string;
  name: string;
  type: string;
  state: string;
}

interface RawGrant {
  id: string;
  resourceId: string;
  actions: string[];
  principalId?: string;
  group?: string;
}

interface RawJob {
  id: string;
  state: string;
  operation: string;
  traceId: string;
  attemptCount: number;
  createdAt: string;
  error?: { code: string; message: string; traceId: string };
}

interface RawJobAccepted {
  jobId: string;
  statusUrl: string;
}

interface RawEvidence {
  id: string;
  recordId: string;
  sourceId: string;
  sourceVersion: string;
  passage: string;
  location?: string;
  locator?: { chunkIndex?: number; characters?: { start: number; end: number }; sentences?: { first: number; last: number }; lines?: { first: number; last: number }; heading?: string; path?: string };
  sourceUrl?: string;
}

interface RawFact {
  subject: string;
  relation: string;
  object: string;
  evidenceIds?: string[];
  linkedThrough?: string;
  text?: string;
}

interface RawQueryResponse {
  queryId: string;
  state: string;
  answer?: string;
  answerWithheld?: boolean;
  evidence?: RawEvidence[];
  facts?: RawFact[];
  insufficientEvidence?: boolean;
  traceId: string;
}

interface RawQueryTrace {
  traceId: string;
  queryId: string;
  mode: ContextQueryMode;
  outcome: string;
  limit: number;
  retrievalMode?: string;
  selectedEvidenceIds?: string[];
  retrieved?: number;
  suppressed?: number;
  factsFound?: number;
  factsKept?: number;
  linkedThrough?: string[];
  models?: { embedding?: { provider: string; model: string }; answer?: { provider: string; model: string } };
  createdAt: string;
}

interface RawGraph {
  entities?: { id: string; name: string; kind?: string; mentions?: number }[];
  records?: { id: string; sourceId: string; recordId: string }[];
  mentions?: { entity: string; record: string; chunks?: number }[];
  relations?: { subject: string; relation: string; object: string; records?: string[]; text?: string }[];
  truncated?: boolean;
}

interface RawEntityView {
  entity: { id: string; name: string; kind?: string; mentions?: number };
  evidence?: RawEvidence[];
  mentionedIn?: string[];
  facts?: RawFact[];
}

interface RawPrincipal {
  id: string;
  kind: string;
  email?: string;
  groups?: string[];
}

/** An engine as the BFF lists it. The URLs are set only while it runs. */
interface BffEngine {
  name: string;
  displayName?: string;
  description?: string;
  environment: string;
  status: string;
  statusReason?: string;
  createdAt?: string;
  consoleApiUrl?: string;
  publicApiUrl?: string;
}

interface BffIntegration {
  name: string;
  type: string;
  shape: string;
  sourceId?: string;
  status: string;
  statusReason?: string;
  lastRun?: { status: string; startedAt?: string; completedAt?: string };
}

interface BffApiKey {
  name: string;
  displayName?: string;
  maskedApiKey: string;
  status: string;
  expiresAt?: string;
}

/** `GET /v1/engine`: what the engine's environment configured, never keys. */
interface RawModelSummary {
  provider: string;
  model: string;
}

interface RawEngineConfig {
  description?: string | null;
  models?: { embedding?: RawModelSummary | null; llm?: RawModelSummary | null; answer?: RawModelSummary | null } | null;
  storage?: Partial<Record<StorageKind, { provider?: string } | null>> | null;
  interfaces?: { publicApi?: boolean; mcp?: boolean; answers?: boolean } | null;
}

/** `GET /v1/progress` — one entry per source the caller may inspect. */
interface RawSourceProgress {
  sourceId: string;
  reading: { state: string; runId?: string | null; startedAt?: string | null; completedAt?: string | null };
  processing: { since?: string | null; total: number; queued: number; running: number; succeeded: number; failed: number; percent?: number | null };
  records: { active: number; quarantined: number; deleted: number };
  indexing: { state: string; expected?: number | null; indexed?: number | null; indexing?: number | null; failed?: number | null; missing?: number | null; percent?: number | null; collectedAt?: string | null };
}

interface RawRecordStatus {
  recordId: string;
  state: string;
  currentVersion: string;
  quarantineReason?: string;
  indexState: string;
  indexError?: string;
  updatedAt: string;
}

interface RawEngineProgress {
  sources: RawSourceProgress[];
}

// ── Mappers ─────────────────────────────────────────────────────────────────

const ENGINE_STATES: Record<string, ContextEngineState> = { provisioning: 'provisioning', starting: 'starting', running: 'ready', failed: 'failed', deleting: 'deleting' };

const toEngine = (raw: BffEngine): ContextEngine => ({
  id: contextEngineKey(raw.environment, raw.name),
  handle: raw.name,
  environment: raw.environment,
  name: raw.displayName || raw.name,
  description: raw.description ?? '',
  state: ENGINE_STATES[raw.status] ?? 'unknown',
  ...(raw.statusReason ? { statusReason: raw.statusReason } : {}),
  createdAt: raw.createdAt ?? '',
  ...(raw.publicApiUrl ? { publicApiUrl: raw.publicApiUrl.replace(/\/+$/, '') } : {}),
});

const toSource = (raw: RawSource): ContextSource => ({ id: raw.id, name: raw.name, type: raw.type, state: raw.state });

const toGrant = (raw: RawGrant): ContextGrant => ({ id: raw.id, resourceId: raw.resourceId, actions: raw.actions ?? [], principalId: raw.principalId, group: raw.group });

const toJob = (raw: RawJob): ContextJob => ({ id: raw.id, state: raw.state, operation: raw.operation, traceId: raw.traceId, attemptCount: raw.attemptCount, createdAt: raw.createdAt, error: raw.error });

const toEvidence = (raw: RawEvidence): ContextEvidence => ({
  id: raw.id,
  recordId: raw.recordId,
  sourceId: raw.sourceId,
  sourceVersion: raw.sourceVersion,
  passage: raw.passage,
  location: raw.location,
  locator: raw.locator ? { chunkIndex: raw.locator.chunkIndex, characters: raw.locator.characters, sentences: raw.locator.sentences, lines: raw.locator.lines, heading: raw.locator.heading, path: raw.locator.path } : undefined,
  sourceUrl: raw.sourceUrl,
});

const toModel = (raw: RawModelSummary | null | undefined): ContextModelSummary | null => (raw ? { provider: raw.provider, model: raw.model } : null);

/** The environment's models; they change only by redeploying the engine, so nothing here is editable. */
const toModels = (raw: RawEngineConfig | null): ContextEngineModels => ({
  embedding: toModel(raw?.models?.embedding),
  llm: toModel(raw?.models?.llm),
  answer: toModel(raw?.models?.answer),
  embeddingLocked: true,
});

const READING_STATES: ReadonlySet<string> = new Set<SourceReadingState>(['idle', 'reading', 'completed']);
const INDEXING_STATES: ReadonlySet<string> = new Set<SourceIndexingState>(['not_collected', 'ok', 'unavailable']);
const orUndefined = (v: string | null | undefined): string | undefined => v ?? undefined;

const toSourceProgress = (raw: RawSourceProgress): SourceProgress => ({
  sourceId: raw.sourceId,
  reading: {
    state: READING_STATES.has(raw.reading?.state) ? (raw.reading.state as SourceReadingState) : 'idle',
    startedAt: orUndefined(raw.reading?.startedAt),
    completedAt: orUndefined(raw.reading?.completedAt),
  },
  processing: {
    since: orUndefined(raw.processing?.since),
    total: raw.processing?.total ?? 0,
    queued: raw.processing?.queued ?? 0,
    running: raw.processing?.running ?? 0,
    succeeded: raw.processing?.succeeded ?? 0,
    failed: raw.processing?.failed ?? 0,
    percent: raw.processing?.percent ?? null,
  },
  records: { active: raw.records?.active ?? 0, quarantined: raw.records?.quarantined ?? 0, deleted: raw.records?.deleted ?? 0 },
  indexing: {
    state: INDEXING_STATES.has(raw.indexing?.state) ? (raw.indexing.state as SourceIndexingState) : 'not_collected',
    expected: raw.indexing?.expected ?? null,
    indexed: raw.indexing?.indexed ?? null,
    indexing: raw.indexing?.indexing ?? null,
    failed: raw.indexing?.failed ?? null,
    missing: raw.indexing?.missing ?? null,
    percent: raw.indexing?.percent ?? null,
    collectedAt: orUndefined(raw.indexing?.collectedAt),
  },
});

/** Which public surfaces the deployment serves, as the engine reports them; unknown counts as off. */
const toExposure = (raw: RawEngineConfig | null): ContextEngineExposure => ({ api: raw?.interfaces?.publicApi ?? false, mcp: raw?.interfaces?.mcp ?? false, answers: raw?.interfaces?.answers ?? false });

/** The engine reports a store by provider id; the card shows the name people know. */
const STORE_PROVIDER_LABEL: Record<string, { label: string; detail: string }> = {
  lancedb: { label: 'LanceDB', detail: 'Engine managed · embedded' },
  sqlite: { label: 'SQLite', detail: 'Engine managed · embedded' },
  kuzu: { label: 'Kuzu', detail: 'Engine managed · embedded' },
  pgvector: { label: 'PostgreSQL + pgvector', detail: 'External' },
  postgres: { label: 'PostgreSQL', detail: 'External' },
  neo4j: { label: 'Neo4j', detail: 'External' },
};

/** Per-store placement as the engine reports it; null until it reports any. */
const toStorage = (raw: RawEngineConfig | null): Record<StorageKind, StorageSummary> | null => {
  const st = raw?.storage;
  if (!st) return null;
  const one = (kind: StorageKind): StorageSummary => {
    const s = st[kind];
    const known = s?.provider ? STORE_PROVIDER_LABEL[s.provider] : undefined;
    return { provider: s?.provider ?? 'unknown', label: known?.label ?? (s?.provider ? s.provider : 'Not reported'), detail: known?.detail };
  };
  return { vector: one('vector'), relational: one('relational'), graph: one('graph') };
};

const toFact = (raw: RawFact): ContextFact => ({
  subject: raw.subject,
  relation: raw.relation,
  object: raw.object,
  evidenceIds: raw.evidenceIds ?? [],
  ...(raw.linkedThrough ? { linkedThrough: raw.linkedThrough } : {}),
  ...(raw.text ? { text: raw.text } : {}),
});

const toQueryResult = (raw: RawQueryResponse): ContextQueryResult => ({
  queryId: raw.queryId,
  state: raw.state,
  answer: raw.answer,
  answerWithheld: raw.answerWithheld ?? false,
  evidence: (raw.evidence ?? []).map(toEvidence),
  facts: (raw.facts ?? []).map(toFact),
  insufficientEvidence: raw.insufficientEvidence ?? raw.state === 'insufficient_evidence',
  traceId: raw.traceId,
});

const toTrace = (raw: RawQueryTrace): ContextQueryTrace => ({
  queryId: raw.queryId,
  traceId: raw.traceId,
  mode: raw.mode,
  outcome: raw.outcome,
  limit: raw.limit,
  retrievalMode: raw.retrievalMode,
  selectedEvidenceIds: raw.selectedEvidenceIds ?? [],
  retrieved: raw.retrieved ?? 0,
  suppressed: raw.suppressed ?? 0,
  factsFound: raw.factsFound,
  factsKept: raw.factsKept,
  linkedThrough: raw.linkedThrough ?? [],
  models: raw.models ?? {},
  createdAt: raw.createdAt,
});

const toGraphEntity = (raw: NonNullable<RawGraph['entities']>[number]): ContextGraphEntity => ({ id: raw.id, name: raw.name, ...(raw.kind ? { kind: raw.kind } : {}), mentions: raw.mentions ?? 0 });

const toGraph = (raw: RawGraph): ContextGraph => ({
  entities: (raw.entities ?? []).map(toGraphEntity),
  records: (raw.records ?? []).map((r) => ({ id: r.id, sourceId: r.sourceId, recordId: r.recordId })),
  mentions: (raw.mentions ?? []).map((m) => ({ entityId: m.entity, recordNodeId: m.record, chunks: m.chunks ?? 1 })),
  relations: (raw.relations ?? []).map((r) => ({ subjectId: r.subject, relation: r.relation, objectId: r.object, recordNodeIds: r.records ?? [], ...(r.text ? { text: r.text } : {}) })),
  truncated: raw.truncated ?? false,
});

// ── Degradation helpers ─────────────────────────────────────────────────────

/** A route the engine has not shipped yet answers 404 (unknown path) or 405 (path known, verb not). */
function isMissingRoute(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 404 || err.status === 405);
}

/** Secondary reads on the detail page: a missing route or a denied read falls back so the page still renders. */
async function optional<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingRoute(err) || (err instanceof HttpError && err.status === 403)) return fallback;
    throw err;
  }
}

// ── Engines ─────────────────────────────────────────────────────────────────

/** The engine's configuration, sources and grants, each degrading to empty when the caller may not read it. */
async function fetchEngineFacets(engineId: string): Promise<{ engine: RawEngineConfig | null; sources: RawSource[]; grants: RawGrant[] }> {
  const [engine, sources, grants] = await Promise.all([
    optional(() => contextEngineClient.get<RawEngineConfig>(engineId, `${V1}/engine`), null as RawEngineConfig | null),
    optional(() => contextEngineClient.get<RawSource[]>(engineId, `${V1}/sources`), [] as RawSource[]),
    optional(() => contextEngineClient.get<RawGrant[]>(engineId, grantsPath()), [] as RawGrant[]),
  ]);
  return { engine, sources: sources ?? [], grants: grants ?? [] };
}

/** Listing-only progress: any failure just leaves the progress line out, it never fails the listing. */
async function fetchProgressQuietly(engineId: string): Promise<RawEngineProgress | null> {
  try {
    return await contextEngineClient.get<RawEngineProgress>(engineId, `${V1}/progress`);
  } catch {
    return null;
  }
}

/** The engines in one environment, from the BFF alone; their summaries are read per engine. */
export async function listContextEngines(environment: string): Promise<ContextEngine[]> {
  const raw = await viaBff(() => bff.get<ListResponse<BffEngine>>(`/context-engines${q({ environment })}`));
  return items(raw).map(toEngine);
}

/** At-a-glance facts for a running engine's listing row, read from the engine itself. */
export async function getContextEngineSummary(engineId: string): Promise<ContextEngineSummary> {
  const [facets, progress] = await Promise.all([fetchEngineFacets(engineId), fetchProgressQuietly(engineId)]);
  return {
    sourceCount: facets.sources.length,
    sourceTypes: facets.sources.map((s) => s.type),
    roleCount: rolesFromGrants(facets.grants.map(toGrant)).length,
    exposure: toExposure(facets.engine),
    progress: progress
      ? summarizeEngineProgress(
          facets.sources.map((src) => src.id),
          (progress.sources ?? []).map(toSourceProgress),
        )
      : null,
  };
}

/** The engine with its sources, models, query roles and exposure. Until it runs, only what the BFF knows. */
export async function getContextEngine(engineId: string): Promise<ContextEngineDetail> {
  const engine = toEngine(await viaBff(() => bff.get<BffEngine>(enginePath(engineId))));
  if (engine.state !== 'ready') {
    return { ...engine, sources: [], models: toModels(null), queryRoles: [], exposure: toExposure(null), storage: null };
  }
  const { engine: config, sources, grants } = await fetchEngineFacets(engineId);
  return {
    ...engine,
    description: engine.description || config?.description || '',
    sources: sources.map(toSource),
    models: toModels(config),
    queryRoles: rolesFromGrants(grants.map(toGrant)),
    exposure: toExposure(config),
    storage: toStorage(config),
  };
}

/** Ask the BFF for a new engine. It starts provisioning; {@link setUpContextEngine} runs once it is ready. */
export async function createContextEngine(input: CreateContextEngineInput): Promise<ContextEngine> {
  return toEngine(await viaBff(() => bff.post<BffEngine>('/context-engines', toBffCreateRequest(input))));
}

/** Register a source: on the engine for one the browser feeds, through the BFF for one an integration runs. */
async function registerSource(engineId: string, source: ContextSourceConfig): Promise<ContextSource> {
  const type = integrationTypeFor(source.type);
  if (type === null) return toSource(await contextEngineClient.post<RawSource>(engineId, `${V1}/sources`, toSourceRegistration(source)));
  const request = toIntegrationRequest(source, type);
  const raw = await viaBff(() => bff.post<BffIntegration>(`${enginePath(engineId)}/integrations`, request));
  if (!raw.sourceId) throw new Error('The integration was added, but its source is not registered yet.');
  return { id: raw.sourceId, name: request.name, type: raw.type, state: 'ready' };
}

/**
 * Set up a running engine: grant its creator query and upload access, register the sources with
 * their visibility rules, and grant the chosen roles. A step the engine refuses is reported rather
 * than undone: what succeeded is already usable.
 */
export async function setUpContextEngine(engineId: string, input: ContextEngineSetupInput): Promise<ContextEngineSetupResult> {
  const warnings: string[] = [];
  const sources: Record<string, string> = {};
  const attempt = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      warnings.push(`${label}: ${engineMessage(err, 'the engine refused it')}`);
    }
  };
  await attempt('Give you query and upload access', async () => {
    const me = await getContextPrincipal(engineId);
    await contextEngineClient.put(engineId, `${grantsPath()}/${encodeURIComponent(ownerGrantId(me.id))}`, { principalId: me.id, actions: [...CONTEXT_OWNER_ACTIONS] });
  });
  for (const source of input.sources) {
    await attempt(`Register source “${source.name}”`, async () => {
      const created = await registerSource(engineId, source);
      sources[source.name.trim()] = created.id;
    });
  }
  for (const role of input.roles) {
    await attempt(`Grant query access to role “${role}”`, () => contextEngineClient.put(engineId, `${grantsPath()}/${encodeURIComponent(roleGrantId(role))}`, { group: role, actions: [...CONTEXT_QUERY_ACTIONS] }));
  }
  return { sources, warnings };
}

/** Delete the engine, its integrations and its data. The BFF lists it as deleting until it is gone. */
export async function deleteContextEngine(engineId: string): Promise<void> {
  await viaBff(() => bff.delete(enginePath(engineId)));
  forgetConsoleAccess(engineId);
}

/** The BFF cannot change an engine's models yet. */
export async function updateContextModels(_input: UpdateContextModelsInput): Promise<ContextEngineModels> {
  throw provisioningRefused('Changing the models');
}

// ── Integrations and API keys (BFF) ─────────────────────────────────────────

export async function listContextIntegrations(engineId: string): Promise<ContextIntegration[]> {
  const raw = await viaBff(() => bff.get<ListResponse<BffIntegration>>(`${enginePath(engineId)}/integrations`));
  return items(raw).map((i) => ({ name: i.name, type: i.type, shape: i.shape, sourceId: i.sourceId, status: i.status, statusReason: i.statusReason, lastRun: i.lastRun }));
}

export async function listContextApiKeys(engineId: string): Promise<ContextApiKey[]> {
  const raw = await viaBff(() => bff.get<ListResponse<BffApiKey> | BffApiKey[]>(`${enginePath(engineId)}/api-keys`));
  const list = Array.isArray(raw) ? raw : items(raw);
  return list.map((k) => ({ name: k.name, displayName: k.displayName, maskedKey: k.maskedApiKey, status: k.status, expiresAt: k.expiresAt }));
}

/** A key for the engine's public API; the full key comes back only here. */
export async function createContextApiKey(engineId: string, input: { displayName?: string; expiresAt?: string }): Promise<CreatedContextApiKey> {
  const raw = await viaBff(() => bff.post<{ keyId: string; apiKey: string; expiresAt?: string }>(`${enginePath(engineId)}/api-keys`, input));
  return { keyId: raw.keyId, apiKey: raw.apiKey, expiresAt: raw.expiresAt };
}

export async function revokeContextApiKey(engineId: string, keyName: string): Promise<void> {
  await viaBff(() => bff.delete(`${enginePath(engineId)}/api-keys/${seg(keyName)}`));
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export async function getContextJob(engineId: string, jobId: string): Promise<ContextJob> {
  return toJob(await contextEngineClient.get<RawJob>(engineId, `${V1}/jobs/${encodeURIComponent(jobId)}`));
}

// ── Progress ────────────────────────────────────────────────────────────────

/**
 * Read-only pipeline progress of the engine's sources. The engine returns only
 * sources the caller may inspect (delivery or manage rights), so a reader sees
 * fewer entries than sources. An engine without the route reports `available: false`.
 */
export async function getContextEngineProgress(engineId: string): Promise<ContextEngineProgress> {
  try {
    const raw = await contextEngineClient.get<RawEngineProgress>(engineId, `${V1}/progress`);
    return { available: true, sources: (raw?.sources ?? []).map(toSourceProgress) };
  } catch (err) {
    if (isMissingRoute(err)) return { available: false, sources: [] };
    throw err;
  }
}

// ── Sources ─────────────────────────────────────────────────────────────────

/** Add a source to a running engine with its visibility rules; a connector's source is run by an integration. */
export async function addContextSource(engineId: string, source: ContextSourceConfig): Promise<ContextSource> {
  return registerSource(engineId, source);
}

/** Rename a source, replace its visibility rules, or pause and resume it. */
export async function updateContextSource(input: UpdateContextSourceInput): Promise<ContextSource> {
  const body = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.audience ? { audienceMapping: audienceMappingFromRules(input.audience) } : {}),
    ...(input.state ? { state: input.state } : {}),
  };
  return toSource(await contextEngineClient.patch<RawSource>(input.engineId, `${V1}/sources/${encodeURIComponent(input.sourceId)}`, body));
}

// ── File uploads ────────────────────────────────────────────────────────────
//
// The browser delivers files itself through the engine's one-call ingestion
// route: one multipart request per file, the event part first and the bytes
// second. It mirrors the connector host's sink: the same idempotency-key scheme,
// the content hash in the event, and a lookup by key after a lost reply.

const sourcePath = (id: string): string => `${V1}/sources/${encodeURIComponent(id)}`;

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `<sourceId>:<operation>:<sha256>`: the connector host's scheme, which stays under the engine's key length limit. */
async function deliveryKey(sourceId: string, operation: string, recordId: string, version: string): Promise<string> {
  return `${sourceId}:${operation}:${await sha256Hex(deliveryIdentity(recordId, version))}`;
}

/** The job accepted under a delivery key, or null when the engine has none: the check after a lost reply. */
async function findContextDelivery(engineId: string, sourceId: string, key: string): Promise<ContextJobHandle | null> {
  try {
    const raw = await contextEngineClient.get<RawJobAccepted>(engineId, `${sourcePath(sourceId)}/ingestions/${encodeURIComponent(key)}`);
    return raw ? { jobId: raw.jobId, statusUrl: raw.statusUrl } : null;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Upload one file as a record of the source. The record id is the file name, so
 * uploading the same name again is a new version; versions are epoch milliseconds.
 * A new audience for a record is an upload of its content at a newer version.
 */
export async function ingestContextFile(input: IngestFileInput): Promise<ContextJobHandle> {
  const key = await deliveryKey(input.sourceId, 'upsert', input.recordId, input.version);
  const bytes = await input.content.arrayBuffer();
  const event = {
    schemaVersion: '1',
    sourceId: input.sourceId,
    sourceRecordId: input.recordId,
    sourceVersion: input.version,
    operation: 'upsert',
    contentType: input.contentType,
    contentHash: `sha256:${await sha256Hex(bytes)}`,
    sourceObservedAt: new Date(Number(input.version)).toISOString(),
    audience: input.audience,
    idempotencyKey: key,
  };
  const form = new FormData();
  form.append('event', new Blob([JSON.stringify(event)], { type: 'application/json' }), 'event.json');
  form.append('content', new Blob([bytes], { type: input.contentType }), input.recordId);
  try {
    const raw = await engineUpload<RawJobAccepted>(input.engineId, `${sourcePath(input.sourceId)}/ingestions`, form, { 'Idempotency-Key': key }, input.onProgress, input.signal);
    return { jobId: raw.jobId, statusUrl: raw.statusUrl };
  } catch (err) {
    // The engine answered, or the user cancelled: nothing to look up.
    if (err instanceof HttpError || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    const found = await findContextDelivery(input.engineId, input.sourceId, key).catch(() => null);
    if (found) return found;
    throw err;
  }
}

/** Remove a record with an event-only delivery, at a version newer than the record's. */
export async function deleteContextRecord(input: RecordDeleteInput): Promise<ContextJobHandle> {
  const key = await deliveryKey(input.sourceId, 'delete', input.recordId, input.version);
  const event = {
    schemaVersion: '1',
    sourceId: input.sourceId,
    sourceRecordId: input.recordId,
    sourceVersion: input.version,
    operation: 'delete',
    sourceObservedAt: new Date(Number(input.version)).toISOString(),
    audience: input.audience,
    idempotencyKey: key,
  };
  const form = new FormData();
  form.append('event', new Blob([JSON.stringify(event)], { type: 'application/json' }), 'event.json');
  const raw = await engineUpload<RawJobAccepted>(input.engineId, `${sourcePath(input.sourceId)}/ingestions`, form, { 'Idempotency-Key': key });
  return { jobId: raw.jobId, statusUrl: raw.statusUrl };
}

/** A record's lifecycle and index state. Needs delivery or manage rights on the source. */
export async function getContextRecordStatus(engineId: string, sourceId: string, recordId: string): Promise<ContextRecordStatus> {
  const raw = await contextEngineClient.get<RawRecordStatus>(engineId, `${sourcePath(sourceId)}/records/${encodeURIComponent(recordId)}`);
  return { recordId: raw.recordId, state: raw.state, currentVersion: raw.currentVersion, quarantineReason: raw.quarantineReason, indexState: raw.indexState, indexError: raw.indexError, updatedAt: raw.updatedAt };
}

// ── Query ───────────────────────────────────────────────────────────────────

export async function queryContextEngine(input: ContextQueryInput): Promise<ContextQueryResult> {
  const raw = await contextEngineClient.post<RawQueryResponse>(input.engineId, `${V1}/queries`, { question: input.question, mode: input.mode, ...(input.limit ? { limit: input.limit } : {}) });
  return toQueryResult(raw);
}

/**
 * Reopen a stored query. Only its asker can, and every passage is checked
 * again: ones that moved out of reach drop out, and an answer whose passages
 * are not all still visible comes back withheld. Anyone else gets 404.
 */
export async function getContextQuery(engineId: string, queryId: string): Promise<ContextQueryResult> {
  return toQueryResult(await contextEngineClient.get<RawQueryResponse>(engineId, `${V1}/queries/${encodeURIComponent(queryId)}`));
}

/**
 * One passage by its evidence id, for a citation link. Open to anyone with
 * query or evidence access who may read the record now, while it is still at
 * that version; every refusal is the same 404.
 */
export async function getContextEvidence(engineId: string, evidenceId: string): Promise<ContextEvidence> {
  return toEvidence(await contextEngineClient.get<RawEvidence>(engineId, `${V1}/evidence/${encodeURIComponent(evidenceId)}`));
}

/**
 * How a stored query ran, for its asker holding `trace.read`. Null when the
 * reader may not have it or the engine does not serve traces yet, so the
 * console simply leaves the trace out.
 */
export async function getContextQueryTrace(engineId: string, queryId: string): Promise<ContextQueryTrace | null> {
  const raw = await optional(() => contextEngineClient.get<RawQueryTrace>(engineId, `${V1}/queries/${encodeURIComponent(queryId)}/trace`), null as RawQueryTrace | null);
  return raw ? toTrace(raw) : null;
}

/**
 * The part of the engine's knowledge graph the reader may see: entities, the
 * records naming them, and their relationships. Null when the engine does not
 * serve its graph yet.
 */
export async function getContextGraph(engineId: string, limit: number): Promise<ContextGraph | null> {
  try {
    return toGraph(await contextEngineClient.get<RawGraph>(engineId, `${V1}/graph?limit=${encodeURIComponent(String(limit))}`));
  } catch (err) {
    if (isMissingRoute(err)) return null;
    throw err;
  }
}

/** One entity, by its name as the graph returns it, with the passages that name it and its relationships. 404 when nothing the reader may read names it. */
export async function getContextEntity(engineId: string, name: string, limit = 10): Promise<ContextEntityView> {
  const raw = await contextEngineClient.get<RawEntityView>(engineId, `${V1}/graph/entity?name=${encodeURIComponent(name)}&limit=${encodeURIComponent(String(limit))}`);
  return {
    entity: toGraphEntity(raw.entity),
    evidence: (raw.evidence ?? []).map(toEvidence),
    mentionedIn: raw.mentionedIn ?? [],
    facts: (raw.facts ?? []).map(toFact),
  };
}

/** The caller's effective actions on the engine. */
export async function getContextPermissions(engineId: string): Promise<string[]> {
  const raw = await contextEngineClient.get<{ resourceId: string; actions?: string[] }>(engineId, `${V1}/auth/permissions?resourceId=${encodeURIComponent(CONTEXT_ENGINE_ID)}`);
  return raw?.actions ?? [];
}

// ── Access ──────────────────────────────────────────────────────────────────

export async function listContextGrants(engineId: string): Promise<ContextGrant[]> {
  const raw = await contextEngineClient.get<RawGrant[]>(engineId, grantsPath());
  return (raw ?? []).map(toGrant);
}

export async function putContextGrant(input: PutContextGrantInput): Promise<ContextGrant> {
  const body = { actions: input.actions, ...(input.group ? { group: input.group } : {}), ...(input.principalId ? { principalId: input.principalId } : {}) };
  return toGrant(await contextEngineClient.put<RawGrant>(input.engineId, `${grantsPath()}/${encodeURIComponent(input.grantId)}`, body));
}

export async function deleteContextGrant(engineId: string, grantId: string): Promise<void> {
  await contextEngineClient.delete(engineId, `${grantsPath()}/${encodeURIComponent(grantId)}`);
}

/** The caller as the engine resolved it from the platform token. */
export async function getContextPrincipal(engineId: string): Promise<ContextPrincipal> {
  const raw = await contextEngineClient.get<RawPrincipal>(engineId, `${V1}/auth/me`);
  return { id: raw.id, kind: raw.kind, email: raw.email, groups: raw.groups ?? [] };
}
