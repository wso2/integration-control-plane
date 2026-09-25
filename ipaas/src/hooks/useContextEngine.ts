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

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContextEngine,
  deleteContextEngine,
  deleteContextGrant,
  getContextEngine,
  getContextEngineProgress,
  getContextJob,
  getContextPrincipal,
  listContextEngines,
  listContextGrants,
  putContextGrant,
  queryContextEngine,
  rebuildContextEngine,
  updateContextEngineExposure,
} from '#api/contextEngine';
import { IS_WIP } from '../features';
import { getAccessToken } from '../auth/tokenManager';
import { CONTEXT_ENGINE_ASKED_KEY_PREFIX, CONTEXT_ENGINE_DRAFT_KEY_PREFIX, CONTEXT_ENGINE_ENRICHMENT_KEY_PREFIX, CONTEXT_JOB_TERMINAL_STATES, CONTEXT_OWNER_ACTIONS, PROGRESS_POLL_ACTIVE_MS, PROGRESS_POLL_IDLE_MS } from '../constants/contextEngine';
import { fromDraft, isEngineProgressActive, ownerGrantId, resolveGraphStatus, toDraft } from '../utils/contextEngine';
import { HttpError } from '../types/http';
import type { ContextEngineExposure, ContextEngineForm, ContextGraphStatus, ContextQueryInput, CreateContextEngineInput, PutContextGrantInput } from '../types/contextEngine';

const ROOT_KEY = 'contextEngines';

/** Context Engines: wip build with the engine URL configured and the feature flag on. */
export function isContextEngineEnabled(): boolean {
  return IS_WIP && !!window.API_CONFIG?.enableContextEngineFeature && !!window.API_CONFIG?.contextEngineApiUrl;
}

export function useContextEngines() {
  return useQuery({
    queryKey: [ROOT_KEY, 'list'],
    queryFn: () => listContextEngines(),
    enabled: isContextEngineEnabled(),
    retry: false,
  });
}

export function useContextEngine(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'detail', engineId],
    queryFn: () => getContextEngine(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
  });
}

export function useCreateContextEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContextEngineInput) => createContextEngine(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

export function useDeleteContextEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (engineId: string) => deleteContextEngine(engineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

export function useUpdateContextEngineExposure(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exposure: ContextEngineExposure) => updateContextEngineExposure(engineId, exposure),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] }),
  });
}

export function useRebuildContextEngine(engineId: string) {
  return useMutation({ mutationFn: () => rebuildContextEngine(engineId) });
}

/** Poll a build job every few seconds until it reaches a terminal state. */
export function useContextJob(jobId: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'job', jobId],
    queryFn: () => getContextJob(jobId!),
    enabled: isContextEngineEnabled() && !!jobId,
    refetchInterval: (query) => (query.state.data && CONTEXT_JOB_TERMINAL_STATES.has(query.state.data.state) ? false : 3000),
    retry: false,
  });
}

/**
 * Source progress, polled quickly while any source is reading, processing or
 * indexing and slowly otherwise. Stops when the engine does not serve progress.
 * TanStack pauses the interval while the browser tab is hidden.
 */
export function useContextEngineProgress(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'progress', engineId],
    queryFn: () => getContextEngineProgress(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.available || query.state.status === 'error') return false;
      return isEngineProgressActive(data) ? PROGRESS_POLL_ACTIVE_MS : PROGRESS_POLL_IDLE_MS;
    },
    retry: false,
  });
}

/** Natural-language query — a mutation because each question is a new request, not cached state. */
export function useQueryContextEngine() {
  return useMutation({ mutationFn: (input: ContextQueryInput) => queryContextEngine(input) });
}

export function useContextGrants(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'grants', engineId],
    queryFn: () => listContextGrants(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
  });
}

