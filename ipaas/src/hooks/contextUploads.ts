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

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { deleteContextRecord, getContextJob, getContextRecordStatus, hashContent, ingestContextFile, retryContextJob, updateContextSource } from '../api/contextEngine';
import {
  CONTEXT_ENGINE_FILES_KEY_PREFIX,
  CONTEXT_ENGINE_RULES_KEY_PREFIX,
  CONTEXT_JOB_TERMINAL_STATES,
  UPLOAD_CHECK_BACKOFF_MS,
  UPLOAD_CHECK_CONCURRENCY,
  UPLOAD_CHECK_GIVE_UP_MS,
  UPLOAD_CHECK_RETRY_DETAIL,
  UPLOAD_CHECK_STOPPED_DETAIL,
  UPLOAD_CHECK_STEADY_MS,
  UPLOAD_CONCURRENCY,
  UPLOAD_POLL_MS,
} from '../constants/contextEngine';
import { engineMessage, isTransientReadError, isUploadActive, nextRecordVersion, reselectedFileProblem, unchangedDelivery, uploadSourceRules, uploadStatusFromRecord } from '../utils/contextEngine';
import { HttpError } from '../types/http';
import type { AudienceRule, ContextJob, ContextRecordStatus, FileVisibility, UploadedFile, UploadEntry } from '../types/contextEngine';

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
/** Bytes of files this tab uploaded, in memory only: a retry or a visibility change sends them again. */
const heldBytes = new Map<string, FileToUpload>();
const timers = new Map<string, number>();
const active = new Map<string, number>();
const queues = new Map<string, (() => Promise<void>)[]>();
/** Files whose status is being read right now, so a second read for the same file waits for the first. */
const checking = new Set<string>();
const checkQueue: (() => void)[] = [];
let checksActive = 0;
/** Status reads that failed to reach the engine in a row, per file, for the backoff. */
const checkAttempts = new Map<string, number>();
/** When a file's status reads started failing to reach the engine, so the retries stop in time. */
const checkFailingSince = new Map<string, number>();

function resetCheck(key: string): void {
  checkAttempts.delete(key);
  checkFailingSince.delete(key);
}
/** Bumped when a file is sent again, so a read started for the previous upload cannot touch the new one. */
const generations = new Map<string, number>();
let notifyTimer: number | undefined;

const UNCHANGED_DETAIL = 'Unchanged, so it was not sent again.';
const BYTES_GONE_DETAIL = 'The engine no longer has this file. Upload it again.';

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

/**
 * Tell subscribers once per task, not once per patch: a burst of status results then
 * costs one render, and no subscriber runs on the stack of the code that patched the store.
 * The leave prompt follows at once, since the browser may ask before that task runs.
 */
function emit(): void {
  syncLeaveGuard();
  if (notifyTimer !== undefined) return;
  notifyTimer = window.setTimeout(() => {
    notifyTimer = undefined;
    listeners.forEach((l) => l());
  }, 0);
}

/**
 * Closing or reloading the tab stops a file still being sent, so the browser asks first. The store
 * registers the prompt, not a page, because uploads carry on whichever page is open.
 * Browsers show their own wording in that prompt; a page cannot set it.
 */
function askBeforeLeaving(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Older Chrome and Edge show the prompt only when this is set.
  event.returnValue = true;
}
let guardingLeave = false;

function syncLeaveGuard(): void {
  const sending = anySending();
  if (sending === guardingLeave) return;
  guardingLeave = sending;
  if (sending) window.addEventListener('beforeunload', askBeforeLeaving);
  else window.removeEventListener('beforeunload', askBeforeLeaving);
}

function entriesOf(sourceId: string): UploadEntry[] {
  return entriesBySource.get(sourceId) ?? EMPTY;
}

function persist(sourceId: string): void {
  const remembered: UploadedFile[] = entriesOf(sourceId)
    .filter((e) => e.status !== 'failed' || e.jobId)
    .map(({ recordId, name, size, contentType, visibility, audience, label, version, uploadedAt, jobId, contentHash }) => ({ recordId, name, size, contentType, visibility, audience, label, version, uploadedAt, jobId, contentHash }));
  writeJson(filesKey(sourceId), remembered);
}

function setEntries(sourceId: string, next: UploadEntry[]): void {
  entriesBySource.set(sourceId, next);
  emit();
}

