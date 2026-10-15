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
 * Context Engines — backed by the Context Engine REST API (`/v1`).
 *
 * Each context engine runs as its own instance (the engine's ADR 0019), and this
 * console is the UI for the one at the configured URL, shown under the id
 * `engine`, which is also the engine's grant resource. Until the control plane
 * provisions engines, creating one sets up that running engine: the wizard
 * registers its sources and grants, and its name and description stay in this
 * browser, since the engine holds no name. Models, stores and served interfaces
 * come from the engine's environment through `GET /v1/engine`, read-only;
 * deleting an engine and changing its models are provisioning, refused here.
 * Sources live at `/v1/sources` and progress at `/v1/progress`. Answer mode
 * answers 404 when the engine is deployed without answers. Integrators use the
 * public routes, `/v1/context`, `/v1/answer` and `/v1/mcp`.
 *
 * Reads that hit a missing route degrade to an empty section so the detail page
 * still renders.
 */

import { getAccessToken } from '#auth';
import { contextEngineClient, isAccessTokenExpired, refreshAccessToken } from './httpClients';
import { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_LOCAL_KEY, CONTEXT_OWNER_ACTIONS, CONTEXT_QUERY_ACTIONS, DEFAULT_CONTEXT_ENGINE_NAME } from '../../constants/contextEngine';
import { audienceMappingFromRules, deliveryIdentity, engineMessage, ownerGrantId, roleGrantId, rolesFromGrants, summarizeEngineProgress, toSourceRegistration } from '../../utils/contextEngine';
import { HttpError } from '../../types/http';
import type {
  ContextEngine,
  ContextEngineDetail,
  ContextEngineExposure,
  ContextEngineModels,
  ContextModelSummary,
  ContextEngineProgress,
  ContextEngineState,
  ContextEngineSummary,
  ContextEvidence,
  ContextGrant,
  ContextJob,
  ContextJobHandle,
  ContextPrincipal,
  ContextQueryInput,
  ContextQueryResult,
  ContextRecordStatus,
  ContextSource,
  CreateContextEngineInput,
  CreateContextEngineResult,
  IngestFileInput,
  ContextSourceConfig,
  UpdateContextSourceInput,
  UpdateContextModelsInput,
  PutContextGrantInput,
  RecordEventInput,
  SourceIndexingState,
  SourceProgress,
  SourceReadingState,
  StorageKind,
  StorageSummary,
} from '../../types/contextEngine';

const V1 = '/v1';
const grantsPath = (resourceId: string): string => `${V1}/resources/${encodeURIComponent(resourceId)}/grants`;

/** Engines are provisioned by the control plane; here, creating one sets up the running engine. */
export const supportsContextEngineProvisioning = false;

const provisioningRefused = (what: string): Error => new Error(`${what} is provisioning, which the control plane owns; this console shows the engine it is configured for.`);

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

interface RawQueryResponse {
  queryId: string;
  state: string;
  answer?: string;
  answerWithheld?: boolean;
  evidence?: RawEvidence[];
  insufficientEvidence?: boolean;
  traceId: string;
}

interface RawPrincipal {
  id: string;
  kind: string;
  email?: string;
  groups?: string[];
}

/** `GET /v1/engine`: what the engine's environment configured, never keys. */
interface RawModelSummary {
  provider: string;
  model: string;
}

interface RawEngine {
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
  sourceAclVersion: string;
  quarantineReason?: string;
  indexState: string;
  indexError?: string;
  updatedAt: string;
}

interface RawEngineProgress {
  sources: RawSourceProgress[];
}

// ── Mappers ─────────────────────────────────────────────────────────────────

/** The engine's name and description as the wizard set it up, kept in this browser: the engine holds no name. */
interface LocalEngineRecord {
  name: string;
  description: string;
  createdAt: string;
}

function readLocalEngine(): LocalEngineRecord | null {
  try {
    const raw = localStorage.getItem(CONTEXT_ENGINE_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalEngineRecord) : null;
  } catch {
    return null;
  }
}

function writeLocalEngine(record: LocalEngineRecord): void {
  try {
    localStorage.setItem(CONTEXT_ENGINE_LOCAL_KEY, JSON.stringify(record));
  } catch {
    // Storage may be unavailable (private mode); the engine then shows under the default name.
  }
}

/** The one engine: its name and description from this browser's setup, else the engine's own description. */
const toEngine = (raw: RawEngine | null, local: LocalEngineRecord | null): ContextEngine => ({
  id: CONTEXT_ENGINE_ID,
  name: local?.name || DEFAULT_CONTEXT_ENGINE_NAME,
  description: local?.description || raw?.description || '',
  state: 'ready' as ContextEngineState,
  createdAt: local?.createdAt ?? '',
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
const toModels = (raw: RawEngine | null): ContextEngineModels => ({
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
const toExposure = (raw: RawEngine | null): ContextEngineExposure => ({ api: raw?.interfaces?.publicApi ?? false, mcp: raw?.interfaces?.mcp ?? false, answers: raw?.interfaces?.answers ?? false });

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
const toStorage = (raw: RawEngine | null): Record<StorageKind, StorageSummary> | null => {
  const st = raw?.storage;
  if (!st) return null;
  const one = (kind: StorageKind): StorageSummary => {
    const s = st[kind];
    const known = s?.provider ? STORE_PROVIDER_LABEL[s.provider] : undefined;
    return { provider: s?.provider ?? 'unknown', label: known?.label ?? (s?.provider ? s.provider : 'Not reported'), detail: known?.detail };
  };
  return { vector: one('vector'), relational: one('relational'), graph: one('graph') };
};

const toQueryResult = (raw: RawQueryResponse): ContextQueryResult => ({
  queryId: raw.queryId,
  state: raw.state,
  answer: raw.answer,
  answerWithheld: raw.answerWithheld ?? false,
  evidence: (raw.evidence ?? []).map(toEvidence),
  insufficientEvidence: raw.insufficientEvidence ?? raw.state === 'insufficient_evidence',
  traceId: raw.traceId,
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

/** Only the engine this console is configured for exists here; any other id is not found. */
function requireThisEngine(engineId: string): void {
  if (engineId !== CONTEXT_ENGINE_ID) throw new HttpError(404, `HTTP 404: no context engine "${engineId}"`);
}

/**
 * The engine counts as created once this browser set it up. Deleting only forgets it here and
 * leaves the engine's data in place, so the engine's own data cannot decide this.
 */
const isSetUp = (local: LocalEngineRecord | null): boolean => !!local;

/** The engine's configuration, sources and grants, each degrading to empty when the caller may not read it. */
async function fetchEngineFacets(): Promise<{ engine: RawEngine | null; sources: RawSource[]; grants: RawGrant[] }> {
  const [engine, sources, grants] = await Promise.all([
    optional(() => contextEngineClient.get<RawEngine>(`${V1}/engine`), null as RawEngine | null),
    optional(() => contextEngineClient.get<RawSource[]>(`${V1}/sources`), [] as RawSource[]),
    optional(() => contextEngineClient.get<RawGrant[]>(grantsPath(CONTEXT_ENGINE_ID)), [] as RawGrant[]),
  ]);
  return { engine, sources: sources ?? [], grants: grants ?? [] };
}

/** Listing-only progress: any failure just leaves the progress line out, it never fails the listing. */
async function fetchProgressQuietly(): Promise<RawEngineProgress | null> {
  try {
    return await contextEngineClient.get<RawEngineProgress>(`${V1}/progress`);
  } catch {
    return null;
  }
}

/** The one engine this console shows, once it is set up, with an at-a-glance summary. */
export async function listContextEngines(): Promise<ContextEngine[]> {
  const local = readLocalEngine();
  const [facets, progress] = await Promise.all([fetchEngineFacets(), fetchProgressQuietly()]);
  if (!isSetUp(local)) return [];
  const summary: ContextEngineSummary = {
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
  return [{ ...toEngine(facets.engine, local), summary }];
}

/** The engine with its sources, models, query roles and exposure. */
export async function getContextEngine(engineId: string): Promise<ContextEngineDetail> {
  requireThisEngine(engineId);
  const local = readLocalEngine();
  const { engine, sources, grants } = await fetchEngineFacets();
  if (!isSetUp(local)) throw new HttpError(404, 'HTTP 404: the context engine is not set up yet');
  return {
    ...toEngine(engine, local),
    sources: sources.map(toSource),
    models: toModels(engine),
    queryRoles: rolesFromGrants(grants.map(toGrant)),
    exposure: toExposure(engine),
    storage: toStorage(engine),
  };
}

/**
 * Set up the running engine: grant its creator query and upload access,
 * register the sources with their visibility rules, grant the chosen roles, and
 * keep the name and description in this browser. The models, answers and storage
 * come from the engine's environment, so the wizard's choices for them are not sent.
 * One instance is one engine for now, so a second setup is refused. Setting it up again
 * after deleting it adds to whatever the running engine still holds.
 */
export async function createContextEngine(input: CreateContextEngineInput): Promise<CreateContextEngineResult> {
  if (isSetUp(readLocalEngine())) throw new HttpError(409, "HTTP 409: this console's context engine is already set up");
  const warnings: string[] = [];
  const sources: Record<string, string> = {};
  // A step the engine refuses is reported rather than undone: what succeeded is already usable.
  const attempt = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      warnings.push(`${label}: ${engineMessage(err, 'the engine refused it')}`);
    }
  };
  await attempt('Give you query and upload access', async () => {
    const me = await getContextPrincipal();
    await contextEngineClient.put(`${grantsPath(CONTEXT_ENGINE_ID)}/${encodeURIComponent(ownerGrantId(me.id))}`, { principalId: me.id, actions: [...CONTEXT_OWNER_ACTIONS] });
  });
  for (const source of input.sources) {
    await attempt(`Register source “${source.name}”`, async () => {
      const raw = await contextEngineClient.post<RawSource>(`${V1}/sources`, toSourceRegistration(source));
      if (raw?.id) sources[source.name.trim()] = raw.id;
    });
  }
  for (const role of input.roles) {
    await attempt(`Grant query access to role “${role}”`, () => contextEngineClient.put(`${grantsPath(CONTEXT_ENGINE_ID)}/${encodeURIComponent(roleGrantId(role))}`, { group: role, actions: [...CONTEXT_QUERY_ACTIONS] }));
  }
  writeLocalEngine({ name: input.name.trim(), description: input.description.trim(), createdAt: new Date().toISOString() });
  return { id: CONTEXT_ENGINE_ID, sources, warnings };
}

/** Deleting an engine is deprovisioning its instance, which the control plane owns. */
/**
 * Forget the engine in this console. Deleting its container will be the control plane's, through
 * the provisioning API; either way its data stays in the engine's databases until they are cleared.
 */
export async function deleteContextEngine(engineId: string): Promise<ContextJobHandle | null> {
  requireThisEngine(engineId);
  try {
    localStorage.removeItem(CONTEXT_ENGINE_LOCAL_KEY);
  } catch {
    throw new Error("Couldn't forget the engine: this browser's storage is unavailable.");
  }
  return null;
}

/** The engine's models come from its environment; changing them is a redeploy. */
export async function updateContextModels(_input: UpdateContextModelsInput): Promise<ContextEngineModels> {
  throw provisioningRefused('Changing the models');
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export async function getContextJob(jobId: string): Promise<ContextJob> {
  return toJob(await contextEngineClient.get<RawJob>(`${V1}/jobs/${encodeURIComponent(jobId)}`));
}

// ── Progress ────────────────────────────────────────────────────────────────

/**
 * Read-only pipeline progress of the engine's sources. The engine returns only
 * sources the caller may inspect (delivery or manage rights), so a reader sees
 * fewer entries than sources. An engine without the route reports `available: false`.
 */
export async function getContextEngineProgress(engineId: string): Promise<ContextEngineProgress> {
  requireThisEngine(engineId);
  try {
    const raw = await contextEngineClient.get<RawEngineProgress>(`${V1}/progress`);
    return { available: true, sources: (raw?.sources ?? []).map(toSourceProgress) };
  } catch (err) {
    if (isMissingRoute(err)) return { available: false, sources: [] };
    throw err;
  }
}

// ── Sources ─────────────────────────────────────────────────────────────────

/** Register a source on a running engine with its visibility rules. Connection settings still wait for the configuration route. */
export async function addContextSource(engineId: string, source: ContextSourceConfig): Promise<ContextSource> {
  requireThisEngine(engineId);
  return toSource(await contextEngineClient.post<RawSource>(`${V1}/sources`, toSourceRegistration(source)));
}

/** Rename a source, replace its visibility rules, or pause and resume it. */
export async function updateContextSource(input: UpdateContextSourceInput): Promise<ContextSource> {
  const body = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.audience ? { audienceMapping: audienceMappingFromRules(input.audience) } : {}),
    ...(input.state ? { state: input.state } : {}),
  };
  return toSource(await contextEngineClient.patch<RawSource>(`${V1}/sources/${encodeURIComponent(input.sourceId)}`, body));
}

// ── File uploads ────────────────────────────────────────────────────────────
//
// The browser delivers files itself through the engine's one-call ingestion
// route: one multipart request per file, the event part first and the bytes
// second. It mirrors the connector host's sink: the same idempotency-key scheme,
// the content hash in the event, and a lookup by key after a lost reply.

const sourcePath = (id: string): string => `${V1}/sources/${encodeURIComponent(id)}`;

/** A static engine token from runtime config, for local development; the platform token is used otherwise. */
const staticEngineToken = (): string | undefined => window.API_CONFIG?.contextEngineApiToken || undefined;

/**
 * The bearer for requests the browser sends itself: the dev token when
 * configured, else the platform token, refreshed first when it has expired,
 * as the JSON client's fetch does.
 */
async function engineBearer(): Promise<string | null> {
  const fixed = staticEngineToken();
  if (!fixed && isAccessTokenExpired()) await refreshAccessToken();
  const token = fixed || (await getAccessToken());
  return token ? `Bearer ${token}` : null;
}

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `<sourceId>:<operation>:<sha256>`: the connector host's scheme, which stays under the engine's key length limit. */
async function deliveryKey(sourceId: string, operation: string, recordId: string, version: string): Promise<string> {
  return `${sourceId}:${operation}:${await sha256Hex(deliveryIdentity(recordId, version))}`;
}

/** One multipart POST with a given bearer; the caller decides whether to try again. */
function postMultipart(url: string, form: FormData, headers: Record<string, string>, bearer: string | null, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<RawJobAccepted> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (bearer) xhr.setRequestHeader('Authorization', bearer);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as RawJobAccepted);
        } catch {
          reject(new Error('Expected a JSON response body.'));
        }
      } else {
        reject(new HttpError(xhr.status, `HTTP ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('The upload could not reach the context engine.'));
    xhr.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));
    if (signal) {
      if (signal.aborted) {
        // Before send(), abort() fires no abort event, so onabort would never settle the promise.
        reject(new DOMException('The upload was cancelled.', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

/**
 * An XHR rather than fetch, because only XHR reports upload progress. Like
 * the fetch client, it refreshes an expired platform token before sending and
 * once more after a 401, then tries again. Errors carry the engine's status.
 */
async function sendMultipart(url: string, form: FormData, headers: Record<string, string>, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<RawJobAccepted> {
  try {
    return await postMultipart(url, form, headers, await engineBearer(), onProgress, signal);
  } catch (err) {
    if (!(err instanceof HttpError && err.status === 401) || staticEngineToken()) throw err;
    await refreshAccessToken();
    return postMultipart(url, form, headers, await engineBearer(), onProgress, signal);
  }
}

/** The job accepted under a delivery key, or null when the engine has none: the check after a lost reply. */
async function findContextDelivery(sourceId: string, key: string): Promise<ContextJobHandle | null> {
  try {
    const raw = await contextEngineClient.get<RawJobAccepted>(`${sourcePath(sourceId)}/ingestions/${encodeURIComponent(key)}`);
    return raw ? { jobId: raw.jobId, statusUrl: raw.statusUrl } : null;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Upload one file as a record of the source. The record id is the file name, so
 * uploading the same name again is a new version. The version doubles as the
 * ACL version, both epoch milliseconds, so they only grow.
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
    sourceAclVersion: input.version,
    idempotencyKey: key,
  };
  const form = new FormData();
  form.append('event', new Blob([JSON.stringify(event)], { type: 'application/json' }), 'event.json');
  form.append('content', new Blob([bytes], { type: input.contentType }), input.recordId);
  try {
    const raw = await sendMultipart(`${window.API_CONFIG.contextEngineApiUrl}${sourcePath(input.sourceId)}/ingestions`, form, { 'Idempotency-Key': key }, input.onProgress, input.signal);
    return { jobId: raw.jobId, statusUrl: raw.statusUrl };
  } catch (err) {
    // The engine answered, or the user cancelled: nothing to look up.
    if (err instanceof HttpError || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    const found = await findContextDelivery(input.sourceId, key).catch(() => null);
    if (found) return found;
    throw err;
  }
}

/** Remove a record, or change who can see it, with an event-only delivery. */
export async function sendContextRecordEvent(input: RecordEventInput): Promise<ContextJobHandle> {
  const key = await deliveryKey(input.sourceId, input.operation, input.recordId, input.version);
  const event = {
    schemaVersion: '1',
    sourceId: input.sourceId,
    sourceRecordId: input.recordId,
    sourceVersion: input.version,
    operation: input.operation,
    sourceObservedAt: new Date(Number(input.version)).toISOString(),
    audience: input.audience,
    sourceAclVersion: input.version,
    idempotencyKey: key,
  };
  const form = new FormData();
  form.append('event', new Blob([JSON.stringify(event)], { type: 'application/json' }), 'event.json');
  const raw = await sendMultipart(`${window.API_CONFIG.contextEngineApiUrl}${sourcePath(input.sourceId)}/ingestions`, form, { 'Idempotency-Key': key });
  return { jobId: raw.jobId, statusUrl: raw.statusUrl };
}

/** A record's lifecycle and index state. Needs delivery or manage rights on the source. */
export async function getContextRecordStatus(sourceId: string, recordId: string): Promise<ContextRecordStatus> {
  const raw = await contextEngineClient.get<RawRecordStatus>(`${sourcePath(sourceId)}/records/${encodeURIComponent(recordId)}`);
  return { recordId: raw.recordId, state: raw.state, currentVersion: raw.currentVersion, sourceAclVersion: raw.sourceAclVersion, quarantineReason: raw.quarantineReason, indexState: raw.indexState, indexError: raw.indexError, updatedAt: raw.updatedAt };
}

// ── Query ───────────────────────────────────────────────────────────────────

export async function queryContextEngine(input: ContextQueryInput): Promise<ContextQueryResult> {
  const raw = await contextEngineClient.post<RawQueryResponse>(`${V1}/queries`, { question: input.question, mode: input.mode, ...(input.limit ? { limit: input.limit } : {}) });
  return toQueryResult(raw);
}

/**
 * Reopen a stored query. Only its asker can, and every passage is checked
 * again: ones that moved out of reach drop out, and an answer whose passages
 * are not all still visible comes back withheld. Anyone else gets 404.
 */
export async function getContextQuery(queryId: string): Promise<ContextQueryResult> {
  return toQueryResult(await contextEngineClient.get<RawQueryResponse>(`${V1}/queries/${encodeURIComponent(queryId)}`));
}

/**
 * One passage by its evidence id, for a citation link. Open to anyone with
 * query or evidence access who may read the record now, while it is still at
 * that version; every refusal is the same 404.
 */
export async function getContextEvidence(evidenceId: string): Promise<ContextEvidence> {
  return toEvidence(await contextEngineClient.get<RawEvidence>(`${V1}/evidence/${encodeURIComponent(evidenceId)}`));
}

/** The caller's effective engine actions on a resource they can see. */
export async function getContextPermissions(resourceId: string): Promise<string[]> {
  const raw = await contextEngineClient.get<{ resourceId: string; actions?: string[] }>(`${V1}/auth/permissions?resourceId=${encodeURIComponent(resourceId)}`);
  return raw?.actions ?? [];
}

// ── Access ──────────────────────────────────────────────────────────────────

export async function listContextGrants(engineId: string): Promise<ContextGrant[]> {
  const raw = await contextEngineClient.get<RawGrant[]>(grantsPath(engineId));
  return (raw ?? []).map(toGrant);
}

export async function putContextGrant(input: PutContextGrantInput): Promise<ContextGrant> {
  const body = { actions: input.actions, ...(input.group ? { group: input.group } : {}), ...(input.principalId ? { principalId: input.principalId } : {}) };
  return toGrant(await contextEngineClient.put<RawGrant>(`${grantsPath(input.engineId)}/${encodeURIComponent(input.grantId)}`, body));
}

export async function deleteContextGrant(engineId: string, grantId: string): Promise<void> {
  await contextEngineClient.delete(`${grantsPath(engineId)}/${encodeURIComponent(grantId)}`);
}

/** The caller as the engine resolved it from the bearer credential. */
export async function getContextPrincipal(): Promise<ContextPrincipal> {
  const raw = await contextEngineClient.get<RawPrincipal>(`${V1}/auth/me`);
  return { id: raw.id, kind: raw.kind, email: raw.email, groups: raw.groups ?? [] };
}