export function usePutContextGrant(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<PutContextGrantInput, 'engineId'>) => putContextGrant({ ...input, engineId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'grants', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

export function useDeleteContextGrant(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => deleteContextGrant(engineId, grantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'grants', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

/**
 * Give the signed-in user the creator's grant on an engine (query + enrich).
 * Engines created before the wizard added this grant lack it; the engine
 * refuses unless the caller holds access.manage.
 */
export function useGrantOwnerAccess(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const me = await getContextPrincipal();
      return putContextGrant({ engineId, grantId: ownerGrantId(me.id), principalId: me.id, actions: [...CONTEXT_OWNER_ACTIONS] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'grants', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

/** Who the engine thinks the caller is — surfaced on the Access tab so grants can be reasoned about. */
export function useContextPrincipal() {
  return useQuery({
    queryKey: [ROOT_KEY, 'principal'],
    queryFn: () => getContextPrincipal(),
    enabled: isContextEngineEnabled(),
    retry: false,
    staleTime: 60_000,
  });
}

// ── Enrichment status (no engine route reports it yet) ──

const enrichmentListeners = new Set<() => void>();
const enrichmentKey = (engineId: string): string => `${CONTEXT_ENGINE_ENRICHMENT_KEY_PREFIX}${engineId}`;

function readEnrichment(engineId: string): string | null {
  try {
    return localStorage.getItem(enrichmentKey(engineId));
  } catch {
    return null;
  }
}

function writeEnrichment(engineId: string, jobId: string | null): void {
  try {
    if (jobId) localStorage.setItem(enrichmentKey(engineId), jobId);
    else localStorage.removeItem(enrichmentKey(engineId));
  } catch {
    // Storage may be unavailable (private mode); the status then lasts for this page only.
  }
  enrichmentListeners.forEach((l) => l());
}

function subscribeEnrichment(listener: () => void): () => void {
  enrichmentListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    enrichmentListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** The last enrichment job started from this browser for one engine, shared by every component that shows it. */
export function useLastEnrichment(engineId: string) {
  const jobId = useSyncExternalStore(
    subscribeEnrichment,
    () => readEnrichment(engineId),
    () => null,
  );
  const remember = useCallback((id: string) => writeEnrichment(engineId, id), [engineId]);
  const forget = useCallback(() => writeEnrichment(engineId, null), [engineId]);
  return { jobId, remember, forget };
}

/**
 * Enrichment status for one engine: what the engine reports, filled in from the
 * last enrichment job this browser started while the engine reports none.
 */
export function useEngineGraphStatus(engineId: string, reported: ContextGraphStatus, starting = false) {
  const { jobId, remember, forget } = useLastEnrichment(engineId);
  const tracked = reported.state === 'building' && reported.jobId ? reported.jobId : jobId;
  const job = useContextJob(tracked);
  // A job the engine no longer knows (e.g. its database was reset) is forgotten.
  useEffect(() => {
    if (job.error instanceof HttpError && job.error.status === 404 && tracked === jobId) forget();
  }, [job.error, tracked, jobId, forget]);
  return { graph: resolveGraphStatus(reported, job.data, starting), job: job.data, remember };
}

// ── Local state that outlives a page: wizard draft, first-run flags, engine credential ──

/**
 * The create-wizard draft for an org, kept in session storage with secrets
 * stripped. `restore()` is meant for a reducer initializer; `save` and `clear`
 * are stable so a sync effect can depend on them.
 */
export function useContextEngineDraft(orgHandle: string) {
  const key = `${CONTEXT_ENGINE_DRAFT_KEY_PREFIX}${orgHandle}`;
  const [savedAt, setSavedAt] = useState<string | null>(() => fromDraft(sessionStorage.getItem(key))?.savedAt ?? null);
  const restore = useCallback((): ContextEngineForm | null => fromDraft(sessionStorage.getItem(key))?.form ?? null, [key]);
  const save = useCallback(
    (form: ContextEngineForm) => {
      const now = new Date().toISOString();
      sessionStorage.setItem(key, JSON.stringify(toDraft(form, now)));
      setSavedAt(now);
    },
    [key],
  );
  const clear = useCallback(() => {
    sessionStorage.removeItem(key);
    setSavedAt(null);
  }, [key]);
  return { savedAt, restore, save, clear };
}

/** Whether this user has asked the engine anything yet — drives the "Ask it something" checklist step. */
export function useAskedFlag(engineId: string) {
  const key = `${CONTEXT_ENGINE_ASKED_KEY_PREFIX}${engineId}`;
  const [asked, setAsked] = useState(() => localStorage.getItem(key) === 'true');
  const markAsked = useCallback(() => {
    localStorage.setItem(key, 'true');
    setAsked(true);
  }, [key]);
  return { asked, markAsked };
}

/** The bearer credential the browser would send to the engine — the dev token when configured, else the platform token. */
export function useContextEngineBearer(): string | null {
  const token = window.API_CONFIG?.contextEngineApiToken || getAccessToken();
  return token ? `Bearer ${token}` : null;
}

/** Refetch one engine's detail — e.g. after a build job finishes. */
export function useInvalidateContextEngine(engineId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] });
  }, [qc, engineId]);
}