function patchEntry(sourceId: string, recordId: string, patch: Partial<UploadEntry>): void {
  // A row given a new status has moved on, so a status read that could not reach the engine no longer describes it.
  const next = 'status' in patch && !('check' in patch) ? { ...patch, check: undefined } : patch;
  setEntries(
    sourceId,
    entriesOf(sourceId).map((e) => (e.recordId === recordId ? { ...e, ...next } : e)),
  );
}

/** Start a new attempt for a file: pending reads and timers for the earlier one must not touch it. */
function newAttempt(key: string): void {
  clearTimer(key);
  resetCheck(key);
  generations.set(key, (generations.get(key) ?? 0) + 1);
}

function clearTimer(key: string): void {
  const t = timers.get(key);
  if (t !== undefined) {
    window.clearTimeout(t);
    timers.delete(key);
  }
}

function pumpChecks(): void {
  while (checksActive < UPLOAD_CHECK_CONCURRENCY) {
    const next = checkQueue.shift();
    if (!next) return;
    checksActive += 1;
    next();
  }
}

/** Run one engine read when a slot is free, so a restored list of files does not flood the engine. */
function queueCheck<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    checkQueue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          checksActive -= 1;
          pumpChecks();
        });
    });
    pumpChecks();
  });
}

/** Mark a file as being read while `run` lasts, so `follow` does not start a second read meanwhile. */
function trackCheck(key: string, run: () => Promise<void>): Promise<void> {
  checking.add(key);
  return run().finally(() => checking.delete(key));
}

/**
 * The engine could not be reached for this file. Its last status stays, the row says
 * so, and the status is read again after 3 s, 6 s, 12 s, then every 30 s. After
 * UPLOAD_CHECK_GIVE_UP_MS the reads stop and the row waits for "Check again".
 */
function checkLater(sourceId: string, recordId: string, again: () => Promise<void>): void {
  const key = entryKey(sourceId, recordId);
  const attempt = checkAttempts.get(key) ?? 0;
  checkAttempts.set(key, attempt + 1);
  const since = checkFailingSince.get(key) ?? Date.now();
  checkFailingSince.set(key, since);
  if (Date.now() - since >= UPLOAD_CHECK_GIVE_UP_MS) {
    patchEntry(sourceId, recordId, { check: 'stopped', detail: UPLOAD_CHECK_STOPPED_DETAIL });
    return;
  }
  patchEntry(sourceId, recordId, { check: 'retrying', detail: UPLOAD_CHECK_RETRY_DETAIL });
  timers.set(
    key,
    window.setTimeout(() => void trackCheck(key, again), UPLOAD_CHECK_BACKOFF_MS[attempt] ?? UPLOAD_CHECK_STEADY_MS),
  );
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
  const key = entryKey(sourceId, recordId);
  if (checking.has(key)) return Promise.resolve();
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  return trackCheck(key, () => (entry?.jobId ? watchJob(engineId, sourceId, recordId, entry.jobId) : watchRecord(engineId, sourceId, recordId)));
}

/**
 * Re-read a record until its index state settles. A record the engine does not
 * know yet is one whose job has not run, so its job is followed instead; once
 * the job is done, a missing record means it was removed.
 */
async function watchRecord(engineId: string, sourceId: string, recordId: string, afterJob = false): Promise<void> {
  const key = entryKey(sourceId, recordId);
  const generation = generations.get(key);
  clearTimer(key);
  let record: ContextRecordStatus;
  try {
    record = await queueCheck(() => getContextRecordStatus(engineId, sourceId, recordId));
  } catch (err) {
    if (generations.get(key) !== generation) return;
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
    if (isTransientReadError(err)) {
      checkLater(sourceId, recordId, () => watchRecord(engineId, sourceId, recordId, afterJob));
      return;
    }
    patchEntry(sourceId, recordId, {
      status: 'failed',
      detail: err instanceof HttpError && err.status === 403 ? 'Seeing this file needs upload access to the source.' : engineMessage(err, "Couldn't read the file's status."),
      forbidden: err instanceof HttpError && err.status === 403,
    });
    return;
  }
  if (generations.get(key) !== generation) return;
  const { status, detail } = uploadStatusFromRecord(record);
  resetCheck(key);
  patchEntry(sourceId, recordId, { status, detail, forbidden: false, check: undefined, version: record.currentVersion, progress: 100 });
  if (status === 'indexing')
    timers.set(
      key,
      window.setTimeout(() => void trackCheck(key, () => watchRecord(engineId, sourceId, recordId)), UPLOAD_POLL_MS),
    );
}

