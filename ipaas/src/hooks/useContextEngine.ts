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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import {
  addContextSource,
  createContextApiKey,
  createContextEngine,
  deleteContextEngine,
  deleteContextGrant,
  getContextEngine,
  getContextEngineProgress,
  getContextEngineSummary,
  getContextEntity,
  getContextEvidence,
  getContextGraph,
  getContextPermissions,
  getContextQueryTrace,
  getContextPrincipal,
  getContextQuery,
  listContextApiKeys,
  listContextEngines,
  listContextGrants,
  listContextIntegrations,
  putContextGrant,
  queryContextEngine,
  revokeContextApiKey,
  setUpContextEngine,
  updateContextModels,
  updateContextSource,
} from '../api/contextEngine';
import { CONTEXT_ENGINE_ASKED_KEY_PREFIX, CONTEXT_ENGINE_DRAFT_KEY_PREFIX, CONTEXT_OWNER_ACTIONS, DELETION_POLL_MS, ENGINE_STATUS_POLL_MS, PROGRESS_POLL_ACTIVE_MS, PROGRESS_POLL_IDLE_MS, SUMMARY_CONCURRENCY } from '../constants/contextEngine';
import { contextEngineKey } from '../utils/contextEngineKey';
import { everyoneRoles, fromDraft, isEngineProgressActive, ownerGrantId, toDraft } from '../utils/contextEngine';
import { useRoles } from './useAuth';
import type { ContextEngineForm, ContextEngineSetupInput, ContextEngineState, ContextQueryInput, ContextSourceConfig, CreateContextEngineInput, PutContextGrantInput, UpdateContextModelsInput, UpdateContextSourceInput } from '../types/contextEngine';

const ROOT_KEY = 'contextEngines';

/** An engine's models are set when it is created; the BFF cannot change them yet. */
export const CONTEXT_ENGINE_MODEL_UPDATES = false;

/** Context Engines: the feature flag on. */
export function isContextEngineEnabled(): boolean {
  return !!window.API_CONFIG?.enableContextEngineFeature;
}

/** The engine a page is for: its name from the path and its environment from `?env=`; empty when either is missing. */
export function useRouteEngineId(): string {
  const { engineId: handle = '' } = useParams();
  const [params] = useSearchParams();
  const environment = params.get('env') ?? '';
  return handle && environment ? contextEngineKey(environment, handle) : '';
}

/** States an engine leaves on its own, so a page showing one checks again. */
const TRANSIENT_STATES: ReadonlySet<ContextEngineState> = new Set(['provisioning', 'starting', 'deleting', 'unknown']);

/** The engines in one environment; checked again while any is starting or being deleted. */
export function useContextEngines(environment: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'list', environment],
    queryFn: () => listContextEngines(environment),
    enabled: isContextEngineEnabled() && !!environment,
    retry: false,
    refetchInterval: (query) => (query.state.data?.some((e) => TRANSIENT_STATES.has(e.state)) ? DELETION_POLL_MS : false),
  });
}

// The listing reads a few summaries at a time, however many rows come into view together.
let summariesRunning = 0;
const summaryQueue: (() => void)[] = [];

function throttledSummary<T>(read: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      summariesRunning += 1;
      read()
        .then(resolve, reject)
        .finally(() => {
          summariesRunning -= 1;
          summaryQueue.shift()?.();
        });
    };
    if (summariesRunning < SUMMARY_CONCURRENCY) run();
    else summaryQueue.push(run);
  });
}

/** A running engine's listing summary, read once its row is on screen. */
export function useContextEngineSummary(engineId: string, enabled: boolean) {
  return useQuery({
    queryKey: [ROOT_KEY, 'summary', engineId],
    queryFn: () => throttledSummary(() => getContextEngineSummary(engineId)),
    enabled: isContextEngineEnabled() && !!engineId && enabled,
    retry: false,
    staleTime: 60_000,
  });
}

/** Whether an element has been on screen; it stays true once it has. */
export function useSeenOnScreen<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, seen]);
  return [setEl, seen];
}

/** One engine; checked again while it starts or is being deleted. */
export function useContextEngine(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'detail', engineId],
    queryFn: () => getContextEngine(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === 'deleting') return DELETION_POLL_MS;
      return state && TRANSIENT_STATES.has(state) ? ENGINE_STATUS_POLL_MS : false;
    },
  });
}

