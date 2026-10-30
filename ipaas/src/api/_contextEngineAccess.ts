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
 * Calls to one engine's console API, through the org gateway. The BFF hands out the gateway URL
 * and a short-lived key (`POST …/console-access`); every call carries that key as `X-API-Key` and
 * the platform login token as `Authorization`, which the gateway passes to the engine. A key is
 * fetched again shortly before it expires, and once more when the gateway refuses it.
 */

import { authenticatedFetch, getAccessToken } from '../auth';
import { CONSOLE_ACCESS_REFRESH_MARGIN_MS } from '../constants/contextEngine';
import { HttpError } from '../types/http';
import { isGatewayKeyRefusal, parseContextEngineKey } from '../utils/contextEngine';
import { bff, BffError, seg } from './_client';

interface ConsoleAccess {
  url: string;
  apiKey: string;
  expiresAt: number;
}

interface RawConsoleAccess {
  consoleApiUrl: string;
  apiKey: string;
  expiresAt: string;
}

/** A BFF failure as the engine pages expect one: an `HttpError` carrying the status and the BFF's sentence. */
export function asHttpError(err: unknown): unknown {
  return err instanceof BffError ? new HttpError(err.status, err.message) : err;
}

/** The BFF path of one engine. */
export function enginePath(engineId: string): string {
  const { environment, handle } = parseContextEngineKey(engineId);
  return `/context-engines/${seg(handle)}/environments/${seg(environment)}`;
}

const accessByEngine = new Map<string, Promise<ConsoleAccess>>();

const isFresh = (access: ConsoleAccess): boolean => access.expiresAt - CONSOLE_ACCESS_REFRESH_MARGIN_MS > Date.now();

async function requestAccess(engineId: string, staleApiKey?: string): Promise<ConsoleAccess> {
  try {
    const raw = await bff.post<RawConsoleAccess>(`${enginePath(engineId)}/console-access`, staleApiKey ? { staleApiKey } : {});
    const expiresAt = Date.parse(raw.expiresAt);
    return { url: raw.consoleApiUrl.replace(/\/+$/, ''), apiKey: raw.apiKey, expiresAt: Number.isNaN(expiresAt) ? Date.now() + 2 * CONSOLE_ACCESS_REFRESH_MARGIN_MS : expiresAt };
  } catch (err) {
    throw asHttpError(err);
  }
}

function load(engineId: string, staleApiKey?: string): Promise<ConsoleAccess> {
  const pending = requestAccess(engineId, staleApiKey);
  accessByEngine.set(engineId, pending);
  pending.catch(() => {
    if (accessByEngine.get(engineId) === pending) accessByEngine.delete(engineId);
  });
  return pending;
}

/** The engine's console access, shared by every call to it; fetched again when it nears expiry. */
async function consoleAccess(engineId: string): Promise<ConsoleAccess> {
  const cached = accessByEngine.get(engineId);
  if (!cached) return load(engineId);
  const access = await cached.catch(() => null);
  if (access && isFresh(access)) return access;
  // Another caller may have replaced it while this one waited.
  if (accessByEngine.get(engineId) !== cached) return consoleAccess(engineId);
  return load(engineId);
}

/** A new key in place of one the gateway refused, unless another call already replaced it. */
async function renewAccess(engineId: string, staleApiKey: string): Promise<ConsoleAccess> {
  const cached = accessByEngine.get(engineId);
  if (cached) {
    const access = await cached.catch(() => null);
    if (access && access.apiKey !== staleApiKey && isFresh(access)) return access;
    if (accessByEngine.get(engineId) !== cached) return renewAccess(engineId, staleApiKey);
  }
  return load(engineId, staleApiKey);
}

/** Drop what this browser holds for an engine, e.g. once it is deleted. */
export function forgetConsoleAccess(engineId: string): void {
  accessByEngine.delete(engineId);
}

const toError = (status: number, text: string, statusText = ''): HttpError => new HttpError(status, `HTTP ${status}: ${text || statusText}`);

/** A JSON call to the engine's console API. Errors are `HttpError`s carrying the engine's status and body. */
export async function engineRequest<T>(engineId: string, method: string, path: string, body?: unknown): Promise<T> {
  const send = async (access: ConsoleAccess): Promise<{ res: Response; text: string }> => {
    const headers: Record<string, string> = { 'X-API-Key': access.apiKey, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    const res = await authenticatedFetch(`${access.url}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { res, text: await res.text().catch(() => '') };
  };
  const access = await consoleAccess(engineId);
  let { res, text } = await send(access);
  if (isGatewayKeyRefusal(res.status, text)) ({ res, text } = await send(await renewAccess(engineId, access.apiKey)));
  if (!res.ok) throw toError(res.status, text, res.statusText);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

interface XhrResult {
  status: number;
  text: string;
}

/** One multipart POST. Settles with the response whatever its status; rejects only when nothing came back. */
function postMultipart(url: string, form: FormData, headers: Record<string, string>, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
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
 * A multipart POST to the engine's console API, as an XHR because only XHR reports upload
 * progress. Like {@link engineRequest}, it carries both credentials and retries once on a refused key.
 */
export async function engineUpload<T>(engineId: string, path: string, form: FormData, headers: Record<string, string>, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  const send = async (access: ConsoleAccess): Promise<XhrResult> => {
    const token = await getAccessToken();
    return postMultipart(`${access.url}${path}`, form, { ...headers, 'X-API-Key': access.apiKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, onProgress, signal);
  };
  const access = await consoleAccess(engineId);
  let result = await send(access);
  if (isGatewayKeyRefusal(result.status, result.text)) result = await send(await renewAccess(engineId, access.apiKey));
  if (result.status < 200 || result.status >= 300) throw toError(result.status, result.text);
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new Error('Expected a JSON response body.');
  }
}