/** Follow the engine's job for an upload, then the record it produced. */
async function watchJob(engineId: string, sourceId: string, recordId: string, jobId: string): Promise<void> {
  const key = entryKey(sourceId, recordId);
  const generation = generations.get(key);
  clearTimer(key);
  let job: ContextJob;
  try {
    job = await queueCheck(() => getContextJob(engineId, jobId));
  } catch (err) {
    if (generations.get(key) !== generation) return;
    if (isTransientReadError(err)) {
      checkLater(sourceId, recordId, () => watchJob(engineId, sourceId, recordId, jobId));
      return;
    }
    patchEntry(sourceId, recordId, { status: 'failed', detail: engineMessage(err, "Couldn't follow the upload.") });
    return;
  }
  if (generations.get(key) !== generation) return;
  resetCheck(key);
  if (!CONTEXT_JOB_TERMINAL_STATES.has(job.state)) {
    patchEntry(sourceId, recordId, { status: 'queued', progress: 100, running: job.state === 'running', check: undefined });
    timers.set(
      key,
      window.setTimeout(() => void trackCheck(key, () => watchJob(engineId, sourceId, recordId, jobId)), UPLOAD_POLL_MS),
    );
    return;
  }
  if (job.state === 'failed') {
    patchEntry(sourceId, recordId, { status: 'failed', retrying: false, check: undefined, detail: job.error?.message ?? 'The engine could not apply this file.' });
    return;
  }
  await watchRecord(engineId, sourceId, recordId, true);
}

