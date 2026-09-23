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
 * ingestion jobs, grants, `auth/me`. Routes taken from its OpenAPI contract that
 * are not served yet answer 404/405: sources, queries, evidence, enrichments,
 * space deletion. Two routes are proposals this UI needs the engine to add:
 * `PUT/GET /v1/spaces/{id}/configuration` (models + source settings and
 * credentials) and `PUT /v1/spaces/{id}/exposures` (API/MCP publishing).
 *
 * Reads that hit a missing route degrade to an empty section so the detail page
 * still renders; the create flow reports them as warnings instead of failing.
 */

import { contextEngineClient } from './httpClients';
import { CONTEXT_QUERY_ACTIONS } from '../../constants/contextEngine';
import { roleGrantId, rolesFromGrants, toConfigurationPayload, toSourceRegistration } from '../../utils/contextEngine';
import { HttpError } from '../../types/http';
import type {
  ContextEngine,
  ContextEngineDetail,
  ContextEngineExposure,
  ContextEngineState,
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
} from '../../types/contextEngine';

const V1 = '/v1';
const spacePath = (id: string): string => `${V1}/spaces/${encodeURIComponent(id)}`;
const grantsPath = (resourceId: string): string => `${V1}/resources/${encodeURIComponent(resourceId)}/grants`;

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

/** Proposed `GET /v1/spaces/{id}/configuration` response — models and exposure without credentials. */
interface RawConfiguration {
  embedding?: { provider: string; model: string } | null;
  llm?: { provider: string; model: string } | null;
  exposure?: { api?: boolean; mcp?: boolean } | null;
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

/** Context engines visible to the caller (the engine lists only spaces the principal holds an action on). */
export async function listContextEngines(): Promise<ContextEngine[]> {
  const raw = await contextEngineClient.get<RawContextSpace[]>(`${V1}/spaces`);
  return (raw ?? []).map(toEngine);
}

/** One engine with its sources, models, query roles and exposure. Only the space itself is required to exist. */
export async function getContextEngine(engineId: string): Promise<ContextEngineDetail> {
  const space = await contextEngineClient.get<RawContextSpace>(spacePath(engineId));
  const [sources, grants, configuration] = await Promise.all([
    optional(() => contextEngineClient.get<RawSource[]>(`${spacePath(engineId)}/sources`), [] as RawSource[]),
    optional(() => contextEngineClient.get<RawGrant[]>(grantsPath(engineId)), [] as RawGrant[]),
    optional(() => contextEngineClient.get<RawConfiguration>(`${spacePath(engineId)}/configuration`), null as RawConfiguration | null),
  ]);
  return {
    ...toEngine(space),
    sources: (sources ?? []).map(toSource),
    models: { embedding: configuration?.embedding ?? null, llm: configuration?.llm ?? null },
    queryRoles: rolesFromGrants((grants ?? []).map(toGrant)),
    exposure: { api: configuration?.exposure?.api ?? false, mcp: configuration?.exposure?.mcp ?? false },
  };
}

/**
 * Create the space, then register sources, grant the chosen roles and store the
 * model configuration. Steps the engine does not serve yet are reported as
 * warnings; any other failure rolls the space back and rethrows.
 */
export async function createContextEngine(input: CreateContextEngineInput): Promise<CreateContextEngineResult> {
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
    for (const source of input.sources) {
      await attempt(`Register source “${source.name}”`, () => contextEngineClient.post(`${spacePath(space.id)}/sources`, toSourceRegistration(source)));
    }
    for (const role of input.roles) {
      await attempt(`Grant query access to role “${role}”`, () => contextEngineClient.put(`${grantsPath(space.id)}/${encodeURIComponent(roleGrantId(role))}`, { group: role, actions: [...CONTEXT_QUERY_ACTIONS] }));
    }
    await attempt('Save model configuration and source credentials', () => contextEngineClient.put(`${spacePath(space.id)}/configuration`, toConfigurationPayload(input)));
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