/** The caller's effective actions on one engine, to offer only what they can do. Empty while unknown. */
export function useContextPermissions(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'permissions', engineId],
    queryFn: () => getContextPermissions(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
    staleTime: 30_000,
  });
}

/** Replace the engine's models; the engine's page refetches to show the new ones and their key status. */
export function useUpdateContextModels(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UpdateContextModelsInput, 'engineId'>) => updateContextModels({ ...input, engineId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] }),
  });
}

/** Reopen a question this caller asked; every passage is checked again. */
export function useReopenContextQuery(engineId: string) {
  return useMutation({ mutationFn: (queryId: string) => getContextQuery(engineId, queryId) });
}

/**
 * A stored query, reopened for the graph's provenance view. The engine checks
 * every passage again, so what comes back is what the reader may still see.
 */
export function useContextQueryResult(engineId: string, queryId: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'query', engineId, queryId],
    queryFn: () => getContextQuery(engineId, queryId as string),
    enabled: isContextEngineEnabled() && !!engineId && !!queryId,
    retry: false,
    staleTime: 30_000,
  });
}

/** How a stored query ran; null when the reader lacks `trace.read` or the engine serves no traces. */
export function useContextQueryTrace(engineId: string, queryId: string | null, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'trace', engineId, queryId],
    queryFn: () => getContextQueryTrace(engineId, queryId as string),
    enabled: isContextEngineEnabled() && !!engineId && !!queryId && enabled,
    retry: false,
    staleTime: 30_000,
  });
}

/** The part of the knowledge graph the reader may see; null when the engine does not serve its graph. */
export function useContextGraph(engineId: string, limit: number, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'graph', engineId, limit],
    queryFn: () => getContextGraph(engineId, limit),
    enabled: isContextEngineEnabled() && !!engineId && enabled,
    retry: false,
    staleTime: 60_000,
  });
}

/** One entity's passages and relationships; a 404 means nothing the reader may read names it. */
export function useContextEntity(engineId: string, name: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'entity', engineId, name],
    queryFn: () => getContextEntity(engineId, name as string, 10),
    enabled: isContextEngineEnabled() && !!engineId && !!name,
    retry: false,
    staleTime: 60_000,
  });
}

/** One passage behind a citation link. A 404 means it is gone or out of reach, which the engine does not tell apart. */
export function useContextEvidence(engineId: string, evidenceId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'evidence', engineId, evidenceId],
    queryFn: () => getContextEvidence(engineId, evidenceId),
    enabled: isContextEngineEnabled() && !!engineId && !!evidenceId,
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

/** Set up an engine the wizard created, once it runs: grants and sources. */
export function useSetUpContextEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ engineId, input }: { engineId: string; input: ContextEngineSetupInput }) => setUpContextEngine(engineId, input),
    onSuccess: (_result, { engineId }) => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'summary', engineId] });
    },
  });
}

/** Delete an engine; the list and page show it as deleting until it is gone. */
export function useDeleteContextEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (engineId: string) => deleteContextEngine(engineId),
    onSuccess: (_result, engineId) => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

/** Register a source on a running engine; the detail and listing refetch so the new source shows with its progress. */
export function useAddContextSource(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: ContextSourceConfig) => addContextSource(engineId, source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'summary', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'integrations', engineId] });
      // The new source has no progress row until the next poll; fetch it now so the card never says "hidden".
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'progress', engineId] });
    },
  });
}

export function useUpdateContextSource(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UpdateContextSourceInput, 'engineId'>) => updateContextSource({ ...input, engineId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'summary', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'progress', engineId] });
    },
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
 * Give the signed-in user the creator's grant on an engine.
 * Engines created before the wizard added this grant lack it; the engine
 * refuses unless the caller holds access.manage.
 */