function pump(engineId: string, sourceId: string): void {
  const queue = queues.get(sourceId) ?? [];
  while ((active.get(sourceId) ?? 0) < UPLOAD_CONCURRENCY && queue.length > 0) {
    const run = queue.shift();
    if (!run) return;
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
function ensureSourceRules(engineId: string, sourceId: string, tags: string[]): Promise<void> {
  const previous = ruleChecks.get(sourceId) ?? Promise.resolve();
  const next = previous.then(async () => {
    const saved = rememberedSourceRules(sourceId);
    const missing = tags.filter((t) => !saved.some((r) => r.group === t && r.role === t));
    if (missing.length === 0) return;
    const rules = [...saved.filter((r) => !missing.includes(r.group)), ...uploadSourceRules(missing)];
    try {
      await updateContextSource({ engineId, sourceId, audience: rules });
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

/**
 * Run a failed row's job again on the engine, as the same job, from the bytes
 * the engine still has. True when the engine took it, or when the job turned out
 * to be running or done already, and the row now follows it; true as well when
 * the retry failed for another reason, or the job could not be looked up, and
 * the row says so. False only when the engine cannot run that job again because
 * its bytes are gone, so the caller sends the file itself if it still has it.
 */
async function retryOnEngine(engineId: string, sourceId: string, recordId: string, jobId: string): Promise<boolean> {
  const key = entryKey(sourceId, recordId);
  newAttempt(key);
  patchEntry(sourceId, recordId, { status: 'queued', progress: 100, detail: undefined, forbidden: false, jobId, retrying: true });
  try {
    await retryContextJob(engineId, jobId);
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      // The engine refused to run the job again. Its state says why: one still running or done is
      // followed; a failed one has lost its bytes. When the state cannot be read, nothing is known,
      // so the row stays failed with its job and nothing is sent again.
      let job: ContextJob;
      try {
        job = await getContextJob(engineId, jobId);
      } catch (lookupErr) {
        patchEntry(sourceId, recordId, { status: 'failed', progress: 0, retrying: false, detail: engineMessage(lookupErr, 'The retry was refused, and the job could not be looked up. Try again.') });
        return true;
      }
      if (job.state !== 'failed') {
        await trackCheck(key, () => watchJob(engineId, sourceId, recordId, jobId));
        return true;
      }
      patchEntry(sourceId, recordId, { retrying: false });
      return false;
    }
    const forbidden = err instanceof HttpError && err.status === 403;
    patchEntry(sourceId, recordId, { status: 'failed', progress: 0, forbidden, retrying: false, detail: forbidden ? 'Retrying needs upload access to this engine.' : engineMessage(err, 'The retry failed.') });
    return true;
  }
  persist(sourceId);
  await trackCheck(key, () => watchJob(engineId, sourceId, recordId, jobId));
  return true;
}

/**
 * Queue one file. `previous` is the row the file replaces, when there is one.
 * The hash of the bytes says whether the file changed, not the version number,
 * which is only the engine's ordering number: the same bytes with the same
 * roles are not sent again. A row that failed on the engine is retried there
 * as the same job; a row that is fine is kept as it is.
 */
function enqueue(engineId: string, sourceId: string, file: FileToUpload, audience: string[], version: string, previous?: UploadEntry): void {
  const recordId = file.name;
  const key = entryKey(sourceId, recordId);
  // A status check still pending for the file this one replaces must not touch it.
  newAttempt(key);
  heldBytes.set(key, file);
  const queue = queues.get(sourceId) ?? [];
  queues.set(sourceId, queue);
  queue.push(async () => {
    patchEntry(sourceId, recordId, { status: 'uploading', progress: 0, detail: undefined, forbidden: false, retrying: false });
    try {
      const contentHash = await hashContent(file.content);
      if (previous?.jobId && unchangedDelivery(previous, contentHash, audience)) {
        if (previous.status !== 'failed') {
          // Already on the engine as it is: keep the row, with the version it has there. The sharing
          // choice stays the new one: it names the same audience, in the words just chosen.
          heldBytes.delete(key);
          const fresh = entriesOf(sourceId).find((e) => e.recordId === recordId);
          patchEntry(sourceId, recordId, { ...previous, ...(fresh ? { visibility: fresh.visibility, label: fresh.label } : {}), progress: 100, check: undefined, detail: isUploadActive(previous) ? undefined : UNCHANGED_DETAIL });
          persist(sourceId);
          if (isUploadActive(previous)) await follow(engineId, sourceId, recordId);
          return;
        }
        patchEntry(sourceId, recordId, { version: previous.version, uploadedAt: previous.uploadedAt, contentHash });
        if (await retryOnEngine(engineId, sourceId, recordId, previous.jobId)) return;
        // The engine no longer has the bytes; they are here, so they go up as a new version.
        patchEntry(sourceId, recordId, { status: 'uploading', progress: 0, retrying: false, version, uploadedAt: new Date(Number(version)).toISOString() });
      }
      // A file still under its old label keeps the source's label rule; role tags must map to themselves.
      if (entriesOf(sourceId).find((e) => e.recordId === recordId)?.visibility) await ensureSourceRules(engineId, sourceId, audience);
      const handle = await ingestContextFile({ engineId, sourceId, recordId, content: file.content, contentType: file.contentType, audience, version, onProgress: (f) => patchEntry(sourceId, recordId, { progress: Math.round(f * 100) }) });
      patchEntry(sourceId, recordId, { status: 'queued', progress: 100, jobId: handle.jobId, contentHash });
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
  // The rows being replaced, so an unchanged file is told from a changed one by its hash.
  const previous = new Map(entriesOf(sourceId).map((e) => [e.recordId, e]));
  const fresh: UploadEntry[] = files.map((f) => ({ recordId: f.name, name: f.name, size: f.size, contentType: f.contentType, visibility, audience, ...(visibility ? {} : { label }), version, uploadedAt, status: 'uploading', progress: 0 }));
  const names = new Set(fresh.map((f) => f.recordId));
  setEntries(sourceId, [...fresh, ...entriesOf(sourceId).filter((e) => !names.has(e.recordId))]);
  files.forEach((f) => enqueue(engineId, sourceId, f, audience, version, previous.get(f.name)));
}

/**
 * Try a failed file again. One that failed on the engine runs there again as the
 * same job, with no new upload, also after a page reload. When the engine no
 * longer has its bytes and they are still here, they go up as a new version. One
 * that never reached the engine is sent again.
 */
export function retryUpload(engineId: string, sourceId: string, recordId: string): void {
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  if (!entry) return;
  const file = heldBytes.get(entryKey(sourceId, recordId));
  const resend = (): void => {
    if (!file) return;
    const version = String(Date.now());
    patchEntry(sourceId, recordId, { version, uploadedAt: new Date(Number(version)).toISOString() });
    enqueue(engineId, sourceId, file, entry.audience, version);
  };
  if (!entry.jobId) {
    resend();
    return;
  }
  const jobId = entry.jobId;
  void retryOnEngine(engineId, sourceId, recordId, jobId).then((handled) => {
    if (handled) return;
    if (file) resend();
    else patchEntry(sourceId, recordId, { status: 'failed', progress: 0, detail: BYTES_GONE_DETAIL });
  });
}

/** Retry every upload the engine refused for lack of access, e.g. after the owner grant was added. */
export function retryForbidden(engineId: string, sourceId: string): void {
  entriesOf(sourceId)
    .filter((e) => e.forbidden && e.status === 'failed')
    .forEach((e) => (heldBytes.has(entryKey(sourceId, e.recordId)) ? retryUpload(engineId, sourceId, e.recordId) : void follow(engineId, sourceId, e.recordId)));
}

/** Delete a record; it leaves search on the engine's next pass. */
export async function removeUpload(engineId: string, sourceId: string, recordId: string): Promise<void> {
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  if (entry && (entry.status === 'failed' || entry.status === 'uploading') && !entry.jobId) {
    // Never reached the engine: just forget it.
    clearTimer(entryKey(sourceId, recordId));
    heldBytes.delete(entryKey(sourceId, recordId));
    setEntries(
      sourceId,
      entriesOf(sourceId).filter((e) => e.recordId !== recordId),
    );
    persist(sourceId);
    return;
  }
  await deleteContextRecord({ engineId, sourceId, recordId, audience: entry?.audience ?? [], version: nextRecordVersion(entry?.version) });
  clearTimer(entryKey(sourceId, recordId));
  heldBytes.delete(entryKey(sourceId, recordId));
  setEntries(
    sourceId,
    entriesOf(sourceId).filter((e) => e.recordId !== recordId),
  );
  persist(sourceId);
}

/** Whether this tab still holds a file's bytes, so its visibility can change without choosing it again. */
export function holdsUploadBytes(sourceId: string, recordId: string): boolean {
  return heldBytes.has(entryKey(sourceId, recordId));
}

/**
 * Share a file with other roles. The engine versions a record's audience with its
 * content, so the file is sent again at a newer version: the bytes this tab holds,
 * or `chosen`, the same file picked again. A held-back file becomes visible once
 * the source maps its new roles, which this checks first.
 */
export async function changeUploadVisibility(engineId: string, sourceId: string, recordId: string, visibility: FileVisibility, audience: string[], chosen?: File): Promise<void> {
  const key = entryKey(sourceId, recordId);
  const entry = entriesOf(sourceId).find((e) => e.recordId === recordId);
  if (!entry) return;
  const problem = chosen ? reselectedFileProblem(entry, chosen) : null;
  if (problem) throw new Error(problem);
  const file: FileToUpload | undefined = chosen ? { content: chosen, name: entry.name, size: chosen.size, contentType: entry.contentType } : heldBytes.get(key);
  if (!file) throw new Error('To change who can see this file, choose it again.');
  await ensureSourceRules(engineId, sourceId, audience);
  const version = nextRecordVersion(entry.version);
  const handle = await ingestContextFile({ engineId, sourceId, recordId, content: file.content, contentType: entry.contentType, audience, version });
  heldBytes.set(key, file);
  newAttempt(key);
  patchEntry(sourceId, recordId, { visibility, audience, label: undefined, version, status: 'queued', detail: undefined, jobId: handle.jobId });
  persist(sourceId);
  timers.set(
    key,
    window.setTimeout(() => void trackCheck(key, () => watchJob(engineId, sourceId, recordId, handle.jobId)), UPLOAD_POLL_MS),
  );
}

/** Read a file's status now, e.g. after the engine was out of reach; the backoff starts over. */
export function checkUpload(engineId: string, sourceId: string, recordId: string): void {
  const key = entryKey(sourceId, recordId);
  resetCheck(key);
  clearTimer(key);
  void follow(engineId, sourceId, recordId);
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
const getEmpty = (): UploadEntry[] => EMPTY;

export function useSourceUploads(engineId: string, sourceId: string): UploadEntry[] {
  const getSnapshot = useCallback(() => entriesOf(sourceId), [sourceId]);
  const entries = useSyncExternalStore(subscribe, getSnapshot, getEmpty);
  useEffect(() => {
    if (engineId && sourceId) ensureLoaded(engineId, sourceId);
  }, [engineId, sourceId]);
  return entries;
}

/** Whether any file, in any source, is still being sent from this tab. */
function anySending(): boolean {
  for (const list of entriesBySource.values()) if (list.some((e) => e.status === 'uploading')) return true;
  return false;
}

/** True while any file is still being sent from this tab. */
export function useAnySending(): boolean {
  return useSyncExternalStore(subscribe, anySending, () => false);
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
