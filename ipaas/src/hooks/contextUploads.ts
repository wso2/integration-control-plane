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
 * Uploads to a context engine source, tracked from the transfer through the
 * engine's job to the record's index state.
 *
 * The state lives at module level, not in a component: an upload started on the
 * create wizard keeps going after the page hands off to the engine's Overview,
 * and the Files drawer there shows the same rows. Files this browser uploaded are
 * remembered in localStorage per source, because the engine has no route that
 * lists a source's records yet; their statuses are re-read from the engine.
 *
 * Files are shared with roles directly: each is tagged with role handles, and
 * the source's rules map every handle to itself. Before sending, the rules this
 * browser last saved are checked for the tags, and the source is updated when
 * one is missing, because the engine holds back a file with an unmapped tag.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { getContextJob, getContextRecordStatus, ingestContextFile, sendContextRecordEvent, updateContextSource } from '#api/contextEngine';
import { CONTEXT_ENGINE_FILES_KEY_PREFIX, CONTEXT_ENGINE_RULES_KEY_PREFIX, CONTEXT_JOB_TERMINAL_STATES, UPLOAD_CONCURRENCY, UPLOAD_POLL_MS } from '../constants/contextEngine';
import { engineMessage, uploadSourceRules, uploadStatusFromRecord } from '../utils/contextEngine';
import { HttpError } from '../types/http';
import type { AudienceRule, FileVisibility, UploadedFile, UploadEntry } from '../types/contextEngine';

export interface FileToUpload {
  content: Blob;
  name: string;
  size: number;
  contentType: string;
}

const EMPTY: UploadEntry[] = [];
const entriesBySource = new Map<string, UploadEntry[]>();
const loadedSources = new Set<string>();
const listeners = new Set<() => void>();
/** Bytes of uploads that have not succeeded yet, so a failed one can be retried. */
const pendingBytes = new Map<string, FileToUpload>();
const timers = new Map<string, number>();
const active = new Map<string, number>();
const queues = new Map<string, (() => Promise<void>)[]>();

