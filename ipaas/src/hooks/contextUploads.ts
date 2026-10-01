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
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getContextJob, getContextRecordStatus, ingestContextFile, sendContextRecordEvent } from '#api/contextEngine';
import { CONTEXT_ENGINE_FILES_KEY_PREFIX, CONTEXT_ENGINE_LABELS_KEY_PREFIX, CONTEXT_ENGINE_RULES_KEY_PREFIX, CONTEXT_JOB_TERMINAL_STATES, UPLOAD_CONCURRENCY, UPLOAD_POLL_MS } from '../constants/contextEngine';
import { engineMessage, labelsFromRules, uploadStatusFromRecord } from '../utils/contextEngine';
import { HttpError } from '../types/http';
import type { AudienceRule, UploadedFile, UploadEntry } from '../types/contextEngine';

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
const labelsKey = (sourceId: string): string => `${CONTEXT_ENGINE_LABELS_KEY_PREFIX}${sourceId}`;
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
    .map(({ recordId, name, size, contentType, label, version, uploadedAt, jobId }) => ({ recordId, name, size, contentType, label, version, uploadedAt, jobId }));
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
  const remembered = readJson<UploadedFile[]>(filesKey(sourceId), []);
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

function enqueue(engineId: string, sourceId: string, file: FileToUpload, label: string, version: string): void {
  const recordId = file.name;
  const key = entryKey(sourceId, recordId);
  pendingBytes.set(key, file);
  const queue = queues.get(sourceId) ?? [];
  queues.set(sourceId, queue);
  queue.push(async () => {
    patchEntry(sourceId, recordId, { status: 'uploading', progress: 0, detail: undefined, forbidden: false });
    try {
      const handle = await ingestContextFile({ engineId, sourceId, recordId, content: file.content, contentType: file.contentType, label, version, onProgress: (f) => patchEntry(sourceId, recordId, { progress: Math.round(f * 100) }) });
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
 * Upload files to a source under one visibility label. Each file is one
 * request; a few run at once. A file whose name is already in the source
 * becomes its new version.
 */
export function startUploads(engineId: string, sourceId: string, files: FileToUpload[], label: string): void {
  ensureLoaded(engineId, sourceId);
  const version = String(Date.now());
  const uploadedAt = new Date(Number(version)).toISOString();
  const fresh: UploadEntry[] = files.map((f) => ({ recordId: f.name, name: f.name, size: f.size, contentType: f.contentType, label, version, uploadedAt, status: 'uploading', progress: 0 }));
  const names = new Set(fresh.map((f) => f.recordId));
  setEntries(sourceId, [...fresh, ...entriesOf(sourceId).filter((e) => !names.has(e.recordId))]);
  files.forEach((f) => enqueue(engineId, sourceId, f, label, version));
}

/** Send a failed upload again, with a new version so the engine treats it as fresh. */
export function retryUpload(engineId: string, sourceId: string, recordId: string): void {
  const file = pendingBytes.get(entryKey(sourceId, recordId));
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  if (!file || !entry) return;
  const version = String(Date.now());
  patchEntry(sourceId, recordId, { version, uploadedAt: new Date(Number(version)).toISOString() });
  enqueue(engineId, sourceId, file, entry.label, version);
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
  await sendContextRecordEvent({ engineId, sourceId, recordId, operation: 'delete', label: entry?.label ?? '', version: String(Date.now()) });
  clearTimer(entryKey(sourceId, recordId));
  setEntries(
    sourceId,
    entriesOf(sourceId).filter((e) => e.recordId !== recordId),
  );
  persist(sourceId);
}

/** Move a record to another label; a held-back record becomes visible once its new label has a rule. */
export async function relabelUpload(engineId: string, sourceId: string, recordId: string, label: string): Promise<void> {
  const handle = await sendContextRecordEvent({ engineId, sourceId, recordId, operation: 'acl_changed', label, version: String(Date.now()) });
  patchEntry(sourceId, recordId, { label, status: 'queued', detail: undefined, jobId: handle.jobId });
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

// ── Labels ──────────────────────────────────────────────────────────────────
// The engine does not report a source's audience mapping yet, so the labels the
// wizard defined are kept per browser, and the drawer lets the user add one.

const labelListeners = new Set<() => void>();
const labelCache = new Map<string, string[]>();

function labelsOf(sourceId: string): string[] {
  let cached = labelCache.get(sourceId);
  if (!cached) {
    cached = readJson<string[]>(labelsKey(sourceId), []);
    labelCache.set(sourceId, cached);
  }
  return cached;
}

export function rememberSourceLabels(sourceId: string, labels: string[]): void {
  const merged = [...labelsOf(sourceId), ...labels].filter((l, i, all) => l.trim() !== '' && all.indexOf(l) === i);
  labelCache.set(sourceId, merged);
  writeJson(labelsKey(sourceId), merged);
  labelListeners.forEach((l) => l());
}

/** Labels known for a source, and a way to add one the user typed. */
export function useSourceLabels(sourceId: string): { labels: string[]; addLabel: (label: string) => void } {
  const labels = useSyncExternalStore(
    (l) => {
      labelListeners.add(l);
      return () => labelListeners.delete(l);
    },
    () => labelsOf(sourceId),
    () => EMPTY_LABELS,
  );
  const addLabel = useCallback((label: string) => rememberSourceLabels(sourceId, [label]), [sourceId]);
  return { labels, addLabel };
}

const EMPTY_LABELS: string[] = [];

/** A source's rules as this browser last saved them; empty when it never did. The engine does not return them. */
export function rememberedSourceRules(sourceId: string): AudienceRule[] {
  return readJson<AudienceRule[]>(rulesKey(sourceId), []).filter((r) => typeof r?.group === 'string' && typeof r?.role === 'string');
}

/** Keep a source's rules after saving them to the engine, and the labels they define. */
export function rememberSourceRules(sourceId: string, rules: AudienceRule[]): void {
  const complete = rules.filter((r) => r.group.trim() !== '' && r.role.trim() !== '').map((r) => ({ group: r.group.trim(), role: r.role.trim() }));
  writeJson(rulesKey(sourceId), complete);
  rememberSourceLabels(sourceId, labelsFromRules(complete));
}
