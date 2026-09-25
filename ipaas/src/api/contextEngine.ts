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
 * Context Engines — backed by the Devant Context Engine REST API (`/v1`).
 *
 * The engine ships milestone by milestone. Routes that exist today: spaces,
 * sources, ingestion jobs, grants, `auth/me` and the read-only progress routes
 * (`/v1/progress/...`). Routes taken from its OpenAPI contract that are not
 * served yet answer 404/405: evidence, traces, space deletion. Queries serve
 * context mode only (answer mode is rejected until the engine's M5), and both
 * queries and enrichments answer 503 when the engine runs without its knowledge backend.
 * Two routes are proposals this UI needs the engine to add:
 * `PUT/GET /v1/spaces/{id}/configuration` (models + source settings and
 * credentials) and `PUT /v1/spaces/{id}/exposures` (API/MCP publishing).
 *
 * Reads that hit a missing route degrade to an empty section so the detail page
 * still renders; the create flow reports them as warnings instead of failing.
 */

import { contextEngineClient } from './httpClients';
import { getServer, getServerAdminUser } from './platformServices';
import { CONTEXT_OWNER_ACTIONS, CONTEXT_QUERY_ACTIONS } from '../../constants/contextEngine';
import { infrastructureStorageKinds, ownerGrantId, roleGrantId, rolesFromGrants, summarizeEngineProgress, toConfigurationPayload, toSourceRegistration, type ResolvedConnection } from '../../utils/contextEngine';
import { HttpError } from '../../types/http';
import type {
  ContextEngine,
  ContextEngineDetail,
  ContextEngineExposure,
  ContextEngineProgress,
  ContextEngineState,
  ContextEngineSummary,
  ContextGraphState,
  ContextGraphStatus,
  ContextEvidence,
  ContextGrant,
  ContextJob,
  ContextJobHandle,
  ContextPrincipal,
  ContextQueryInput,
  ContextQueryResult,
  ContextSource,
  CreateContextEngineInput,
  CreateContextEngineResult,
  PutContextGrantInput,
  SourceIndexingState,
  SourceProgress,
  SourceReadingState,
  StorageKind,
  StorageSummary,
} from '../../types/contextEngine';

const V1 = '/v1';
const spacePath = (id: string): string => `${V1}/spaces/${encodeURIComponent(id)}`;
const grantsPath = (resourceId: string): string => `${V1}/resources/${encodeURIComponent(resourceId)}/grants`;
const progressPath = (spaceId: string): string => `${V1}/progress/spaces/${encodeURIComponent(spaceId)}`;

// ── Raw wire shapes — private to this file ──────────────────────────────────

interface RawContextSpace {
  id: string;
  name: string;
  description?: string;
  state: string;
  createdAt: string;
}

interface RawSource {
  id: string;
  spaceId: string;
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
  sourceUrl?: string;
}

interface RawQueryResponse {
  queryId: string;
  state: string;
  answer?: string;
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

/** Proposed `GET /v1/spaces/{id}/configuration` response — models, exposure and graph status, without credentials. */
interface RawConfiguration {
  embedding?: { provider: string; model: string } | null;
  llm?: { provider: string; model: string } | null;
  exposure?: { api?: boolean; mcp?: boolean } | null;
  graph?: { state?: string; builtAt?: string; jobId?: string; progress?: { done: number; total: number } } | null;
  storage?: Partial<Record<StorageKind, { provider?: string; label?: string; detail?: string } | null>> | null;
}

/** `GET /v1/progress/spaces/{id}` — one entry per source the caller may inspect. */
interface RawSourceProgress {
  sourceId: string;
  reading: { state: string; runId?: string | null; startedAt?: string | null; completedAt?: string | null };
  processing: { since?: string | null; total: number; queued: number; running: number; succeeded: number; failed: number; percent?: number | null };
  records: { active: number; quarantined: number; deleted: number };
  indexing: { state: string; expected?: number | null; indexed?: number | null; indexing?: number | null; failed?: number | null; missing?: number | null; percent?: number | null; collectedAt?: string | null };
}

interface RawSpaceProgress {
  spaceId: string;
  sources: RawSourceProgress[];
}

// ── Mappers ─────────────────────────────────────────────────────────────────

const toEngine = (raw: RawContextSpace): ContextEngine => ({
  id: raw.id,
  name: raw.name,
  description: raw.description ?? '',
  state: raw.state as ContextEngineState,
  createdAt: raw.createdAt,
});

const toSource = (raw: RawSource): ContextSource => ({ id: raw.id, name: raw.name, type: raw.type, state: raw.state });

const toGrant = (raw: RawGrant): ContextGrant => ({ id: raw.id, resourceId: raw.resourceId, actions: raw.actions ?? [], principalId: raw.principalId, group: raw.group });

const toJob = (raw: RawJob): ContextJob => ({ id: raw.id, state: raw.state, operation: raw.operation, traceId: raw.traceId, attemptCount: raw.attemptCount, createdAt: raw.createdAt, error: raw.error });

const toEvidence = (raw: RawEvidence): ContextEvidence => ({ id: raw.id, recordId: raw.recordId, sourceId: raw.sourceId, sourceVersion: raw.sourceVersion, passage: raw.passage, location: raw.location, sourceUrl: raw.sourceUrl });

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

const GRAPH_STATES: ReadonlySet<string> = new Set<ContextGraphState>(['not_built', 'building', 'built', 'failed']);

/** Graph status from the configuration route; an engine that does not report one has not built anything we know of. */
const toGraph = (raw: RawConfiguration['graph']): ContextGraphStatus => ({
  state: raw?.state && GRAPH_STATES.has(raw.state) ? (raw.state as ContextGraphState) : 'not_built',
  builtAt: raw?.builtAt,
  jobId: raw?.jobId,
  progress: raw?.progress,
});

const toExposure = (raw: RawConfiguration | null | undefined): ContextEngineExposure => ({ api: raw?.exposure?.api ?? false, mcp: raw?.exposure?.mcp ?? false });

/** Per-store placement from the configuration route; null until the engine reports any. */
const toStorage = (raw: RawConfiguration | null | undefined): Record<StorageKind, StorageSummary> | null => {
  const st = raw?.storage;
  if (!st) return null;
  const one = (kind: StorageKind): StorageSummary => {
    const s = st[kind];
    return { provider: s?.provider ?? 'unknown', label: s?.label ?? (s?.provider ? s.provider : 'Not reported'), detail: s?.detail };
  };
  return { vector: one('vector'), relational: one('relational'), graph: one('graph') };
};

/**
 * Connection details for every store that points at an Infrastructure server:
 * host/port/database from the server, user and password from its admin user.
 * Mirrors how the RAG wizard resolves a managed vector store.
 */
async function resolveInfrastructureConnections(input: CreateContextEngineInput): Promise<Partial<Record<StorageKind, ResolvedConnection>>> {
  const kinds = infrastructureStorageKinds(input.storage);
  const entries = await Promise.all(
    kinds.map(async (kind) => {
      const sel = input.storage[kind];
      if (sel.mode !== 'infrastructure') return [kind, undefined] as const;
      const [server, admin] = await Promise.all([getServer(sel.serverId), getServerAdminUser(sel.serverId)]);
      const conn = server.connection_params;
      return [kind, { host: conn.host, port: conn.port, user: conn.user || admin.username, password: admin.password, sslRequired: conn.ssl_required }] as const;
    }),
  );
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as Partial<Record<StorageKind, ResolvedConnection>>;
}

const toQueryResult = (raw: RawQueryResponse): ContextQueryResult => ({
  queryId: raw.queryId,
  state: raw.state,
  answer: raw.answer,
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

/** Sources, grants and configuration of one space, each degrading to empty when the engine cannot serve it. */
async function fetchSpaceFacets(engineId: string): Promise<{ sources: RawSource[]; grants: RawGrant[]; configuration: RawConfiguration | null }> {
  const [sources, grants, configuration] = await Promise.all([
    optional(() => contextEngineClient.get<RawSource[]>(`${spacePath(engineId)}/sources`), [] as RawSource[]),
    optional(() => contextEngineClient.get<RawGrant[]>(grantsPath(engineId)), [] as RawGrant[]),
    optional(() => contextEngineClient.get<RawConfiguration>(`${spacePath(engineId)}/configuration`), null as RawConfiguration | null),
  ]);
  return { sources: sources ?? [], grants: grants ?? [], configuration };
}

/** Listing-only progress: any failure just leaves the progress line out, it never fails the listing. */
async function fetchSpaceProgressQuietly(engineId: string): Promise<RawSpaceProgress | null> {
  try {
    return await contextEngineClient.get<RawSpaceProgress>(progressPath(engineId));
  } catch {
    return null;
  }
}

/**
 * Context engines visible to the caller, each with an at-a-glance summary.
 * The engine lists only spaces the principal holds an action on. Until it
 * offers `GET /v1/spaces?include=summary`, the summary is assembled here with
 * one facet round-trip per space, plus its progress roll-up.
 */
export async function listContextEngines(): Promise<ContextEngine[]> {
  const raw = await contextEngineClient.get<RawContextSpace[]>(`${V1}/spaces`);
  return Promise.all(
    (raw ?? []).map(async (space) => {
      const [facets, progress] = await Promise.all([fetchSpaceFacets(space.id), fetchSpaceProgressQuietly(space.id)]);
      const summary: ContextEngineSummary = {
        sourceCount: facets.sources.length,
        sourceTypes: facets.sources.map((s) => s.type),
        roleCount: rolesFromGrants(facets.grants.map(toGrant)).length,
        exposure: toExposure(facets.configuration),
        graph: toGraph(facets.configuration?.graph),
        progress: progress
          ? summarizeEngineProgress(
              facets.sources.map((src) => src.id),
              (progress.sources ?? []).map(toSourceProgress),
            )
          : null,
      };
      return { ...toEngine(space), summary };
    }),
  );
}

/** One engine with its sources, models, query roles and exposure. Only the space itself is required to exist. */
export async function getContextEngine(engineId: string): Promise<ContextEngineDetail> {
  const space = await contextEngineClient.get<RawContextSpace>(spacePath(engineId));
  const { sources, grants, configuration } = await fetchSpaceFacets(engineId);
  return {
    ...toEngine(space),
    sources: sources.map(toSource),
    models: { embedding: configuration?.embedding ?? null, llm: configuration?.llm ?? null },
    queryRoles: rolesFromGrants(grants.map(toGrant)),
    exposure: toExposure(configuration),
    graph: toGraph(configuration?.graph),
    storage: toStorage(configuration),
  };
}

/**
 * Create the space, then grant its creator query and enrichment access, register
 * sources with their visibility rules, grant the chosen roles and store the
 * model configuration. Steps the engine does not serve yet are reported as
 * warnings; any other failure rolls the space back and rethrows.
 */
export async function createContextEngine(input: CreateContextEngineInput): Promise<CreateContextEngineResult> {
  // Resolve Infrastructure connections first so a missing or powered-off server fails before anything is created.
  const connections = await resolveInfrastructureConnections(input);
  const space = await contextEngineClient.post<RawContextSpace>(`${V1}/spaces`, { name: input.name, ...(input.description ? { description: input.description } : {}) });
  const warnings: string[] = [];

  const attempt = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      if (isMissingRoute(err)) {
        warnings.push(label);
        return;
      }
      throw err;
    }
  };

  try {
    // The engine gives a space's creator nothing by itself: without this grant they could neither query nor enrich it.
    await attempt('Give you query and enrichment access', async () => {
      const me = await getContextPrincipal();
      await contextEngineClient.put(`${grantsPath(space.id)}/${encodeURIComponent(ownerGrantId(me.id))}`, { principalId: me.id, actions: [...CONTEXT_OWNER_ACTIONS] });
    });
    for (const source of input.sources) {
      await attempt(`Register source “${source.name}”`, () => contextEngineClient.post(`${spacePath(space.id)}/sources`, toSourceRegistration(source)));
    }
    for (const role of input.roles) {
      await attempt(`Grant query access to role “${role}”`, () => contextEngineClient.put(`${grantsPath(space.id)}/${encodeURIComponent(roleGrantId(role))}`, { group: role, actions: [...CONTEXT_QUERY_ACTIONS] }));
    }
    await attempt('Save model, storage and source configuration', () => contextEngineClient.put(`${spacePath(space.id)}/configuration`, toConfigurationPayload(input, connections)));
  } catch (err) {
    // Best-effort rollback so a half-configured engine does not linger in the listing.
    await optional(() => contextEngineClient.delete(spacePath(space.id)), undefined).catch(() => undefined);
    throw err;
  }

  return { id: space.id, warnings };
}

/** Delete an engine. The contract returns a job handle; the engine may also answer 204 with no body. */
export async function deleteContextEngine(engineId: string): Promise<void> {
  await contextEngineClient.delete<RawJobAccepted | undefined>(spacePath(engineId));
}

/** Proposed `PUT /v1/spaces/{id}/exposures` — publish or unpublish the API and MCP surfaces. */
export async function updateContextEngineExposure(engineId: string, exposure: ContextEngineExposure): Promise<ContextEngineExposure> {
  const raw = await contextEngineClient.put<{ api?: boolean; mcp?: boolean } | undefined>(`${spacePath(engineId)}/exposures`, exposure);
  return { api: raw?.api ?? exposure.api, mcp: raw?.mcp ?? exposure.mcp };
}

// ── Build jobs ──────────────────────────────────────────────────────────────

/** Start an enrichment (graph build) over the engine's sources; returns the job handle to poll. */
export async function rebuildContextEngine(engineId: string): Promise<ContextJobHandle> {
  const raw = await contextEngineClient.post<RawJobAccepted>(`${spacePath(engineId)}/enrichments`, undefined, { 'Idempotency-Key': crypto.randomUUID() });
  return { jobId: raw.jobId, statusUrl: raw.statusUrl };
}

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
  try {
    const raw = await contextEngineClient.get<RawSpaceProgress>(progressPath(engineId));
    return { available: true, sources: (raw?.sources ?? []).map(toSourceProgress) };
  } catch (err) {
    if (isMissingRoute(err)) return { available: false, sources: [] };
    throw err;
  }
}

// ── Query ───────────────────────────────────────────────────────────────────

export async function queryContextEngine(input: ContextQueryInput): Promise<ContextQueryResult> {
  const raw = await contextEngineClient.post<RawQueryResponse>(`${V1}/queries`, { spaceId: input.engineId, question: input.question, mode: input.mode, ...(input.limit ? { limit: input.limit } : {}) });
  return toQueryResult(raw);
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