const entryKey = (sourceId: string, recordId: string): string => `${sourceId}\u0000${recordId}`;
const filesKey = (sourceId: string): string => `${CONTEXT_ENGINE_FILES_KEY_PREFIX}${sourceId}`;
const rulesKey = (sourceId: string): string => `${CONTEXT_ENGINE_RULES_KEY_PREFIX}${sourceId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable; the list then lasts for this page only.
  }
}

function emit(): void {
  listeners.forEach((l) => l());
}

function entriesOf(sourceId: string): UploadEntry[] {
  return entriesBySource.get(sourceId) ?? EMPTY;
}

function persist(sourceId: string): void {
  const remembered: UploadedFile[] = entriesOf(sourceId)
    .filter((e) => e.status !== 'failed' || e.jobId)
    .map(({ recordId, name, size, contentType, visibility, audience, label, version, uploadedAt, jobId }) => ({ recordId, name, size, contentType, visibility, audience, label, version, uploadedAt, jobId }));
  writeJson(filesKey(sourceId), remembered);
}

function setEntries(sourceId: string, next: UploadEntry[]): void {
  entriesBySource.set(sourceId, next);
  emit();
}

function patchEntry(sourceId: string, recordId: string, patch: Partial<UploadEntry>): void {
  setEntries(
    sourceId,
    entriesOf(sourceId).map((e) => (e.recordId === recordId ? { ...e, ...patch } : e)),
  );
}

function clearTimer(key: string): void {
  const t = timers.get(key);
  if (t !== undefined) {
    window.clearTimeout(t);
    timers.delete(key);
  }
}

/** Files this browser uploaded earlier, restored once per source; their statuses are then re-read. */
function ensureLoaded(engineId: string, sourceId: string): void {
  if (loadedSources.has(sourceId)) return;
  loadedSources.add(sourceId);
  // Files remembered before visibility was chosen by role carry only their label.
  const remembered = readJson<UploadedFile[]>(filesKey(sourceId), []).map((f) => ({ ...f, audience: Array.isArray(f.audience) ? f.audience : f.label ? [f.label] : [] }));
  if (remembered.length === 0) return;
  const restored: UploadEntry[] = remembered.map((f) => ({ ...f, status: 'indexing', progress: 100 }));
  setEntries(sourceId, [...restored, ...entriesOf(sourceId).filter((e) => !remembered.some((f) => f.recordId === e.recordId))]);
  restored.forEach((e) => void follow(engineId, sourceId, e.recordId));
}

/** Re-read a file's status: through its job while that is still running, else straight from the record. */
function follow(engineId: string, sourceId: string, recordId: string): Promise<void> {
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  return entry?.jobId ? watchJob(engineId, sourceId, recordId, entry.jobId) : watchRecord(engineId, sourceId, recordId);
}

/**
 * Re-read a record until its index state settles. A record the engine does not
 * know yet is one whose job has not run, so its job is followed instead; once
 * the job is done, a missing record means it was removed.
 */
async function watchRecord(engineId: string, sourceId: string, recordId: string, afterJob = false): Promise<void> {
  const key = entryKey(sourceId, recordId);
  clearTimer(key);
  try {
    const record = await getContextRecordStatus(sourceId, recordId);
    const { status, detail } = uploadStatusFromRecord(record);
    patchEntry(sourceId, recordId, { status, detail, forbidden: false, version: record.currentVersion, progress: 100 });
    if (status === 'indexing')
      timers.set(
        key,
        window.setTimeout(() => void watchRecord(engineId, sourceId, recordId), UPLOAD_POLL_MS),
      );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
      if (!afterJob && entry?.jobId) {
        await watchJob(engineId, sourceId, recordId, entry.jobId);
        return;
      }
      setEntries(
        sourceId,
        entriesOf(sourceId).filter((e) => e.recordId !== recordId),
      );
      persist(sourceId);
      return;
    }
    patchEntry(sourceId, recordId, {
      status: 'failed',
      detail: err instanceof HttpError && err.status === 403 ? 'Seeing this file needs upload access to the source.' : engineMessage(err, "Couldn't read the file's status."),
      forbidden: err instanceof HttpError && err.status === 403,
    });
  }
}

/** Follow the engine's job for an upload, then the record it produced. */
async function watchJob(engineId: string, sourceId: string, recordId: string, jobId: string): Promise<void> {
  const key = entryKey(sourceId, recordId);
  clearTimer(key);
  try {
    const job = await getContextJob(jobId);
    if (!CONTEXT_JOB_TERMINAL_STATES.has(job.state)) {
      patchEntry(sourceId, recordId, { status: 'queued', progress: 100 });
      timers.set(
        key,
        window.setTimeout(() => void watchJob(engineId, sourceId, recordId, jobId), UPLOAD_POLL_MS),
      );
      return;
    }
    if (job.state === 'failed') {
      patchEntry(sourceId, recordId, { status: 'failed', detail: job.error?.message ?? 'The engine could not apply this file.' });
      return;
    }
    pendingBytes.delete(key);
    await watchRecord(engineId, sourceId, recordId, true);
  } catch (err) {
    patchEntry(sourceId, recordId, { status: 'failed', detail: engineMessage(err, "Couldn't follow the upload.") });
  }
}

function pump(engineId: string, sourceId: string): void {
  const queue = queues.get(sourceId) ?? [];
  while ((active.get(sourceId) ?? 0) < UPLOAD_CONCURRENCY && queue.length > 0) {
    const run = queue.shift()!;
    active.set(sourceId, (active.get(sourceId) ?? 0) + 1);
    void run().finally(() => {
      active.set(sourceId, (active.get(sourceId) ?? 1) - 1);
      pump(engineId, sourceId);
    });
  }
}

// ── Source rules for the tags ───────────────────────────────────────────────

/** One check at a time per source, so concurrent uploads update the rules once. */
const ruleChecks = new Map<string, Promise<void>>();

/**
 * Make sure the source maps every tag to itself before a file is sent with them.
 * Rules this browser saved are checked first; a missing tag updates the source,
 * keeping the other saved rules. Someone without manage rights cannot update it,
 * and the file is sent anyway: the engine then holds it back and its row says why.
 */
function ensureSourceRules(sourceId: string, tags: string[]): Promise<void> {
  const previous = ruleChecks.get(sourceId) ?? Promise.resolve();
  const next = previous.then(async () => {
    const saved = rememberedSourceRules(sourceId);
    const missing = tags.filter((t) => !saved.some((r) => r.group === t && r.role === t));
    if (missing.length === 0) return;
    const rules = [...saved.filter((r) => !missing.includes(r.group)), ...uploadSourceRules(missing)];
    try {
      await updateContextSource({ sourceId, audience: rules });
      rememberSourceRules(sourceId, rules);
    } catch {
      // Uploading needs no manage rights; the file's row explains a hold-back.
    }
  });
  ruleChecks.set(
    sourceId,
    next.catch(() => undefined),
  );
  return next;
}

function enqueue(engineId: string, sourceId: string, file: FileToUpload, audience: string[], version: string): void {
  const recordId = file.name;
  const key = entryKey(sourceId, recordId);
  pendingBytes.set(key, file);
  const queue = queues.get(sourceId) ?? [];
  queues.set(sourceId, queue);
  queue.push(async () => {
    patchEntry(sourceId, recordId, { status: 'uploading', progress: 0, detail: undefined, forbidden: false });
    try {
      // A file still under its old label keeps the source's label rule; role tags must map to themselves.
      if (entriesOf(sourceId).find((e) => e.recordId === recordId)?.visibility) await ensureSourceRules(sourceId, audience);
      const handle = await ingestContextFile({ engineId, sourceId, recordId, content: file.content, contentType: file.contentType, audience, version, onProgress: (f) => patchEntry(sourceId, recordId, { progress: Math.round(f * 100) }) });
      patchEntry(sourceId, recordId, { status: 'queued', progress: 100, jobId: handle.jobId });
      persist(sourceId);
      await watchJob(engineId, sourceId, recordId, handle.jobId);
    } catch (err) {
      const forbidden = err instanceof HttpError && err.status === 403;
      patchEntry(sourceId, recordId, { status: 'failed', progress: 0, forbidden, detail: forbidden ? 'Uploading needs upload access to this engine.' : engineMessage(err, 'The upload failed.') });
    }
  });
  pump(engineId, sourceId);
}

/**
 * Upload files to a source, shared with one choice of roles. `audience` is that
 * choice as role handles (see `visibilityTags`). Each file is one request; a few
 * run at once. A file whose name is already in the source becomes its new version.
 * `visibility` is undefined only when replacing a file kept under its old label.
 */
export function startUploads(engineId: string, sourceId: string, files: FileToUpload[], visibility: FileVisibility | undefined, audience: string[], label?: string): void {
  ensureLoaded(engineId, sourceId);
  const version = String(Date.now());
  const uploadedAt = new Date(Number(version)).toISOString();
  const fresh: UploadEntry[] = files.map((f) => ({ recordId: f.name, name: f.name, size: f.size, contentType: f.contentType, visibility, audience, ...(visibility ? {} : { label }), version, uploadedAt, status: 'uploading', progress: 0 }));
  const names = new Set(fresh.map((f) => f.recordId));
  setEntries(sourceId, [...fresh, ...entriesOf(sourceId).filter((e) => !names.has(e.recordId))]);
  files.forEach((f) => enqueue(engineId, sourceId, f, audience, version));
}

/** Send a failed upload again, with a new version so the engine treats it as fresh. */
export function retryUpload(engineId: string, sourceId: string, recordId: string): void {
  const file = pendingBytes.get(entryKey(sourceId, recordId));
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  if (!file || !entry) return;
  const version = String(Date.now());
  patchEntry(sourceId, recordId, { version, uploadedAt: new Date(Number(version)).toISOString() });
  enqueue(engineId, sourceId, file, entry.audience, version);
}

/** Retry every upload the engine refused for lack of access, e.g. after the owner grant was added. */
export function retryForbidden(engineId: string, sourceId: string): void {
  entriesOf(sourceId)
    .filter((e) => e.forbidden && e.status === 'failed')
    .forEach((e) => (pendingBytes.has(entryKey(sourceId, e.recordId)) ? retryUpload(engineId, sourceId, e.recordId) : void follow(engineId, sourceId, e.recordId)));
}

/** Delete a record; it leaves search on the engine's next pass. */
export async function removeUpload(engineId: string, sourceId: string, recordId: string): Promise<void> {
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  if (entry && (entry.status === 'failed' || entry.status === 'uploading') && !entry.jobId) {
    // Never reached the engine: just forget it.
    clearTimer(entryKey(sourceId, recordId));
    pendingBytes.delete(entryKey(sourceId, recordId));
    setEntries(
      sourceId,
      entriesOf(sourceId).filter((e) => e.recordId !== recordId),
    );
    persist(sourceId);
    return;
  }
  await sendContextRecordEvent({ engineId, sourceId, recordId, operation: 'delete', audience: entry?.audience ?? [], version: String(Date.now()) });
  clearTimer(entryKey(sourceId, recordId));
  // A failed upload kept its bytes for a retry; nothing will retry a removed record.
  pendingBytes.delete(entryKey(sourceId, recordId));
  setEntries(
    sourceId,
    entriesOf(sourceId).filter((e) => e.recordId !== recordId),
  );
  persist(sourceId);
}

/** Share a file with other roles. A held-back file becomes visible once the source maps its new roles, which this checks first. */
export async function changeUploadVisibility(engineId: string, sourceId: string, recordId: string, visibility: FileVisibility, audience: string[]): Promise<void> {
  await ensureSourceRules(sourceId, audience);
  const handle = await sendContextRecordEvent({ engineId, sourceId, recordId, operation: 'acl_changed', audience, version: String(Date.now()) });
  patchEntry(sourceId, recordId, { visibility, audience, label: undefined, status: 'queued', detail: undefined, jobId: handle.jobId });
  persist(sourceId);
  timers.set(
    entryKey(sourceId, recordId),
    window.setTimeout(() => void watchJob(engineId, sourceId, recordId, handle.jobId), UPLOAD_POLL_MS),
  );
}

/** Re-read every remembered file's status, e.g. when the drawer opens. */
export function refreshUploads(engineId: string, sourceId: string): void {
  ensureLoaded(engineId, sourceId);
  entriesOf(sourceId)
    .filter((e) => e.status !== 'uploading')
    .forEach((e) => void follow(engineId, sourceId, e.recordId));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The files this browser uploaded to a source, with live statuses. */
export function useSourceUploads(engineId: string, sourceId: string): UploadEntry[] {
  const entries = useSyncExternalStore(
    subscribe,
    () => entriesOf(sourceId),
    () => EMPTY,
  );
  useEffect(() => {
    if (engineId && sourceId) ensureLoaded(engineId, sourceId);
  }, [engineId, sourceId]);
  return entries;
}

// ── Rules ───────────────────────────────────────────────────────────────────
// The engine keeps a source's rules but does not return them, so the rules this
// browser last saved are kept for the edit form and the upload rules check.

/** A source's rules as this browser last saved them; empty when it never did. The engine does not return them. */
export function rememberedSourceRules(sourceId: string): AudienceRule[] {
  return readJson<AudienceRule[]>(rulesKey(sourceId), []).filter((r) => typeof r?.group === 'string' && typeof r?.role === 'string');
}

/** Keep a source's rules after saving them to the engine. */
export function rememberSourceRules(sourceId: string, rules: AudienceRule[]): void {
  const complete = rules.filter((r) => r.group.trim() !== '' && r.role.trim() !== '').map((r) => ({ group: r.group.trim(), role: r.role.trim() }));
  writeJson(rulesKey(sourceId), complete);
}