export function useGrantOwnerAccess(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const me = await getContextPrincipal(engineId);
      return putContextGrant({ engineId, grantId: ownerGrantId(me.id), principalId: me.id, actions: [...CONTEXT_OWNER_ACTIONS] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'grants', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

/** Who the engine thinks the caller is — surfaced on the Access tab so grants can be reasoned about. */
export function useContextPrincipal(engineId: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'principal', engineId],
    queryFn: () => getContextPrincipal(engineId as string),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * What choosing who can see uploaded files needs: the org roles to pick from and
 * their names, the caller's groups for the "you won't see these" check, and the
 * role handles "everyone who can query" stands for. `queryRoles` are the roles
 * granted query access, chosen or already granted. Before an engine exists there
 * is no one to ask for the caller's groups, so they are empty.
 */
export function useUploadAudience(orgHandle: string, queryRoles: string[], engineId: string | null) {
  const roles = useRoles(orgHandle);
  const principal = useContextPrincipal(engineId);
  const myGroups = useMemo(() => principal.data?.groups ?? [], [principal.data]);
  const roleKey = queryRoles.join('\u0000');
  const everyone = useMemo(
    () =>
      everyoneRoles(
        roles.data?.map((r) => r.roleId),
        roleKey ? roleKey.split('\u0000') : [],
        myGroups,
      ),
    [roles.data, roleKey, myGroups],
  );
  const roleNames = useMemo(() => Object.fromEntries((roles.data ?? []).map((r) => [r.roleId, r.roleName])), [roles.data]);
  return { roles: roles.data ?? [], rolesLoading: roles.isLoading, rolesFailed: roles.isError, roleNames, myGroups, everyone };
}

// ── Local state that outlives a page: wizard draft, first-run flags ──

/**
 * The create-wizard draft for an org, kept in session storage with secrets
 * stripped. `restore()` is meant for a reducer initializer; `save` and `clear`
 * are stable so a sync effect can depend on them.
 */
// Web storage can be unavailable (private mode, blocked site data, a sandboxed frame), and then
// even reading it throws. The wizard and the engine page must still render, so these never throw.

function readStorage(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Unavailable: what was written lasts for this page only.
  }
}

const session = () => sessionStorage;
const local = () => localStorage;

export function useContextEngineDraft(orgHandle: string) {
  const key = `${CONTEXT_ENGINE_DRAFT_KEY_PREFIX}${orgHandle}`;
  const [savedAt, setSavedAt] = useState<string | null>(() => fromDraft(readStorage(session, key))?.savedAt ?? null);
  const restore = useCallback((): ContextEngineForm | null => fromDraft(readStorage(session, key))?.form ?? null, [key]);
  const save = useCallback(
    (form: ContextEngineForm) => {
      const now = new Date().toISOString();
      writeStorage(session, key, JSON.stringify(toDraft(form, now)));
      setSavedAt(now);
    },
    [key],
  );
  const clear = useCallback(() => {
    writeStorage(session, key, null);
    setSavedAt(null);
  }, [key]);
  return { savedAt, restore, save, clear };
}

/** Whether this user has asked the engine anything yet — drives the "Ask it something" checklist step. */
export function useAskedFlag(engineId: string) {
  const key = `${CONTEXT_ENGINE_ASKED_KEY_PREFIX}${engineId}`;
  const [asked, setAsked] = useState(() => readStorage(local, key) === 'true');
  const markAsked = useCallback(() => {
    writeStorage(local, key, 'true');
    setAsked(true);
  }, [key]);
  return { asked, markAsked };
}

// ── Integrations and API keys ──

/** The integrations running an engine's sources, with their status; checked again while any is settling. */
export function useContextIntegrations(engineId: string, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'integrations', engineId],
    queryFn: () => listContextIntegrations(engineId),
    enabled: isContextEngineEnabled() && !!engineId && enabled,
    retry: false,
    refetchInterval: (query) => (query.state.data?.some((i) => i.status === 'provisioning' || i.status === 'removing') ? ENGINE_STATUS_POLL_MS : false),
  });
}

export function useContextApiKeys(engineId: string, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'apiKeys', engineId],
    queryFn: () => listContextApiKeys(engineId),
    enabled: isContextEngineEnabled() && !!engineId && enabled,
    retry: false,
  });
}

export function useCreateContextApiKey(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName?: string; expiresAt?: string }) => createContextApiKey(engineId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'apiKeys', engineId] }),
  });
}

export function useRevokeContextApiKey(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyName: string) => revokeContextApiKey(engineId, keyName),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'apiKeys', engineId] }),
  });
}

/** Refetch one engine's detail — e.g. after a build job finishes. */
export function useInvalidateContextEngine(engineId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'summary', engineId] });
  }, [qc, engineId]);
}
